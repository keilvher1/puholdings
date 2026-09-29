import { NextResponse } from "next/server"
import {
  addRoomMembers,
  fail,
  filterInvitableMembers,
  loadRoom,
  loadRooms,
  parseIdList,
  readJson,
  recordEvent,
  requireMessenger,
  serverError,
} from "@/lib/messenger"

// GET  /api/messenger/rooms → { success, rooms: MessengerRoom[] } (내가 참여한 방)
// POST /api/messenger/rooms
//   {kind:'topic', name, description?, is_private?, member_ids?} → 토픽 생성(정회원만). 만든 사람이 토픽 관리자.
//   {kind:'dm', member_ids}                                       → 대화 시작. 같은 구성의 대화가 있으면 그 방을 돌려준다.
//     member_ids가 비어 있으면 '나와의 대화'. 게스트는 같은 방에 있는 사람하고만 대화를 시작할 수 있다.
//   → { success, room: MessengerRoom, existing?: true }
export const dynamic = "force-dynamic"

const MAX_DM_MEMBERS = 30

export async function GET(request: Request) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  try {
    const rooms = await loadRooms(auth.sql, auth.me.id)
    return NextResponse.json({ success: true, rooms })
  } catch (error) {
    return serverError(error, "rooms list", "방 목록을 불러오지 못했습니다")
  }
}

export async function POST(request: Request) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const body = await readJson(request)
  if (!body) return fail("요청 형식이 올바르지 않습니다", 400)

  const memberIds = body.member_ids === undefined ? [] : parseIdList(body.member_ids)
  if (memberIds === null) return fail("member_ids 형식이 올바르지 않습니다", 400)
  const others = memberIds.filter((id) => id !== me.id)

  try {
    if (body.kind === "topic") {
      if (me.role !== "member") return fail("게스트는 토픽을 만들 수 없습니다", 403)
      const name = typeof body.name === "string" ? body.name.trim() : ""
      if (!name) return fail("토픽 이름을 입력하세요", 400)
      if (name.length > 80) return fail("토픽 이름은 80자까지 쓸 수 있습니다", 400)
      const description = typeof body.description === "string" ? body.description.trim() : ""
      if (description.length > 1000) return fail("토픽 설명은 1000자까지 쓸 수 있습니다", 400)
      if (body.is_private !== undefined && typeof body.is_private !== "boolean") {
        return fail("is_private는 true/false여야 합니다", 400)
      }
      const isPrivate = body.is_private === true
      const valid = await filterInvitableMembers(sql, me, others)
      if (valid.length !== others.length) return fail("초대할 수 없는 구성원이 포함되어 있습니다", 400)

      const rows = await sql`
        INSERT INTO messenger_rooms (kind, name, description, is_private, created_by)
        VALUES ('topic', ${name}, ${description}, ${isPrivate}, ${me.id})
        RETURNING id
      `
      const roomId = Number(rows[0].id)
      await addRoomMembers(sql, roomId, [me.id], "admin")
      await addRoomMembers(sql, roomId, others, "member")
      await recordEvent(sql, { room_id: roomId, type: "room.updated", payload: {} })
      const room = await loadRoom(sql, me.id, roomId)
      return NextResponse.json({ success: true, room }, { status: 201 })
    }

    if (body.kind === "dm") {
      if (others.length + 1 > MAX_DM_MEMBERS) return fail(`대화는 ${MAX_DM_MEMBERS}명까지 함께할 수 있습니다`, 400)
      const valid = await filterInvitableMembers(sql, me, others)
      if (valid.length !== others.length) return fail("대화를 시작할 수 없는 구성원이 포함되어 있습니다", 400)
      const all = [me.id, ...others].sort((a, b) => a - b)
      const dmKey = all.join(",")

      let roomId: number | null = null
      let existing = false
      const found = await sql`SELECT id FROM messenger_rooms WHERE dm_key = ${dmKey}`
      if (found.length > 0) {
        roomId = Number(found[0].id)
        existing = true
      } else {
        const created = await sql`
          INSERT INTO messenger_rooms (kind, name, is_private, dm_key, created_by)
          VALUES ('dm', '', true, ${dmKey}, ${me.id})
          ON CONFLICT (dm_key) DO NOTHING
          RETURNING id
        `
        if (created.length > 0) roomId = Number(created[0].id)
        else {
          const again = await sql`SELECT id FROM messenger_rooms WHERE dm_key = ${dmKey}`
          roomId = again.length > 0 ? Number(again[0].id) : null
          existing = true
        }
      }
      if (!roomId) return fail("대화를 시작하지 못했습니다", 500)
      // 전에 나간 사람이 있으면 다시 넣는다(대화 구성은 dm_key로 고정).
      const added = await addRoomMembers(sql, roomId, all, "member")
      if (added.length > 0 || !existing) await recordEvent(sql, { room_id: roomId, type: "room.updated", payload: {} })
      const room = await loadRoom(sql, me.id, roomId)
      return NextResponse.json({ success: true, room, ...(existing ? { existing: true } : {}) }, { status: existing ? 200 : 201 })
    }

    return fail("kind는 'topic' 또는 'dm'이어야 합니다", 400)
  } catch (error) {
    return serverError(error, "room create", "방을 만들지 못했습니다")
  }
}
