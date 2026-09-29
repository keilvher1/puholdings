import { NextResponse } from "next/server"
import { fail, requireMessenger, serverError } from "@/lib/messenger"
import { getPollContext, parseVoteOptions, publishMessageUpdate, toId } from "@/lib/messenger-extras"

// POST /api/messenger/polls/[id]/vote { options: number[] } — 내 투표를 이 선택으로 바꾼다(빈 배열 = 취소).
// 방 참여자만. 닫혔거나 마감 시각이 지난 투표는 409.
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
    if (ctx.access.is_archived) return fail("보관된 토픽입니다", 409)
    if (ctx.closed) return fail("마감된 투표입니다", 409)

    const body = (await request.json().catch(() => null)) as { options?: unknown } | null
    const choice = parseVoteOptions(body?.options, ctx.options.length, ctx.multiple)
    if (!choice.ok) return fail(choice.error, 400)

    await sql.transaction((tx) => [
      tx`DELETE FROM messenger_poll_votes WHERE poll_id = ${pollId} AND member_id = ${member.id}`,
      tx`
        INSERT INTO messenger_poll_votes (poll_id, member_id, option_index)
        SELECT ${pollId}, ${member.id}, o FROM unnest(${choice.options}::int[]) AS o
      `,
    ])
    const message = await publishMessageUpdate(sql, ctx.room_id, ctx.message_id, member.id)
    return NextResponse.json({ success: true, message, poll: message?.poll ?? null })
  } catch (error) {
    return serverError(error, "poll vote", "투표하지 못했습니다")
  }
}
