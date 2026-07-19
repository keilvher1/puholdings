import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

// GET /api/admin/billing/items — 관리비 항목 목록
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const rows = await sql`SELECT * FROM billing_items ORDER BY sort_order, id`
    return NextResponse.json({ success: true, items: rows })
  } catch (error) {
    console.error("List billing items error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// POST /api/admin/billing/items — 항목 추가
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
    const { name, unit, unit_price, is_metered, default_amount, sort_order, is_active } = await request.json()
    if (!name) {
      return NextResponse.json({ success: false, error: "항목명은 필수입니다" }, { status: 400 })
    }
    const metered = is_metered === true
    if (metered && !(Number(unit_price) > 0)) {
      return NextResponse.json({ success: false, error: "검침 항목은 단가가 필요합니다" }, { status: 400 })
    }
    const rows = await sql`
      INSERT INTO billing_items (name, unit, unit_price, is_metered, default_amount, sort_order, is_active)
      VALUES (
        ${name},
        ${unit || null},
        ${unit_price ?? null},
        ${metered},
        ${default_amount ?? null},
        ${Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0},
        ${is_active !== false}
      )
      RETURNING *
    `
    return NextResponse.json({ success: true, item: rows[0] })
  } catch (error) {
    console.error("Create billing item error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다 (항목명 중복 여부를 확인하세요)" }, { status: 500 })
  }
}

// PUT /api/admin/billing/items — 항목 수정 (body에 id)
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
    const { id, name, unit, unit_price, is_metered, default_amount, sort_order, is_active } = await request.json()
    if (!id || !name) {
      return NextResponse.json({ success: false, error: "id와 항목명은 필수입니다" }, { status: 400 })
    }
    if (is_metered === true && !(Number(unit_price) > 0)) {
      return NextResponse.json({ success: false, error: "검침 항목은 단가가 필요합니다" }, { status: 400 })
    }
    const rows = await sql`
      UPDATE billing_items
      SET name = ${name},
          unit = ${unit || null},
          unit_price = ${unit_price ?? null},
          is_metered = ${is_metered === true},
          default_amount = ${default_amount ?? null},
          sort_order = ${Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0},
          is_active = ${is_active !== false}
      WHERE id = ${id}
      RETURNING *
    `
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "존재하지 않는 항목입니다" }, { status: 404 })
    }
    return NextResponse.json({ success: true, item: rows[0] })
  } catch (error) {
    console.error("Update billing item error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}

// DELETE /api/admin/billing/items?id=1
export async function DELETE(request: Request) {
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
    const id = Number(searchParams.get("id"))
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    }
    const rows = await sql`DELETE FROM billing_items WHERE id = ${id} RETURNING id`
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "존재하지 않는 항목입니다" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    // meter_readings에서 참조 중이면 FK 제약으로 삭제 불가
    console.error("Delete billing item error:", error)
    return NextResponse.json(
      { success: false, error: "검침 기록이 있는 항목은 삭제할 수 없습니다. 대신 비활성화하세요" },
      { status: 400 }
    )
  }
}
