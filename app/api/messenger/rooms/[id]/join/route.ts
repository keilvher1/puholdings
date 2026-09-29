import { NextResponse } from "next/server"
import {
  addRoomMembers,
  fail,
  loadRoom,
  parseId,
  postNotice,
  recordEvent,
  requireMessenger,
  serverError,
} from "@/lib/messenger"

// POST /api/messenger/rooms/[id]/join → { success, room }
// 공개 토픽 참여(정회원만). 비공개·보관·시스템 토픽은 404/400.
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  if (me.role !== "member") return fail("게스트는 토픽에 직접 참여할 수 없습니다. 초대를 받아야 합니다", 403)
  const roomId = parseId((await params).id)
  if (!roomId) return fail("잘못된 방 id입니다", 400)
  try {
    const rows = await sql`
      SELECT id, is_archived FROM messenger_rooms
      WHERE id = ${roomId} AND kind = 'topic' AND is_private = false AND system_slug IS NULL
    `
    if (rows.length === 0) return fail("토픽을 찾을 수 없습니다", 404)
    if (rows[0].is_archived === true) return fail("보관된 토픽에는 참여할 수 없습니다", 400)
    const added = await addRoomMembers(sql, roomId, [me.id], "member")
    if (added.length > 0) {
      await postNotice(sql, roomId, `${me.display_name}님이 참여했습니다.`)
      await recordEvent(sql, { room_id: roomId, type: "room.updated", payload: {} })
    }
    const room = await loadRoom(sql, me.id, roomId)
    return NextResponse.json({ success: true, room })
  } catch (error) {
    return serverError(error, "join", "토픽에 참여하지 못했습니다")
  }
}
