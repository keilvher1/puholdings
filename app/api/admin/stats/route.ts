import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

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
    const { stats } = await request.json()

    // Delete all existing stats and insert new ones
    await sql`DELETE FROM statistics`

    for (const stat of stats) {
      await sql`
        INSERT INTO statistics (label, value, suffix, sort_order)
        VALUES (${stat.label}, ${stat.value}, ${stat.suffix || ""}, ${stat.sort_order})
      `
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Update stats error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}
