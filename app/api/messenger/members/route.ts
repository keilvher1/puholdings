import { NextResponse } from "next/server"
import { loadVisibleMembers, provisionMembers, requireMessenger, serverError } from "@/lib/messenger"

// GET /api/messenger/members → { success, members: MessengerMember[] }
// 정회원: 활성 계정 전원(+ 같은 방의 과거 참여자). 게스트: 나 + 같은 방 참여자만.
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  try {
    if (me.role === "member") await provisionMembers(sql)
    const members = await loadVisibleMembers(sql, me)
    return NextResponse.json({ success: true, members })
  } catch (error) {
    return serverError(error, "members", "구성원 목록을 불러오지 못했습니다")
  }
}
