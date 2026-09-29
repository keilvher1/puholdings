import { NextResponse } from "next/server"
import {
  fail,
  isTopicAdmin,
  loadRoom,
  parseId,
  readJson,
  recordEvent,
  requireMessenger,
  requireRoomMember,
  serverError,
} from "@/lib/messenger"

// GET   /api/messenger/rooms/[id] → { success, room }
// PATCH /api/messenger/rooms/[id] {name?, description?, is_private?, is_archived?, announcement_message_id?: number|null}
//   이름·설명·공개 여부·보관: 토픽 관리자만. 공지 고정/해제: 방에 참여한 정회원.
//   → { success, room }
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Ctx) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const roomId = parseId((await params).id)
  if (!roomId) return fail("잘못된 방 id입니다", 400)
  try {
    const room = await loadRoom(auth.sql, auth.me.id, roomId)
    if (!room) return fail("방을 찾을 수 없습니다", 404)
    return NextResponse.json({ success: true, room })
  } catch (error) {
    return serverError(error, "room get", "방 정보를 불러오지 못했습니다")
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const roomId = parseId((await params).id)
  if (!roomId) return fail("잘못된 방 id입니다", 400)
  const body = await readJson(request)
  if (!body) return fail("요청 형식이 올바르지 않습니다", 400)

  try {
    const room = await requireRoomMember(sql, roomId, me.id)
    if (!room) return fail("방을 찾을 수 없습니다", 404)

    const next = {
      name: room.name,
      description: room.description,
      is_private: room.is_private,
      is_archived: room.is_archived,
      announcement_message_id: room.announcement_message_id,
    }
    const touchesSettings = ["name", "description", "is_private", "is_archived"].some((k) => k in body)
    if (touchesSettings) {
      if (room.kind !== "topic") return fail("대화방은 이름·공개 여부를 바꿀 수 없습니다", 400)
      if (!isTopicAdmin(room, me)) return fail("토픽 관리자만 바꿀 수 있습니다", 403)
    }
    if ("name" in body) {
      const v = typeof body.name === "string" ? body.name.trim() : ""
      if (!v) return fail("토픽 이름을 입력하세요", 400)
      if (v.length > 80) return fail("토픽 이름은 80자까지 쓸 수 있습니다", 400)
      next.name = v
    }
    if ("description" in body) {
      const v = typeof body.description === "string" ? body.description.trim() : ""
      if (v.length > 1000) return fail("토픽 설명은 1000자까지 쓸 수 있습니다", 400)
      next.description = v
    }
    if ("is_private" in body) {
      if (typeof body.is_private !== "boolean") return fail("is_private는 true/false여야 합니다", 400)
      if (room.system_slug && !body.is_private) return fail("시스템 알림 토픽은 공개로 바꿀 수 없습니다", 400)
      next.is_private = body.is_private
    }
    if ("is_archived" in body) {
      if (typeof body.is_archived !== "boolean") return fail("is_archived는 true/false여야 합니다", 400)
      next.is_archived = body.is_archived
    }
    if ("announcement_message_id" in body) {
      if (me.role !== "member") return fail("게스트는 공지를 고정할 수 없습니다", 403)
      if (body.announcement_message_id === null) {
        next.announcement_message_id = null
      } else {
        const mid = parseId(body.announcement_message_id)
        if (!mid) return fail("announcement_message_id가 올바르지 않습니다", 400)
        const msg = await sql`
          SELECT id FROM messenger_messages
          WHERE id = ${mid} AND room_id = ${roomId} AND parent_id IS NULL AND deleted_at IS NULL
        `
        if (msg.length === 0) return fail("이 방의 메시지만 공지로 고정할 수 있습니다", 400)
        next.announcement_message_id = mid
      }
    }

    await sql`
      UPDATE messenger_rooms
      SET name = ${next.name}, description = ${next.description}, is_private = ${next.is_private},
          is_archived = ${next.is_archived}, announcement_message_id = ${next.announcement_message_id}, updated_at = now()
      WHERE id = ${roomId}
    `
    await recordEvent(sql, { room_id: roomId, type: "room.updated", payload: {} })
    const updated = await loadRoom(sql, me.id, roomId)
    return NextResponse.json({ success: true, room: updated })
  } catch (error) {
    return serverError(error, "room update", "방 설정을 저장하지 못했습니다")
  }
}
