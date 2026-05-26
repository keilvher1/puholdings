import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export const dynamic = "force-dynamic"

// GET /api/popups — currently active popups for the public site (no auth).
export async function GET() {
  const sql = getDb()
  if (!sql) {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } })
  }

  try {
    const rows = await sql`
      SELECT * FROM popups
      WHERE is_active = TRUE
        AND start_at <= now()
        AND end_at >= now()
      ORDER BY priority DESC, id DESC
    `
    return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Public popups error:", error)
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } })
  }
}
