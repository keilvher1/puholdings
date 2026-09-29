import { NextResponse } from "next/server"
import {
  escapeLike,
  fail,
  fileItemFromRow,
  loadMessageList,
  loadVisibleMembers,
  parseId,
  requireMessenger,
  requireRoomMember,
  serverError,
  type MessengerFileItem,
} from "@/lib/messenger"

// GET /api/messenger/search?q=&type=messages|files|members&room_id=
//   → { success, type, q, messages: MessengerMessage[], files: MessengerFileItem[], members: MessengerMember[] }
//   요청한 type의 배열만 채운다(나머지는 빈 배열). 내가 참여한 방 범위만, 최신 먼저 최대 50.
//   messages는 본문·커넥트 블록, files는 파일 이름, members는 이름·직함·상태 메시지로 찾는다.
export const dynamic = "force-dynamic"

const LIMIT = 50

export async function GET(request: Request) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const sp = new URL(request.url).searchParams
  const q = (sp.get("q") ?? "").trim().slice(0, 100)
  const type = sp.get("type") ?? "messages"
  if (type !== "messages" && type !== "files" && type !== "members") {
    return fail("type은 messages, files, members 중 하나여야 합니다", 400)
  }
  let roomId: number | null = null
  if (sp.get("room_id")) {
    roomId = parseId(sp.get("room_id"))
    if (!roomId) return fail("room_id가 올바르지 않습니다", 400)
  }
  const empty = { success: true, type, q, messages: [], files: [], members: [] }
  if (!q) return NextResponse.json(empty)
  const pattern = `%${escapeLike(q)}%`

  try {
    if (roomId && !(await requireRoomMember(sql, roomId, me.id))) return fail("방을 찾을 수 없습니다", 404)

    if (type === "members") {
      const needle = q.toLowerCase()
      const members = (await loadVisibleMembers(sql, me))
        .filter((m) => [m.display_name, m.title, m.status_text].some((s) => s.toLowerCase().includes(needle)))
        .slice(0, LIMIT)
      return NextResponse.json({ ...empty, members })
    }

    if (type === "files") {
      const rows = await sql`
        SELECT m.id AS message_id, m.room_id, m.author_id, m.parent_id, m.created_at, a.value AS att
        FROM messenger_messages m
        CROSS JOIN LATERAL jsonb_array_elements(m.attachments) AS a(value)
        WHERE m.room_id IN (SELECT room_id FROM messenger_room_members WHERE member_id = ${me.id})
          AND (${roomId}::int IS NULL OR m.room_id = ${roomId}::int)
          AND m.deleted_at IS NULL
          AND jsonb_typeof(m.attachments) = 'array' AND jsonb_array_length(m.attachments) > 0
          AND (a.value->>'name') ILIKE ${pattern}
        ORDER BY m.id DESC
        LIMIT ${LIMIT}
      `
      const files = rows.map(fileItemFromRow).filter((f): f is MessengerFileItem => f !== null)
      return NextResponse.json({ ...empty, files })
    }

    const rows = await sql`
      SELECT m.id
      FROM messenger_messages m
      WHERE m.room_id IN (SELECT room_id FROM messenger_room_members WHERE member_id = ${me.id})
        AND (${roomId}::int IS NULL OR m.room_id = ${roomId}::int)
        AND m.deleted_at IS NULL
        AND (m.body ILIKE ${pattern} OR (jsonb_array_length(m.connect_info) > 0 AND m.connect_info::text ILIKE ${pattern}))
      ORDER BY m.id DESC
      LIMIT ${LIMIT}
    `
    const messages = await loadMessageList(sql, me.id, rows.map((r) => Number(r.id)))
    return NextResponse.json({ ...empty, messages })
  } catch (error) {
    return serverError(error, "search", "검색하지 못했습니다")
  }
}
