import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

// GET /api/admin/popups — full list (admin only)
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
    const rows = await sql`
      SELECT * FROM popups
      ORDER BY priority DESC, created_at DESC
    `
    return NextResponse.json({ success: true, popups: rows })
  } catch (error) {
    console.error("List popups error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// POST /api/admin/popups — create (admin only)
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
      title,
      content,
      image_url,
      link_url,
      link_label,
      start_at,
      end_at,
      is_active,
      priority,
      related_news_id,
    } = await request.json()

    if (!title || !start_at || !end_at) {
      return NextResponse.json(
        { success: false, error: "제목, 시작일, 종료일은 필수입니다" },
        { status: 400 }
      )
    }
    if (new Date(end_at) <= new Date(start_at)) {
      return NextResponse.json(
        { success: false, error: "종료일은 시작일보다 뒤여야 합니다" },
        { status: 400 }
      )
    }

    const rows = await sql`
      INSERT INTO popups (title, content, image_url, link_url, link_label, start_at, end_at, is_active, priority, related_news_id)
      VALUES (
        ${title},
        ${content || null},
        ${image_url || null},
        ${link_url || null},
        ${link_label || null},
        ${start_at},
        ${end_at},
        ${is_active !== false},
        ${Number.isFinite(Number(priority)) ? Number(priority) : 0},
        ${related_news_id || null}
      )
      RETURNING *
    `
    return NextResponse.json({ success: true, popup: rows[0] })
  } catch (error) {
    console.error("Create popup error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}
