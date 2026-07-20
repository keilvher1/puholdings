import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidDateString } from "@/lib/billing"

const DEPOSIT_PER_PYEONG = 200000 // 기준 보증금 = 평당 20만원 × 실제평형

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// GET /api/admin/contracts — 목록(기업·호실 조인). ?tenant_id= / ?room_id= / ?status= 필터
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const { searchParams } = new URL(request.url)
    const tenantId = Number(searchParams.get("tenant_id"))
    const roomId = Number(searchParams.get("room_id"))
    const status = searchParams.get("status")

    const rows = await sql`
      SELECT c.*, c.contract_date::text AS contract_date, c.start_date::text AS start_date,
             c.ended_at::text AS ended_at, c.deposit_returned_at::text AS deposit_returned_at,
             t.name AS tenant_name, r.code AS room_code, r.building
      FROM contracts c
      JOIN tenants t ON t.id = c.tenant_id
      JOIN rooms r ON r.id = c.room_id
      WHERE (${Number.isInteger(tenantId) && tenantId > 0 ? tenantId : null}::int IS NULL OR c.tenant_id = ${Number.isInteger(tenantId) && tenantId > 0 ? tenantId : null})
        AND (${Number.isInteger(roomId) && roomId > 0 ? roomId : null}::int IS NULL OR c.room_id = ${Number.isInteger(roomId) && roomId > 0 ? roomId : null})
        AND (${status === "active" || status === "ended" ? status : null}::text IS NULL OR c.status = ${status === "active" || status === "ended" ? status : null})
      ORDER BY c.status, r.building, r.code
    `
    return NextResponse.json({ success: true, contracts: rows })
  } catch (error) {
    console.error("List contracts error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// POST /api/admin/contracts — 계약 등록 (기준 보증금 자동계산)
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const b = await request.json()
    const tenantId = Number(b.tenant_id)
    const roomId = Number(b.room_id)
    const pyeongBilled = num(b.pyeong_billed)
    const rentUnit = num(b.rent_unit_price)
    if (!Number.isInteger(tenantId) || !Number.isInteger(roomId) || pyeongBilled === null || rentUnit === null) {
      return NextResponse.json({ success: false, error: "기업·호실·부과평형·평당단가는 필수입니다" }, { status: 400 })
    }
    const pyeongActual = num(b.pyeong_actual) ?? pyeongBilled
    const depositStandard = num(b.deposit_standard) ?? Math.round(DEPOSIT_PER_PYEONG * pyeongActual)

    const rows = await sql`
      INSERT INTO contracts (
        tenant_id, room_id, contract_date, start_date, renewal_type,
        pyeong_billed, pyeong_actual, rent_unit_price, mgmt_fee,
        deposit_standard, deposit_actual, elec_method, first_month_billing, memo)
      VALUES (
        ${tenantId}, ${roomId},
        ${isValidDateString(b.contract_date) ? b.contract_date : null},
        ${isValidDateString(b.start_date) ? b.start_date : null},
        ${b.renewal_type === "new" ? "new" : "renewal"},
        ${pyeongBilled}, ${pyeongActual}, ${rentUnit}, ${num(b.mgmt_fee) ?? 15000},
        ${depositStandard}, ${num(b.deposit_actual)},
        ${b.elec_method === "metered" ? "metered" : "area"},
        ${["full", "prorated", "none"].includes(b.first_month_billing) ? b.first_month_billing : "full"},
        ${b.memo || null})
      RETURNING id
    `
    return NextResponse.json({ success: true, id: rows[0].id })
  } catch (error) {
    console.error("Create contract error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}

// PUT /api/admin/contracts — 수정 (body에 id)
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const b = await request.json()
    const id = Number(b.id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    const pyeongBilled = num(b.pyeong_billed)
    const rentUnit = num(b.rent_unit_price)
    if (pyeongBilled === null || rentUnit === null) {
      return NextResponse.json({ success: false, error: "부과평형·평당단가는 필수입니다" }, { status: 400 })
    }
    const pyeongActual = num(b.pyeong_actual) ?? pyeongBilled
    const depositStandard = num(b.deposit_standard) ?? Math.round(DEPOSIT_PER_PYEONG * pyeongActual)

    const rows = await sql`
      UPDATE contracts SET
        contract_date = ${isValidDateString(b.contract_date) ? b.contract_date : null},
        start_date = ${isValidDateString(b.start_date) ? b.start_date : null},
        renewal_type = ${b.renewal_type === "new" ? "new" : "renewal"},
        pyeong_billed = ${pyeongBilled}, pyeong_actual = ${pyeongActual},
        rent_unit_price = ${rentUnit}, mgmt_fee = ${num(b.mgmt_fee) ?? 15000},
        deposit_standard = ${depositStandard}, deposit_actual = ${num(b.deposit_actual)},
        elec_method = ${b.elec_method === "metered" ? "metered" : "area"},
        first_month_billing = ${["full", "prorated", "none"].includes(b.first_month_billing) ? b.first_month_billing : "full"},
        memo = ${b.memo || null}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id
    `
    if (rows.length === 0) return NextResponse.json({ success: false, error: "존재하지 않는 계약입니다" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Update contract error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}

// DELETE /api/admin/contracts?id=
export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const id = Number(new URL(request.url).searchParams.get("id"))
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    await sql`DELETE FROM contracts WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete contract error:", error)
    return NextResponse.json({ success: false, error: "삭제에 실패했습니다" }, { status: 500 })
  }
}
