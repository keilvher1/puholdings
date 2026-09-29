"use client"

// 할 일 패널. 오른쪽 패널의 '할 일' 탭 내용. '이 방' / '내 할 일' 전환, 진행 중 → 완료(접힘) 순.
//
// export function TodoPanel(props: { room: MessengerRoom | null })   — room이 없으면 '내 할 일'만
// 데이터: GET todos?scope=room&room_id=N | GET todos?scope=mine → { todos }
//   ctx.state.todos(sync·응답으로 본 할 일)를 덮어써 최신 값을 보이고, ctx.state.todoVersion이 바뀌면 조용히 다시 불러온다.

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { MessengerRoom, MessengerTodo } from "@/lib/messenger-types"
import { useMessenger } from "./store"
import { isOverdue, PanelEmpty, PanelError, PanelLoading, pickArray, Segmented, usePanelFetch } from "./panel-kit"
import { TodoRow } from "./todo-card"
import { TodoDialog } from "./todo-dialog"

type Scope = "room" | "mine"

function sortOpen(a: MessengerTodo, b: MessengerTodo): number {
  // 마감 지난 것 → 마감 가까운 것 → 마감 없음(최근 생성 순)
  const ad = a.due_date ?? "9999-12-31"
  const bd = b.due_date ?? "9999-12-31"
  if (ad !== bd) return ad < bd ? -1 : 1
  return (b.created_at || "").localeCompare(a.created_at || "")
}

export function TodoPanel({ room }: { room: MessengerRoom | null }) {
  const ctx = useMessenger()
  const { me, state } = ctx
  const [scope, setScope] = useState<Scope>(room ? "room" : "mine")
  const [showDone, setShowDone] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const effective: Scope = room ? scope : "mine"
  const path = effective === "room" && room ? `todos?scope=room&room_id=${room.id}` : "todos?scope=mine"
  const { data, error, loading, reload } = usePanelFetch<unknown>(path, state.todoVersion)

  const todos = useMemo(() => {
    const belongs = (t: MessengerTodo) => (effective === "room" ? t.room_id === room?.id : t.assignee_ids.includes(me.id))
    const map = new Map<number, MessengerTodo>()
    for (const t of pickArray<MessengerTodo>(data, ["todos", "items"])) map.set(t.id, state.todos[t.id] ?? t)
    // 응답 이후 생긴·바뀐 할 일(ctx.state.todos)도 범위에 맞으면 넣고, 범위를 벗어나면 뺀다
    for (const t of Object.values(state.todos)) {
      if (belongs(t)) map.set(t.id, t)
      else map.delete(t.id)
    }
    return [...map.values()]
  }, [data, state.todos, effective, room?.id, me.id])

  const open = todos.filter((t) => !t.done).sort(sortOpen)
  const done = todos.filter((t) => t.done).sort((a, b) => (b.done_at || "").localeCompare(a.done_at || ""))
  const overdue = open.filter(isOverdue).length

  const rowProps = (t: MessengerTodo) => {
    const r = state.rooms[t.room_id]
    return {
      todo: t,
      roomName: effective === "mine" && r ? ctx.roomName(r) : undefined,
      onOpen: t.message_id != null && r ? () => ctx.jumpToMessage(t.room_id, t.message_id!) : undefined,
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-warm-tan px-3 py-2.5">
        {room ? (
          <Segmented
            label="할 일 범위"
            value={effective}
            onChange={setScope}
            options={[
              { value: "room", label: "이 방" },
              { value: "mine", label: "내 할 일" },
            ]}
          />
        ) : (
          <span className="text-sm font-medium text-dark">내 할 일</span>
        )}
        <span className="text-xs tabular-nums text-text-secondary">
          진행 {open.length}
          {overdue > 0 && <span className="font-semibold text-destructive"> · 지남 {overdue}</span>}
        </span>
        {room && !room.is_archived && (
          <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => setCreateOpen(true)}>
            <Plus />
            추가
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && !data ? (
          <PanelError message={error} onRetry={() => void reload()} />
        ) : loading && !data ? (
          <PanelLoading />
        ) : todos.length === 0 ? (
          <PanelEmpty>
            {effective === "room" ? "이 방에 등록된 할 일이 없습니다. 메시지 메뉴의 '할 일로 만들기'로도 만들 수 있습니다." : "나에게 배정된 할 일이 없습니다."}
          </PanelEmpty>
        ) : (
          <>
            {open.length === 0 ? (
              <p className="px-3 py-4 text-sm text-text-secondary">진행 중인 할 일이 없습니다.</p>
            ) : (
              <ul>
                {open.map((t) => (
                  <TodoRow key={t.id} {...rowProps(t)} />
                ))}
              </ul>
            )}
            {done.length > 0 && (
              <div className="border-t border-warm-tan">
                <button
                  type="button"
                  onClick={() => setShowDone((v) => !v)}
                  aria-expanded={showDone}
                  className="flex w-full items-center gap-1 px-3 py-2 text-left text-xs font-medium text-text-secondary hover:text-dark"
                >
                  {showDone ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
                  완료 {done.length}
                </button>
                {showDone && (
                  <ul>
                    {done.map((t) => (
                      <TodoRow key={t.id} {...rowProps(t)} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {room && createOpen && <TodoDialog open onOpenChange={setCreateOpen} roomId={room.id} />}
    </div>
  )
}
