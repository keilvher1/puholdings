import { NextResponse } from "next/server"
import {
  fail,
  isTopicAdmin,
  parseId,
  postNotice,
  recordEvents,
  requireMessenger,
  requireRoomMember,
  serverError,
} from "@/lib/messenger"

// DELETE /api/messenger/rooms/[id]/members/[memberId] → { success }
// 본인이면 나가기, 다른 사람이면 내보내기(토픽 관리자만, 토픽 생성자는 내보낼 수 없음).
// 시스템 알림 토픽은 나갈 수 없다(알림 끄기를 쓴다).
export const dynamic = "force-dynamic"

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const p = await params
  const roomId = parseId(p.id)
  const targetId = parseId(p.memberId)
  if (!roomId || !targetId) return fail("잘못된 요청입니다", 400)

  try {
    const room = await requireRoomMember(sql, roomId, me.id)
    if (!room) return fail("방을 찾을 수 없습니다", 404)
    const self = targetId === me.id
    if (self) {
      if (room.system_slug) return fail("시스템 알림 토픽은 나갈 수 없습니다. 알림 끄기를 쓰세요", 400)
    } else {
      if (!isTopicAdmin(room, me)) return fail("토픽 관리자만 내보낼 수 있습니다", 403)
      if (room.created_by === targetId) return fail("토픽을 만든 사람은 내보낼 수 없습니다", 400)
    }

    const removed = await sql`
      DELETE FROM messenger_room_members WHERE room_id = ${roomId} AND member_id = ${targetId}
      RETURNING member_id
    `
    if (removed.length === 0) return fail("이 방의 구성원이 아닙니다", 404)

    // 토픽에 관리자가 아무도 안 남으면 가장 먼저 들어온 정회원을 관리자로.
    if (room.kind === "topic") {
      await sql`
        UPDATE messenger_room_members SET role = 'admin'
        WHERE room_id = ${roomId}
          AND NOT EXISTS (SELECT 1 FROM messenger_room_members x WHERE x.room_id = ${roomId} AND x.role = 'admin')
          AND member_id = (
            SELECT rm.member_id FROM messenger_room_members rm
            JOIN messenger_members m ON m.id = rm.member_id
            WHERE rm.room_id = ${roomId} AND m.role = 'member'
            ORDER BY rm.joined_at, rm.member_id LIMIT 1
          )
      `
    }

    const nameRows = await sql`SELECT display_name FROM messenger_members WHERE id = ${targetId}`
    const name = nameRows.length > 0 ? String(nameRows[0].display_name) : "구성원"
    await postNotice(sql, roomId, self ? `${name}님이 나갔습니다.` : `${name}님이 내보내졌습니다.`)
    await recordEvents(sql, [
      { room_id: roomId, member_id: targetId, type: "room.removed", payload: {} },
      { room_id: roomId, type: "room.updated", payload: {} },
    ])
    return NextResponse.json({ success: true })
  } catch (error) {
    return serverError(error, "leave/kick", "처리하지 못했습니다")
  }
}
