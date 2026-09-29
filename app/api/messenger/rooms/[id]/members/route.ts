import { NextResponse } from "next/server"
import {
  addRoomMembers,
  fail,
  filterInvitableMembers,
  loadRoom,
  parseId,
  parseIdList,
  postNotice,
  readJson,
  recordEvent,
  requireMessenger,
  requireRoomMember,
  serverError,
} from "@/lib/messenger"

// POST /api/messenger/rooms/[id]/members {member_ids} → { success, room, added: number[] }
// 토픽에 구성원 초대(방에 참여한 정회원만). 대화(DM)는 구성이 고정이라 초대 대신 새 대화를 시작한다.
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const roomId = parseId((await params).id)
  if (!roomId) return fail("잘못된 방 id입니다", 400)
  const body = await readJson(request)
  if (!body) return fail("요청 형식이 올바르지 않습니다", 400)
  const ids = parseIdList(body.member_ids)
  if (!ids || ids.length === 0) return fail("초대할 구성원을 고르세요", 400)

  try {
    const room = await requireRoomMember(sql, roomId, me.id)
    if (!room) return fail("방을 찾을 수 없습니다", 404)
    if (me.role !== "member") return fail("게스트는 구성원을 초대할 수 없습니다", 403)
    if (room.kind !== "topic") return fail("대화방에는 초대할 수 없습니다. 새 대화를 시작하세요", 400)
    if (room.is_archived) return fail("보관된 토픽에는 초대할 수 없습니다", 400)
    // 시스템 알림 토픽은 정회원 전용(postSystemMessage가 정회원을 자동 참여시킨다) — 초대 경로로 게스트가 들어오지 못하게
    if (room.system_slug) return fail("시스템 알림 토픽에는 초대할 수 없습니다", 400)
    const targets = ids.filter((id) => id !== me.id)
    const valid = await filterInvitableMembers(sql, me, targets)
    if (valid.length !== targets.length) return fail("초대할 수 없는 구성원이 포함되어 있습니다", 400)

    const added = await addRoomMembers(sql, roomId, valid, "member")
    if (added.length > 0) {
      const names = await sql`SELECT display_name FROM messenger_members WHERE id = ANY(${added}::int[]) ORDER BY display_name`
      const list = names.map((r) => String(r.display_name)).join(", ")
      await postNotice(sql, roomId, `${me.display_name}님이 ${list}님을 초대했습니다.`)
      await recordEvent(sql, { room_id: roomId, type: "room.updated", payload: {} })
    }
    const updated = await loadRoom(sql, me.id, roomId)
    return NextResponse.json({ success: true, room: updated, added })
  } catch (error) {
    return serverError(error, "invite", "초대하지 못했습니다")
  }
}
