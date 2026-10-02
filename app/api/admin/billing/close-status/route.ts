import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { getCloseStatus } from "@/components/admin/billing/close/status-query"

export const dynamic = "force-dynamic"

// GET /api/admin/billing/close-status?month=YYYY-MM(전기 사용월) — 월 마감 상태(조회 전용).
// getCloseProgress(lib/admin-todo.ts)를 그대로 감싸고 화면 필드만 더한다(단계 판정은 그쪽 한 곳).
// month가 없거나 형식이 틀리면 기본 마감 월(2.2.1 규칙).
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "로그인이 끝났어요. 다시 로그인해 주세요." }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "불러오지 못했어요." }, { status: 500 })
  try {
    const month = new URL(request.url).searchParams.get("month")
    const status = await getCloseStatus(sql, month)
    return NextResponse.json({ success: true, status })
  } catch (error) {
    console.error("Close status error:", error)
    return NextResponse.json({ success: false, error: "불러오지 못했어요." }, { status: 500 })
  }
}
