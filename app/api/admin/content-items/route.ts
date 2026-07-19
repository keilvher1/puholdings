import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { getCollectionDef } from "@/lib/content-schema"

// GET /api/admin/content-items?collection= — 해당 collection 전체(비활성 포함)
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
    const collection = searchParams.get("collection") || ""
    if (!getCollectionDef(collection)) {
      return NextResponse.json({ success: false, error: "알 수 없는 collection입니다" }, { status: 400 })
    }
    const rows = await sql`
      SELECT id, sort_order, is_active, data
      FROM content_items
      WHERE collection = ${collection}
      ORDER BY sort_order, id
    `
    return NextResponse.json({ success: true, items: rows })
  } catch (error) {
    console.error("List content items error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// POST /api/admin/content-items — { collection, data, sort_order?, is_active? }
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
    const { collection, data, sort_order, is_active } = await request.json()
    if (!getCollectionDef(collection)) {
      return NextResponse.json({ success: false, error: "알 수 없는 collection입니다" }, { status: 400 })
    }
    if (!data || typeof data !== "object") {
      return NextResponse.json({ success: false, error: "data가 필요합니다" }, { status: 400 })
    }
    // sort_order 미지정 시 맨 끝에 추가
    let order = Number(sort_order)
    if (!Number.isFinite(order)) {
      const maxRows = await sql`SELECT COALESCE(MAX(sort_order), 0) AS m FROM content_items WHERE collection = ${collection}`
      order = Number(maxRows[0].m) + 1
    }
    const rows = await sql`
      INSERT INTO content_items (collection, sort_order, is_active, data)
      VALUES (${collection}, ${order}, ${is_active !== false}, ${JSON.stringify(data)}::jsonb)
      RETURNING id
    `
    return NextResponse.json({ success: true, id: rows[0].id })
  } catch (error) {
    console.error("Create content item error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}

// PUT /api/admin/content-items — { id, data?, sort_order?, is_active? }
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
    const { id, data, sort_order, is_active } = await request.json()
    const itemId = Number(id)
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    }

    const existing = await sql`SELECT data, sort_order, is_active FROM content_items WHERE id = ${itemId}`
    if (existing.length === 0) {
      return NextResponse.json({ success: false, error: "존재하지 않는 항목입니다" }, { status: 404 })
    }
    // 전달된 필드만 갱신, 나머지는 기존 값 유지
    const nextData = data !== undefined && data !== null ? JSON.stringify(data) : JSON.stringify(existing[0].data)
    const nextOrder = Number.isFinite(Number(sort_order)) ? Number(sort_order) : existing[0].sort_order
    const nextActive = typeof is_active === "boolean" ? is_active : existing[0].is_active

    await sql`
      UPDATE content_items
      SET data = ${nextData}::jsonb, sort_order = ${nextOrder}, is_active = ${nextActive}, updated_at = NOW()
      WHERE id = ${itemId}
    `
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Update content item error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}

// DELETE /api/admin/content-items?id=
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
    const rows = await sql`DELETE FROM content_items WHERE id = ${id} RETURNING id`
    return NextResponse.json({ success: rows.length > 0 })
  } catch (error) {
    console.error("Delete content item error:", error)
    return NextResponse.json({ success: false, error: "삭제에 실패했습니다" }, { status: 500 })
  }
}
