import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { sendBatch } from "@/lib/mail"

// GET /api/admin/emails?status=sent|failed|queued — 발송 로그 (최근 200건)
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }

  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")

    const rows =
      status === "sent" || status === "failed" || status === "queued"
        ? await sql`
            SELECT l.id, l.to_email, l.tenant_id, l.template_code, l.subject, l.status, l.error,
                   l.related_type, l.related_id, l.sent_at, l.created_at, t.name AS tenant_name
            FROM email_logs l
            LEFT JOIN tenants t ON t.id = l.tenant_id
            WHERE l.status = ${status}
            ORDER BY l.created_at DESC
            LIMIT 200
          `
        : await sql`
            SELECT l.id, l.to_email, l.tenant_id, l.template_code, l.subject, l.status, l.error,
                   l.related_type, l.related_id, l.sent_at, l.created_at, t.name AS tenant_name
            FROM email_logs l
            LEFT JOIN tenants t ON t.id = l.tenant_id
            ORDER BY l.created_at DESC
            LIMIT 200
          `
    return NextResponse.json({ success: true, logs: rows })
  } catch (error) {
    console.error("List email logs error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// POST /api/admin/emails — 수동 발송 (수신 기업 다중 선택 + 제목/본문 직접 작성)
// body: { tenant_ids: number[], subject: string, body_html: string }
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
    const { tenant_ids, subject, body_html } = await request.json()

    if (!Array.isArray(tenant_ids) || tenant_ids.length === 0) {
      return NextResponse.json({ success: false, error: "수신 기업을 선택해주세요" }, { status: 400 })
    }
    if (!subject || !body_html) {
      return NextResponse.json({ success: false, error: "제목과 본문을 입력해주세요" }, { status: 400 })
    }

    const ids = tenant_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)

    // 수신 주소: 포털 계정 이메일 우선, 없으면 담당자 이메일. 입주 중인 기업만.
    const recipients = await sql`
      SELECT t.id, t.name, COALESCE(u.email, t.contact_email) AS email
      FROM tenants t
      LEFT JOIN tenant_users u ON u.tenant_id = t.id
      WHERE t.id = ANY(${ids}) AND t.status = 'active'
    `

    const skipped = recipients.filter((r) => !r.email).map((r) => r.name)
    const portalUrl = `${new URL(request.url).origin}/portal/login`

    // Resend batch API 사용 (건별 순차 호출은 rate limit(2req/s)에 걸린다)
    const result = await sendBatch(
      recipients
        .filter((r) => r.email)
        .map((r) => ({
          to: r.email,
          tenantId: r.id,
          vars: { tenant_name: r.name, portal_url: portalUrl },
        })),
      "manual",
      { subject, html: body_html }
    )

    return NextResponse.json({ success: true, sent: result.sent, failed: result.failed, skipped })
  } catch (error) {
    console.error("Manual send error:", error)
    return NextResponse.json({ success: false, error: "발송에 실패했습니다" }, { status: 500 })
  }
}
