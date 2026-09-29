import { NextResponse } from "next/server"
import { fail, loadMessage, loadMessageList, parseId, requireMessageAccess, requireMessenger, serverError } from "@/lib/messenger"

// GET /api/messenger/messages/[id]/thread → { success, parent: MessengerMessage, replies: MessengerMessage[] }
// 댓글 id를 줘도 원본 스레드를 돌려준다. 댓글은 오래된 → 최근 순서(삭제된 댓글 제외, 최대 500).
export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const id = parseId((await params).id)
  if (!id) return fail("잘못된 메시지 id입니다", 400)
  try {
    const msg = await requireMessageAccess(sql, id, me.id)
    if (!msg) return fail("메시지를 찾을 수 없습니다", 404)
    const parentId = msg.parent_id ?? msg.id
    const rows = await sql`
      SELECT id FROM messenger_messages
      WHERE parent_id = ${parentId} AND deleted_at IS NULL
      ORDER BY id ASC
      LIMIT 500
    `
    const [parent, replies] = await Promise.all([
      loadMessage(sql, me.id, parentId),
      loadMessageList(sql, me.id, rows.map((r) => Number(r.id))),
    ])
    if (!parent) return fail("메시지를 찾을 수 없습니다", 404)
    return NextResponse.json({ success: true, parent, replies })
  } catch (error) {
    return serverError(error, "thread", "댓글을 불러오지 못했습니다")
  }
}
