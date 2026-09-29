import { NextResponse } from "next/server"
import { fail, loadMessageList, parseId, requireMessenger, serverError } from "@/lib/messenger"

// GET /api/messenger/mentions?before=MESSAGE_ID → { success, messages, has_more }
// 나를(또는 @전체) 멘션한 최근 메시지(내 방 범위, 내가 쓴 것 제외, 댓글 포함), 최신 먼저 50개.
export const dynamic = "force-dynamic"

const LIMIT = 50

export async function GET(request: Request) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const sp = new URL(request.url).searchParams
  const before = sp.has("before") ? parseId(sp.get("before")) : null
  if (sp.has("before") && !before) return fail("before 값이 올바르지 않습니다", 400)
  try {
    const rows = await sql`
      SELECT m.id
      FROM messenger_messages m
      WHERE m.room_id IN (SELECT room_id FROM messenger_room_members WHERE member_id = ${me.id})
        AND m.deleted_at IS NULL
        AND m.author_id IS DISTINCT FROM ${me.id}
        AND (m.mentions @> ${JSON.stringify([me.id])}::jsonb OR m.mentions @> '[-1]'::jsonb)
        AND (${before}::bigint IS NULL OR m.id < ${before}::bigint)
      ORDER BY m.id DESC
      LIMIT ${LIMIT + 1}
    `
    const ids = rows.map((r) => Number(r.id))
    const messages = await loadMessageList(sql, me.id, ids.slice(0, LIMIT))
    return NextResponse.json({ success: true, messages, has_more: ids.length > LIMIT })
  } catch (error) {
    return serverError(error, "mentions", "멘션을 불러오지 못했습니다")
  }
}
