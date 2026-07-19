import { NextResponse } from "next/server"
import { createHmac, createHash, timingSafeEqual } from "node:crypto"
import { put } from "@vercel/blob"
import { getDb } from "@/lib/db"

// POST /api/webhooks/cloudconvert — 변환 완료/실패 webhook.
// CloudConvert-Signature(HMAC-SHA256, CLOUDCONVERT_WEBHOOK_SECRET) 검증 실패 시 401.
//
// job.finished: export URL에서 PDF를 받아 previews/<sha1(source_pathname)>.pdf 로
// private 저장 → file_conversions done → news/programs/submissions의 attachments JSONB에
// preview_pathname/preview_status 반영.
// job.failed: failed + error 기록 및 preview_status='failed' 반영.

interface CloudConvertTask {
  name: string
  operation: string
  status: string
  message?: string | null
  result?: { files?: { filename?: string; url?: string }[] }
}

function verifySignature(payload: string, signature: string | null): boolean {
  const secret = process.env.CLOUDCONVERT_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = createHmac("sha256", secret).update(payload).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

// news/programs/submissions의 attachments JSONB 배열에서 해당 pathname 요소에 미리보기 정보 병합
async function patchAttachments(
  sourcePathname: string,
  patch: { preview_pathname?: string; preview_status: string }
): Promise<void> {
  const sql = getDb()
  if (!sql) return
  const patchJson = JSON.stringify(patch)
  const containsJson = JSON.stringify([{ pathname: sourcePathname }])
  try {
    await sql`
      UPDATE news SET attachments = (
        SELECT COALESCE(jsonb_agg(
          CASE WHEN elem->>'pathname' = ${sourcePathname} THEN elem || ${patchJson}::jsonb ELSE elem END
        ), '[]'::jsonb)
        FROM jsonb_array_elements(news.attachments) elem
      )
      WHERE attachments @> ${containsJson}::jsonb
    `
    await sql`
      UPDATE programs SET attachments = (
        SELECT COALESCE(jsonb_agg(
          CASE WHEN elem->>'pathname' = ${sourcePathname} THEN elem || ${patchJson}::jsonb ELSE elem END
        ), '[]'::jsonb)
      FROM jsonb_array_elements(programs.attachments) elem
      )
      WHERE attachments @> ${containsJson}::jsonb
    `
    await sql`
      UPDATE submissions SET attachments = (
        SELECT COALESCE(jsonb_agg(
          CASE WHEN elem->>'pathname' = ${sourcePathname} THEN elem || ${patchJson}::jsonb ELSE elem END
        ), '[]'::jsonb)
        FROM jsonb_array_elements(submissions.attachments) elem
      )
      WHERE attachments @> ${containsJson}::jsonb
    `
  } catch (error) {
    console.error("[convert] attachments JSONB 갱신 실패:", error)
  }
}

export async function POST(request: Request) {
  const payload = await request.text()
  const signature = request.headers.get("cloudconvert-signature")
  if (!verifySignature(payload, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 500 })
  }

  try {
    const body = JSON.parse(payload)
    const event: string = body?.event
    const jobId: string | undefined = body?.job?.id
    const tasks: CloudConvertTask[] = body?.job?.tasks ?? []
    if (!jobId || (event !== "job.finished" && event !== "job.failed")) {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const conversions = await sql`
      SELECT id, source_pathname FROM file_conversions WHERE job_id = ${jobId}
    `
    if (conversions.length === 0) {
      // 우리가 만든 job이 아니거나 기록 유실 — 무시
      return NextResponse.json({ ok: true, ignored: true })
    }
    const sourcePathname: string = conversions[0].source_pathname

    if (event === "job.failed") {
      const failedTask = tasks.find((t) => t.status === "error")
      const message = failedTask?.message || "변환 작업이 실패했습니다"
      await sql`
        UPDATE file_conversions
        SET status = 'failed', error = ${message}, updated_at = NOW()
        WHERE job_id = ${jobId}
      `
      await patchAttachments(sourcePathname, { preview_status: "failed" })
      return NextResponse.json({ ok: true })
    }

    // job.finished — export/url task에서 PDF 다운로드
    const exportTask = tasks.find((t) => t.operation === "export/url" && t.status === "finished")
    const fileUrl = exportTask?.result?.files?.[0]?.url
    if (!fileUrl) {
      await sql`
        UPDATE file_conversions
        SET status = 'failed', error = 'export URL이 없습니다', updated_at = NOW()
        WHERE job_id = ${jobId}
      `
      await patchAttachments(sourcePathname, { preview_status: "failed" })
      return NextResponse.json({ ok: true })
    }

    const pdfRes = await fetch(fileUrl)
    if (!pdfRes.ok) {
      throw new Error(`변환 결과 다운로드 실패 (${pdfRes.status})`)
    }
    const pdfBuffer = await pdfRes.arrayBuffer()

    const hash = createHash("sha1").update(sourcePathname).digest("hex")
    const previewPathname = `previews/${hash}.pdf`
    const blob = await put(previewPathname, pdfBuffer, {
      access: "private",
      contentType: "application/pdf",
      allowOverwrite: true,
    })

    await sql`
      UPDATE file_conversions
      SET status = 'done', preview_pathname = ${blob.pathname}, error = NULL, updated_at = NOW()
      WHERE job_id = ${jobId}
    `
    await patchAttachments(sourcePathname, {
      preview_pathname: blob.pathname,
      preview_status: "done",
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("CloudConvert webhook error:", error)
    return NextResponse.json({ error: "webhook 처리 실패" }, { status: 500 })
  }
}
