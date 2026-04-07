import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

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
    const { title, summary, content, category, is_visible, published_at, image_url } = await request.json()

    await sql`
      INSERT INTO news (title, summary, content, category, is_visible, published_at, image_url)
      VALUES (${title}, ${summary}, ${content || ""}, ${category}, ${is_visible}, ${published_at}, ${image_url || null})
    `

    return NextResponse.json({ success: true })
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
    const { id, title, summary, content, category, is_visible, published_at, image_url } = await request.json()

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
