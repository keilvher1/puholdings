"use client"

// 프로필 대화상자. 내 프로필이면 이름·직함·상태 메시지·자리 비움을 고치고, 다른 사람이면 정보 + 1:1 대화.
//
// export function ProfileDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; memberId: number })
// 저장 후 ctx.dispatch({ type: "upsertMember", member }) — sync의 member.updated로도 온다.
// '대화하기': 기존 1:1 대화가 있으면 열고, 없으면 만든다(useOpenDm).
// API: PATCH me { display_name?, title?, status_text?, away? } → { member } (api.patchMe)

import { useEffect, useState } from "react"
import { Loader2, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { MessengerMember } from "@/lib/messenger-types"
import { patchMe, type MePatch } from "./api"
import { MemberAvatar, presenceOf } from "./message-item"
import { useMessenger } from "./store"
import { errText, InlineError, presenceLabel, useOpenDm } from "./panel-kit"

const STATUS_PRESETS = ["회의 중", "외근 중", "휴가 중", "재택 근무", "식사 중"]

export function ProfileDialog({ open, onOpenChange, memberId }: { open: boolean; onOpenChange: (open: boolean) => void; memberId: number }) {
  const ctx = useMessenger()
  const { me } = ctx
  const member: MessengerMember | undefined = memberId === me.id ? me : ctx.state.members[memberId]
  const isMe = memberId === me.id
  const openDm = useOpenDm()
  const [name, setName] = useState("")
  const [title, setTitle] = useState("")
  const [status, setStatus] = useState("")
  const [away, setAway] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 열릴 때 한 번만 채운다(편집 중 sync로 덮이지 않게)
  useEffect(() => {
    if (!open || !member) return
    setName(member.display_name)
    setTitle(member.title)
    setStatus(member.status_text)
    setAway(member.away)
    setError(null)
    setSaving(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memberId])

  async function save() {
    if (me.role === "member" && !name.trim()) return setError("이름을 입력하세요.")
    setSaving(true)
    setError(null)
    try {
      const body: MePatch = { status_text: status.trim(), away }
      // 게스트의 이름·소속은 입주기업 계정에서 오므로 상태만 바꾼다
      if (me.role === "member") {
        body.display_name = name.trim()
        body.title = title.trim()
      }
      const saved = await patchMe(body)
      ctx.dispatch({ type: "upsertMember", member: saved ?? { ...me, ...body } })
      ctx.notify("프로필을 저장했습니다.")
      onOpenChange(false)
    } catch (e) {
      setError(errText(e, "저장하지 못했습니다."))
    } finally {
      setSaving(false)
    }
  }

  if (!member) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>프로필</DialogTitle>
            <DialogDescription>멤버 정보를 볼 수 없습니다.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-sm">
        <DialogHeader className="sr-only">
          <DialogTitle>{isMe ? "내 프로필" : `${member.display_name} 프로필`}</DialogTitle>
          <DialogDescription>{isMe ? "이름과 상태를 바꿀 수 있습니다." : "멤버 정보"}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <MemberAvatar member={member} size={64} presence={presenceOf(member)} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-dark">{member.display_name}</p>
            {member.title && <p className="truncate text-sm text-text-secondary">{member.title}</p>}
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
              <span className="rounded-sm border border-warm-tan px-1 text-dark">{member.role === "guest" ? "게스트" : "정회원"}</span>
              {presenceLabel(member)}
            </p>
          </div>
        </div>

        {!isMe && (
          <>
            {member.status_text && (
              <p className="rounded-md border border-warm-tan bg-warm-ivory px-3 py-2 text-sm text-dark">{member.status_text}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  onOpenChange(false)
                  void openDm(member.id)
                }}
              >
                <MessageSquare />
                대화하기
              </Button>
            </DialogFooter>
          </>
        )}

        {isMe && (
          <>
            <div className="grid gap-4">
              {me.role === "member" && (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pf-name">이름</Label>
                    <Input id="pf-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pf-title">직함·소속</Label>
                    <Input id="pf-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="예: 운영팀 매니저" />
                  </div>
                </>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="pf-status">상태 메시지</Label>
                <Input id="pf-status" value={status} maxLength={120} onChange={(e) => setStatus(e.target.value)} placeholder="동료에게 보일 한 줄" />
                <div className="flex flex-wrap gap-1">
                  {STATUS_PRESETS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={cn(
                        "h-6 rounded-sm border px-1.5 text-xs",
                        status === s ? "border-dark bg-warm-beige text-dark" : "border-warm-tan text-text-secondary hover:text-dark"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                  {status && (
                    <button type="button" onClick={() => setStatus("")} className="h-6 px-1.5 text-xs text-text-secondary underline underline-offset-2">
                      지우기
                    </button>
                  )}
                </div>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-md border border-warm-tan px-3 py-2.5 text-sm text-dark">
                <span>
                  자리 비움
                  <span className="block text-xs text-text-secondary">켜 두면 이름 옆에 자리 비움으로 표시됩니다.</span>
                </span>
                <Switch checked={away} onCheckedChange={setAway} />
              </label>
              <InlineError message={error} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                취소
              </Button>
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                저장
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
