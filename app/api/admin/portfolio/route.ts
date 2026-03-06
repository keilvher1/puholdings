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
    const { name, name_en, category, description, website, investment_year, status, sort_order } = await request.json()

    await sql`
      INSERT INTO portfolio_companies (name, name_en, category, description, website, investment_year, status, sort_order)
      VALUES (${name}, ${name_en || ""}, ${category}, ${description || ""}, ${website || ""}, ${investment_year}, ${status}, ${sort_order})
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Create portfolio error:", error)
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
    const { id, name, name_en, category, description, website, investment_year, status, sort_order } = await request.json()

    await sql`
      UPDATE portfolio_companies SET
        name = ${name},
        name_en = ${name_en || ""},
        category = ${category},
        description = ${description || ""},
        website = ${website || ""},
        investment_year = ${investment_year},
        status = ${status},
        sort_order = ${sort_order}
      WHERE id = ${id}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Update portfolio error:", error)
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
    await sql`DELETE FROM portfolio_companies WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete portfolio error:", error)
    return NextResponse.json({ success: false, error: "삭제에 실패했습니다" }, { status: 500 })
  }
}
