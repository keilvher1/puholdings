import { NextResponse } from "next/server"
import { loadMessageList, requireMessenger, serverError } from "@/lib/messenger"

// GET /api/messenger/bookmarks → { success, messages }
// 내가 별표한 메시지(지금 참여 중인 방의 것만, 삭제된 것 제외), 별표한 순서 최신 먼저 최대 200개.
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  try {
    const rows = await sql`
      SELECT b.message_id
      FROM messenger_bookmarks b
      JOIN messenger_messages m ON m.id = b.message_id
      JOIN messenger_room_members rm ON rm.room_id = m.room_id AND rm.member_id = ${me.id}
      WHERE b.member_id = ${me.id} AND m.deleted_at IS NULL
      ORDER BY b.created_at DESC, b.message_id DESC
      LIMIT 200
    `
    const messages = await loadMessageList(sql, me.id, rows.map((r) => Number(r.message_id)))
    return NextResponse.json({ success: true, messages })
  } catch (error) {
    return serverError(error, "bookmarks", "별표 목록을 불러오지 못했습니다")
  }
}
