import { NextResponse } from "next/server"
import { fail, requireMessenger, serverError, toIso } from "@/lib/messenger"
import type { MessengerRoom } from "@/lib/messenger-types"

// GET /api/messenger/rooms/browse → { success, rooms: (MessengerRoom & { member_count })[] }
// 참여하지 않은 공개 토픽 둘러보기(정회원만). 보관된 토픽은 뒤로.
// 참여 전이라 내 설정 값(starred·muted·안 읽은 수·마지막 메시지)은 기본값이다.
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  if (me.role !== "member") return fail("게스트는 토픽을 둘러볼 수 없습니다", 403)
  try {
    const rows = await sql`
      SELECT r.id, r.name, r.description, r.created_by, r.created_at, r.is_archived,
             (SELECT COALESCE(array_agg(x.member_id ORDER BY x.joined_at, x.member_id), '{}')
                FROM messenger_room_members x WHERE x.room_id = r.id) AS member_ids
      FROM messenger_rooms r
      WHERE r.kind = 'topic' AND r.is_private = false AND r.system_slug IS NULL
        AND NOT EXISTS (SELECT 1 FROM messenger_room_members rm WHERE rm.room_id = r.id AND rm.member_id = ${me.id})
      ORDER BY r.is_archived, r.name, r.id
      LIMIT 500
    `
    const rooms: (MessengerRoom & { member_count: number })[] = rows.map((r) => {
      const memberIds = Array.isArray(r.member_ids) ? (r.member_ids as unknown[]).map(Number) : []
      return {
        id: Number(r.id),
        kind: "topic",
        name: String(r.name ?? ""),
        description: String(r.description ?? ""),
        is_private: false,
        is_archived: r.is_archived === true,
        created_by: r.created_by === null || r.created_by === undefined ? null : Number(r.created_by),
        created_at: toIso(r.created_at) ?? "",
        member_ids: memberIds,
        announcement: null,
        starred: false,
        muted: false,
        last_read_message_id: null,
        unread_count: 0,
        mention_count: 0,
        last_message: null,
        member_count: memberIds.length,
      }
    })
    return NextResponse.json({ success: true, rooms })
  } catch (error) {
    return serverError(error, "browse", "토픽 목록을 불러오지 못했습니다")
  }
}
