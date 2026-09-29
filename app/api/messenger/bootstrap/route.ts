import { NextResponse } from "next/server"
import {
  cleanupOldEvents,
  currentCursor,
  loadRooms,
  loadVisibleMembers,
  provisionMembers,
  publicMember,
  requireMessenger,
  serverError,
} from "@/lib/messenger"
import type { BootstrapResponse } from "@/lib/messenger-types"

// GET /api/messenger/bootstrap → BootstrapResponse
// 처음 화면을 열 때 한 번: 나, 볼 수 있는 구성원, 참여한 방(안 읽은 수·마지막 메시지 포함), 이벤트 커서.
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  try {
    // 정회원이 초대·대화 상대로 고를 수 있게 아직 들어온 적 없는 계정도 구성원으로 만들어 둔다.
    if (me.role === "member") await provisionMembers(sql)
    // 커서를 먼저 잡는다 — 상태를 읽는 도중 생긴 변경은 커서 뒤 이벤트로 다시 받는다(병합은 멱등).
    const cursor = await currentCursor(sql)
    const [members, rooms] = await Promise.all([loadVisibleMembers(sql, me), loadRooms(sql, me.id)])
    // 7일 지난 동기화 이벤트 정리(가끔)
    if (Math.random() < 0.05) {
      await cleanupOldEvents(sql).catch((error) => console.error("Messenger event cleanup error:", error))
    }
    const body: BootstrapResponse = { success: true, me: publicMember(me), members, rooms, cursor }
    return NextResponse.json(body)
  } catch (error) {
    return serverError(error, "bootstrap", "메신저를 불러오지 못했습니다. 새로고침하세요.")
  }
}
