import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

// GET /api/admin/notes — 메모·확인 사항 목록 (미해결 우선)
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const rows = await sql`
      SELECT * FROM admin_notes
      ORDER BY (status = 'open') DESC, created_at DESC
    `
    return NextResponse.json({ success: true, notes: rows })
  } catch (error) {
    console.error("List notes error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// POST /api/admin/notes — { title, body?, category? } 메모 추가
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const b = await request.json()
    const title = String(b.title ?? "").trim().slice(0, 300)
    if (!title) return NextResponse.json({ success: false, error: "제목을 입력해주세요" }, { status: 400 })
    const category = ["migration", "confirm", "memo"].includes(b.category) ? b.category : "memo"
    const rows = await sql`
      INSERT INTO admin_notes (category, title, body)
      VALUES (${category}, ${title}, ${String(b.body ?? "").trim() || null})
      RETURNING id
    `
    return NextResponse.json({ success: true, id: rows[0].id })
  } catch (error) {
    console.error("Create note error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}

// PUT /api/admin/notes — { id, answer?, status? } 답변 저장·해결/재오픈
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const b = await request.json()
    const id = Number(b.id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })

    if (b.answer !== undefined) {
      const answer = String(b.answer ?? "").trim() || null
      await sql`
        UPDATE admin_notes
        SET answer = ${answer}, answered_at = ${answer ? new Date().toISOString() : null}, updated_at = NOW()
        WHERE id = ${id}
      `
    }
    if (b.status === "resolved" || b.status === "open") {
      await sql`UPDATE admin_notes SET status = ${b.status}, updated_at = NOW() WHERE id = ${id}`
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Update note error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}

// DELETE /api/admin/notes?id=
export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const id = Number(new URL(request.url).searchParams.get("id"))
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    await sql`DELETE FROM admin_notes WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete note error:", error)
    return NextResponse.json({ success: false, error: "삭제에 실패했습니다" }, { status: 500 })
  }
}
