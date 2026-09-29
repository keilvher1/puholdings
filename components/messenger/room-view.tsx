"use client"

// 대화창: 머리(방 이름·설명·멤버 수·별표·알림·메뉴) · 공지 배너 · 메시지 목록 · 입력창 · 파일 끌어다 놓기.
// 메시지 공유 다이얼로그(ShareDialog)도 여기 둔다(messenger.tsx DialogHost가 연다).

import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react"
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  BellOff,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Hash,
  ListTodo,
  Lock,
  LogOut,
  MoreVertical,
  Pin,
  Search,
  Settings,
  Star,
  UserPlus,
  Users,
  Webhook,
  X,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { MessengerRoom } from "@/lib/messenger-types"
import * as api from "./api"
import { dmPartner, messagePreview, sortedDms, sortedTopics, timelineMessages, useMessenger } from "./store"
import { MemberAvatar, formatTime, presenceOf } from "./message-item"
import { MessageList } from "./message-list"
import { Composer } from "./composer"

export function RoomView({ room }: { room: MessengerRoom }) {
  const ctx = useMessenger()
  const { state, me } = ctx
  const [editingId, setEditingId] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const filesRef = useRef<((files: File[]) => void) | null>(null)

  const editLast = () => {
    const list = timelineMessages(state, room.id)
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]
      if (m.author_id === me.id && !m.deleted && (m.kind === "text" || m.kind === "file")) {
        setEditingId(m.id)
        ctx.jumpToMessage(room.id, m.id)
        return
      }
    }
  }

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files")
  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e) || room.is_archived) return
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }
  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e) || room.is_archived) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }
  const onDragLeave = (e: DragEvent) => {
    if (!hasFiles(e)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length && filesRef.current) filesRef.current(files)
  }

  return (
    <section
      className="relative flex h-full min-h-0 flex-col bg-card"
      aria-label={ctx.roomName(room)}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <RoomHeader room={room} />
      <AnnouncementBanner room={room} />
      <MessageList room={room} editingId={editingId} onEditDone={() => setEditingId(null)} />
      <Composer room={room} autoFocus onEditLast={editLast} filesRef={filesRef} />

      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-md border-2 border-dashed border-dark/50 bg-card/90">
          <p className="text-sm font-semibold text-dark">여기에 놓으면 {ctx.roomName(room)}에 파일을 올립니다</p>
        </div>
      )}
    </section>
  )
}

function HeaderButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md outline-none hover:bg-warm-beige focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:h-4 [&_svg]:w-4",
        active ? "bg-warm-beige text-dark" : "text-text-secondary hover:text-dark"
      )}
    >
      {children}
    </button>
  )
}

