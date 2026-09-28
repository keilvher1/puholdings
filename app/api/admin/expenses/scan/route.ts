import { NextResponse } from "next/server"
import {
  MAX_SCAN_FILE_BYTES,
  SCAN_MIME_TYPES,
  emptyReceiptFields,
  type DuplicateReceipt,
  type ReceiptDraft,
  type ScanResponse,
  type UploadedFileMeta,
} from "@/lib/expenses"
import {
  RECEIPT_PREFIX,
  checkUpload,
  dbErrorMessage,
  fail,
  findDuplicatesByHash,
  findSimilarReceipts,
  kstToday,
  listProjects,
  nameWithKindExt,
  requireAdminDb,
  sha256Hex,
  storePrivateBlob,
} from "@/lib/expense-db"
import { ExpenseAiError, hasExpenseAiKey, prepareImageForAi, scanReceipt, type AiInput } from "@/lib/expense-ai"
import type { SimilarReceipt } from "@/lib/expense-dedupe"

// POST /api/admin/expenses/scan  multipart: file(1개 — 사진 또는 PDF, 4MB 이하)
//   + original_hash(선택): 브라우저가 줄이기 전 원본 파일의 sha256 hex. 같은 사진을 다른 기기·브라우저에서 올려
//     전송본이 달라져도 같은 파일로 알아보기 위해 file.hash(저장 시 file_hash)로 쓴다. 없으면 전송본 해시.
// 원본을 Blob(private, expenses/receipts/YYYY-MM/...)에 보관하고, 같은 파일로 이미 저장된 증빙(duplicates)을 찾고,
// 활성 프로젝트 목록을 참고해 AI OCR 초안(drafts)을 돌려준다. DB에는 아무것도 저장하지 않는다.
//
// 성공: ScanResponse { success:true, file, drafts, duplicates }
//   + warnings(파일 전체 경고, 각 초안 warnings에도 합쳐 둠)
//   + possible_duplicates: SimilarReceipt[][] (drafts와 같은 순서) — 파일은 다르지만 같은 거래로 보이는 저장된 증빙
//     (승인번호 일치, 또는 거래처·합계가 같고 날짜가 7일 이내). 화면은 이런 행의 기본 선택을 해제한다.
//   AI가 증빙을 못 찾으면 빈 초안 1개(직접 입력용)를 돌려준다 — 파일이 표에서 사라지지 않도록.
// 실패: { success:false, error, needs_setup? } — 원본 보관 이후의 실패(AI 미설정·AI 오류)에는
//   file·duplicates를 함께 돌려주므로 화면은 빈 행을 만들어 직접 입력을 이어갈 수 있다.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// 비전 추론(여러 페이지 PDF 포함)이라 기본 타임아웃으로는 모자랄 수 있다.
export const maxDuration = 300

