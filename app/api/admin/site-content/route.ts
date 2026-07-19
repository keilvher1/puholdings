import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

// GET /api/admin/site-content — 전체 싱글턴. ?key= 지정 시 단건
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
    const key = searchParams.get("key")
    if (key) {
      const rows = await sql`SELECT key, value FROM site_content WHERE key = ${key}`
      return NextResponse.json({ success: true, value: rows[0]?.value ?? null })
    }
    const rows = await sql`SELECT key, value FROM site_content`
    const map: Record<string, unknown> = {}
    for (const r of rows) map[r.key as string] = r.value
    return NextResponse.json({ success: true, content: map })
  } catch (error) {
    console.error("Get site content error:", error)
    return NextResponse.json({ success: false, error: "불러오지 못했습니다" }, { status: 500 })
  }
}

// PUT /api/admin/site-content — { key, value } upsert
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
    const { key, value } = await request.json()
    if (!key || typeof key !== "string") {
      return NextResponse.json({ success: false, error: "key가 필요합니다" }, { status: 400 })
    }
    if (!value || typeof value !== "object") {
      return NextResponse.json({ success: false, error: "value가 필요합니다" }, { status: 400 })
    }
    await sql`
      INSERT INTO site_content (key, value)
      VALUES (${key}, ${JSON.stringify(value)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Update site content error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}