function RoomHeader({ room }: { room: MessengerRoom }) {
  const ctx = useMessenger()
  const { state, me, isMember, panel } = ctx
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const name = ctx.roomName(room)
  const partner = dmPartner(room, state.members, me.id)
  const canManage = ctx.canManageRoom(room)
  const panelOn = (tab: typeof panel.tab) => panel.open && panel.tab === tab

  const togglePanel = (tab: typeof panel.tab) => (panelOn(tab) ? ctx.closePanel() : ctx.openPanel(tab))

  const setArchived = async (value: boolean) => {
    try {
      const r = await api.patchRoom(room.id, { is_archived: value })
      if (r) ctx.applyRoom(r)
      else ctx.dispatch({ type: "patchRoom", roomId: room.id, patch: { is_archived: value } })
      ctx.notify(value ? "토픽을 보관했습니다." : "보관을 해제했습니다.")
    } catch (e) {
      ctx.notify(e instanceof Error ? e.message : "바꾸지 못했습니다.", "error")
    }
  }

  const sub =
    room.kind === "topic"
      ? room.description
      : partner
        ? partner.away
          ? "자리 비움"
          : partner.status_text || partner.title || (presenceOf(partner) === "online" ? "접속 중" : "")
        : `${room.member_ids.length}명`

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-warm-tan bg-card px-2 sm:px-3">
      <button
        type="button"
        onClick={() => ctx.openRoom(null)}
        aria-label="방 목록으로"
        className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-warm-beige hover:text-dark md:hidden"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {room.kind === "topic" ? (
          room.is_private ? (
            <Lock className="h-4 w-4 shrink-0 text-text-secondary" aria-label="비공개 토픽" />
          ) : (
            <Hash className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
          )
        ) : partner ? (
          <MemberAvatar member={partner} size={28} presence={presenceOf(partner)} />
        ) : null}
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-base font-semibold text-dark">
              {room.kind === "dm" && partner ? (
                <button type="button" className="hover:underline" onClick={() => ctx.openDialog({ name: "profile", memberId: partner.id })}>
                  {name}
                </button>
              ) : (
                name
              )}
            </h2>
            <button
              type="button"
              onClick={() => void ctx.toggleStar(room.id)}
              aria-label={room.starred ? "즐겨찾기 해제" : "즐겨찾기"}
              title={room.starred ? "즐겨찾기 해제" : "즐겨찾기"}
              className="shrink-0 rounded p-0.5 text-text-secondary hover:text-dark"
            >
              <Star className={cn("h-4 w-4", room.starred && "fill-gold text-gold")} />
            </button>
            {room.is_archived && (
              <span className="shrink-0 rounded-sm border border-warm-tan bg-warm-beige px-1 text-[11px] text-dark">보관됨</span>
            )}
          </div>
          {sub && <p className="truncate text-xs text-text-secondary">{sub}</p>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={() => togglePanel("members")}
          title="참여자"
          aria-label={`참여자 ${room.member_ids.length}명`}
          className={cn(
            "flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium outline-none hover:bg-warm-beige focus-visible:ring-[3px] focus-visible:ring-ring/50",
            panelOn("members") ? "bg-warm-beige text-dark" : "text-text-secondary hover:text-dark"
          )}
        >
          <Users className="h-4 w-4" aria-hidden />
          <span className="tabular-nums">{room.member_ids.length}</span>
        </button>
        <HeaderButton label={room.muted ? "알림 켜기" : "알림 끄기"} onClick={() => void ctx.toggleMute(room.id)} active={room.muted}>
          {room.muted ? <BellOff /> : <Bell />}
        </HeaderButton>
        <span className="hidden sm:contents">
          <HeaderButton label="파일" onClick={() => togglePanel("files")} active={panelOn("files")}>
            <FolderOpen />
          </HeaderButton>
          <HeaderButton label="할 일" onClick={() => togglePanel("todos")} active={panelOn("todos")}>
            <ListTodo />
          </HeaderButton>
          <HeaderButton label="검색" onClick={() => togglePanel("search")} active={panelOn("search")}>
            <Search />
          </HeaderButton>
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="방 메뉴"
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary outline-none hover:bg-warm-beige hover:text-dark focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="sm:hidden">
              <DropdownMenuItem onSelect={() => ctx.openPanel("files")}>
                <FolderOpen /> 파일
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => ctx.openPanel("todos")}>
                <ListTodo /> 할 일
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => ctx.openPanel("search")}>
                <Search /> 검색
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </div>
            {room.kind === "topic" && isMember && !room.is_archived && (
              <DropdownMenuItem onSelect={() => ctx.openDialog({ name: "invite", roomId: room.id })}>
                <UserPlus /> 멤버 초대
              </DropdownMenuItem>
            )}
            {room.kind === "topic" && canManage && (
              <DropdownMenuItem onSelect={() => ctx.openDialog({ name: "roomSettings", roomId: room.id })}>
                <Settings /> 토픽 설정
              </DropdownMenuItem>
            )}
            {room.kind === "topic" && canManage && (
              <DropdownMenuItem onSelect={() => ctx.openDialog({ name: "webhooks", roomId: room.id })}>
                <Webhook /> 웹훅 연동
                {!!room.webhook_count && <span className="ml-auto text-xs tabular-nums text-text-secondary">{room.webhook_count}</span>}
              </DropdownMenuItem>
            )}
            {room.kind === "topic" && canManage && (
              <DropdownMenuItem onSelect={() => (room.is_archived ? void setArchived(false) : setConfirmArchive(true))}>
                {room.is_archived ? <ArchiveRestore /> : <Archive />} {room.is_archived ? "보관 해제" : "토픽 보관"}
              </DropdownMenuItem>
            )}
            {room.kind === "dm" && (
              <DropdownMenuItem onSelect={() => ctx.openDialog({ name: "startDm", memberIds: room.member_ids.filter((id) => id !== me.id) })}>
                <UserPlus /> 사람 추가해 새 대화
              </DropdownMenuItem>
            )}
            {room.kind === "topic" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmLeave(true)}>
                  <LogOut /> 토픽 나가기
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{name} 토픽에서 나갈까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {room.is_private || !isMember
                ? "비공개 토픽이라 다시 들어오려면 초대를 받아야 합니다."
                : "공개 토픽은 둘러보기에서 다시 참여할 수 있습니다."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void ctx.leaveRoom(room.id)}>
              나가기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{name} 토픽을 보관할까요?</AlertDialogTitle>
            <AlertDialogDescription>보관하면 메시지는 남지만 새 메시지를 보낼 수 없습니다. 나중에 보관을 해제할 수 있습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => void setArchived(true)}>보관</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  )
}

