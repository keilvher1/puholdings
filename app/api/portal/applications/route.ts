import { NextResponse } from "next/server"
import { getPortalSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { todayKST } from "@/lib/programs"

// POST /api/portal/applications — { program_id }
// 신청 기간(apply_start~apply_end, KST) 내에만 가능. 중복 신청은 409.
// tenant_id는 세션에서만 읽는다.
export async function POST(request: Request) {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const { program_id } = await request.json()
    const programId = Number(program_id)
    if (!Number.isInteger(programId) || programId <= 0) {
      return NextResponse.json({ success: false, error: "program_id가 필요합니다" }, { status: 400 })
    }

    const programs = await sql`
      SELECT id, status, apply_start::text AS apply_start, apply_end::text AS apply_end
      FROM programs WHERE id = ${programId}
    `
    if (programs.length === 0 || programs[0].status !== "open") {
      return NextResponse.json({ success: false, error: "모집 중인 프로그램이 아닙니다" }, { status: 400 })
    }
    const program = programs[0]
    const today = todayKST()
    if (program.apply_start && today < program.apply_start) {
      return NextResponse.json({ success: false, error: "아직 신청 기간이 아닙니다" }, { status: 400 })
    }
    if (program.apply_end && today > program.apply_end) {
      return NextResponse.json({ success: false, error: "신청 기간이 지났습니다" }, { status: 400 })
    }

    const inserted = await sql`
      INSERT INTO program_applications (program_id, tenant_id)
      VALUES (${programId}, ${session.tenant_id})
      ON CONFLICT (program_id, tenant_id) DO NOTHING
      RETURNING id
    `
    if (inserted.length === 0) {
      return NextResponse.json({ success: false, error: "이미 신청한 프로그램입니다" }, { status: 409 })
    }
    return NextResponse.json({ success: true, id: inserted[0].id })
  } catch (error) {
    console.error("Portal apply error:", error)
    return NextResponse.json({ success: false, error: "신청에 실패했습니다" }, { status: 500 })
  }
}
