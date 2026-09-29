"use client"

// 할 일 카드(메시지 안) · 할 일 목록 한 줄(할 일 패널).
//
// export function TodoCard(props: { message: MessengerMessage; todo: MessengerTodo })   — message-item(C)이 todo 메시지 본문 자리에 배치
// export function TodoRow(props: { todo: MessengerTodo; roomName?: string; onOpen?: () => void })  — todo-panel 목록용
// export function useTodoToggle() → { toggle(todo), busyId }   — 완료 토글(낙관적 반영 → PATCH todos/[id] {done} → ctx.applyTodo)
// 변경 반영: ctx.applyTodo(todo) (C의 store가 같은 할 일을 가진 메시지 카드도 함께 갱신)

import { useCallback, useState } from "react"
import { CalendarDays, Check, CornerDownRight, Loader2, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MessengerMessage, MessengerTodo } from "@/lib/messenger-types"
import { patchTodo } from "./api"
import { useMessenger } from "./store"
import { errText, formatDateTime, formatDue, isOverdue } from "./panel-kit"
import { TodoDialog } from "./todo-dialog"

export function useTodoToggle() {
  const ctx = useMessenger()
  const [busyId, setBusyId] = useState<number | null>(null)
  const toggle = useCallback(
    async (todo: MessengerTodo) => {
      setBusyId(todo.id)
      const optimistic: MessengerTodo = {
        ...todo,
        done: !todo.done,
        done_by: !todo.done ? ctx.me.id : null,
        done_at: !todo.done ? new Date().toISOString() : null,
      }
      ctx.applyTodo(optimistic)
      try {
        const saved = await patchTodo(todo.id, { done: !todo.done })
        if (saved) ctx.applyTodo(saved)
      } catch (e) {
        ctx.applyTodo(todo)
        ctx.notify(errText(e, "할 일 상태를 바꾸지 못했습니다."), "error")
      } finally {
        setBusyId(null)
      }
    },
    [ctx]
  )
  return { toggle, busyId }
}

function DoneBox({ done, busy, onClick }: { done: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={done}
      aria-label={done ? "완료 취소" : "완료로 표시"}
      className={cn(
        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm border transition-colors",
        done ? "border-green-700 bg-green-700 text-white" : "border-text-secondary bg-card hover:border-dark"
      )}
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : done ? <Check className="size-3.5" strokeWidth={3} /> : null}
    </button>
  )
}

function AssigneeText({ ids }: { ids: number[] }) {
  const { me, memberName } = useMessenger()
  if (ids.length === 0) return <span>담당자 없음</span>
  const names = ids.map((id) => (id === me.id ? "나" : memberName(id)))
  return (
    <span title={names.join(", ")}>
      {names.slice(0, 3).join(", ")}
      {names.length > 3 && ` 외 ${names.length - 3}명`}
    </span>
  )
}

function DueText({ todo }: { todo: MessengerTodo }) {
  if (!todo.due_date) return null
  const overdue = isOverdue(todo)
  return (
    <span className={cn("inline-flex items-center gap-1", overdue && "font-semibold text-destructive")}>
      <CalendarDays className="size-3.5" aria-hidden />
      {formatDue(todo.due_date)}
      {overdue && " 지남"}
    </span>
  )
}

// 수정 대화상자는 열 때의 값으로 고정(편집 중 sync가 와도 입력이 덮이지 않게)
function useEditSnapshot() {
  const [snap, setSnap] = useState<MessengerTodo | null>(null)
  return {
    snap,
    open: (t: MessengerTodo) => setSnap(t),
    onOpenChange: (v: boolean) => {
      if (!v) setSnap(null)
    },
  }
}

// todo는 message.todo(C의 store가 applyTodo 때 메시지 카드도 함께 갱신한다)
export function TodoCard({ message, todo }: { message: MessengerMessage; todo: MessengerTodo }) {
  const ctx = useMessenger()
  const { toggle, busyId } = useTodoToggle()
  const edit = useEditSnapshot()
  const mine = todo.assignee_ids.includes(ctx.me.id)
  const room = ctx.state.rooms[message.room_id]

  return (
    <div className={cn("rounded-md border bg-card px-3.5 py-3", mine && !todo.done ? "border-dark/40" : "border-warm-tan")}>
      <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-text-secondary">
        <span>할 일{mine && !todo.done ? " · 내 담당" : ""}</span>
        {!room?.is_archived && (
          <button
            type="button"
            onClick={() => edit.open(todo)}
            className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-warm-ivory hover:text-dark"
          >
            <Pencil className="size-3" aria-hidden />
            수정
          </button>
        )}
      </div>
      <div className="flex items-start gap-2.5">
        <DoneBox done={todo.done} busy={busyId === todo.id} onClick={() => void toggle(todo)} />
        <div className="min-w-0 flex-1">
          <p className={cn("break-words text-[15px] font-medium text-dark", todo.done && "text-text-secondary line-through")}>{todo.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
            <AssigneeText ids={todo.assignee_ids} />
            <DueText todo={todo} />
            {todo.done && (
              <span className="text-green-800">
                {todo.done_by != null ? `${todo.done_by === ctx.me.id ? "내가" : `${ctx.memberName(todo.done_by)}님이`} ` : ""}
                완료{todo.done_at ? ` · ${formatDateTime(todo.done_at)}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>
      {edit.snap && <TodoDialog open onOpenChange={edit.onOpenChange} roomId={edit.snap.room_id} todo={edit.snap} />}
    </div>
  )
}

export function TodoRow({ todo, roomName, onOpen }: { todo: MessengerTodo; roomName?: string; onOpen?: () => void }) {
  const { toggle, busyId } = useTodoToggle()
  const edit = useEditSnapshot()
  return (
    <li className="border-b border-warm-tan/70 px-3 py-2.5 last:border-b-0">
      <div className="flex items-start gap-2.5">
        <DoneBox done={todo.done} busy={busyId === todo.id} onClick={() => void toggle(todo)} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => edit.open(todo)}
            className={cn("block w-full break-words text-left text-sm font-medium text-dark hover:underline", todo.done && "text-text-secondary line-through")}
            title="할 일 수정"
          >
            {todo.title}
          </button>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-text-secondary">
            <AssigneeText ids={todo.assignee_ids} />
            <DueText todo={todo} />
            {roomName && <span className="max-w-full truncate">{roomName}</span>}
          </div>
        </div>
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="shrink-0 rounded-sm p-1 text-text-secondary hover:bg-warm-ivory hover:text-dark"
            aria-label="원본 메시지로 이동"
            title="원본 메시지로 이동"
          >
            <CornerDownRight className="size-4" />
          </button>
        )}
      </div>
      {edit.snap && <TodoDialog open onOpenChange={edit.onOpenChange} roomId={edit.snap.room_id} todo={edit.snap} />}
    </li>
  )
}