// 공지 배너: 한 줄 요약(펼치면 전체) · 메시지로 이동 · 내리기(정회원)
function AnnouncementBanner({ room }: { room: MessengerRoom }) {
  const ctx = useMessenger()
  const [expanded, setExpanded] = useState(false)
  const [hidden, setHidden] = useState<number | null>(null)
  const a = room.announcement
  if (!a || a.deleted || hidden === a.id) return null
  const author = a.author_id ? ctx.memberName(a.author_id) : a.author_label || "알림"
  const text = messagePreview(a)

  return (
    <div className="shrink-0 border-b border-warm-tan bg-warm-ivory px-3 py-2">
      <div className="flex items-start gap-2">
        <Pin className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-text-secondary">
            <span className="font-semibold text-dark">공지</span> · {author} · {formatTime(a.created_at)}
          </p>
          <p className={cn("mt-0.5 text-sm text-dark [word-break:keep-all]", expanded ? "whitespace-pre-wrap" : "truncate")}>
            {expanded ? a.body.replace(/@\[([^\]]{1,60})\]\(m:(?:\d+|all)\)/g, "@$1") || text : text}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => ctx.jumpToMessage(room.id, a.id)}>
            메시지로 이동
          </Button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "공지 접기" : "공지 펼치기"}
            className="rounded p-1 text-text-secondary hover:bg-warm-beige hover:text-dark"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {ctx.isMember ? (
            <button
              type="button"
              onClick={() => void ctx.pinAnnouncement(room.id, null)}
              aria-label="공지 내리기"
              title="공지 내리기"
              className="rounded p-1 text-text-secondary hover:bg-warm-beige hover:text-dark"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setHidden(a.id)}
              aria-label="공지 숨기기"
              title="숨기기(이 화면에서만)"
              className="rounded p-1 text-text-secondary hover:bg-warm-beige hover:text-dark"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 메시지 공유 ──────────────────────────────────────────────────────────────

export function ShareDialog({
  open,
  onOpenChange,
  messageId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  messageId: number
}) {
  const ctx = useMessenger()
  const { state } = ctx
  const [q, setQ] = useState("")
  const [target, setTarget] = useState<number | null>(null)
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)
  const message = state.messages[messageId]

  const rooms = useMemo(() => {
    const all = [...sortedTopics(state.rooms), ...sortedDms(state.rooms)]
    const query = q.trim().toLowerCase()
    return all.filter((r) => !query || ctx.roomName(r).toLowerCase().includes(query))
  }, [state.rooms, q, ctx])

  const submit = async () => {
    if (!target) return
    setBusy(true)
    try {
      const m = await api.shareMessage(messageId, target, comment.trim() || undefined)
      if (m) ctx.applyMessage(m)
      const targetRoom = state.rooms[target]
      ctx.notify(`${targetRoom ? ctx.roomName(targetRoom) : "방"}에 공유했습니다.`)
      onOpenChange(false)
    } catch (e) {
      ctx.notify(e instanceof Error ? e.message : "공유하지 못했습니다.", "error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>메시지 공유</DialogTitle>
          <DialogDescription className="truncate">
            {message ? messagePreview(message) || "첨부 메시지" : "메시지를 찾을 수 없습니다."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="공유할 방 찾기"
            aria-label="공유할 방 찾기"
            className="h-9 w-full rounded-md border border-warm-tan bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <ul className="max-h-60 overflow-y-auto rounded-md border border-warm-tan" role="listbox" aria-label="방 목록">
            {rooms.map((r) => (
              <li key={r.id} role="option" aria-selected={target === r.id}>
                <button
                  type="button"
                  onClick={() => setTarget(r.id)}
                  className={cn(
                    "flex w-full items-center gap-2 border-b border-warm-tan/60 px-3 py-2 text-left text-sm last:border-b-0",
                    target === r.id ? "bg-dark text-primary-foreground" : "text-dark hover:bg-warm-ivory"
                  )}
                >
                  {r.kind === "topic" ? (
                    r.is_private ? <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Hash className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="truncate">{ctx.roomName(r)}</span>
                </button>
              </li>
            ))}
            {rooms.length === 0 && <li className="px-3 py-3 text-sm text-text-secondary">공유할 수 있는 방이 없습니다.</li>}
          </ul>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="함께 보낼 말(선택)"
            aria-label="함께 보낼 말"
            rows={2}
            maxLength={1000}
            className="w-full resize-none rounded-md border border-warm-tan bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            취소
          </Button>
          <Button onClick={() => void submit()} disabled={!target || busy || !message}>
            공유
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
