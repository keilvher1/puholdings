// 증빙 파일 1개 받기 → 검사 → 원본 보관 → 중복 조회 → 자동 인식 — /scan(웹 화면)과 /inbox(데스크톱 앱)가 함께 쓴다.
// 결과는 단계별로 나뉜 값으로 돌려주고, 응답 모양은 각 라우트가 정한다(/scan의 응답·문구는 이 파일로 옮기기 전과 같다).
// 서버 전용(node:crypto·@vercel/blob·sharp). 클라이언트 컴포넌트에서 import하지 않는다.

import {
  MAX_SCAN_FILE_BYTES,
  SCAN_MIME_TYPES,
  emptyReceiptFields,
  type DuplicateReceipt,
  type ExpenseProject,
  type ReceiptDraft,
  type UploadedFileMeta,
} from "./expenses"
import {
  RECEIPT_PREFIX,
  checkUpload,
  dbErrorMessage,
  findDuplicatesByHash,
  findSimilarReceipts,
  kstToday,
  listProjects,
  nameWithKindExt,
  sha256Hex,
  storePrivateBlob,
  type Sql,
} from "./expense-db"
import { ExpenseAiError, hasExpenseAiKey, prepareImageForAi, scanReceipt, type AiInput } from "./expense-ai"
import type { SimilarReceipt } from "./expense-dedupe"

export const SCAN_NOT_CONFIGURED_MESSAGE =
  "자동 인식이 설정되지 않았습니다(OPENAI_API_KEY). 파일은 보관되었으니 표에서 직접 입력하세요."
const SCAN_UNKNOWN_ERROR = "증빙 인식에 실패했습니다. 잠시 후 '다시 시도'를 누르세요."

export function manualDraft(warnings: string[]): ReceiptDraft {
  return {
    ...emptyReceiptFields(),
    suggested_project_id: null,
    project_reason: "",
    confidence: "low",
    low_confidence_fields: ["issue_date", "vendor_name", "total_amount"],
    warnings,
  }
}

// 64자 hex(소문자로 맞춤)만 인정한다.
export function parseHashField(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null
  const s = v.trim().toLowerCase()
  return /^[0-9a-f]{64}$/.test(s) ? s : null
}

type Stored = { file: UploadedFileMeta; duplicates: DuplicateReceipt[]; projects: ExpenseProject[] }

export type ReceiptScanOutcome =
  // 파일 검사 실패(400) 또는 보관·DB 조회 실패(500). 보관 전 실패라 file이 없다.
  | { stage: "rejected"; status: number; error: string }
  // 자동 인식 키가 없음 — 파일은 보관됨
  | ({ stage: "not_configured"; message: string } & Stored)
  // 인식 오류 — 파일은 보관됨. message는 화면에 그대로 보일 문구.
  | ({ stage: "scan_failed"; status: number; needsSetup: boolean; message: string } & Stored)
  | ({
      stage: "ok"
      drafts: ReceiptDraft[]
      warnings: string[]
      possible_duplicates: SimilarReceipt[][]
    } & Stored)

// formData의 file(1개)을 검사·보관·인식한다. original_hash(선택)는 줄이기 전 원본의 sha256.
export async function scanUploadedReceipt(sql: Sql, formData: FormData): Promise<ReceiptScanOutcome> {
  const files = formData.getAll("file").filter((f): f is File => f instanceof File)
  if (files.length === 0) return { stage: "rejected", status: 400, error: "증빙 파일(사진 또는 PDF)을 올리세요" }
  if (files.length > 1) return { stage: "rejected", status: 400, error: "한 번에 파일 1개씩 보내세요" }
  const file = files[0]

  const checked = await checkUpload(file, SCAN_MIME_TYPES, MAX_SCAN_FILE_BYTES)
  if (!checked.ok) return { stage: "rejected", status: 400, error: checked.error }
  if (checked.kind === "text") {
    return { stage: "rejected", status: 400, error: "텍스트 파일은 증빙으로 올릴 수 없습니다. 사진이나 PDF로 올리세요." }
  }
  const kind = checked.kind

  // 1) 원본 보관 — 저장할 때 이 경로를 증빙과 연결한다.
  const sentHash = sha256Hex(checked.buffer)
  const hash = parseHashField(formData.get("original_hash")) ?? sentHash
  const displayName = nameWithKindExt(file.name || "증빙", kind)
  let fileMeta: UploadedFileMeta
  try {
    const pathname = await storePrivateBlob(`${RECEIPT_PREFIX}${kstToday().slice(0, 7)}`, displayName, checked.buffer, checked.mime)
    fileMeta = { pathname, name: displayName, type: checked.mime, size: checked.buffer.length, hash }
  } catch (error) {
    console.error("Receipt store error:", error)
    return { stage: "rejected", status: 500, error: "파일을 보관하지 못했습니다. 잠시 후 '다시 시도'를 누르세요." }
  }

  // 2) 같은 파일로 이미 저장된 증빙 + 인식에 알려줄 활성 프로젝트
  let duplicates: DuplicateReceipt[]
  let projects: ExpenseProject[]
  try {
    ;[duplicates, projects] = await Promise.all([findDuplicatesByHash(sql, [hash, sentHash]), listProjects(sql, { activeOnly: true })])
  } catch (error) {
    console.error("Receipt scan DB error:", error)
    return {
      stage: "rejected",
      status: 500,
      error: dbErrorMessage(error, "증빙 정보를 확인하지 못했습니다. 잠시 후 '다시 시도'를 누르세요."),
    }
  }
  const stored: Stored = { file: fileMeta, duplicates, projects }

  if (!hasExpenseAiKey()) return { stage: "not_configured", message: SCAN_NOT_CONFIGURED_MESSAGE, ...stored }

  // 3) 인식
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
      drafts = [manualDraft(["인식된 내용 없음 · 직접 입력하거나 행을 삭제하세요.", ...fileWarnings])]
    }

    // 4) 파일은 다르지만 같은 거래로 보이는 저장된 증빙(세금계산서 + 이체확인증 등 이중 계상 방지).
    //    조회에 실패해도 판독 결과는 돌려준다(경고만 못 할 뿐).
    let possible: SimilarReceipt[][] = drafts.map(() => [])
    try {
      possible = await findSimilarReceipts(sql, drafts, duplicates.map((d) => d.id))
    } catch (error) {
      console.error("Receipt similar lookup error:", error)
    }

    return { stage: "ok", drafts, warnings: fileWarnings, possible_duplicates: possible, ...stored }
  } catch (error) {
    const e = error instanceof ExpenseAiError ? error : new ExpenseAiError(SCAN_UNKNOWN_ERROR, 500)
    if (!(error instanceof ExpenseAiError)) console.error("Receipt scan error:", error)
    const message = e.needsSetup ? e.message : `${e.message} (파일 보관됨 · 직접 입력 가능)`
    return { stage: "scan_failed", status: e.status, needsSetup: e.needsSetup, message, ...stored }
  }
}
