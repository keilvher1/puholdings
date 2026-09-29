"use client"

// 메신저 왼쪽 사이드바: 내 프로필·상태 · 방 찾기/검색 · 바로가기(멘션·별표·할 일) · 토픽 · 대화(DM) · 보관된 토픽.

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  AtSign,
  Bell,
  BellOff,
  ChevronDown,
  ChevronRight,
  Compass,
  Hash,
  ListTodo,
  Lock,
  MessageSquarePlus,
  Plus,
  Search,
  Star,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { MessengerRoom } from "@/lib/messenger-types"
import * as api from "./api"
import { archivedTopics, dmPartner, messagePreview, sortedDms, sortedTopics, useMessenger } from "./store"
import { MemberAvatar, presenceOf } from "./message-item"

export function MessengerSidebar() {
  const ctx = useMessenger()
  const { state, isMember, openPanel, openDialog } = ctx
  const [filter, setFilter] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  const [collapsed, setCollapsed] = useState<{ topic: boolean; dm: boolean }>({ topic: false, dm: false })

  const topics = useMemo(() => sortedTopics(state.rooms), [state.rooms])
  const dms = useMemo(() => sortedDms(state.rooms), [state.rooms])
  const archived = useMemo(() => archivedTopics(state.rooms), [state.rooms])

  const q = filter.trim().toLowerCase()
  const match = (r: MessengerRoom) => !q || ctx.roomName(r).toLowerCase().includes(q)
  const topicList = topics.filter(match)
  const dmList = dms.filter(match)
  const archivedList = archived.filter(match)

  const mentionTotal = useMemo(
    () => Object.values(state.rooms).reduce((n, r) => n + (r.is_archived ? 0 : r.mention_count), 0),
    [state.rooms]
  )

  return (
    <nav className="flex h-full w-full min-w-0 flex-col bg-warm-ivory" aria-label="메신저 방 목록">
      <ProfileHeader />

      {state.errorStatus === 401 && (
        <p className="mx-3 mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
          로그인이 만료되어 새 메시지를 받지 못합니다. 다시 로그인해 주세요.
        </p>
      )}

      <div className="flex items-center gap-1.5 px-3 pt-3">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="messenger-room-filter" className="sr-only">
            방 이름으로 찾기
          </label>
          <input
            id="messenger-room-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="방 이름 찾기"
            className="h-8 w-full rounded-md border border-warm-tan bg-card pl-2.5 pr-7 text-sm text-dark outline-none placeholder:text-text-secondary focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter("")}
              aria-label="찾기 지우기"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-secondary hover:text-dark"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          className="border-warm-tan bg-card"
          onClick={() => openPanel("search")}
          title="메시지·파일 검색 (Ctrl+K)"
          aria-label="메시지·파일 검색"
        >
          <Search />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-1 px-3 pt-2">
        <QuickLink icon={AtSign} label="멘션" count={mentionTotal} onClick={() => openPanel("mentions")} />
        <QuickLink icon={Star} label="별표" onClick={() => openPanel("bookmarks")} />
        <QuickLink icon={ListTodo} label="할 일" onClick={() => openPanel("todos")} />
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <SectionHeader
          label="토픽"
          count={topics.length}
          open={!collapsed.topic}
          onToggle={() => setCollapsed((c) => ({ ...c, topic: !c.topic }))}
          action={
            isMember ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="토픽 만들기·둘러보기"
                    className="rounded p-1 text-text-secondary outline-none hover:bg-warm-beige hover:text-dark focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => openDialog({ name: "createTopic" })}>
                    <Plus /> 토픽 만들기
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openDialog({ name: "browseTopics" })}>
                    <Compass /> 공개 토픽 둘러보기
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null
          }
        />
        {!collapsed.topic && (
          <ul className="space-y-px">
            {topicList.map((r) => (
              <RoomItem key={r.id} room={r} />
            ))}
            {topicList.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-text-secondary">
                {q ? "찾는 토픽이 없습니다." : isMember ? "참여한 토픽이 없습니다." : "초대받은 토픽이 없습니다."}
              </li>
            )}
            {isMember && !q && topics.length === 0 && (
              <li className="px-2 pt-1">
                <Button variant="outline" size="sm" className="w-full border-warm-tan bg-card" onClick={() => openDialog({ name: "browseTopics" })}>
                  공개 토픽 둘러보기
                </Button>
              </li>
            )}
          </ul>
        )}

        <SectionHeader
          label="대화"
          count={dms.length}
          open={!collapsed.dm}
          onToggle={() => setCollapsed((c) => ({ ...c, dm: !c.dm }))}
          action={
            <button
              type="button"
              onClick={() => openDialog({ name: "startDm" })}
              aria-label="대화 시작"
              title="대화 시작"
              className="rounded p-1 text-text-secondary outline-none hover:bg-warm-beige hover:text-dark focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          }
        />
        {!collapsed.dm && (
          <ul className="space-y-px">
            {dmList.map((r) => (
              <RoomItem key={r.id} room={r} />
            ))}
            {dmList.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-text-secondary">{q ? "찾는 대화가 없습니다." : "대화가 없습니다."}</li>
            )}
          </ul>
        )}

        {archived.length > 0 && (
          <>
            <SectionHeader
              label="보관된 토픽"
              count={archived.length}
              open={showArchived}
              onToggle={() => setShowArchived((v) => !v)}
            />
            {showArchived && (
              <ul className="space-y-px">
                {archivedList.map((r) => (
                  <RoomItem key={r.id} room={r} />
                ))}
              </ul>
            )}
          </>
        )}

        {!isMember && (
          <p className="mt-4 px-2 text-xs leading-5 text-text-secondary [word-break:keep-all]">
            게스트 계정은 초대받은 토픽과 대화만 볼 수 있습니다.
          </p>
        )}
      </div>
    </nav>
  )
}

