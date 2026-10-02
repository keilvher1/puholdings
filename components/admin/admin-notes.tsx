"use client"

// 홈 "메모·확인 사항"(계획서 3.2·4.1.3). 열린 메모는 제목·날짜만 한 줄씩 접혀 있고, 누르면 그 자리에서 답변 칸과
// [답변 저장]·[해결로 표시]가 펼쳐진다. 해결은 확인창 없이 바로 처리하고 토스트 [되돌리기](상태를 open으로 PUT).
// 삭제는 ⋯ 안 → useConfirm(위험, 메모 제목). API는 기존 /api/admin/notes 그대로.

import { useCallback, useEffect, useId, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  BusyButton,
  CardSkeleton,
  CountBadge,
  EmptyState,
  Notice,
  RowActions,
  Section,
  StatusBadge,
  toastSuccess,
  useConfirm,
  useDelayedFlag,
} from "@/components/saas"
import { dateShort, dateTime } from "@/lib/format"
import { friendlyError, MSG } from "@/lib/messages"

interface Note {
  id: number
  category: "migration" | "confirm" | "memo"
  title: string
  body: string | null
  status: "open" | "resolved"
  answer: string | null
  answered_at: string | null
  created_at: string
}

const CATEGORY_LABEL: Record<Note["category"], string> = {
  migration: "데이터 이관",
  confirm: "확인 필요",
  memo: "메모",
}

type PutBody = { id: number; answer?: string; status?: "open" | "resolved" }

async function putNote(body: PutBody): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.success) return null
    return friendlyError(res.status, d.error, MSG.saveFailed)
  } catch {
    return friendlyError(0, null, MSG.saveFailed)
  }
}

