import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

// Build the popup body from a news item: prefer summary, fall back to first 200 chars of content.
function popupContentFrom(summary?: string, content?: string): string | null {
  if (summary && summary.trim()) return summary
  if (content && content.trim()) return content.slice(0, 200)
  return null
}

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
      summary,
      content,
      category,
      is_visible,
      published_at,
      image_url,
      popup_enabled,
      popup_start_at,
      popup_end_at,
      popup_priority,
    } = await request.json()

    const inserted = await sql`
      INSERT INTO news (title, summary, content, category, is_visible, published_at, image_url)
      VALUES (${title}, ${summary}, ${content || ""}, ${category}, ${is_visible}, ${published_at}, ${image_url || null})
      RETURNING id
    `
    const newsId = inserted[0].id

    if (popup_enabled && popup_start_at && popup_end_at) {
      await sql`
        INSERT INTO popups (title, content, image_url, link_url, start_at, end_at, is_active, priority, related_news_id)
        VALUES (
          ${title},
          ${popupContentFrom(summary, content)},
          ${image_url || null},
          ${"/news"},
          ${popup_start_at},
          ${popup_end_at},
          ${true},
          ${Number.isFinite(Number(popup_priority)) ? Number(popup_priority) : 0},
          ${newsId}
        )
      `
    }

    return NextResponse.json({ success: true, id: newsId })
  } catch (error) {
    console.error("Create news error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}

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
      title,
      summary,
      content,
      category,
      is_visible,
      published_at,
      image_url,
      popup_enabled,
      popup_start_at,
      popup_end_at,
      popup_priority,
    } = await request.json()

    await sql`
      UPDATE news SET
        title = ${title},
        summary = ${summary},
        content = ${content || ""},
        category = ${category},
        is_visible = ${is_visible},
        published_at = ${published_at},
        image_url = ${image_url || null}
      WHERE id = ${id}
    `

    // Sync the linked popup (if any).
    const existing = await sql`SELECT id FROM popups WHERE related_news_id = ${id} LIMIT 1`
    const popupId = existing[0]?.id

    if (popup_enabled && popup_start_at && popup_end_at) {
      const priority = Number.isFinite(Number(popup_priority)) ? Number(popup_priority) : 0
      if (popupId) {
        await sql`
          UPDATE popups SET
            title = ${title},
            content = ${popupContentFrom(summary, content)},
            image_url = ${image_url || null},
            link_url = ${"/news"},
            start_at = ${popup_start_at},
            end_at = ${popup_end_at},
            is_active = ${true},
            priority = ${priority},
            updated_at = now()
          WHERE id = ${popupId}
        `
      } else {
        await sql`
          INSERT INTO popups (title, content, image_url, link_url, start_at, end_at, is_active, priority, related_news_id)
          VALUES (
            ${title},
            ${popupContentFrom(summary, content)},
            ${image_url || null},
            ${"/news"},
            ${popup_start_at},
            ${popup_end_at},
            ${true},
            ${priority},
            ${id}
          )
        `
      }
    } else if (popupId) {
      // Unchecked but a linked popup exists -> deactivate it (preserve the record).
      await sql`UPDATE popups SET is_active = ${false}, updated_at = now() WHERE id = ${popupId}`
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Update news error:", error)
    return NextResponse.json({ success: false, error: "수정에 실패했습니다" }, { status: 500 })
  }
}

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
    const { id } = await request.json()
    await sql`DELETE FROM news WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete news error:", error)
    return NextResponse.json({ success: false, error: "삭제에 실패했습니다" }, { status: 500 })
  }
}