function QuickLink({
  icon: Icon,
  label,
  count,
  onClick,
}: {
  icon: typeof AtSign
  label: string
  count?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 items-center justify-center gap-1 rounded-md border border-warm-tan bg-card text-xs font-medium text-dark outline-none hover:bg-warm-beige focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <Icon className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
      {label}
      {!!count && count > 0 && (
        <span className="rounded-sm bg-destructive px-1 text-[11px] font-semibold leading-4 text-white tabular-nums">{count > 99 ? "99+" : count}</span>
      )}
    </button>
  )
}

function SectionHeader({
  label,
  count,
  open,
  onToggle,
  action,
}: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
  action?: ReactNode
}) {
  return (
    <div className="mt-3 flex items-center justify-between px-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-1 rounded px-1 py-1 text-xs font-semibold text-text-secondary outline-none hover:text-dark focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
        {label}
        <span className="font-normal tabular-nums">{count}</span>
      </button>
      {action}
    </div>
  )
}

function RoomItem({ room }: { room: MessengerRoom }) {
  const ctx = useMessenger()
  const { state, me, activeRoomId, openRoom } = ctx
  const active = activeRoomId === room.id
  const name = ctx.roomName(room)
  const partner = dmPartner(room, state.members, me.id)
  const unread = room.unread_count
  const mentions = room.mention_count
  const hasUnread = unread > 0 || mentions > 0
  const preview = room.kind === "dm" && room.last_message ? messagePreview(room.last_message) : ""

  return (
    <li>
      <button
        type="button"
        onClick={() => openRoom(room.id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          active ? "bg-dark text-primary-foreground" : "text-dark hover:bg-warm-beige"
        )}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">
          {room.kind === "topic" ? (
            room.is_private ? (
              <Lock className={cn("h-3.5 w-3.5", active ? "text-primary-foreground/80" : "text-text-secondary")} aria-label="비공개" />
            ) : (
              <Hash className={cn("h-4 w-4", active ? "text-primary-foreground/80" : "text-text-secondary")} aria-hidden />
            )
          ) : partner ? (
            <MemberAvatar member={partner} size={24} presence={presenceOf(partner)} />
          ) : (
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums",
                active ? "bg-white/15" : "bg-warm-beige text-text-secondary"
              )}
            >
              {room.member_ids.length}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm", hasUnread && !active ? "font-semibold" : "font-normal")}>{name}</span>
          {preview && (
            <span className={cn("block truncate text-xs", active ? "text-primary-foreground/70" : "text-text-secondary")}>{preview}</span>
          )}
        </span>
        {room.starred && <Star className={cn("h-3 w-3 shrink-0", active ? "fill-gold text-gold" : "fill-gold text-gold")} aria-label="즐겨찾기" />}
        {room.muted && <BellOff className={cn("h-3 w-3 shrink-0", active ? "text-primary-foreground/70" : "text-text-secondary")} aria-label="알림 꺼짐" />}
        {mentions > 0 && (
          <span className="shrink-0 rounded-sm bg-destructive px-1 text-[11px] font-semibold leading-[18px] text-white" title={`멘션 ${mentions}개`}>
            @{mentions > 9 ? "9+" : mentions}
          </span>
        )}
        {unread > 0 && (
          <span
            className={cn(
              "min-w-[20px] shrink-0 rounded-sm px-1 text-center text-[11px] font-semibold leading-[18px] tabular-nums",
              room.muted ? "bg-warm-tan text-dark" : active ? "bg-gold text-dark" : "bg-dark text-primary-foreground"
            )}
            title={`안 읽은 메시지 ${unread}개`}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    </li>
  )
}

function ProfileHeader() {
  const ctx = useMessenger()
  const { me, openDialog, dispatch, notify } = ctx
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default")

  useEffect(() => {
    setPerm(typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported")
  }, [])

  const toggleAway = async () => {
    const next = !me.away
    dispatch({ type: "upsertMember", member: { ...me, away: next } })
    try {
      const m = await api.patchMe({ away: next })
      if (m) dispatch({ type: "upsertMember", member: m })
    } catch (e) {
      dispatch({ type: "upsertMember", member: { ...me, away: !next } })
      notify(e instanceof Error ? e.message : "상태를 바꾸지 못했습니다.", "error")
    }
  }

  const askPermission = async () => {
    if (perm === "unsupported") return
    try {
      const p = await Notification.requestPermission()
      setPerm(p)
      notify(p === "granted" ? "브라우저 알림을 켰습니다." : "브라우저 설정에서 알림이 차단되어 있습니다.", p === "granted" ? "info" : "error")
    } catch {
      notify("이 브라우저는 알림을 지원하지 않습니다.", "error")
    }
  }

  const statusLine = me.away ? "자리 비움" : me.status_text || me.title || (me.role === "guest" ? "게스트" : "")

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-warm-tan bg-card px-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left outline-none hover:bg-warm-beige focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="내 프로필·상태"
          >
            <MemberAvatar member={me} size={32} presence={me.away ? "away" : "online"} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-dark">{me.display_name}</span>
              {statusLine && <span className="block truncate text-xs text-text-secondary">{statusLine}</span>}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="truncate">{me.display_name}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => openDialog({ name: "profile", memberId: me.id })}>프로필·상태 메시지 편집</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void toggleAway()}>{me.away ? "자리 비움 해제" : "자리 비움으로 표시"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          {perm === "granted" ? (
            <DropdownMenuItem disabled>
              <Bell /> 브라우저 알림 켜짐
            </DropdownMenuItem>
          ) : perm === "unsupported" ? (
            <DropdownMenuItem disabled>
              <BellOff /> 브라우저 알림 미지원
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => void askPermission()}>
              <Bell /> 브라우저 알림 켜기
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
