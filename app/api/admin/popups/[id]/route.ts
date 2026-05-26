import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

// GET /api/admin/popups/[id] — single popup (admin only)
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }

  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }

  try {
    const { id } = await params
    const rows = await sql`SELECT * FROM popups WHERE id = ${parseInt(id)}`
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "팝업을 찾을 수 없습니다" }, { status: 404 })
    }
    return NextResponse.json({ success: true, popup: rows[0] })
  } catch (error) {
    console.error("Get popup error:", error)
    return NextResponse.json({ success: false, error: "조회에 실패했습니다" }, { status: 500 })
  }
}

// PATCH /api/admin/popups/[id] — update (admin only)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }

  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }

  try {
    const { id } = await params
    const popupId = parseInt(id)
    const existingRows = await sql`SELECT * FROM popups WHERE id = ${popupId}`
    if (existingRows.length === 0) {
      return NextResponse.json({ success: false, error: "팝업을 찾을 수 없습니다" }, { status: 404 })
    }
    const current = existingRows[0]
    const body = await request.json()

    // Merge incoming fields over current values (partial update friendly).
    const next = {
      title: body.title ?? current.title,
      content: body.content ?? current.content,
      image_url: body.image_url ?? current.image_url,
      link_url: body.link_url ?? current.link_url,
      link_label: body.link_label ?? current.link_label,
      start_at: body.start_at ?? current.start_at,
      end_at: body.end_at ?? current.end_at,
      is_active: body.is_active ?? current.is_active,
      priority: body.priority ?? current.priority,
      related_news_id:
        body.related_news_id !== undefined ? body.related_news_id : current.related_news_id,
    }

    if (new Date(next.end_at) <= new Date(next.start_at)) {
      return NextResponse.json(
        { success: false, error: "종료일은 시작일보다 뒤여야 합니다" },
        { status: 400 }
      )
    }

    const rows = await sql`
      UPDATE popups SET
        title = ${next.title},
        content = ${next.content || null},
        image_url = ${next.image_url || null},
        link_url = ${next.link_url || null},
        link_label = ${next.link_label || null},
        start_at = ${next.start_at},
        end_at = ${next.end_at},
        is_active = ${next.is_active},
        priority = ${Number.isFinite(Number(next.priority)) ? Number(next.priority) : 0},
        related_news_id = ${next.related_news_id || null},
        updated_at = now()
      WHERE id = ${popupId}
      RETURNING *
    `
    return NextResponse.json({ success: true, popup: rows[0] })
  } catch (error) {
    console.error("Update popup error:", error)
    return NextResponse.json({ success: false, error: "수정에 실패했습니다" }, { status: 500 })
  }
}

// DELETE /api/admin/popups/[id] — delete (admin only)
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }

  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }

  try {
    const { id } = await params
    await sql`DELETE FROM popups WHERE id = ${parseInt(id)}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete popup error:", error)
    return NextResponse.json({ success: false, error: "삭제에 실패했습니다" }, { status: 500 })
  }
}
