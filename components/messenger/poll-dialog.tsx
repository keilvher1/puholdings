"use client"

// 투표 만들기 대화상자. 입력창(C)의 '투표' 버튼 → ctx.openDialog({ name: "poll", roomId }).
//
// export function PollDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; roomId: number })
// 만든 뒤 ctx.applyMessage(message)로 목록에 바로 넣는다(sync 중복은 id로 병합).
// API: POST polls { room_id, question, options: string[2..10], multiple, anonymous, closes_at: ISO|null } → { message, poll? }

import { useEffect, useState } from "react"
import { Loader2, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { MessengerMessage } from "@/lib/messenger-types"
import { messengerApi } from "./api"
import { useMessenger } from "./store"
import { errText, InlineError, pickObject } from "./panel-kit"

export interface PollDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId: number
}

const MIN_OPTIONS = 2
const MAX_OPTIONS = 10

export function PollDialog({ open, onOpenChange, roomId }: PollDialogProps) {
  const ctx = useMessenger()
  const [question, setQuestion] = useState("")
  const [options, setOptions] = useState<string[]>(["", ""])
  const [multiple, setMultiple] = useState(false)
  const [anonymous, setAnonymous] = useState(false)
  const [useDeadline, setUseDeadline] = useState(false)
  const [deadline, setDeadline] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setQuestion("")
    setOptions(["", ""])
    setMultiple(false)
    setAnonymous(false)
    setUseDeadline(false)
    setDeadline("")
    setError(null)
    setSaving(false)
  }, [open])

  const filled = options.map((o) => o.trim()).filter(Boolean)
  const dupes = new Set(filled).size !== filled.length

  async function save() {
    if (!question.trim()) return setError("질문을 입력하세요.")
    if (filled.length < MIN_OPTIONS) return setError("선택지를 2개 이상 입력하세요.")
    if (dupes) return setError("같은 선택지가 있습니다.")
    let closesAt: string | null = null
    if (useDeadline) {
      const d = new Date(deadline)
      if (!deadline || Number.isNaN(d.getTime())) return setError("마감 시각을 입력하세요.")
      if (d.getTime() <= Date.now()) return setError("마감 시각은 지금보다 뒤여야 합니다.")
      closesAt = d.toISOString()
    }
    setSaving(true)
    setError(null)
    try {
      const res = await messengerApi.post("polls", {
        room_id: roomId,
        question: question.trim(),
        options: filled,
        multiple,
        anonymous,
        closes_at: closesAt,
      })
      const msg = pickObject<MessengerMessage>(res, ["message"])
      if (msg) ctx.applyMessage(msg)
      onOpenChange(false)
    } catch (e) {
      setError(errText(e, "투표를 만들지 못했습니다."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>투표 만들기</DialogTitle>
          <DialogDescription>선택지는 2~10개까지 넣을 수 있습니다.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="poll-q">질문</Label>
            <Input id="poll-q" value={question} maxLength={300} autoFocus onChange={(e) => setQuestion(e.target.value)} placeholder="예: 10월 회의 날짜" />
          </div>

          <div className="grid gap-1.5">
            <Label>선택지</Label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-text-secondary">{i + 1}</span>
                <Input
                  value={opt}
                  maxLength={120}
                  onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing && i === options.length - 1 && options.length < MAX_OPTIONS) {
                      e.preventDefault()
                      setOptions([...options, ""])
                    }
                  }}
                  aria-label={`선택지 ${i + 1}`}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={options.length <= MIN_OPTIONS}
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  aria-label={`선택지 ${i + 1} 삭제`}
                >
                  <X />
                </Button>
              </div>
            ))}
            {options.length < MAX_OPTIONS && (
              <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setOptions([...options, ""])}>
                <Plus />
                선택지 추가
              </Button>
            )}
          </div>

          <div className="grid gap-3 rounded-md border border-warm-tan px-3 py-3">
            <label className="flex items-center justify-between gap-3 text-sm text-dark">
              복수 선택 허용
              <Switch checked={multiple} onCheckedChange={setMultiple} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-dark">
              <span>
                익명 투표
                <span className="block text-xs text-text-secondary">누가 어디에 투표했는지 보이지 않습니다.</span>
              </span>
              <Switch checked={anonymous} onCheckedChange={setAnonymous} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-dark">
              마감 시각 정하기
              <Switch checked={useDeadline} onCheckedChange={setUseDeadline} />
            </label>
            {useDeadline && (
              <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="마감 시각" />
            )}
          </div>
          <InlineError message={error} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            올리기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
