import { NextResponse } from "next/server"
import { fail, loadMessage, parseId, recordEvent, requireMessageAccess, requireMessenger, serverError } from "@/lib/messenger"

// POST /api/messenger/messages/[id]/bookmark → { success, bookmarked: boolean, message }
// 별표(북마크) 토글. 나에게만 보이는 설정이라 이벤트도 나에게만 간다.
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const id = parseId((await params).id)
  if (!id) return fail("잘못된 메시지 id입니다", 400)
  try {
    const msg = await requireMessageAccess(sql, id, me.id)
    if (!msg) return fail("메시지를 찾을 수 없습니다", 404)
    const removed = await sql`
      DELETE FROM messenger_bookmarks WHERE member_id = ${me.id} AND message_id = ${id} RETURNING message_id
    `
    let bookmarked = false
    if (removed.length === 0) {
      if (msg.deleted) return fail("삭제된 메시지입니다", 400)
      await sql`INSERT INTO messenger_bookmarks (member_id, message_id) VALUES (${me.id}, ${id}) ON CONFLICT DO NOTHING`
      bookmarked = true
    }
    await recordEvent(sql, { room_id: msg.room_id, member_id: me.id, type: "message.updated", payload: { message_id: id } })
    const message = await loadMessage(sql, me.id, id)
    return NextResponse.json({ success: true, bookmarked, message })
  } catch (error) {
    return serverError(error, "bookmark", "별표를 바꾸지 못했습니다")
  }
}
