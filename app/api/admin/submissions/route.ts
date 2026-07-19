import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { sendMail } from "@/lib/mail"

// GET /api/admin/submissions?program_id= — 제출물 목록
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
    const programId = Number(searchParams.get("program_id"))
    if (!Number.isInteger(programId) || programId <= 0) {
      return NextResponse.json({ success: false, error: "program_id가 필요합니다" }, { status: 400 })
    }
    const rows = await sql`
      SELECT s.*, t.name AS tenant_name, t.room_no
      FROM submissions s
      JOIN tenants t ON t.id = s.tenant_id
      WHERE s.program_id = ${programId}
      ORDER BY s.submitted_at
    `
    return NextResponse.json({ success: true, submissions: rows })
  } catch (error) {
    console.error("List submissions error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// PUT /api/admin/submissions — { id, status, feedback? }
// approved/rejected/resubmit_requested로 바꾸면 submission_feedback 메일 발송
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const { id, status, feedback } = await request.json()
    const subId = Number(id)
    if (!Number.isInteger(subId) || subId <= 0) {
      return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    }
    if (!["reviewing", "approved", "rejected", "resubmit_requested"].includes(status)) {
      return NextResponse.json({ success: false, error: "잘못된 상태입니다" }, { status: 400 })
    }
    const cleanFeedback = typeof feedback === "string" ? feedback.trim() || null : null

    // 상태/피드백이 실제로 바뀔 때만 갱신·메일 발송 (동일 내용 재저장 시 중복 발송 방지)
    const rows = await sql`
      UPDATE submissions
      SET status = ${status}, feedback = ${cleanFeedback}, updated_at = NOW()
      WHERE id = ${subId}
        AND (status IS DISTINCT FROM ${status} OR feedback IS DISTINCT FROM ${cleanFeedback})
      RETURNING id, program_id, tenant_id
    `
    if (rows.length === 0) {
      const exists = await sql`SELECT id FROM submissions WHERE id = ${subId}`
      if (exists.length === 0) {
        return NextResponse.json({ success: false, error: "존재하지 않는 제출물입니다" }, { status: 404 })
      }
      return NextResponse.json({ success: true, mail_sent: false, unchanged: true })
    }
    const sub = rows[0]

    let mailSent = false
    if (status === "approved" || status === "rejected" || status === "resubmit_requested") {
      const [programs, tenants] = await Promise.all([
        sql`SELECT title FROM programs WHERE id = ${sub.program_id}`,
        sql`
          SELECT t.name, COALESCE(u.email, t.contact_email) AS email
          FROM tenants t LEFT JOIN tenant_users u ON u.tenant_id = t.id
          WHERE t.id = ${sub.tenant_id}
        `,
      ])
      const tenant = tenants[0]
      if (tenant?.email && programs[0]) {
        const statusText =
          status === "approved" ? "승인되었습니다." : status === "rejected" ? "반려되었습니다." : "재제출이 필요합니다."
        const result = await sendMail({
          to: tenant.email,
          templateCode: "submission_feedback",
          tenantId: sub.tenant_id,
          related: { type: "submission", id: sub.id },
          vars: {
            tenant_name: tenant.name,
            submission_name: programs[0].title,
            feedback: cleanFeedback ? `${statusText} ${cleanFeedback}` : statusText,
            portal_url: `${new URL(request.url).origin}/portal/login`,
          },
        })
        mailSent = result.success
      }
    }

    return NextResponse.json({ success: true, mail_sent: mailSent })
  } catch (error) {
    console.error("Update submission error:", error)
    return NextResponse.json({ success: false, error: "처리에 실패했습니다" }, { status: 500 })
  }
}
