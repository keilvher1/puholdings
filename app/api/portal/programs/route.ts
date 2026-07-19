import { NextResponse } from "next/server"
import { getPortalSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

// GET /api/portal/programs — open 프로그램 + 본인 신청/제출 상태.
// ?id= 지정 시 단건 상세 (open/closed만 — 마감 후에도 제출/피드백 확인 가능해야 함).
// 스코프는 세션 tenant_id로만 결정한다.
export async function GET(request: Request) {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (id) {
      const programId = Number(id)
      if (!Number.isInteger(programId) || programId <= 0) {
        return NextResponse.json({ success: false, error: "잘못된 id입니다" }, { status: 400 })
      }
      const rows = await sql`
        SELECT p.id, p.title, p.description, p.category, p.status, p.attachments,
               p.apply_start::text AS apply_start, p.apply_end::text AS apply_end,
               p.submit_deadline::text AS submit_deadline,
               a.id AS application_id, a.status AS application_status, a.applied_at,
               s.id AS submission_id, s.title AS submission_title, s.note AS submission_note,
               s.attachments AS submission_attachments, s.status AS submission_status,
               s.feedback, s.submitted_at, s.updated_at AS submission_updated_at
        FROM programs p
        LEFT JOIN program_applications a ON a.program_id = p.id AND a.tenant_id = ${session.tenant_id}
        LEFT JOIN submissions s ON s.program_id = p.id AND s.tenant_id = ${session.tenant_id}
        WHERE p.id = ${programId} AND p.status IN ('open', 'closed')
      `
      if (rows.length === 0) {
        return NextResponse.json({ success: false, error: "프로그램을 찾을 수 없습니다" }, { status: 404 })
      }
      return NextResponse.json({ success: true, program: rows[0] })
    }

    const rows = await sql`
      SELECT p.id, p.title, p.description, p.category, p.status,
             p.apply_start::text AS apply_start, p.apply_end::text AS apply_end,
             p.submit_deadline::text AS submit_deadline,
             a.status AS application_status,
             s.status AS submission_status
      FROM programs p
      LEFT JOIN program_applications a ON a.program_id = p.id AND a.tenant_id = ${session.tenant_id}
      LEFT JOIN submissions s ON s.program_id = p.id AND s.tenant_id = ${session.tenant_id}
      WHERE p.status = 'open' OR (p.status = 'closed' AND a.id IS NOT NULL)
      ORDER BY p.apply_end NULLS LAST, p.id DESC
    `
    return NextResponse.json({ success: true, programs: rows })
  } catch (error) {
    console.error("Portal programs error:", error)
    return NextResponse.json({ success: false, error: "프로그램을 불러오지 못했습니다" }, { status: 500 })
  }
}
