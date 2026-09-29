import { NextResponse } from "next/server"
import { fail, requireMessenger, serverError, syncEvents } from "@/lib/messenger"
import type { SyncResponse } from "@/lib/messenger-types"

// GET /api/messenger/sync?cursor=N → SyncResponse
// 내가 참여한 방의 변경 이벤트(최대 500건). 최근 몇 초의 이벤트는 다음 호출에 다시 올 수 있다(병합은 멱등하게).
// reset:true면 커서가 너무 오래됐으니 bootstrap부터 다시.
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const raw = new URL(request.url).searchParams.get("cursor") ?? ""
  const cursor = /^\d{1,15}$/.test(raw) ? Number(raw) : NaN
  if (!Number.isSafeInteger(cursor)) return fail("cursor가 올바르지 않습니다", 400)
  try {
    const result = await syncEvents(sql, me, cursor)
    const body: SyncResponse = { success: true, events: result.events, cursor: result.cursor }
    if (result.reset) body.reset = true
    return NextResponse.json(body)
  } catch (error) {
    return serverError(error, "sync", "동기화에 실패했습니다")
  }
}
