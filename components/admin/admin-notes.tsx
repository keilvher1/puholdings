"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { AdminCard } from "@/components/admin/admin-ui"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { StickyNote, Plus, Check, RotateCcw, Trash2, ChevronDown, ChevronUp } from "lucide-react"

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

const CATEGORY_LABEL: Record<Note["category"], { label: string; cls: string }> = {
  migration: { label: "데이터 이관", cls: "bg-warm-beige text-dark" },
  confirm: { label: "확인 필요", cls: "bg-gold/20 text-dark" },
  memo: { label: "메모", cls: "bg-warm-beige text-text-secondary" },
}

function NoteItem({ note, onChanged }: { note: Note; onChanged: () => void }) {
  const [answer, setAnswer] = useState(note.answer ?? "")
  const [busy, setBusy] = useState(false)
  const cat = CATEGORY_LABEL[note.category]

  const save = async (extra?: { status?: "resolved" | "open" }) => {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/notes", {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ id: note.id, answer, ...extra }),
      })
      const d = await res.json()
      if (d.success) onChanged()
      else alert(d.error || "저장 실패")
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!confirm("이 메모를 삭제할까요?")) return
    await fetch(`/api/admin/notes?id=${note.id}`, { method: "DELETE", credentials: "include" })
    onChanged()
  }

  return (
    <div className={`rounded-lg border p-4 ${note.status === "open" ? "border-gold/40 bg-gold/[0.04]" : "border-warm-tan bg-card opacity-75"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cat.cls}`}>{cat.label}</span>
            {note.status === "resolved" && <Badge variant="secondary" className="h-5 text-[10px]">해결됨</Badge>}
            <span className="text-[11px] text-text-tertiary">{new Date(note.created_at).toLocaleDateString("ko-KR")}</span>
          </div>
          <p className="mt-1.5 text-sm font-semibold text-dark">{note.title}</p>
          {note.body && <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-text-secondary">{note.body}</p>}
        </div>
        <button onClick={remove} title="삭제" className="shrink-0 rounded p-1 text-text-tertiary hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 답변 */}
      <div className="mt-3 border-t border-warm-tan/60 pt-3">
        {note.answer && note.status === "resolved" ? (
          <div className="rounded-md bg-warm-beige/60 px-3 py-2 text-[13px]">
            <span className="font-medium text-dark">답변: </span>
            <span className="whitespace-pre-line text-text-secondary">{note.answer}</span>
          </div>
        ) : (
          <div className="grid gap-2">
            <Textarea
              rows={2}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="확인 결과나 답변을 입력하세요"
              className="bg-card text-sm"
            />
            <div className="flex justify-end gap-2">
              {note.status === "open" ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => save()} disabled={busy || !answer.trim()}>
                    답변 저장
                  </Button>
                  <Button size="sm" onClick={() => save({ status: "resolved" })} disabled={busy}>
                    <Check className="h-3.5 w-3.5" />
                    {answer.trim() ? "답변 저장 + 해결" : "해결됨 처리"}
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => save({ status: "open" })} disabled={busy}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  다시 열기
                </Button>
              )}
            </div>
          </div>
        )}
        {note.answer && note.status === "resolved" && (
          <div className="mt-2 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => save({ status: "open" })} disabled={busy} className="h-7 text-xs text-text-tertiary">
              <RotateCcw className="h-3 w-3" /> 다시 열기
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function AdminNotesCard() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [showResolved, setShowResolved] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newBody, setNewBody] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notes", { credentials: "include" })
      const d = await res.json()
      if (d.success) setNotes(d.notes)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const open = notes.filter((n) => n.status === "open")
  const resolved = notes.filter((n) => n.status === "resolved")

  const addMemo = async () => {
    if (!newTitle.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/admin/notes", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ title: newTitle, body: newBody }),
      })
      const d = await res.json()
      if (d.success) { setAddOpen(false); setNewTitle(""); setNewBody(""); load() }
      else alert(d.error || "저장 실패")
    } finally { setSaving(false) }
  }

  if (loading || notes.length === 0) {
    // 메모가 하나도 없으면 추가 버튼만 있는 컴팩트 카드
    if (loading) return null
  }

  return (
    <AdminCard className="mt-4 p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-dark">
          <StickyNote className="h-4 w-4 text-gold" />
          메모 · 확인 사항
          {open.length > 0 && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{open.length}</Badge>}
        </h2>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          메모 추가
        </Button>
      </div>

      {open.length === 0 && resolved.length === 0 ? (
        <p className="py-4 text-center text-sm text-text-secondary">등록된 메모가 없습니다</p>
      ) : (
        <div className="grid gap-3">
          {open.map((n) => <NoteItem key={n.id} note={n} onChanged={load} />)}
          {resolved.length > 0 && (
            <>
              <button
                onClick={() => setShowResolved((v) => !v)}
                className="flex items-center gap-1 self-start text-xs text-text-secondary hover:text-dark"
              >
                {showResolved ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                해결된 항목 {resolved.length}개 {showResolved ? "접기" : "보기"}
              </button>
              {showResolved && resolved.map((n) => <NoteItem key={n.id} note={n} onChanged={load} />)}
            </>
          )}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>메모 추가</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="n-title">제목</Label>
              <Input id="n-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="n-body">내용</Label>
              <Textarea id="n-body" rows={4} value={newBody} onChange={(e) => setNewBody(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>취소</Button>
            <Button onClick={addMemo} disabled={saving || !newTitle.trim()}>{saving ? "저장 중..." : "저장"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminCard>
  )
}
