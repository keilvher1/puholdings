import { NextResponse } from "next/server"
import {
  fail,
  isTopicAdmin,
  readJson,
  requireMessenger,
  requireRoomMember,
  roomMemberIds,
  serverError,
  todoFromRow,
} from "@/lib/messenger"
import { DATE_RE, publishMessageUpdate, publishTodoUpdate, toId, toIdArray } from "@/lib/messenger-extras"

// PATCH /api/messenger/todos/[id] { title?, assignee_ids?, due_date?(null=없앰), done? }
// 방 참여자 중 만든 사람·담당자·토픽 관리자(담당자가 없거나 1:1 대화면 참여자 누구나)만.
// 제목이 바뀌면 할 일 카드 메시지 본문도 같이 바꾼다.
// → { success, todo: MessengerTodo }  (sync에는 todo.updated + 카드 메시지 message.updated)

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me: member } = auth
  const todoId = toId((await params).id)
  if (!todoId) return fail("할 일을 찾을 수 없습니다", 404)

  const raw = await readJson(request)
  if (!raw) return fail("요청 형식이 올바르지 않습니다", 400)

  try {
    const found = await sql`
      SELECT id, room_id, message_id, title, assignee_ids, to_char(due_date, 'YYYY-MM-DD') AS due_date, done_at, done_by,
             created_by, created_at
      FROM messenger_todos WHERE id = ${todoId}
    `
    if (found.length === 0) return fail("할 일을 찾을 수 없습니다", 404)
    const current = todoFromRow(found[0])
    const access = await requireRoomMember(sql, current.room_id, member.id)
    if (!access) return fail("할 일을 찾을 수 없습니다", 404)
    if (access.is_archived) return fail("보관된 토픽입니다", 409)

    const allowed =
      current.created_by === member.id ||
      current.assignee_ids.includes(member.id) ||
      current.assignee_ids.length === 0 ||
      access.kind === "dm" ||
      isTopicAdmin(access, member)
    if (!allowed) return fail("만든 사람·담당자·토픽 관리자만 바꿀 수 있습니다", 403)

    let title = current.title
    if (raw.title !== undefined) {
      title = typeof raw.title === "string" ? raw.title.replace(/\s+/g, " ").trim() : ""
      if (!title) return fail("할 일 내용을 입력해 주세요", 400)
      if (title.length > 300) return fail("할 일은 300자 이하여야 합니다", 400)
    }
    let assigneeIds = current.assignee_ids
    if (raw.assignee_ids !== undefined) {
      assigneeIds = toIdArray(raw.assignee_ids)
      if (assigneeIds.length > 50) return fail("담당자가 너무 많습니다", 400)
      if (assigneeIds.length > 0) {
        const inRoom = new Set(await roomMemberIds(sql, current.room_id))
        if (assigneeIds.some((id) => !inRoom.has(id))) return fail("담당자는 이 대화방 참여자여야 합니다", 400)
      }
    }
    let dueDate = current.due_date
    if (raw.due_date !== undefined) {
      if (raw.due_date === null || raw.due_date === "") dueDate = null
      else if (typeof raw.due_date === "string" && DATE_RE.test(raw.due_date)) dueDate = raw.due_date
      else return fail("기한은 YYYY-MM-DD 형식이어야 합니다", 400)
    }
    let done = current.done
    if (raw.done !== undefined) {
      if (typeof raw.done !== "boolean") return fail("완료 여부가 올바르지 않습니다", 400)
      done = raw.done
    }
    const doneChanged = done !== current.done

    const rows = await sql`
      UPDATE messenger_todos SET
        title = ${title},
        assignee_ids = ${JSON.stringify(assigneeIds)}::jsonb,
        due_date = ${dueDate}::date,
        done_at = CASE WHEN ${doneChanged} THEN (CASE WHEN ${done} THEN now() ELSE NULL END) ELSE done_at END,
        done_by = CASE WHEN ${doneChanged} THEN (CASE WHEN ${done} THEN ${member.id}::int ELSE NULL END) ELSE done_by END,
        updated_at = now()
      WHERE id = ${todoId}
      RETURNING id, room_id, message_id, title, assignee_ids, to_char(due_date, 'YYYY-MM-DD') AS due_date, done_at, done_by,
                created_by, created_at
    `
    const todo = todoFromRow(rows[0])

    if (todo.message_id) {
      if (title !== current.title) {
        await sql`
          UPDATE messenger_messages SET body = ${title}
          WHERE id = ${todo.message_id} AND kind = 'todo' AND deleted_at IS NULL
        `
      }
      await publishMessageUpdate(sql, todo.room_id, todo.message_id, member.id)
    }
    await publishTodoUpdate(sql, todo)
    return NextResponse.json({ success: true, todo })
  } catch (error) {
    return serverError(error, "todo update", "할 일을 바꾸지 못했습니다")
  }
}
