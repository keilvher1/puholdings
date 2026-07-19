import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { sendMail } from "@/lib/mail"

// POST /api/admin/emails/resend — 실패 건 재발송 (기록된 제목/본문 그대로, 새 로그 생성)
// body: { id: number }
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }

  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }

  try {
    const { id } = await request.json()
    const logId = Number(id)
    if (!Number.isInteger(logId) || logId <= 0) {
      return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    }

    const rows = await sql`
      SELECT id, to_email, tenant_id, template_code, subject, body_html, status, related_type, related_id
      FROM email_logs WHERE id = ${logId}
    `
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "존재하지 않는 로그입니다" }, { status: 404 })
    }

    const log = rows[0]
    if (log.status !== "failed") {
      return NextResponse.json(
        { success: false, error: "실패한 발송 건만 재발송할 수 있습니다" },
        { status: 400 }
      )
    }
    // 계정 안내 메일은 로그에 비밀번호가 마스킹되어 있어 재발송 불가 — 비밀번호 초기화로 새로 발급해야 함
    if (log.template_code === "tenant_welcome") {
      return NextResponse.json(
        { success: false, error: "계정 안내 메일은 재발송할 수 없습니다. 입주기업 관리에서 비밀번호 초기화로 다시 발급해주세요" },
        { status: 400 }
      )
    }
    if (!log.subject || !log.body_html) {
      return NextResponse.json(
        { success: false, error: "본문이 기록되지 않은 로그는 재발송할 수 없습니다" },
        { status: 400 }
      )
    }

    const result = await sendMail({
      to: log.to_email,
      templateCode: log.template_code || "manual",
      tenantId: log.tenant_id,
      related:
        log.related_type && log.related_id
          ? { type: log.related_type, id: log.related_id }
          : undefined,
      overrides: { subject: log.subject, html: log.body_html },
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "재발송에 실패했습니다" },
        { status: 502 }
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Resend email error:", error)
    return NextResponse.json({ success: false, error: "재발송에 실패했습니다" }, { status: 500 })
  }
}
