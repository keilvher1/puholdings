import { NextResponse } from "next/server"
import { copy } from "@vercel/blob"
import {
  createMessage,
  fail,
  loadMessage,
  parseId,
  readJson,
  requireMessageAccess,
  requireMessenger,
  requireRoomMember,
  serverError,
} from "@/lib/messenger"
import { MAX_MESSAGE_LENGTH, type MessengerAttachment } from "@/lib/messenger-types"

// POST /api/messenger/messages/[id]/share {room_id, comment?} → 201 { success, message, comment_message? }
// 내가 참여한 다른 방(또는 같은 방)으로 메시지를 공유한다. 원본 방과 대상 방 모두 참여 중이어야 한다.
// 첨부는 대상 방 경로(messenger/{room_id}/…)로 복사한다 — 파일 접근 권한이 방 참여로 정해지기 때문.
// comment가 있으면 공유 메시지 바로 앞에 내 글로 먼저 올린다. 멘션은 옮기지 않는다(다시 알리지 않음).
export const dynamic = "force-dynamic"

function basename(pathname: string): string {
  return (pathname.split("/").pop() || "file").replace(/^\d+-/, "")
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const id = parseId((await params).id)
  if (!id) return fail("잘못된 메시지 id입니다", 400)
  const body = await readJson(request)
  if (!body) return fail("요청 형식이 올바르지 않습니다", 400)
  const targetId = parseId(body.room_id)
  if (!targetId) return fail("공유할 방을 고르세요", 400)
  const comment = typeof body.comment === "string" ? body.comment.trim() : ""
  if (comment.length > MAX_MESSAGE_LENGTH) return fail(`코멘트는 ${MAX_MESSAGE_LENGTH}자까지 쓸 수 있습니다`, 400)

  try {
    const src = await requireMessageAccess(sql, id, me.id)
    if (!src) return fail("메시지를 찾을 수 없습니다", 404)
    if (src.deleted) return fail("삭제된 메시지는 공유할 수 없습니다", 400)
    const target = await requireRoomMember(sql, targetId, me.id)
    if (!target) return fail("공유할 방을 찾을 수 없습니다", 404)
    if (target.is_archived) return fail("보관된 토픽에는 공유할 수 없습니다", 400)

    let attachments: MessengerAttachment[] = src.attachments
    if (attachments.length > 0 && src.room_id !== targetId) {
      try {
        attachments = await Promise.all(
          src.attachments.map(async (a, i) => {
            const to = `messenger/${targetId}/${Date.now()}${i}-${basename(a.pathname)}`
            const res = await copy(a.pathname, to, {
              access: "private",
              addRandomSuffix: false,
              contentType: a.type || undefined,
            })
            return { ...a, pathname: res.pathname }
          })
        )
      } catch (error) {
        console.error("Messenger share copy error:", error)
        return fail("첨부 파일을 복사하지 못했습니다. 잠시 후 다시 시도하세요", 502)
      }
    }

    let commentMessage = null
    if (comment) {
      const cid = await createMessage(sql, { room_id: targetId, author_id: me.id, kind: "text", body: comment })
      commentMessage = await loadMessage(sql, me.id, cid)
    }
    const kind = attachments.length > 0 ? "file" : "text"
    // 투표·할 일은 본문(질문·제목)만 글로 공유된다.
    let text = src.body
    if (!text && src.kind === "poll") {
      const q = await sql`SELECT question FROM messenger_polls WHERE message_id = ${id}`
      text = q.length > 0 ? `[투표] ${String(q[0].question)}` : ""
    }
    if (!text && src.kind === "todo") {
      const t = await sql`SELECT title FROM messenger_todos WHERE message_id = ${id} ORDER BY id LIMIT 1`
      text = t.length > 0 ? `[할 일] ${String(t[0].title)}` : ""
    }
    const newId = await createMessage(sql, {
      room_id: targetId,
      author_id: me.id,
      kind,
      body: text.slice(0, MAX_MESSAGE_LENGTH),
      attachments,
      connect_color: src.connect_color,
      connect_info: src.connect_info,
      shared_from_id: id,
    })
    const message = await loadMessage(sql, me.id, newId)
    return NextResponse.json({ success: true, message, comment_message: commentMessage }, { status: 201 })
  } catch (error) {
    return serverError(error, "share", "공유하지 못했습니다")
  }
}
