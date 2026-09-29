"use client"

// 방 관련 대화상자 모음. C의 DialogHost가 ctx.dialog에 따라 하나만 렌더한다(닫으면 언마운트).
// 상태·반영은 useMessenger()로 한다.
//
// export function CreateTopicDialog(props: { open; onOpenChange })
//   POST rooms {kind:'topic', name, description, is_private, member_ids} → ctx.applyRoom(room, true)
// export function BrowseTopicsDialog(props: { open; onOpenChange })
//   GET rooms/browse → 참여 POST rooms/[id]/join → ctx.applyRoom(room, true). '새 토픽'은 ctx.openDialog({name:'createTopic'})
// export function StartDmDialog(props: { open; onOpenChange; initialMemberIds?: number[] })
//   같은 구성의 DM이 이미 있으면 그 방을 열고, 없으면 POST rooms {kind:'dm', member_ids} (1명=1:1, 여러 명=그룹 대화)
// export function InviteDialog(props: { open; onOpenChange; roomId: number })
//   POST rooms/[id]/members {member_ids} → room 응답이면 ctx.applyRoom(room), 없으면 member_ids만 로컬 반영
// export function RoomSettingsDialog(props: { open; onOpenChange; roomId: number; initialTab?: "info"|"notify"|"webhooks"|"leave" })
//   정보(이름·설명·공개 — 토픽 관리자) · 알림(ctx.toggleMute/toggleStar) · 웹훅(정회원·토픽 관리자) · 보관/나가기(ctx.leaveRoom)
// export function WebhooksDialog(props: { open; onOpenChange; roomId: number })
// export function WebhookManager(props: { room: MessengerRoom })   — 설정의 '웹훅' 탭 내용
//   GET/POST/DELETE rooms/[id]/webhooks (DELETE는 ?id=N)

import { useEffect, useMemo, useState } from "react"
import { Check, Copy, Hash, Loader2, Lock, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { MessengerRoom } from "@/lib/messenger-types"
import { addRoomMembers, browseRooms, createRoom, joinRoom, messengerApi, patchRoom, type RoomPatch } from "./api"
import { useMessenger } from "./store"
import {
  errText,
  formatDateTime,
  InlineError,
  MemberPicker,
  PanelEmpty,
  PanelError,
  PanelLoading,
  pickArray,
  pickObject,
  useRoomMembers,
} from "./panel-kit"

type OpenProps = { open: boolean; onOpenChange: (open: boolean) => void }

function VisibilityChoice({ value, onChange, disabled }: { value: boolean; onChange: (isPrivate: boolean) => void; disabled?: boolean }) {
  const opts = [
    { v: false, title: "공개 토픽", desc: "정회원 누구나 둘러보고 참여할 수 있습니다.", icon: Hash },
    { v: true, title: "비공개 토픽", desc: "초대받은 사람만 보고 참여할 수 있습니다.", icon: Lock },
  ]
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
      {opts.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          disabled={disabled}
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded-md border px-3 py-2 text-left disabled:opacity-60",
            value === o.v ? "border-dark bg-warm-ivory" : "border-warm-tan hover:bg-warm-ivory"
          )}
        >
          <span className="flex items-center gap-1.5 text-sm font-medium text-dark">
            <o.icon className="size-4" aria-hidden />
            {o.title}
          </span>
          <span className="mt-0.5 block text-xs text-text-secondary [word-break:keep-all]">{o.desc}</span>
        </button>
      ))}
    </div>
  )
}

function FooterButtons({ busy, onCancel, onOk, okLabel, disabled }: { busy: boolean; onCancel: () => void; onOk: () => void; okLabel: string; disabled?: boolean }) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
        취소
      </Button>
      <Button type="button" onClick={onOk} disabled={busy || disabled}>
        {busy && <Loader2 className="animate-spin" />}
        {okLabel}
      </Button>
    </DialogFooter>
  )
}

// ── 토픽 만들기 ─────────────────────────────────────────────────────────────

