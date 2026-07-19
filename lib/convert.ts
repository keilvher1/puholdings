import { get } from "@vercel/blob"
import { getDb } from "./db"
import type { Attachment } from "./db"

// hwp/hwpx/doc 등 브라우저가 직접 렌더링 못 하는 문서를 CloudConvert로 PDF 변환해
// /api/file 프록시로 미리보기를 제공한다.
//
// 설계 원칙:
// - enqueueConversion은 실패해도 throw하지 않는다 (업로드 자체를 깨지 않기 위해).
// - CLOUDCONVERT_API_KEY / APP_URL 미설정 시 변환만 스킵하고 failed로 기록한다.
// - source_pathname UNIQUE upsert로 같은 파일의 중복 변환을 방지한다.

const CONVERTIBLE_EXTENSIONS = [".hwp", ".hwpx", ".doc", ".docx", ".ppt", ".pptx"]
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"]

function extOf(filename: string): string {
  return (filename.match(/\.[^.]+$/)?.[0] || "").toLowerCase()
}

// PDF 변환이 필요한 파일인가 (pdf·이미지는 브라우저가 직접 보여주므로 불필요)
export function needsConversion(filename: string): boolean {
  return CONVERTIBLE_EXTENSIONS.includes(extOf(filename))
}

export function isImageFile(attachment: Pick<Attachment, "name" | "type">): boolean {
  return attachment.type.startsWith("image/") || IMAGE_EXTENSIONS.includes(extOf(attachment.name))
}

export function isPdfFile(attachment: Pick<Attachment, "name" | "type">): boolean {
  return attachment.type === "application/pdf" || extOf(attachment.name) === ".pdf"
}

// 미리보기 가능 여부와 표시할 pathname (pdf/이미지는 원본, 변환 대상은 preview_pathname)
export function getPreviewInfo(attachment: Attachment): { previewable: boolean; pathname?: string } {
  if (isPdfFile(attachment) || isImageFile(attachment)) {
    return { previewable: true, pathname: attachment.pathname }
  }
  if (attachment.preview_status === "done" && attachment.preview_pathname) {
    return { previewable: true, pathname: attachment.preview_pathname }
  }
  return { previewable: false }
}

async function markConversion(
  pathname: string,
  fields: { status: string; job_id?: string | null; error?: string | null }
): Promise<void> {
  const sql = getDb()
  if (!sql) return
  try {
    await sql`
      UPDATE file_conversions
      SET status = ${fields.status},
          job_id = ${fields.job_id ?? null},
          error = ${fields.error ?? null},
          updated_at = NOW()
      WHERE source_pathname = ${pathname}
    `
  } catch (error) {
    console.error("[convert] 상태 기록 실패:", error)
  }
}

// 변환 큐 등록: file_conversions upsert(pending) → CloudConvert job 생성 →
// Blob에서 원본을 읽어 import/upload로 직접 업로드 (private Blob이라 URL import 불가).
export async function enqueueConversion(
  pathname: string
): Promise<{ success: boolean; status: "pending" | "failed" | "skipped" }> {
  const sql = getDb()
  if (!sql) return { success: false, status: "failed" }

  try {
    // source_pathname UNIQUE upsert — 같은 pathname에 대한 중복 job 생성을 막는다
    // (재시도/웹훅 경합 방어). failed 상태만 재변환하고 pending/processing/done은 스킵.
    // 참고: 업로드마다 pathname에 타임스탬프가 붙으므로 동일 파일 재업로드는 새 job이 된다.
    const rows = await sql`
      INSERT INTO file_conversions (source_pathname, status)
      VALUES (${pathname}, 'pending')
      ON CONFLICT (source_pathname) DO UPDATE
      SET status = 'pending', error = NULL, preview_pathname = NULL, updated_at = NOW()
      WHERE file_conversions.status = 'failed'
      RETURNING id
    `
    if (rows.length === 0) {
      return { success: true, status: "skipped" }
    }

    const apiKey = process.env.CLOUDCONVERT_API_KEY
    if (!apiKey) {
      console.warn("[convert] CLOUDCONVERT_API_KEY 미설정 — 변환 스킵:", pathname)
      await markConversion(pathname, { status: "failed", error: "CLOUDCONVERT_API_KEY not set" })
      return { success: false, status: "failed" }
    }
    const appUrl = process.env.APP_URL
    if (!appUrl) {
      console.warn("[convert] APP_URL 미설정 — 변환 스킵:", pathname)
      await markConversion(pathname, { status: "failed", error: "APP_URL not set" })
      return { success: false, status: "failed" }
    }

    // 1. CloudConvert job 생성 (import/upload → convert(pdf) → export/url)
    const jobRes = await fetch("https://api.cloudconvert.com/v2/jobs", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tag: pathname.slice(0, 250),
        webhook_url: `${appUrl.replace(/\/$/, "")}/api/webhooks/cloudconvert`,
        tasks: {
          "import-file": { operation: "import/upload" },
          "convert-file": { operation: "convert", input: "import-file", output_format: "pdf" },
          "export-file": { operation: "export/url", input: "convert-file" },
        },
      }),
    })
    if (!jobRes.ok) {
      const text = await jobRes.text()
      throw new Error(`CloudConvert job 생성 실패 (${jobRes.status}): ${text.slice(0, 300)}`)
    }
    const jobData = await jobRes.json()
    const jobId: string = jobData?.data?.id
    const importTask = (jobData?.data?.tasks ?? []).find(
      (t: { operation: string }) => t.operation === "import/upload"
    )
    const form = importTask?.result?.form
    if (!jobId || !form?.url || !form?.parameters) {
      throw new Error("CloudConvert 응답에 업로드 폼이 없습니다")
    }

    // 2. Blob에서 원본 읽기 (get()은 { statusCode, stream, blob }을 반환)
    const result = await get(pathname, { access: "private" })
    if (!result || !result.stream) {
      throw new Error("원본 파일을 Blob에서 찾을 수 없습니다")
    }
    const buffer = await new Response(result.stream).arrayBuffer()

    // 3. import/upload 폼으로 직접 업로드 (파일명 확장자로 입력 포맷을 인식하므로 원본명 유지)
    const filename = pathname.split("/").pop() || "file"
    const formData = new FormData()
    for (const [key, value] of Object.entries(form.parameters as Record<string, string>)) {
      formData.append(key, value)
    }
    formData.append("file", new Blob([buffer]), filename)

    const uploadRes = await fetch(form.url, { method: "POST", body: formData })
    if (!uploadRes.ok) {
      throw new Error(`CloudConvert 업로드 실패 (${uploadRes.status})`)
    }

    await markConversion(pathname, { status: "processing", job_id: jobId })
    return { success: true, status: "pending" }
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류"
    console.error("[convert] 변환 등록 실패:", pathname, error)
    await markConversion(pathname, { status: "failed", error: message })
    return { success: false, status: "failed" }
  }
}
