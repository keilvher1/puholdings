import { NextResponse, after } from "next/server"
import { del } from "@vercel/blob"
import {
  fail,
  isTopicAdmin,
  loadMessage,
  parseId,
  readJson,
  recordEvents,
  requireMessageAccess,
  requireMessenger,
  resolveMentions,
  roomMemberIds,
  serverError,
  type EventInput,
} from "@/lib/messenger"
import { MAX_MESSAGE_LENGTH } from "@/lib/messenger-types"

// GET    /api/messenger/messages/[id] → { success, message }
// PATCH  /api/messenger/messages/[id] {body} → { success, message }   본인 메시지(글·파일)만, 멘션 다시 읽음
// DELETE /api/messenger/messages/[id] → { success }                   본인 또는 토픽 관리자. 소프트 삭제(본문·첨부 비움)
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Ctx) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const id = parseId((await params).id)
  if (!id) return fail("잘못된 메시지 id입니다", 400)
  try {
    const access = await requireMessageAccess(sql, id, me.id)
    if (!access) return fail("메시지를 찾을 수 없습니다", 404)
    const message = await loadMessage(sql, me.id, id)
    return NextResponse.json({ success: true, message })
  } catch (error) {
    return serverError(error, "message get", "메시지를 불러오지 못했습니다")
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const id = parseId((await params).id)
  if (!id) return fail("잘못된 메시지 id입니다", 400)
  const body = await readJson(request)
  if (!body) return fail("요청 형식이 올바르지 않습니다", 400)
  const text = typeof body.body === "string" ? body.body.replace(/\r\n/g, "\n").replace(/\s+$/, "") : null
  if (text === null) return fail("body를 보내세요", 400)
  if (text.length > MAX_MESSAGE_LENGTH) return fail(`메시지는 ${MAX_MESSAGE_LENGTH}자까지 보낼 수 있습니다`, 400)

  try {
    const msg = await requireMessageAccess(sql, id, me.id)
    if (!msg) return fail("메시지를 찾을 수 없습니다", 404)
    if (msg.author_id !== me.id) return fail("본인 메시지만 수정할 수 있습니다", 403)
    if (msg.deleted) return fail("삭제된 메시지는 수정할 수 없습니다", 400)
    if (msg.kind !== "text" && msg.kind !== "file") return fail("이 메시지는 수정할 수 없습니다", 400)
    if (msg.room.is_archived) return fail("보관된 토픽의 메시지는 수정할 수 없습니다", 400)
    if (!text.trim() && msg.attachments.length === 0) return fail("메시지를 입력하세요", 400)

    const mentions = resolveMentions(text, body.mentions, await roomMemberIds(sql, msg.room_id))
    await sql`
      UPDATE messenger_messages
      SET body = ${text}, mentions = ${JSON.stringify(mentions)}::jsonb, edited_at = now()
      WHERE id = ${id}
    `
    const events: EventInput[] = [{ room_id: msg.room_id, type: "message.updated", payload: { message_id: id } }]
    if (msg.room.announcement_message_id === id) events.push({ room_id: msg.room_id, type: "room.updated", payload: {} })
    await recordEvents(sql, events)
    const message = await loadMessage(sql, me.id, id)
    return NextResponse.json({ success: true, message })
  } catch (error) {
    return serverError(error, "message update", "메시지를 수정하지 못했습니다")
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const id = parseId((await params).id)
  if (!id) return fail("잘못된 메시지 id입니다", 400)

  try {
    const msg = await requireMessageAccess(sql, id, me.id)
    if (!msg) return fail("메시지를 찾을 수 없습니다", 404)
    const own = msg.author_id !== null && msg.author_id === me.id
    if (!own && !isTopicAdmin(msg.room, me)) return fail("본인 메시지만 삭제할 수 있습니다", 403)
    if (msg.deleted) return NextResponse.json({ success: true })

    await sql`
      UPDATE messenger_messages
      SET deleted_at = now(), body = '', attachments = '[]'::jsonb, connect_info = '[]'::jsonb, mentions = '[]'::jsonb
      WHERE id = ${id} AND deleted_at IS NULL
    `
    const events: EventInput[] = [{ room_id: msg.room_id, type: "message.deleted", payload: { message_id: id } }]
    if (msg.parent_id) events.push({ room_id: msg.room_id, type: "message.updated", payload: { message_id: msg.parent_id } })
    if (msg.room.announcement_message_id === id) {
      await sql`UPDATE messenger_rooms SET announcement_message_id = NULL, updated_at = now() WHERE id = ${msg.room_id}`
      events.push({ room_id: msg.room_id, type: "room.updated", payload: {} })
    }
    await recordEvents(sql, events)

    // 첨부 원본도 지운다(응답 뒤). 같은 방 공유처럼 다른 살아 있는 메시지가 같은 경로를 쓰면 남긴다.
    const paths = msg.attachments.map((a) => a.pathname).filter(Boolean)
    if (paths.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        after(async () => {
          try {
            const used = await sql`
              SELECT DISTINCT a->>'pathname' AS pathname
              FROM messenger_messages m, jsonb_array_elements(m.attachments) a
              WHERE m.deleted_at IS NULL AND a->>'pathname' = ANY(${paths}::text[])
            `
            const keep = new Set(used.map((r) => String(r.pathname)))
            const drop = paths.filter((p) => !keep.has(p))
            if (drop.length > 0) await del(drop)
          } catch (error) {
            console.error("Messenger attachment cleanup error:", error)
          }
        })
      } catch {
        // after()를 쓸 수 없는 환경 — 정리 생략(파일 접근은 /api/file이 삭제 여부로 막는다)
      }
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    return serverError(error, "message delete", "메시지를 삭제하지 못했습니다")
  }
}