export function CreateTopicDialog({ open, onOpenChange }: OpenProps) {
  const ctx = useMessenger()
  const everyone = useRoomMembers(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isPrivate, setIsPrivate] = useState(false)
  const [memberIds, setMemberIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) return setError("토픽 이름을 입력하세요.")
    setSaving(true)
    setError(null)
    try {
      const room = await createRoom({ kind: "topic", name: name.trim(), description: description.trim(), is_private: isPrivate, member_ids: memberIds })
      ctx.applyRoom(room, true)
      onOpenChange(false)
    } catch (e) {
      setError(errText(e, "토픽을 만들지 못했습니다."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>토픽 만들기</DialogTitle>
          <DialogDescription>주제별 대화방을 만들고 함께할 사람을 초대합니다.</DialogDescription>
        </DialogHeader>
        {!ctx.isMember ? (
          <p className="text-sm text-text-secondary">게스트는 토픽을 만들 수 없습니다.</p>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="tp-name">이름</Label>
              <Input
                id="tp-name"
                value={name}
                maxLength={80}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 입주기업 지원"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tp-desc">설명 (선택)</Label>
              <Textarea
                id="tp-desc"
                value={description}
                maxLength={500}
                rows={2}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="이 토픽에서 다루는 내용"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>공개 범위</Label>
              <VisibilityChoice value={isPrivate} onChange={setIsPrivate} />
            </div>
            <div className="grid gap-1.5">
              <Label>초대할 멤버 (선택)</Label>
              <MemberPicker members={everyone} selected={memberIds} onChange={setMemberIds} exclude={[ctx.me.id]} />
            </div>
            <InlineError message={error} />
          </div>
        )}
        <FooterButtons busy={saving} onCancel={() => onOpenChange(false)} onOk={() => void save()} okLabel="만들기" disabled={!ctx.isMember || !name.trim()} />
      </DialogContent>
    </Dialog>
  )
}

// ── 토픽 둘러보기 ───────────────────────────────────────────────────────────

export function BrowseTopicsDialog({ open, onOpenChange }: OpenProps) {
  const ctx = useMessenger()
  const [rooms, setRooms] = useState<MessengerRoom[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [joining, setJoining] = useState<number | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)

  async function load() {
    setRooms(null)
    setError(null)
    try {
      setRooms(await browseRooms())
    } catch (e) {
      setError(errText(e, "토픽 목록을 불러오지 못했습니다."))
    }
  }

  useEffect(() => {
    if (open && ctx.isMember) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (rooms ?? [])
      .filter((r) => !ctx.state.rooms[r.id])
      .filter((r) => !n || r.name.toLowerCase().includes(n) || r.description.toLowerCase().includes(n))
      .sort((a, b) => b.member_ids.length - a.member_ids.length || a.name.localeCompare(b.name, "ko"))
  }, [rooms, q, ctx.state.rooms])

  async function join(room: MessengerRoom) {
    setJoining(room.id)
    setJoinError(null)
    try {
      const joined = (await joinRoom(room.id)) ?? { ...room, member_ids: [...room.member_ids, ctx.me.id] }
      ctx.applyRoom(joined, true)
      onOpenChange(false)
    } catch (e) {
      setJoinError(errText(e, "참여하지 못했습니다."))
    } finally {
      setJoining(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>토픽 둘러보기</DialogTitle>
          <DialogDescription>아직 참여하지 않은 공개 토픽입니다.</DialogDescription>
        </DialogHeader>
        {!ctx.isMember ? (
          <p className="text-sm text-text-secondary">게스트는 초대받은 토픽만 볼 수 있습니다.</p>
        ) : (
          <>
            <div className="flex gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="토픽 이름·설명 검색" aria-label="토픽 검색" />
              <Button type="button" variant="outline" onClick={() => ctx.openDialog({ name: "createTopic" })}>
                <Plus />
                새 토픽
              </Button>
            </div>
            <InlineError message={joinError} />
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-warm-tan">
              {error ? (
                <PanelError message={error} onRetry={() => void load()} />
              ) : rooms === null ? (
                <PanelLoading />
              ) : list.length === 0 ? (
                <PanelEmpty>{q.trim() ? "검색 결과가 없습니다." : "참여할 수 있는 공개 토픽이 없습니다."}</PanelEmpty>
              ) : (
                <ul>
                  {list.map((r) => (
                    <li key={r.id} className="flex items-start gap-3 border-b border-warm-tan/70 px-3 py-2.5 last:border-b-0">
                      <Hash className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-dark">{r.name}</p>
                        {r.description && <p className="line-clamp-2 text-xs text-text-secondary">{r.description}</p>}
                        <p className="mt-0.5 text-xs text-text-secondary">
                          {r.member_ids.length}명 참여
                          {r.last_message ? ` · 최근 대화 ${formatDateTime(r.last_message.created_at)}` : ""}
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => void join(r)} disabled={joining !== null}>
                        {joining === r.id && <Loader2 className="animate-spin" />}
                        참여
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── 대화 시작(DM) ───────────────────────────────────────────────────────────

export function StartDmDialog({ open, onOpenChange, initialMemberIds }: OpenProps & { initialMemberIds?: number[] }) {
  const ctx = useMessenger()
  const everyone = useRoomMembers(null)
  const [ids, setIds] = useState<number[]>(() => (initialMemberIds ?? []).filter((id) => id !== ctx.me.id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    if (ids.length === 0) return setError("대화할 사람을 고르세요.")
    const want = [...new Set([ctx.me.id, ...ids])].sort((a, b) => a - b).join(",")
    const existing = Object.values(ctx.state.rooms).find(
      (r) => r.kind === "dm" && [...new Set(r.member_ids)].sort((a, b) => a - b).join(",") === want
    )
    if (existing) {
      ctx.openRoom(existing.id)
      onOpenChange(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const room = await createRoom({ kind: "dm", member_ids: ids })
      ctx.applyRoom(room, true)
      onOpenChange(false)
    } catch (e) {
      setError(errText(e, "대화를 시작하지 못했습니다."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>대화 시작</DialogTitle>
          <DialogDescription>
            {ctx.isMember ? "한 명을 고르면 1:1 대화, 여러 명이면 그룹 대화가 됩니다." : "같은 토픽에 참여 중인 사람과 대화할 수 있습니다."}
          </DialogDescription>
        </DialogHeader>
        <MemberPicker members={everyone} selected={ids} onChange={setIds} exclude={[ctx.me.id]} />
        <InlineError message={error} />
        <FooterButtons busy={saving} onCancel={() => onOpenChange(false)} onOk={() => void start()} okLabel="대화 시작" disabled={ids.length === 0} />
      </DialogContent>
    </Dialog>
  )
}

// ── 초대 ───────────────────────────────────────────────────────────────────

export function InviteDialog({ open, onOpenChange, roomId }: OpenProps & { roomId: number }) {
  const ctx = useMessenger()
  const room = ctx.state.rooms[roomId]
  const everyone = useRoomMembers(null)
  const [ids, setIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function invite() {
    if (!room || ids.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const next = await addRoomMembers(room.id, ids)
      if (next) ctx.applyRoom(next)
      else ctx.dispatch({ type: "patchRoom", roomId: room.id, patch: { member_ids: [...new Set([...room.member_ids, ...ids])] } })
      ctx.notify(`${ids.length}명을 초대했습니다.`)
      onOpenChange(false)
    } catch (e) {
      setError(errText(e, "초대하지 못했습니다."))
    } finally {
      setSaving(false)
    }
  }

  const guestPicked = ids.some((id) => ctx.state.members[id]?.role === "guest")
  const blocked = !room ? "방을 찾을 수 없습니다." : !ctx.isMember ? "게스트는 멤버를 초대할 수 없습니다." : room.is_archived ? "보관된 토픽에는 초대할 수 없습니다." : null

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{room ? `${ctx.roomName(room)}에 초대` : "초대"}</DialogTitle>
          <DialogDescription>초대받은 사람은 이전 대화와 파일도 볼 수 있습니다.</DialogDescription>
        </DialogHeader>
        {blocked ? (
          <p className="text-sm text-text-secondary">{blocked}</p>
        ) : (
          <>
            <MemberPicker members={everyone} selected={ids} onChange={setIds} disabledIds={room!.member_ids} />
            {guestPicked && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 [word-break:keep-all]">
                게스트(입주기업)가 포함되어 있습니다. 게스트는 이 방의 대화·파일·참여자 목록을 볼 수 있습니다.
              </p>
            )}
            <InlineError message={error} />
          </>
        )}
        <FooterButtons
          busy={saving}
          onCancel={() => onOpenChange(false)}
          onOk={() => void invite()}
          okLabel={ids.length > 0 ? `초대 (${ids.length}명)` : "초대"}
          disabled={!!blocked || ids.length === 0}
        />
      </DialogContent>
    </Dialog>
  )
}

// ── 방 설정 ────────────────────────────────────────────────────────────────

type SettingsTab = "info" | "notify" | "webhooks" | "leave"

export function RoomSettingsDialog({ open, onOpenChange, roomId, initialTab }: OpenProps & { roomId: number; initialTab?: SettingsTab }) {
  const ctx = useMessenger()
  const room = ctx.state.rooms[roomId]
  if (!room) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>설정</DialogTitle>
            <DialogDescription>방을 찾을 수 없습니다.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }
  return <RoomSettingsBody open={open} onOpenChange={onOpenChange} room={room} initialTab={initialTab} />
}

function RoomSettingsBody({ open, onOpenChange, room, initialTab }: OpenProps & { room: MessengerRoom; initialTab?: SettingsTab }) {
  const ctx = useMessenger()
  const isTopic = room.kind === "topic"
  const manage = ctx.canManageRoom(room)
  const showWebhooks = isTopic && ctx.isMember && manage
  const firstTab: SettingsTab = (() => {
    const t = initialTab ?? (isTopic ? "info" : "notify")
    if (t === "info" && !isTopic) return "notify"
    if (t === "webhooks" && !showWebhooks) return isTopic ? "info" : "notify"
    return t
  })()
  const [tab, setTab] = useState<SettingsTab>(firstTab)
  const [name, setName] = useState(room.name)
  const [description, setDescription] = useState(room.description)
  const [isPrivate, setIsPrivate] = useState(room.is_private)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save(patch: RoomPatch, label: string, done: string) {
    setBusy(label)
    setError(null)
    try {
      const next = await patchRoom(room.id, patch)
      if (next) ctx.applyRoom(next)
      else ctx.dispatch({ type: "patchRoom", roomId: room.id, patch })
      ctx.notify(done)
      return true
    } catch (e) {
      setError(errText(e, "저장하지 못했습니다."))
      return false
    } finally {
      setBusy(null)
    }
  }

  async function leave() {
    const label = isTopic ? `'${room.name}' 토픽에서 나갈까요?` : "이 대화방에서 나갈까요?"
    if (!window.confirm(`${label}\n비공개 방은 다시 초대받아야 들어올 수 있습니다.`)) return
    setBusy("leave")
    const ok = await ctx.leaveRoom(room.id)
    setBusy(null)
    if (ok) onOpenChange(false)
  }

  async function toggleArchive() {
    const next = !room.is_archived
    if (next && !window.confirm("토픽을 보관할까요? 보관하면 새 메시지를 쓸 수 없고 목록 아래 '보관함'으로 옮겨집니다.")) return
    await save({ is_archived: next }, "archive", next ? "토픽을 보관했습니다." : "보관을 해제했습니다.")
  }

  const unchanged = name.trim() === room.name && description.trim() === room.description && isPrivate === room.is_private

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            {isTopic && (room.is_private ? <Lock className="size-4 text-text-secondary" aria-hidden /> : <Hash className="size-4 text-text-secondary" aria-hidden />)}
            <span className="truncate">{ctx.roomName(room)}</span>
          </DialogTitle>
          <DialogDescription>{isTopic ? "토픽 설정" : "대화방 설정"}</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as SettingsTab)} className="min-h-0 flex-1">
          <TabsList className="w-full">
            {isTopic && <TabsTrigger value="info">정보</TabsTrigger>}
            <TabsTrigger value="notify">알림</TabsTrigger>
            {showWebhooks && <TabsTrigger value="webhooks">웹훅</TabsTrigger>}
            <TabsTrigger value="leave">{isTopic && manage ? "보관·나가기" : "나가기"}</TabsTrigger>
          </TabsList>

          {isTopic && (
            <TabsContent value="info" className="grid gap-4 overflow-y-auto pt-2">
              {!manage && <p className="text-xs text-text-secondary">토픽 관리자만 이름·설명·공개 범위를 바꿀 수 있습니다.</p>}
              <div className="grid gap-1.5">
                <Label htmlFor="rs-name">이름</Label>
                <Input id="rs-name" value={name} maxLength={80} disabled={!manage} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rs-desc">설명</Label>
                <Textarea id="rs-desc" value={description} rows={3} maxLength={500} disabled={!manage} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>공개 범위</Label>
                <VisibilityChoice value={isPrivate} onChange={setIsPrivate} disabled={!manage} />
              </div>
              <p className="text-xs text-text-secondary">
                {room.created_by != null ? `${ctx.memberName(room.created_by)} 개설 · ` : ""}
                {formatDateTime(room.created_at)} · {room.member_ids.length}명 참여
              </p>
              {manage && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={() => void save({ name: name.trim(), description: description.trim(), is_private: isPrivate }, "info", "토픽 정보를 저장했습니다.")}
                    disabled={!!busy || !name.trim() || unchanged}
                  >
                    {busy === "info" && <Loader2 className="animate-spin" />}
                    저장
                  </Button>
                </div>
              )}
            </TabsContent>
          )}

          <TabsContent value="notify" className="grid gap-3 pt-2">
            <label className="flex items-center justify-between gap-3 rounded-md border border-warm-tan px-3 py-2.5 text-sm text-dark">
              <span>
                알림 끄기
                <span className="block text-xs text-text-secondary [word-break:keep-all]">새 메시지 알림을 보내지 않습니다. 나를 멘션한 메시지는 계속 알립니다.</span>
              </span>
              <Switch checked={room.muted} onCheckedChange={() => void ctx.toggleMute(room.id)} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-md border border-warm-tan px-3 py-2.5 text-sm text-dark">
              <span>
                즐겨찾기
                <span className="block text-xs text-text-secondary">목록 맨 위에 고정합니다.</span>
              </span>
              <Switch checked={room.starred} onCheckedChange={() => void ctx.toggleStar(room.id)} />
            </label>
          </TabsContent>

          {showWebhooks && (
            <TabsContent value="webhooks" className="min-h-0 overflow-y-auto pt-2">
              <WebhookManager room={room} />
            </TabsContent>
          )}

          <TabsContent value="leave" className="grid gap-3 pt-2">
            {isTopic && manage && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-warm-tan px-3 py-2.5">
                <div className="text-sm text-dark">
                  {room.is_archived ? "보관 해제" : "토픽 보관"}
                  <span className="block text-xs text-text-secondary">
                    {room.is_archived ? "다시 메시지를 쓸 수 있게 합니다." : "대화는 남기고 더 이상 쓰지 않게 합니다."}
                  </span>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void toggleArchive()} disabled={!!busy}>
                  {busy === "archive" && <Loader2 className="animate-spin" />}
                  {room.is_archived ? "보관 해제" : "보관"}
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 px-3 py-2.5">
              <div className="text-sm text-dark">
                {isTopic ? "토픽 나가기" : "대화방 나가기"}
                <span className="block text-xs text-text-secondary">목록에서 사라지고 새 메시지를 받지 않습니다.</span>
              </div>
              <Button type="button" variant="destructive" size="sm" onClick={() => void leave()} disabled={!!busy}>
                {busy === "leave" && <Loader2 className="animate-spin" />}
                나가기
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        <InlineError message={error} />
      </DialogContent>
    </Dialog>
  )
}

// ── 웹훅 ───────────────────────────────────────────────────────────────────

interface WebhookItem {
  id: number
  name: string
  url?: string | null
  token?: string | null
  created_at?: string | null
  last_used_at?: string | null
}

function webhookUrl(w: WebhookItem): string | null {
  if (w.url) return w.url
  if (w.token && typeof window !== "undefined") return `${window.location.origin}/api/messenger/hooks/${w.token}`
  return null
}

function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          window.prompt("복사할 내용", text)
        }
      }}
    >
      {done ? <Check /> : <Copy />}
      {done ? "복사됨" : label}
    </Button>
  )
}

export function WebhookManager({ room }: { room: MessengerRoom }) {
  const [items, setItems] = useState<WebhookItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [fresh, setFresh] = useState<WebhookItem | null>(null) // 방금 만든 웹훅(주소를 크게 보여준다)

  async function load() {
    setError(null)
    try {
      const res = await messengerApi.get(`rooms/${room.id}/webhooks`)
      setItems(pickArray<WebhookItem>(res, ["webhooks", "items"]))
    } catch (e) {
      setError(errText(e, "웹훅 목록을 불러오지 못했습니다."))
    }
  }

  useEffect(() => {
    setItems(null)
    setFresh(null)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id])

  async function create() {
    if (!name.trim()) return
    setBusy("create")
    setActionError(null)
    try {
      const res = await messengerApi.post(`rooms/${room.id}/webhooks`, { name: name.trim() })
      const w = pickObject<WebhookItem>(res, ["webhook"])
      if (w) {
        setFresh(w)
        setItems((prev) => [w, ...(prev ?? []).filter((x) => x.id !== w.id)])
      } else {
        void load()
      }
      setName("")
    } catch (e) {
      setActionError(errText(e, "웹훅을 만들지 못했습니다."))
    } finally {
      setBusy(null)
    }
  }

  async function remove(w: WebhookItem) {
    if (!window.confirm(`'${w.name}' 웹훅을 삭제할까요? 이 주소로 보내는 요청은 더 이상 받지 않습니다.`)) return
    setBusy(`del-${w.id}`)
    setActionError(null)
    try {
      await messengerApi.del(`rooms/${room.id}/webhooks?id=${w.id}`)
      setItems((prev) => (prev ?? []).filter((x) => x.id !== w.id))
      if (fresh?.id === w.id) setFresh(null)
    } catch (e) {
      setActionError(errText(e, "삭제하지 못했습니다."))
    } finally {
      setBusy(null)
    }
  }

  const freshUrl = fresh ? webhookUrl(fresh) : null
  const sample = freshUrl
    ? `curl -X POST '${freshUrl}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"body":"[배포] 운영 서버 반영 완료","connectColor":"#2563eb","connectInfo":[{"title":"버전","description":"1.4.2"}]}'`
    : ""

  return (
    <div className="grid gap-4">
      <p className="text-sm text-text-secondary [word-break:keep-all]">
        외부 서비스가 이 주소로 JSON을 보내면 토픽에 메시지가 올라옵니다. 본문 형식: <code className="rounded-sm bg-warm-ivory px-1 font-mono text-xs text-dark">{`{ body, connectColor?, connectInfo?: [{ title, description }] }`}</code>
      </p>
      <div className="flex gap-2">
        <Input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void create()
            }
          }}
          placeholder="웹훅 이름(메시지 발신자로 표시)"
          aria-label="웹훅 이름"
        />
        <Button type="button" onClick={() => void create()} disabled={!!busy || !name.trim()}>
          {busy === "create" ? <Loader2 className="animate-spin" /> : <Plus />}
          만들기
        </Button>
      </div>
      <InlineError message={actionError} />

      {fresh && freshUrl && (
        <div className="grid gap-2 rounded-md border border-dark/30 bg-warm-ivory px-3 py-3">
          <p className="text-sm font-medium text-dark">&lsquo;{fresh.name}&rsquo; 웹훅 주소</p>
          <p className="break-all rounded-sm border border-warm-tan bg-card px-2 py-1.5 font-mono text-xs text-dark">{freshUrl}</p>
          <p className="text-xs text-text-secondary">주소를 아는 사람은 누구나 이 토픽에 글을 올릴 수 있습니다. 외부에 공개하지 마세요.</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={freshUrl} label="주소 복사" />
            <CopyButton text={sample} label="예시 curl 복사" />
          </div>
        </div>
      )}

      <div className="rounded-md border border-warm-tan">
        {error ? (
          <PanelError message={error} onRetry={() => void load()} />
        ) : items === null ? (
          <PanelLoading />
        ) : items.length === 0 ? (
          <PanelEmpty>등록된 웹훅이 없습니다.</PanelEmpty>
        ) : (
          <ul>
            {items.map((w) => {
              const url = webhookUrl(w)
              return (
                <li key={w.id} className="flex items-center gap-3 border-b border-warm-tan/70 px-3 py-2.5 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-dark">{w.name}</p>
                    <p className="text-xs text-text-secondary">
                      {w.created_at ? `${formatDateTime(w.created_at)} 등록` : ""}
                      {w.last_used_at ? ` · 마지막 수신 ${formatDateTime(w.last_used_at)}` : " · 수신 기록 없음"}
                    </p>
                  </div>
                  {url && <CopyButton text={url} label="주소" />}
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => void remove(w)}
                    disabled={!!busy}
                    aria-label={`${w.name} 웹훅 삭제`}
                  >
                    {busy === `del-${w.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export function WebhooksDialog({ open, onOpenChange, roomId }: OpenProps & { roomId: number }) {
  const ctx = useMessenger()
  const room = ctx.state.rooms[roomId]
  const allowed = !!room && room.kind === "topic" && ctx.isMember && ctx.canManageRoom(room)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>웹훅 관리{room ? ` · ${room.name}` : ""}</DialogTitle>
          <DialogDescription>외부 서비스의 알림을 이 토픽으로 받습니다.</DialogDescription>
        </DialogHeader>
        {room && allowed ? (
          <WebhookManager room={room} />
        ) : (
          <p className="text-sm text-text-secondary">토픽 관리자(정회원)만 웹훅을 관리할 수 있습니다.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
