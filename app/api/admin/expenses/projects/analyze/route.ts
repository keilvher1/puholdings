import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import type { Attachment } from "@/lib/db"
import { MAX_PROJECT_DOC_FILES, PROJECT_DOC_MIME_TYPES, type AnalyzeProjectsResponse } from "@/lib/expenses"
import {
  PROJECT_DOC_PREFIX,
  checkUpload,
  decodeTextFile,
  fail,
  formatBytes,
  nameWithKindExt,
  storePrivateBlob,
  type FileKind,
} from "@/lib/expense-db"
import { ExpenseAiError, analyzeProjectDocs, hasExpenseAiKey, prepareImageForAi, type AiInput } from "@/lib/expense-ai"

// POST /api/admin/expenses/projects/analyze
// multipart: files(1~5개, 사진·PDF·텍스트, 각 4MB 이하·합계 4.4MB 이하) + hint(선택)
// 사업계획서·협약서·선정 공문 등을 AI로 읽어 프로젝트 "초안"을 돌려준다. DB에는 아무것도 저장하지 않는다.
// 원본 자료는 Blob(private, expenses/projects/...)에 보관하고 files로 돌려준다 — 등록할 때 source_files로 넘기면 된다.
// 응답: AnalyzeProjectsResponse. AI 실패 시에도 보관된 files를 함께 돌려준다(직접 입력에 첨부 가능).

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// 여러 문서를 한 번에 읽는 추론이라 기본 타임아웃으로는 모자란다.
export const maxDuration = 300

const MAX_EACH_BYTES = 4 * 1024 * 1024
// Vercel 함수 요청 본문 한도(4.5MB) 안쪽 — 멀티파트 경계·헤더 여유를 둔다.
const MAX_TOTAL_BYTES = Math.floor(4.4 * 1024 * 1024)
// 텍스트 자료는 파일당 이 글자 수까지만 AI에 보낸다(비용·지연 방지).
const MAX_TEXT_CHARS = 60_000

interface Prepared {
  name: string
  kind: FileKind
  mime: string
  stored: Buffer // Blob에 보관할 바이트(텍스트는 UTF-8로 다시 인코딩)
  input: AiInput
}

export async function POST(request: Request) {
  if (!(await getSession())) return fail("인증이 필요합니다", 401)
  if (!hasExpenseAiKey()) {
    return fail(
      "자료 분석이 설정되지 않았습니다(OPENAI_API_KEY). '직접 입력'으로 등록하세요.",
      503,
      { needs_setup: true },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return fail("파일을 받지 못했습니다. 합계 4.4MB 이하로 다시 올리세요.", 400)
  }
  const files = formData.getAll("files").filter((f): f is File => f instanceof File)
  const hint = String(formData.get("hint") ?? "").slice(0, 1000)

  if (files.length === 0) return fail("사업 자료 파일을 1개 이상 올리세요", 400)
  if (files.length > MAX_PROJECT_DOC_FILES) {
    return fail(`사업 자료는 한 번에 ${MAX_PROJECT_DOC_FILES}개까지 분석할 수 있습니다. 핵심 자료(사업계획서·협약서)만 선택하세요.`, 400)
  }
  const total = files.reduce((s, f) => s + f.size, 0)
  if (total > MAX_TOTAL_BYTES) {
    return fail(
      `한 번에 올릴 수 있는 용량(${formatBytes(MAX_TOTAL_BYTES)})을 넘습니다(현재 ${formatBytes(total)}). 파일 수를 줄이거나 PDF 용량을 줄이세요.`,
      400,
    )
  }

  const warnings: string[] = []
  const prepared: Prepared[] = []
  try {
    for (const file of files) {
      const checked = await checkUpload(file, PROJECT_DOC_MIME_TYPES, MAX_EACH_BYTES)
      if (!checked.ok) return fail(checked.error, 400)
      const name = file.name || "자료"
      if (checked.kind === "text") {
        const text = decodeTextFile(checked.buffer).trim()
        if (!text) return fail(`'${name}' 텍스트 파일에 내용이 없습니다`, 400)
        if (text.length > MAX_TEXT_CHARS) warnings.push(`'${name}'이(가) 길어 앞부분 ${MAX_TEXT_CHARS.toLocaleString("ko-KR")}자만 분석했습니다.`)
        prepared.push({
          name,
          kind: "text",
          mime: "text/plain; charset=utf-8",
          stored: Buffer.from(text, "utf-8"),
          input: { kind: "text", filename: name, text: text.slice(0, MAX_TEXT_CHARS) },
        })
      } else if (checked.kind === "pdf") {
        prepared.push({
          name,
          kind: "pdf",
          mime: checked.mime,
          stored: checked.buffer,
          input: { kind: "pdf", filename: nameWithKindExt(name, "pdf"), data: checked.buffer.toString("base64") },
        })
      } else {
        prepared.push({
          name,
          kind: checked.kind,
          mime: checked.mime,
          stored: checked.buffer,
          input: { kind: "image", filename: name, data: await prepareImageForAi(checked.buffer) },
        })
      }
    }
  } catch (error) {
    if (error instanceof ExpenseAiError) return fail(error.message, error.status)
    console.error("Project doc prepare error:", error)
    return fail("파일을 읽는 중 문제가 생겼습니다. 다시 시도하세요.", 500)
  }

  // 원본 보관 — 실패해도 분석은 계속한다(등록 시 첨부만 빠진다).
  const stored = await Promise.all(
    prepared.map(async (p): Promise<Attachment | null> => {
      try {
        const pathname = await storePrivateBlob(
          PROJECT_DOC_PREFIX.replace(/\/$/, ""),
          nameWithKindExt(p.name, p.kind),
          p.stored,
          p.mime,
        )
        return { name: p.name, pathname, size: p.stored.length, type: p.mime.split(";")[0] }
      } catch (error) {
        console.error("Project doc store error:", p.name, error)
        warnings.push(`'${p.name}' 원본 보관에 실패했습니다(분석은 계속합니다). 등록 후 자료를 다시 첨부하려면 한 번 더 분석하세요.`)
        return null
      }
    }),
  )
  const savedFiles = stored.filter((f): f is Attachment => f !== null)

  try {
    const result = await analyzeProjectDocs(
      prepared.map((p) => p.input),
      hint,
    )
    const body: AnalyzeProjectsResponse = {
      success: true,
      drafts: result.drafts,
      files: savedFiles,
      warnings: [...warnings, ...result.warnings],
    }
    return NextResponse.json(body)
  } catch (error) {
    const e = error instanceof ExpenseAiError ? error : new ExpenseAiError("자료 분석에 실패했습니다. 잠시 후 다시 시도하세요.", 500)
    if (!(error instanceof ExpenseAiError)) console.error("Project analyze error:", error)
    // 보관된 자료는 돌려준다 — 화면에서 '직접 입력'으로 등록하면서 첨부할 수 있다.
    return fail(e.message, e.status, { ...(e.needsSetup ? { needs_setup: true } : {}), files: savedFiles, warnings })
  }
}