function manualDraft(warnings: string[]): ReceiptDraft {
  return {
    ...emptyReceiptFields(),
    suggested_project_id: null,
    project_reason: "",
    confidence: "low",
    low_confidence_fields: ["issue_date", "vendor_name", "total_amount"],
    warnings,
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  const sql = auth.sql

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return fail("파일을 받지 못했습니다. 4MB 이하 파일로 다시 시도하세요.", 400)
  }
  const files = formData.getAll("file").filter((f): f is File => f instanceof File)
  if (files.length === 0) return fail("증빙 파일(사진 또는 PDF)을 올리세요", 400)
  if (files.length > 1) return fail("한 번에 파일 1개씩 보내세요", 400)
  const file = files[0]

  const checked = await checkUpload(file, SCAN_MIME_TYPES, MAX_SCAN_FILE_BYTES)
  if (!checked.ok) return fail(checked.error, 400)
  if (checked.kind === "text") return fail("텍스트 파일은 증빙으로 올릴 수 없습니다. 사진이나 PDF로 올리세요.", 400)
  const kind = checked.kind

  // 1) 원본 보관 — 저장할 때 이 경로를 증빙과 연결한다.
  const sentHash = sha256Hex(checked.buffer)
  const claimedOriginal = formData.get("original_hash")
  const originalHash = typeof claimedOriginal === "string" && /^[0-9a-f]{64}$/.test(claimedOriginal.trim().toLowerCase())
    ? claimedOriginal.trim().toLowerCase()
    : null
  const hash = originalHash ?? sentHash
  const displayName = nameWithKindExt(file.name || "증빙", kind)
  let fileMeta: UploadedFileMeta
  try {
    const pathname = await storePrivateBlob(`${RECEIPT_PREFIX}${kstToday().slice(0, 7)}`, displayName, checked.buffer, checked.mime)
    fileMeta = { pathname, name: displayName, type: checked.mime, size: checked.buffer.length, hash }
  } catch (error) {
    console.error("Receipt store error:", error)
    return fail("파일을 보관하지 못했습니다. 잠시 후 '다시 시도'를 누르세요.", 500)
  }

  // 2) 같은 파일로 이미 저장된 증빙 + AI에 알려줄 활성 프로젝트
  let duplicates: DuplicateReceipt[]
  let projects: Awaited<ReturnType<typeof listProjects>>
  try {
    ;[duplicates, projects] = await Promise.all([findDuplicatesByHash(sql, [hash, sentHash]), listProjects(sql, { activeOnly: true })])
  } catch (error) {
    console.error("Receipt scan DB error:", error)
    return fail(dbErrorMessage(error, "증빙 정보를 확인하지 못했습니다. 잠시 후 '다시 시도'를 누르세요."), 500)
  }

  if (!hasExpenseAiKey()) {
    return fail(
      "자동 인식이 설정되지 않았습니다(OPENAI_API_KEY). 파일은 보관되었으니 표에서 직접 입력하세요.",
      503,
      { needs_setup: true, file: fileMeta, duplicates },
    )
  }

  // 3) AI 판독
  try {
    const input: AiInput =
      kind === "pdf"
        ? { kind: "pdf", filename: displayName, data: checked.buffer.toString("base64") }
        : { kind: "image", filename: displayName, data: await prepareImageForAi(checked.buffer) }

    const result = await scanReceipt(input, {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        program_name: p.program_name,
        budget_items: p.budget_items.map((b) => b.name).filter(Boolean),
        start_date: p.start_date,
        end_date: p.end_date,
      })),
    })

    // 추천 프로젝트는 활성 프로젝트 id일 때만 남긴다(scanReceipt도 거르지만 한 번 더).
    const activeIds = new Set(projects.map((p) => p.id))
    const fileWarnings = result.warnings
    let drafts: ReceiptDraft[] = result.drafts.map((d) => {
      const keep = d.suggested_project_id !== null && activeIds.has(d.suggested_project_id)
      return {
        ...d,
        suggested_project_id: keep ? d.suggested_project_id : null,
        project_reason: keep ? d.project_reason : "",
        warnings: [...new Set([...d.warnings, ...fileWarnings])],
      }
    })
    if (drafts.length === 0) {
      drafts = [
        manualDraft([
          "인식된 내용 없음 · 직접 입력하거나 행을 삭제하세요.",
          ...fileWarnings,
        ]),
      ]
    }

    // 4) 파일은 다르지만 같은 거래로 보이는 저장된 증빙(세금계산서 + 이체확인증 등 이중 계상 방지).
    //    조회에 실패해도 판독 결과는 돌려준다(경고만 못 할 뿐).
    let possible: SimilarReceipt[][] = drafts.map(() => [])
    try {
      possible = await findSimilarReceipts(sql, drafts, duplicates.map((d) => d.id))
    } catch (error) {
      console.error("Receipt similar lookup error:", error)
    }

    const body: ScanResponse & { warnings: string[]; possible_duplicates: SimilarReceipt[][] } = {
      success: true,
      file: fileMeta,
      drafts,
      duplicates,
      warnings: fileWarnings,
      possible_duplicates: possible,
    }
    return NextResponse.json(body)
  } catch (error) {
    const e = error instanceof ExpenseAiError ? error : new ExpenseAiError("증빙 인식에 실패했습니다. 잠시 후 '다시 시도'를 누르세요.", 500)
    if (!(error instanceof ExpenseAiError)) console.error("Receipt scan error:", error)
    const message = e.needsSetup ? e.message : `${e.message} (파일 보관됨 · 직접 입력 가능)`
    return fail(message, e.status, {
      ...(e.needsSetup ? { needs_setup: true } : {}),
      file: fileMeta,
      duplicates,
    })
  }
}
