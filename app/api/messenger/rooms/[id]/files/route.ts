import { NextResponse } from "next/server"
import {
  escapeLike,
  fail,
  fileItemFromRow,
  parseId,
  requireMessenger,
  requireRoomMember,
  serverError,
  type MessengerFileItem,
} from "@/lib/messenger"

// GET /api/messenger/rooms/[id]/files?q=&before=MESSAGE_ID
//   → { success, files: MessengerFileItem[], has_more }
//   MessengerFileItem = MessengerAttachment + { message_id, room_id, author_id, created_at } (최신 먼저, 최대 100)
//   댓글에 붙은 파일도 포함, 삭제된 메시지는 제외. 다음 쪽은 마지막 항목의 message_id를 before로.
export const dynamic = "force-dynamic"

const PAGE = 100

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const roomId = parseId((await params).id)
  if (!roomId) return fail("잘못된 방 id입니다", 400)
  const sp = new URL(request.url).searchParams
  const before = sp.has("before") ? parseId(sp.get("before")) : null
  if (sp.has("before") && !before) return fail("before 값이 올바르지 않습니다", 400)
  const q = (sp.get("q") ?? "").trim().slice(0, 100)
  const pattern = `%${escapeLike(q)}%`

  try {
    const room = await requireRoomMember(sql, roomId, me.id)
    if (!room) return fail("방을 찾을 수 없습니다", 404)
    const rows = await sql`
      SELECT m.id AS message_id, m.room_id, m.author_id, m.parent_id, m.created_at, a.value AS att
      FROM messenger_messages m
      CROSS JOIN LATERAL jsonb_array_elements(m.attachments) AS a(value)
      WHERE m.room_id = ${roomId} AND m.deleted_at IS NULL
        AND jsonb_typeof(m.attachments) = 'array' AND jsonb_array_length(m.attachments) > 0
        AND (${before}::bigint IS NULL OR m.id < ${before}::bigint)
        AND (${q} = '' OR (a.value->>'name') ILIKE ${pattern})
      ORDER BY m.id DESC
      LIMIT ${PAGE + 1}
    `
    const files = rows.map(fileItemFromRow).filter((f): f is MessengerFileItem => f !== null)
    const hasMore = files.length > PAGE
    let page = files.slice(0, PAGE)
    // 다음 쪽은 before=마지막 message_id로 이어지므로, 한 메시지의 첨부가 쪽 경계에서 잘리지 않게 한다.
    if (hasMore) {
      const lastId = page[page.length - 1].message_id
      const trimmed = page.filter((f) => f.message_id !== lastId)
      if (trimmed.length > 0) page = trimmed
    }
    return NextResponse.json({ success: true, files: page, has_more: hasMore })
  } catch (error) {
    return serverError(error, "files", "파일 목록을 불러오지 못했습니다")
  }
}
