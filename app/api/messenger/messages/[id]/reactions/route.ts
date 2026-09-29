import { NextResponse } from "next/server"
import {
  fail,
  loadMessage,
  parseId,
  readJson,
  recordEvent,
  requireMessageAccess,
  requireMessenger,
  serverError,
} from "@/lib/messenger"

// POST /api/messenger/messages/[id]/reactions {emoji} → { success, message, reacted: boolean }
// 같은 이모지를 다시 누르면 취소(토글). 이모지는 텍스트 1~16자(공백 불가).
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const id = parseId((await params).id)
  if (!id) return fail("잘못된 메시지 id입니다", 400)
  const body = await readJson(request)
  const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : ""
  if (!emoji || [...emoji].length > 16 || /[\s<>]/.test(emoji)) {
    return fail("반응 이모지가 올바르지 않습니다", 400)
  }

  try {
    const msg = await requireMessageAccess(sql, id, me.id)
    if (!msg) return fail("메시지를 찾을 수 없습니다", 404)
    if (msg.deleted) return fail("삭제된 메시지입니다", 400)
    const removed = await sql`
      DELETE FROM messenger_reactions WHERE message_id = ${id} AND member_id = ${me.id} AND emoji = ${emoji}
      RETURNING message_id
    `
    let reacted = false
    if (removed.length === 0) {
      const count = await sql`SELECT count(DISTINCT emoji)::int AS n FROM messenger_reactions WHERE message_id = ${id}`
      if ((Number(count[0]?.n) || 0) >= 30) return fail("이 메시지에는 반응을 더 달 수 없습니다", 400)
      await sql`
        INSERT INTO messenger_reactions (message_id, member_id, emoji) VALUES (${id}, ${me.id}, ${emoji})
        ON CONFLICT DO NOTHING
      `
      reacted = true
    }
    await recordEvent(sql, { room_id: msg.room_id, type: "message.updated", payload: { message_id: id } })
    const message = await loadMessage(sql, me.id, id)
    return NextResponse.json({ success: true, message, reacted })
  } catch (error) {
    return serverError(error, "reaction", "반응을 남기지 못했습니다")
  }
}
