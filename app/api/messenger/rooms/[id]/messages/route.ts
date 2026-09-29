import { NextResponse } from "next/server"
import {
  createMessage,
  fail,
  loadMessage,
  loadMessageList,
  parseAttachments,
  parseId,
  readJson,
  requireMessenger,
  requireRoomMember,
  resolveMentions,
  roomMemberIds,
  serverError,
} from "@/lib/messenger"
import { MAX_MESSAGE_LENGTH } from "@/lib/messenger-types"

// GET  /api/messenger/rooms/[id]/messages?before=ID|after=ID|around=ID&limit=50
//   최상위 메시지만(댓글은 thread로), 삭제된 메시지는 빠진다. 오래된 → 최근 순서.
//   → { success, messages, has_more (= has_more_before), has_more_before, has_more_after }
//   - 아무것도 안 주면 최근 limit개. around는 그 메시지를 가운데로 앞뒤 절반씩(검색 결과로 이동할 때).
// POST /api/messenger/rooms/[id]/messages {body, attachments?, parent_id?, mentions?, client_id?}
//   → 201 { success, message, client_id? }  (client_id는 낙관적 표시 교체용으로 그대로 돌려준다)
//   멘션은 본문의 '@[이름](m:ID)' 토큰에서 읽는다(방 참여자와 @전체만 남김). 댓글에 댓글은 원본 스레드로 붙는다.
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Ctx) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const roomId = parseId((await params).id)
  if (!roomId) return fail("잘못된 방 id입니다", 400)
  const sp = new URL(request.url).searchParams
  const limitRaw = Number(sp.get("limit") ?? 50)
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50
  const before = sp.has("before") ? parseId(sp.get("before")) : null
  const after = sp.has("after") ? parseId(sp.get("after")) : null
  const around = sp.has("around") ? parseId(sp.get("around")) : null
  if ((sp.has("before") && !before) || (sp.has("after") && !after) || (sp.has("around") && !around)) {
    return fail("before/after/around 값이 올바르지 않습니다", 400)
  }

  try {
    const room = await requireRoomMember(sql, roomId, me.id)
    if (!room) return fail("방을 찾을 수 없습니다", 404)

    const older = async (below: number | null, n: number) =>
      (await sql`
        SELECT id FROM messenger_messages
        WHERE room_id = ${roomId} AND parent_id IS NULL AND deleted_at IS NULL
          AND (${below}::bigint IS NULL OR id < ${below}::bigint)
        ORDER BY id DESC
        LIMIT ${n + 1}
      `).map((r) => Number(r.id))
    const newer = async (above: number, n: number, inclusive: boolean) =>
      (await sql`
        SELECT id FROM messenger_messages
        WHERE room_id = ${roomId} AND parent_id IS NULL AND deleted_at IS NULL
          AND (id > ${above}::bigint OR (${inclusive}::boolean AND id = ${above}::bigint))
        ORDER BY id ASC
        LIMIT ${n + 1}
      `).map((r) => Number(r.id))

    let ids: number[] = []
    let hasMoreBefore = false
    let hasMoreAfter = false
    if (around) {
      const half = Math.max(1, Math.floor(limit / 2))
      const [olderIds, newerIds] = await Promise.all([older(around, half), newer(around, limit - half, true)])
      hasMoreBefore = olderIds.length > half
      hasMoreAfter = newerIds.length > limit - half
      ids = [...olderIds.slice(0, half).reverse(), ...newerIds.slice(0, limit - half)]
    } else if (after) {
      const newerIds = await newer(after, limit, false)
      hasMoreAfter = newerIds.length > limit
      hasMoreBefore = true
      ids = newerIds.slice(0, limit)
    } else {
      const olderIds = await older(before, limit)
      hasMoreBefore = olderIds.length > limit
      ids = olderIds.slice(0, limit).reverse()
    }
    const messages = await loadMessageList(sql, me.id, ids)
    return NextResponse.json({
      success: true,
      messages,
      has_more: hasMoreBefore,
      has_more_before: hasMoreBefore,
      has_more_after: hasMoreAfter,
    })
  } catch (error) {
    return serverError(error, "messages list", "메시지를 불러오지 못했습니다")
  }
}

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const roomId = parseId((await params).id)
  if (!roomId) return fail("잘못된 방 id입니다", 400)
  const body = await readJson(request)
  if (!body) return fail("요청 형식이 올바르지 않습니다", 400)

  const text = typeof body.body === "string" ? body.body.replace(/\r\n/g, "\n").replace(/\s+$/, "") : ""
  if (text.length > MAX_MESSAGE_LENGTH) return fail(`메시지는 ${MAX_MESSAGE_LENGTH}자까지 보낼 수 있습니다`, 400)
  const atts = parseAttachments(body.attachments, roomId)
  if (!atts.ok) return fail(atts.error, 400)
  if (!text.trim() && atts.value.length === 0) return fail("메시지를 입력하세요", 400)
  let parentId: number | null = null
  if (body.parent_id !== undefined && body.parent_id !== null) {
    parentId = parseId(body.parent_id)
    if (!parentId) return fail("parent_id가 올바르지 않습니다", 400)
  }
  const clientId = typeof body.client_id === "string" ? body.client_id.slice(0, 100) : undefined

  try {
    const room = await requireRoomMember(sql, roomId, me.id)
    if (!room) return fail("방을 찾을 수 없습니다", 404)
    if (room.is_archived) return fail("보관된 토픽에는 메시지를 보낼 수 없습니다", 400)

    if (parentId) {
      const parent = await sql`
        SELECT id, parent_id, deleted_at FROM messenger_messages WHERE id = ${parentId} AND room_id = ${roomId}
      `
      if (parent.length === 0) return fail("댓글을 달 메시지를 찾을 수 없습니다", 404)
      if (parent[0].parent_id !== null && parent[0].parent_id !== undefined) parentId = Number(parent[0].parent_id)
      else if (parent[0].deleted_at) return fail("삭제된 메시지에는 댓글을 달 수 없습니다", 400)
    }

    const memberIds = await roomMemberIds(sql, roomId)
    const mentions = resolveMentions(text, body.mentions, memberIds)
    const id = await createMessage(sql, {
      room_id: roomId,
      author_id: me.id,
      kind: atts.value.length > 0 ? "file" : "text",
      body: text,
      attachments: atts.value,
      mentions,
      parent_id: parentId,
    })
    const message = await loadMessage(sql, me.id, id)
    return NextResponse.json({ success: true, message, ...(clientId ? { client_id: clientId } : {}) }, { status: 201 })
  } catch (error) {
    return serverError(error, "message create", "메시지를 보내지 못했습니다")
  }
}
