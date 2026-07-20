import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

// GET /api/admin/rooms — 호실 목록 (계약 파생 상태 포함)
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const rows = await sql`
      SELECT r.*,
             c.id AS contract_id, c.tenant_id, t.name AS tenant_name,
             c.ended_at::text AS ended_at, c.status AS contract_status
      FROM rooms r
      LEFT JOIN contracts c ON c.room_id = r.id AND c.status = 'active'
      LEFT JOIN tenants t ON t.id = c.tenant_id
      WHERE r.is_active = TRUE
      ORDER BY r.building, r.sort_order, r.code
    `
    return NextResponse.json({ success: true, rooms: rows })
  } catch (error) {
    console.error("List rooms error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// POST /api/admin/rooms — 호실 등록
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const { code, building, floor, area_m2, pyeong, status, memo, sort_order } = await request.json()
    if (!code || !building) {
      return NextResponse.json({ success: false, error: "호실코드와 건물은 필수입니다" }, { status: 400 })
    }
    if (building !== "본관" && building !== "공장동") {
      return NextResponse.json({ success: false, error: "건물은 본관 또는 공장동이어야 합니다" }, { status: 400 })
    }
    const rows = await sql`
      INSERT INTO rooms (code, building, floor, area_m2, pyeong, status, memo, sort_order)
      VALUES (${code}, ${building}, ${floor ?? null}, ${area_m2 ?? null}, ${pyeong ?? null},
              ${status === "maintenance" ? "maintenance" : "available"}, ${memo || null},
              ${Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0})
      RETURNING *
    `
    return NextResponse.json({ success: true, room: rows[0] })
  } catch (error) {
    console.error("Create room error:", error)
    return NextResponse.json({ success: false, error: "저장 실패 (호실코드 중복 확인)" }, { status: 500 })
  }
}

// PUT /api/admin/rooms — 호실 수정 (body에 id)
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const { id, code, building, floor, area_m2, pyeong, status, memo, sort_order } = await request.json()
    if (!id || !code || !building) {
      return NextResponse.json({ success: false, error: "id·호실코드·건물은 필수입니다" }, { status: 400 })
    }
    const rows = await sql`
      UPDATE rooms
      SET code = ${code}, building = ${building}, floor = ${floor ?? null},
          area_m2 = ${area_m2 ?? null}, pyeong = ${pyeong ?? null},
          status = ${status === "maintenance" ? "maintenance" : "available"},
          memo = ${memo || null}, sort_order = ${Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0}
      WHERE id = ${id}
      RETURNING *
    `
    if (rows.length === 0) return NextResponse.json({ success: false, error: "존재하지 않는 호실입니다" }, { status: 404 })
    return NextResponse.json({ success: true, room: rows[0] })
  } catch (error) {
    console.error("Update room error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}

// DELETE /api/admin/rooms?id= — 계약 이력이 있으면 삭제 대신 비활성 권장
export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const id = Number(new URL(request.url).searchParams.get("id"))
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    const used = await sql`SELECT 1 FROM contracts WHERE room_id = ${id} LIMIT 1`
    if (used.length > 0) {
      await sql`UPDATE rooms SET is_active = FALSE WHERE id = ${id}`
      return NextResponse.json({ success: true, deactivated: true })
    }
    await sql`DELETE FROM rooms WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete room error:", error)
    return NextResponse.json({ success: false, error: "삭제에 실패했습니다" }, { status: 500 })
  }
}
