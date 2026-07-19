import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

// GET /api/admin/tenants?status=active|moved_out — 입주기업 목록 (계정 유무 포함)
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

    // DATE는 텍스트로 캐스팅: JS Date 직렬화(UTC 변환)로 인한 하루 밀림 방지
    const rows =
      status === "active" || status === "moved_out"
        ? await sql`
            SELECT t.id, t.name, t.business_no, t.ceo_name, t.room_no, t.contact_email, t.contact_phone,
                   t.move_in_date::text AS move_in_date, t.move_out_date::text AS move_out_date,
                   t.status, t.memo, t.created_at, t.updated_at,
                   u.id AS account_id, u.email AS account_email, u.last_login AS account_last_login
            FROM tenants t
            LEFT JOIN tenant_users u ON u.tenant_id = t.id
            WHERE t.status = ${status}
            ORDER BY t.room_no NULLS LAST, t.name
          `
        : await sql`
            SELECT t.id, t.name, t.business_no, t.ceo_name, t.room_no, t.contact_email, t.contact_phone,
                   t.move_in_date::text AS move_in_date, t.move_out_date::text AS move_out_date,
                   t.status, t.memo, t.created_at, t.updated_at,
                   u.id AS account_id, u.email AS account_email, u.last_login AS account_last_login
            FROM tenants t
            LEFT JOIN tenant_users u ON u.tenant_id = t.id
            ORDER BY t.status, t.room_no NULLS LAST, t.name
          `
    return NextResponse.json({ success: true, tenants: rows })
  } catch (error) {
    console.error("List tenants error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// POST /api/admin/tenants — 등록
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
    const {
      name,
      business_no,
      ceo_name,
      room_no,
      contact_email,
      contact_phone,
      move_in_date,
      move_out_date,
      status,
      memo,
    } = await request.json()

    if (!name) {
      return NextResponse.json({ success: false, error: "기업명은 필수입니다" }, { status: 400 })
    }

    const rows = await sql`
      INSERT INTO tenants (name, business_no, ceo_name, room_no, contact_email, contact_phone, move_in_date, move_out_date, status, memo)
      VALUES (
        ${name},
        ${business_no || null},
        ${ceo_name || null},
        ${room_no || null},
        ${contact_email || null},
        ${contact_phone || null},
        ${move_in_date || null},
        ${move_out_date || null},
        ${status === "moved_out" ? "moved_out" : "active"},
        ${memo || null}
      )
      RETURNING *
    `
    return NextResponse.json({ success: true, tenant: rows[0] })
  } catch (error) {
    console.error("Create tenant error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}

// PUT /api/admin/tenants — 수정 (body에 id 포함)
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
    const {
      id,
      name,
      business_no,
      ceo_name,
      room_no,
      contact_email,
      contact_phone,
      move_in_date,
      move_out_date,
      status,
      memo,
    } = await request.json()

    if (!id || !name) {
      return NextResponse.json({ success: false, error: "id와 기업명은 필수입니다" }, { status: 400 })
    }

    const rows = await sql`
      UPDATE tenants
      SET name = ${name},
          business_no = ${business_no || null},
          ceo_name = ${ceo_name || null},
          room_no = ${room_no || null},
          contact_email = ${contact_email || null},
          contact_phone = ${contact_phone || null},
          move_in_date = ${move_in_date || null},
          move_out_date = ${move_out_date || null},
          status = ${status === "moved_out" ? "moved_out" : "active"},
          memo = ${memo || null},
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "존재하지 않는 기업입니다" }, { status: 404 })
    }
    return NextResponse.json({ success: true, tenant: rows[0] })
  } catch (error) {
    console.error("Update tenant error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}

// DELETE /api/admin/tenants?id=1 — 삭제 (tenant_users는 CASCADE)
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

    const rows = await sql`DELETE FROM tenants WHERE id = ${id} RETURNING id`
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "존재하지 않는 기업입니다" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete tenant error:", error)
    return NextResponse.json({ success: false, error: "삭제에 실패했습니다" }, { status: 500 })
  }
}
