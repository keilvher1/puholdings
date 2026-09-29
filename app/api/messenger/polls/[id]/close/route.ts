import { NextResponse } from "next/server"
import { fail, isTopicAdmin, requireMessenger, serverError } from "@/lib/messenger"
import { getPollContext, publishMessageUpdate, toId } from "@/lib/messenger-extras"

// POST /api/messenger/polls/[id]/close — 투표 마감. 투표를 만든 사람 또는 토픽 관리자만.
// 응답: { success, message: MessengerMessage, poll: MessengerPoll }  (sync에는 message.updated)

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me: member } = auth
  const pollId = toId((await params).id)
  if (!pollId) return fail("투표를 찾을 수 없습니다", 404)

  try {
    const ctx = await getPollContext(sql, pollId, member.id)
    if (!ctx || ctx.deleted) return fail("투표를 찾을 수 없습니다", 404)
    if (ctx.author_id !== member.id && !isTopicAdmin(ctx.access, member)) {
      return fail("투표를 만든 사람이나 토픽 관리자만 마감할 수 있습니다", 403)
    }
    await sql`UPDATE messenger_polls SET closed = true WHERE id = ${pollId} AND closed = false`
    const message = await publishMessageUpdate(sql, ctx.room_id, ctx.message_id, member.id)
    return NextResponse.json({ success: true, message, poll: message?.poll ?? null })
  } catch (error) {
    return serverError(error, "poll close", "투표를 마감하지 못했습니다")
  }
}
