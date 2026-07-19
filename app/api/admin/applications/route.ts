import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { sendMail } from "@/lib/mail"

// GET /api/admin/applications?program_id= — 신청 현황 (기업 정보 포함)
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
      SELECT a.id, a.tenant_id, a.status, a.applied_at, t.name AS tenant_name, t.room_no,
             s.id AS submission_id, s.status AS submission_status
      FROM program_applications a
      JOIN tenants t ON t.id = a.tenant_id
      LEFT JOIN submissions s ON s.program_id = a.program_id AND s.tenant_id = a.tenant_id
      WHERE a.program_id = ${programId}
      ORDER BY a.applied_at
    `
    return NextResponse.json({ success: true, applications: rows })
  } catch (error) {
    console.error("List applications error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// PUT /api/admin/applications — { id, status, note? }
// accepted/rejected로 바꾸면 application_result 메일 발송
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
    const { id, status, note } = await request.json()
    const appId = Number(id)
    if (!Number.isInteger(appId) || appId <= 0) {
      return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    }
    if (!["applied", "accepted", "rejected", "completed"].includes(status)) {
      return NextResponse.json({ success: false, error: "잘못된 상태입니다" }, { status: 400 })
    }

    // 상태가 실제로 바뀔 때만 갱신 (같은 상태로 재저장 시 결과 메일 중복 발송 방지)
    const rows = await sql`
      UPDATE program_applications SET status = ${status}
      WHERE id = ${appId} AND status IS DISTINCT FROM ${status}
      RETURNING id, program_id, tenant_id
    `
    if (rows.length === 0) {
      const exists = await sql`SELECT id FROM program_applications WHERE id = ${appId}`
      if (exists.length === 0) {
        return NextResponse.json({ success: false, error: "존재하지 않는 신청입니다" }, { status: 404 })
      }
      return NextResponse.json({ success: true, mail_sent: false, unchanged: true })
    }
    const app = rows[0]

    let mailSent = false
    if (status === "accepted" || status === "rejected") {
      const [programs, tenants] = await Promise.all([
        sql`SELECT title FROM programs WHERE id = ${app.program_id}`,
        sql`
          SELECT t.name, COALESCE(u.email, t.contact_email) AS email
          FROM tenants t LEFT JOIN tenant_users u ON u.tenant_id = t.id
          WHERE t.id = ${app.tenant_id}
        `,
      ])
      const tenant = tenants[0]
      if (tenant?.email && programs[0]) {
        const result = await sendMail({
          to: tenant.email,
          templateCode: "application_result",
          tenantId: app.tenant_id,
          related: { type: "program_application", id: app.id },
          vars: {
            tenant_name: tenant.name,
            program_name: programs[0].title,
            result: status === "accepted" ? "선정" : "미선정",
            note:
              typeof note === "string" && note.trim()
                ? note.trim()
                : status === "accepted"
                  ? "자세한 일정과 제출 자료는 포털에서 확인해 주세요."
                  : "아쉽지만 다음 기회에 다시 신청해 주시기 바랍니다.",
            portal_url: `${new URL(request.url).origin}/portal/login`,
          },
        })
        mailSent = result.success
      }
    }

    return NextResponse.json({ success: true, mail_sent: mailSent })
  } catch (error) {
    console.error("Update application error:", error)
    return NextResponse.json({ success: false, error: "처리에 실패했습니다" }, { status: 500 })
  }
}