function NoteRow({ note, onChanged, onUndoFailed }: { note: Note; onChanged: () => void; onUndoFailed: (message: string) => void }) {
  const router = useRouter()
  const ask = useConfirm()
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [answer, setAnswer] = useState(note.answer ?? "")
  const [busy, setBusy] = useState<null | "answer" | "resolve" | "reopen" | "delete">(null)
  const [error, setError] = useState("")
  const resolved = note.status === "resolved"

  const after = () => {
    onChanged()
    router.refresh()
  }

  const saveAnswer = async () => {
    setBusy("answer")
    setError("")
    const err = await putNote({ id: note.id, answer })
    setBusy(null)
    if (err) return setError(err)
    toastSuccess("답변을 저장했어요")
    after()
  }

  const resolve = async () => {
    setBusy("resolve")
    setError("")
    const err = await putNote(answer.trim() !== (note.answer ?? "").trim() ? { id: note.id, answer, status: "resolved" } : { id: note.id, status: "resolved" })
    setBusy(null)
    if (err) return setError(err)
    toastSuccess("해결로 표시했어요", {
      description: note.title,
      undo: async () => {
        // 행은 해결 목록으로 옮겨 다시 그려지므로(key에 status) 실패는 카드 맨 위 Notice로 알린다
        const undoErr = await putNote({ id: note.id, status: "open" })
        if (undoErr) onUndoFailed(`‘${note.title}’ 메모를 되돌리지 못했어요. 해결한 메모에서 [다시 열기]를 눌러 주세요`)
        after()
      },
    })
    after()
  }

  const reopen = async () => {
    setBusy("reopen")
    setError("")
    const err = await putNote({ id: note.id, status: "open" })
    setBusy(null)
    if (err) return setError(err)
    toastSuccess("메모를 다시 열었어요")
    after()
  }

  const remove = async () => {
    if (
      !(await ask({
        title: `‘${note.title}’ 메모를 삭제할까요?`,
        consequences: ["답변도 함께 지워져요", "되돌릴 수 없어요"],
        confirmLabel: "삭제하기",
        tone: "danger",
      }))
    )
      return
    setBusy("delete")
    setError("")
    try {
      const res = await fetch(`/api/admin/notes?id=${note.id}`, { method: "DELETE", credentials: "include" })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.success) {
        setOpen(true)
        setError(friendlyError(res.status, d.error, MSG.deleteFailed))
        return
      }
      toastSuccess("메모를 삭제했어요")
      after()
    } catch {
      setOpen(true)
      setError(friendlyError(0, null, MSG.deleteFailed))
    } finally {
      setBusy(null)
    }
  }

  return (
    <li className="border-b border-warm-tan/70 last:border-b-0">
      <div className="flex items-center gap-1 pr-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 px-4 py-2.5 text-left hover:bg-warm-ivory sm:px-5"
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-[#3f3f4e]" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-[#3f3f4e]" aria-hidden />
          )}
          <span className={`min-w-0 flex-1 truncate text-base ${resolved ? "text-text-secondary" : "font-medium text-dark"}`}>
            {note.title}
          </span>
          {resolved && <StatusBadge domain="note" status="resolved" />}
          <span className="shrink-0 text-sm text-text-secondary" title={dateTime(note.created_at)}>
            {dateShort(note.created_at)}
          </span>
        </button>
        <RowActions
          label={note.title}
          triggerLabel={`‘${note.title}’ 메모 동작 더 보기`}
          items={[{ label: "삭제", onSelect: remove, danger: true, disabled: busy !== null }]}
        />
      </div>
      {open && (
        <div id={panelId} className="grid gap-3 px-4 pb-4 sm:px-5 sm:pl-11">
          <p className="text-sm text-text-secondary">
            {CATEGORY_LABEL[note.category]} · {dateTime(note.created_at)}
          </p>
          {note.body && <p className="whitespace-pre-line text-base leading-relaxed text-dark [word-break:keep-all]">{note.body}</p>}
          {error && <Notice tone="danger">{error}</Notice>}
          {resolved ? (
            <>
              {note.answer ? (
                <div className="rounded-md bg-warm-beige/60 px-3 py-2 text-base">
                  <span className="font-medium text-dark">답변 </span>
                  <span className="whitespace-pre-line text-[#3f3f4e]">{note.answer}</span>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">답변 없이 해결했어요</p>
              )}
              <div className="flex justify-end">
                <BusyButton variant="outline" size="sm" busy={busy === "reopen"} busyLabel={MSG.busy} onClick={reopen} className="hover:bg-warm-beige hover:text-dark">
                  다시 열기
                </BusyButton>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor={`${panelId}-answer`}>확인 결과·답변</Label>
                <Textarea
                  id={`${panelId}-answer`}
                  rows={2}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="bg-card text-base"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <BusyButton
                  variant="outline"
                  size="sm"
                  busy={busy === "answer"}
                  disabled={busy !== null && busy !== "answer"}
                  onClick={saveAnswer}
                  className="hover:bg-warm-beige hover:text-dark"
                >
                  답변 저장
                </BusyButton>
                <BusyButton size="sm" busy={busy === "resolve"} busyLabel={MSG.busy} disabled={busy !== null && busy !== "resolve"} onClick={resolve}>
                  해결로 표시
                </BusyButton>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  )
}

export function AdminNotesCard() {
  const router = useRouter()
  const [notes, setNotes] = useState<Note[]>([])
  const [state, setState] = useState<"loading" | "error" | "ready">("loading")
  const [showResolved, setShowResolved] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newBody, setNewBody] = useState("")
  const [titleError, setTitleError] = useState("")
  const [addError, setAddError] = useState("")
  const [saving, setSaving] = useState(false)
  const [undoError, setUndoError] = useState("")
  const showSkeleton = useDelayedFlag(state === "loading")

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notes", { credentials: "include" })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.success) {
        setNotes(d.notes)
        setState("ready")
      } else {
        setState("error")
      }
    } catch {
      setState("error")
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const open = notes.filter((n) => n.status === "open")
  const resolved = notes.filter((n) => n.status === "resolved")

  const openAdd = () => {
    setNewTitle("")
    setNewBody("")
    setTitleError("")
    setAddError("")
    setAddOpen(true)
  }

  const addMemo = async () => {
    if (!newTitle.trim()) {
      setTitleError("제목을 입력해 주세요")
      document.getElementById("note-new-title")?.focus()
      return
    }
    setTitleError("")
    setAddError("")
    setSaving(true)
    try {
      const res = await fetch("/api/admin/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: newTitle, body: newBody }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.success) {
        setAddOpen(false)
        load()
        router.refresh()
      } else {
        setAddError(friendlyError(res.status, d.error, MSG.saveFailed))
      }
    } catch {
      setAddError(friendlyError(0, null, MSG.saveFailed))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      flush
      title={
        <span className="flex items-center gap-2">
          메모·확인 사항
          <CountBadge count={open.length} srLabel={`확인할 메모 ${open.length}건`} />
        </span>
      }
      actions={
        <Button variant="outline" size="sm" onClick={openAdd} className="hover:bg-warm-beige hover:text-dark">
          <Plus className="size-4" aria-hidden />
          메모 추가
        </Button>
      }
    >
      {state === "loading" ? (
        showSkeleton ? <CardSkeleton lines={3} className="m-4" label="메모를 불러오는 중…" /> : <div className="min-h-24" aria-hidden />
      ) : state === "error" ? (
        <EmptyState
          kind="error"
          compact
          title="메모를 불러오지 못했어요"
          description={MSG.network}
          onRetry={() => {
            setState("loading")
            load()
          }}
        />
      ) : notes.length === 0 ? (
        <EmptyState kind="first-use" compact title="아직 남긴 메모가 없어요" description="확인할 일을 적어 두면 여기에 모여요" />
      ) : (
        <>
          {undoError && (
            <div className="px-4 pt-3 sm:px-5">
              <Notice tone="danger" onClose={() => setUndoError("")}>
                {undoError}
              </Notice>
            </div>
          )}
          {open.length === 0 ? (
            <p className="px-4 py-4 text-base text-text-secondary sm:px-5">확인할 메모가 없어요</p>
          ) : (
            <ul>
              {open.map((n) => (
                <NoteRow key={`${n.id}-${n.status}`} note={n} onChanged={load} onUndoFailed={setUndoError} />
              ))}
            </ul>
          )}
          {resolved.length > 0 && (
            <div className="border-t border-warm-tan">
              <button
                type="button"
                onClick={() => setShowResolved((v) => !v)}
                aria-expanded={showResolved}
                className="flex min-h-11 w-full items-center gap-1.5 px-4 text-left text-[15px] text-[#3f3f4e] hover:bg-warm-ivory sm:px-5"
              >
                {showResolved ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                해결한 메모 {resolved.length}개 {showResolved ? "접기" : "보기"}
              </button>
              {showResolved && (
                <ul className="border-t border-warm-tan/70">
                  {resolved.map((n) => (
                    <NoteRow key={`${n.id}-${n.status}`} note={n} onChanged={load} onUndoFailed={setUndoError} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={addOpen} onOpenChange={(o) => !saving && setAddOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>메모 추가</DialogTitle>
            <DialogDescription>확인할 일이나 남겨 둘 내용을 적어요.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {addError && <Notice tone="danger">{addError}</Notice>}
            <div className="grid gap-1.5">
              <Label htmlFor="note-new-title">제목</Label>
              <Input
                id="note-new-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                aria-invalid={titleError ? true : undefined}
                aria-describedby={titleError ? "note-new-title-error" : undefined}
              />
              {titleError && (
                <p id="note-new-title-error" className="text-sm text-red-800">
                  {titleError}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="note-new-body">내용(선택)</Label>
              <Textarea id="note-new-body" rows={4} value={newBody} onChange={(e) => setNewBody(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving} className="hover:bg-warm-beige hover:text-dark">
              닫기
            </Button>
            <BusyButton busy={saving} onClick={addMemo}>
              메모 저장하기
            </BusyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  )
}
