import { NextResponse } from "next/server"
import { fail, loadRoom, parseId, readJson, recordEvents, requireMessenger, requireRoomMember, serverError } from "@/lib/messenger"
import type { EventInput } from "@/lib/messenger"

// PATCH /api/messenger/rooms/[id]/me {starred?, muted?, last_read_message_id?} → { success, room }
// 이 방의 내 설정. last_read_message_id는 앞으로만 움직이고, 방의 마지막 메시지 id(댓글 포함)를 넘지 않는다.
// 보고 있는 방은 받은 메시지(댓글 포함) 중 가장 큰 id를 보내면 된다.
export const dynamic = "force-dynamic"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const roomId = parseId((await params).id)
  if (!roomId) return fail("잘못된 방 id입니다", 400)
  const body = await readJson(request)
  if (!body) return fail("요청 형식이 올바르지 않습니다", 400)
  if ("starred" in body && typeof body.starred !== "boolean") return fail("starred는 true/false여야 합니다", 400)
  if ("muted" in body && typeof body.muted !== "boolean") return fail("muted는 true/false여야 합니다", 400)
  let lastRead: number | null = null
  if ("last_read_message_id" in body) {
    lastRead = parseId(body.last_read_message_id)
    if (!lastRead) return fail("last_read_message_id가 올바르지 않습니다", 400)
  }

  try {
    const room = await requireRoomMember(sql, roomId, me.id)
    if (!room) return fail("방을 찾을 수 없습니다", 404)
    const starred = typeof body.starred === "boolean" ? body.starred : null
    const muted = typeof body.muted === "boolean" ? body.muted : null
    const rows = await sql`
      UPDATE messenger_room_members rm
      SET starred = COALESCE(${starred}::boolean, rm.starred),
          muted = COALESCE(${muted}::boolean, rm.muted),
          last_read_message_id = CASE
            WHEN ${lastRead}::bigint IS NULL THEN rm.last_read_message_id
            ELSE GREATEST(
              COALESCE(rm.last_read_message_id, 0),
              LEAST(${lastRead}::bigint, COALESCE((SELECT max(id) FROM messenger_messages WHERE room_id = ${roomId}), 0))
            )
          END
      WHERE rm.room_id = ${roomId} AND rm.member_id = ${me.id}
      RETURNING rm.last_read_message_id
    `
    if (rows.length === 0) return fail("방을 찾을 수 없습니다", 404)
    const newRead = rows[0].last_read_message_id === null ? null : Number(rows[0].last_read_message_id)
    // 별표·알림 변경만 개인 room.updated로 남긴다(다른 탭 동기화용). 읽음은 read 이벤트로 충분하다 —
    // 읽을 때마다 room.updated를 남기면 sync마다 방 목록을 다시 읽게 된다.
    const events: EventInput[] = []
    if (starred !== null || muted !== null) events.push({ room_id: roomId, member_id: me.id, type: "room.updated", payload: {} })
    if (newRead !== null && newRead > 0 && newRead !== room.last_read_message_id) {
      events.push({ room_id: roomId, type: "read", payload: { member_id: me.id, last_read_message_id: newRead } })
    }
    if (events.length > 0) await recordEvents(sql, events)
    const updated = await loadRoom(sql, me.id, roomId)
    return NextResponse.json({ success: true, room: updated })
  } catch (error) {
    return serverError(error, "room me", "설정을 저장하지 못했습니다")
  }
}
