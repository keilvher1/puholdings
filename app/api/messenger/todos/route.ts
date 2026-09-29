import { NextResponse } from "next/server"
import {
  fail,
  loadMessage,
  readJson,
  requireMessenger,
  requireRoomMember,
  roomMemberIds,
  serverError,
  todoFromRow,
} from "@/lib/messenger"
import { DATE_RE, createMessageWith, publishTodoUpdate, toId, toIdArray } from "@/lib/messenger-extras"

// GET  /api/messenger/todos?scope=mine|room&room_id=
//   mine(기본): 내가 참여한 방에서 나에게 배정된 할 일(담당자 없이 내가 만든 것 포함)
//   room: 그 방의 할 일 전체(방 참여자만)
//   → { success, todos: MessengerTodo[] }  (안 끝난 것 먼저, 기한 빠른 순)
// POST /api/messenger/todos { room_id, title, assignee_ids, due_date?, message_id? }
//   → 할 일 카드 메시지(kind 'todo', body = 제목, mentions = 담당자)를 함께 올린다.
//     message_id가 있으면("메시지를 할 일로") 카드 메시지의 shared_from_id로 원본을 가리킨다.
//   → { success, todo: MessengerTodo, message: MessengerMessage }

export async function GET(request: Request) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me: member } = auth

  const url = new URL(request.url)
  const scope = url.searchParams.get("scope") === "room" ? "room" : "mine"
  try {
    if (scope === "room") {
      const roomId = toId(url.searchParams.get("room_id"))
      if (!roomId) return fail("대화방을 지정해 주세요", 400)
      const access = await requireRoomMember(sql, roomId, member.id)
      if (!access) return fail("대화방을 찾을 수 없습니다", 404)
      const rows = await sql`
        SELECT id, room_id, message_id, title, assignee_ids, to_char(due_date, 'YYYY-MM-DD') AS due_date, done_at, done_by,
               created_by, created_at
        FROM messenger_todos
        WHERE room_id = ${roomId}
        ORDER BY (done_at IS NOT NULL), due_date NULLS LAST, id DESC
        LIMIT 300
      `
      return NextResponse.json({ success: true, todos: rows.map(todoFromRow) })
    }
    const rows = await sql`
      SELECT t.id, t.room_id, t.message_id, t.title, t.assignee_ids, to_char(t.due_date, 'YYYY-MM-DD') AS due_date, t.done_at, t.done_by,
             t.created_by, t.created_at
      FROM messenger_todos t
      JOIN messenger_room_members rm ON rm.room_id = t.room_id AND rm.member_id = ${member.id}
      WHERE t.assignee_ids @> ${JSON.stringify([member.id])}::jsonb
         OR (t.created_by = ${member.id} AND jsonb_array_length(t.assignee_ids) = 0)
      ORDER BY (t.done_at IS NOT NULL), t.due_date NULLS LAST, t.id DESC
      LIMIT 300
    `
    return NextResponse.json({ success: true, todos: rows.map(todoFromRow) })
  } catch (error) {
    return serverError(error, "todos list", "할 일을 불러오지 못했습니다")
  }
}

export async function POST(request: Request) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me: member } = auth

  const raw = await readJson(request)
  if (!raw) return fail("요청 형식이 올바르지 않습니다", 400)
  const roomId = toId(raw.room_id)
  if (!roomId) return fail("대화방을 지정해 주세요", 400)
  const title = typeof raw.title === "string" ? raw.title.replace(/\s+/g, " ").trim() : ""
  if (!title) return fail("할 일 내용을 입력해 주세요", 400)
  if (title.length > 300) return fail("할 일은 300자 이하여야 합니다", 400)
  const dueDate = raw.due_date === undefined || raw.due_date === null || raw.due_date === "" ? null : raw.due_date
  if (dueDate !== null && (typeof dueDate !== "string" || !DATE_RE.test(dueDate))) {
    return fail("기한은 YYYY-MM-DD 형식이어야 합니다", 400)
  }
  const assigneeIds = toIdArray(raw.assignee_ids)
  if (assigneeIds.length > 50) return fail("담당자가 너무 많습니다", 400)
  const sourceId = raw.message_id === undefined || raw.message_id === null ? null : toId(raw.message_id)
  if (raw.message_id !== undefined && raw.message_id !== null && !sourceId) return fail("원본 메시지가 올바르지 않습니다", 400)

  try {
    const access = await requireRoomMember(sql, roomId, member.id)
    if (!access) return fail("대화방을 찾을 수 없습니다", 404)
    if (access.is_archived) return fail("보관된 토픽입니다", 409)

    if (assigneeIds.length > 0) {
      const inRoom = new Set(await roomMemberIds(sql, roomId))
      if (assigneeIds.some((id) => !inRoom.has(id))) return fail("담당자는 이 대화방 참여자여야 합니다", 400)
    }
    if (sourceId) {
      const src = await sql`
        SELECT id FROM messenger_messages WHERE id = ${sourceId} AND room_id = ${roomId} AND deleted_at IS NULL
      `
      if (src.length === 0) return fail("원본 메시지를 찾을 수 없습니다", 404)
    }

    const mentions = assigneeIds.filter((id) => id !== member.id)
    const { messageId, value: rows } = await createMessageWith(
      sql,
      { room_id: roomId, author_id: member.id, kind: "todo", body: title, mentions, shared_from_id: sourceId },
      (id) => sql`
        INSERT INTO messenger_todos (room_id, message_id, title, assignee_ids, due_date, created_by)
        VALUES (${roomId}, ${id}, ${title}, ${JSON.stringify(assigneeIds)}::jsonb, ${dueDate}::date, ${member.id})
        RETURNING id, room_id, message_id, title, assignee_ids, to_char(due_date, 'YYYY-MM-DD') AS due_date,
                  done_at, done_by, created_by, created_at
      `
    )
    const todo = todoFromRow(rows[0])
    await publishTodoUpdate(sql, todo)
    const message = await loadMessage(sql, member.id, messageId)
    return NextResponse.json({ success: true, todo, message })
  } catch (error) {
    return serverError(error, "todo create", "할 일을 만들지 못했습니다")
  }
}
