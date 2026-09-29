import { NextResponse } from "next/server"
import { fail, loadMessage, readJson, requireMessenger, requireRoomMember, serverError } from "@/lib/messenger"
import { createMessageWith, parsePollInput, toId } from "@/lib/messenger-extras"

// POST /api/messenger/polls { room_id, question, options[2..10], multiple, anonymous, closes_at? }
// → 투표 메시지(kind 'poll', body = 질문)와 messenger_polls 행을 만든다(투표 행을 못 만들면 메시지도 지운다).
// 응답: { success, message: MessengerMessage }  (sync에는 message.created 이벤트로 퍼진다)

export async function POST(request: Request) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me: member } = auth

  const raw = await readJson(request)
  if (!raw) return fail("요청 형식이 올바르지 않습니다", 400)
  const roomId = toId(raw.room_id)
  if (!roomId) return fail("대화방을 지정해 주세요", 400)

  try {
    const access = await requireRoomMember(sql, roomId, member.id)
    if (!access) return fail("대화방을 찾을 수 없습니다", 404)
    if (access.is_archived) return fail("보관된 토픽입니다", 409)

    const input = parsePollInput(raw)
    if (!input.ok) return fail(input.error, 400)

    const { messageId } = await createMessageWith(
      sql,
      { room_id: roomId, author_id: member.id, kind: "poll", body: input.question },
      (id) => sql`
        INSERT INTO messenger_polls (message_id, question, options, multiple, anonymous, closes_at)
        VALUES (${id}, ${input.question}, ${JSON.stringify(input.options)}::jsonb, ${input.multiple},
                ${input.anonymous}, ${input.closes_at}::timestamptz)
      `
    )
    const message = await loadMessage(sql, member.id, messageId)
    return NextResponse.json({ success: true, message })
  } catch (error) {
    return serverError(error, "poll create", "투표를 만들지 못했습니다")
  }
}
