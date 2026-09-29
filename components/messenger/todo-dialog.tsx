"use client"

// 할 일 만들기·수정 대화상자. useMessenger()로 방 참여자·반영 함수를 받는다.
//
// export function TodoDialog(props: TodoDialogProps)
// export interface TodoDialogProps {
//   open: boolean
//   onOpenChange: (open: boolean) => void
//   roomId: number                  // 만들 방(수정 모드에서는 todo.room_id 사용)
//   messageId?: number | null       // "할 일로 만들기" 원본 메시지
//   defaultTitle?: string           // "할 일로 만들기" 원본 본문(멘션 토큰은 @이름으로 바꿔 채움)
//   todo?: MessengerTodo | null     // 있으면 수정 모드
// }
// 저장 후: ctx.applyTodo(todo), 응답에 message가 있으면 ctx.applyMessage(message)
// API: POST todos {room_id, title, assignee_ids, due_date, message_id?} → { todo, message? }
//      PATCH todos/[id] {title, assignee_ids, due_date} → { todo }

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { MessengerMessage, MessengerTodo } from "@/lib/messenger-types"
import { messengerApi } from "./api"
import { useMessenger } from "./store"
import { addDaysYmd, errText, InlineError, MemberPicker, pickObject, stripMentionTokens, todayYmd, useRoomMembers } from "./panel-kit"

export interface TodoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId: number
  messageId?: number | null
  defaultTitle?: string
  todo?: MessengerTodo | null
}

const TITLE_MAX = 300

export function TodoDialog({ open, onOpenChange, roomId, messageId, defaultTitle, todo }: TodoDialogProps) {
  const ctx = useMessenger()
  const editing = !!todo
  const room = ctx.state.rooms[todo?.room_id ?? roomId] ?? null
  const candidates = useRoomMembers(room)
  const [title, setTitle] = useState("")
  const [assignees, setAssignees] = useState<number[]>([])
  const [due, setDue] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)
    if (todo) {
      setTitle(todo.title)
      setAssignees(todo.assignee_ids)
      setDue(todo.due_date?.slice(0, 10) ?? "")
    } else {
      setTitle(stripMentionTokens(defaultTitle ?? "").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX))
      setAssignees([])
      setDue("")
    }
  }, [open, todo, defaultTitle])

  async function save() {
    const t = title.trim()
    if (!t) return setError("할 일 내용을 입력하세요.")
    setSaving(true)
    setError(null)
    try {
      const payload = { title: t, assignee_ids: assignees, due_date: due || null }
      const res = editing
        ? await messengerApi.patch(`todos/${todo!.id}`, payload)
        : await messengerApi.post("todos", { room_id: roomId, ...payload, message_id: messageId ?? undefined })
      const msg = pickObject<MessengerMessage>(res, ["message"])
      const saved = pickObject<MessengerTodo>(res, ["todo"]) ?? msg?.todo ?? null
      if (msg) ctx.applyMessage(msg)
      if (saved) ctx.applyTodo(saved)
      ctx.notify(editing ? "할 일을 고쳤습니다." : "할 일을 만들었습니다.")
      onOpenChange(false)
    } catch (e) {
      setError(errText(e, "저장하지 못했습니다."))
    } finally {
      setSaving(false)
    }
  }

  const quickDue = [
    { label: "오늘", value: todayYmd() },
    { label: "내일", value: addDaysYmd(1) },
    { label: "일주일 뒤", value: addDaysYmd(7) },
  ]

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "할 일 수정" : "할 일 만들기"}</DialogTitle>
          <DialogDescription>
            {editing ? "내용·담당자·마감일을 바꿉니다." : "대화방에 할 일 카드로 올라가고 담당자에게 알림이 갑니다."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="todo-title">할 일</Label>
            <Input
              id="todo-title"
              value={title}
              maxLength={TITLE_MAX}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void save()
                }
              }}
              placeholder="예: 10월 관리비 고지서 확인"
            />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>담당자</Label>
              {!assignees.includes(ctx.me.id) && (
                <button
                  type="button"
                  className="text-xs text-text-secondary underline underline-offset-2 hover:text-dark"
                  onClick={() => setAssignees([...assignees, ctx.me.id])}
                >
                  나에게 배정
                </button>
              )}
            </div>
            <MemberPicker members={candidates} selected={assignees} onChange={setAssignees} emptyText="방 참여자가 없습니다." />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="todo-due">마감일</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input id="todo-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-40" />
              {quickDue.map((q) => (
                <Button key={q.label} type="button" size="sm" variant={due === q.value ? "secondary" : "outline"} onClick={() => setDue(q.value)}>
                  {q.label}
                </Button>
              ))}
              {due && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setDue("")}>
                  없음
                </Button>
              )}
            </div>
          </div>
          <InlineError message={error} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || !title.trim()}>
            {saving && <Loader2 className="animate-spin" />}
            {editing ? "저장" : "만들기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
