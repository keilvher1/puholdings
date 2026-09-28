import { NextResponse } from "next/server"
import { fail, requireAdminDb } from "@/lib/expense-db"
import { countPendingInbox, inboxDbErrorMessage } from "@/lib/expense-inbox"

// GET /api/admin/expenses/inbox/count → { success:true, pending_count } — 데스크톱 앱 배지용 가벼운 조회.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  try {
    const pending = await countPendingInbox(auth.sql)
    return NextResponse.json({ success: true, pending_count: pending })
  } catch (e) {
    console.error("Expense inbox count error:", e)
    return fail(inboxDbErrorMessage(e, "확인 대기 건수를 불러오지 못했습니다."), 500)
  }
}
