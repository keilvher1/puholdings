"use client"

// 오른쪽 패널(잔디 우측 서랍). 탭: 댓글 · 검색 · 파일 · 할 일 · 멘션 · 별표 · 멤버.
// C(messenger.tsx)가 넓은 화면에서는 옆 칸(aside), 좁은 화면에서는 Sheet 안에 <RightPanel />로 배치한다.
// 탭·열림 상태는 ctx.panel(openPanel/closePanel)이 갖고, 이 컴포넌트는 머리(제목·닫기)·탭 줄·탭 내용을 그린다.
//
// export function RightPanel(props?: RightPanelProps) — props 없이 <RightPanel />로 충분하다(모두 useMessenger로 처리).
//   C의 PanelHost가 넘기는 props와 호환: tab·onTabChange·onClose·room·threadMessageId·searchQuery는 주면 그 값을 쓰고,
//   나머지(onJumpToMessage·me·members·rooms·threadIncoming·todoUpdates·refreshKey·onOpen*·on*Changed·renderMessage·renderComposer 등)는
//   받아도 쓰지 않는다(이동은 panel-kit useJump = 댓글이면 원본+댓글 탭, 같은 동작)
//   (각 탭이 ctx에서 직접 읽고, 댓글 탭은 C의 MessageItem·Composer를 직접 쓴다).
//   room을 안 주면: 댓글 탭은 원본 메시지의 방, 그 외는 ctx.activeRoom.
// export function MentionsPanel()                  — GET mentions → { messages } · 안 읽은 멘션 수가 바뀌면 조용히 재조회
// export function BookmarksPanel()                 — GET bookmarks → { messages } · 별표 해제는 ctx.toggleBookmark(또는 api.toggleBookmark)

import { useMemo, useState } from "react"
import { AtSign, CheckSquare, FolderOpen, MessageSquareText, Search, Star, Users, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import type { MessengerMember, MessengerMessage, MessengerRoom, MessengerTodo } from "@/lib/messenger-types"
import { toggleBookmark } from "./api"
import { FilesPanel } from "./files-panel"
import { MembersPanel } from "./members-panel"
import { SearchPanel } from "./search-panel"
import { useMessenger, type RightPanelTab } from "./store"
import { ThreadPanel } from "./thread-panel"
import { TodoPanel } from "./todo-panel"
import { errText, MessageSnippet, PanelEmpty, PanelError, PanelLoading, pickArray, useJump, usePanelFetch } from "./panel-kit"

const TAB_META: Record<RightPanelTab, { label: string; icon: typeof Star; title: string }> = {
  thread: { label: "댓글", icon: MessageSquareText, title: "댓글" },
  search: { label: "검색", icon: Search, title: "검색" },
  files: { label: "파일", icon: FolderOpen, title: "파일" },
  todos: { label: "할 일", icon: CheckSquare, title: "할 일" },
  mentions: { label: "멘션", icon: AtSign, title: "나를 멘션한 메시지" },
  bookmarks: { label: "별표", icon: Star, title: "별표한 메시지" },
  members: { label: "멤버", icon: Users, title: "멤버" },
}

const TAB_ORDER: RightPanelTab[] = ["thread", "search", "files", "todos", "mentions", "bookmarks", "members"]

function ListFrame({
  head,
  data,
  error,
  loading,
  reload,
  children,
}: {
  head: React.ReactNode
  data: unknown
  error: string | null
  loading: boolean
  reload: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-10 items-center gap-2 border-b border-warm-tan px-3 py-2 text-xs text-text-secondary">{head}</div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && !data ? <PanelError message={error} onRetry={reload} /> : loading && !data ? <PanelLoading /> : children}
      </div>
    </div>
  )
}

// ── 멘션 ───────────────────────────────────────────────────────────────────

export function MentionsPanel() {
  const ctx = useMessenger()
  const { state, me } = ctx
  const jump = useJump()
  const mentionTotal = useMemo(() => Object.values(state.rooms).reduce((n, r) => n + r.mention_count, 0), [state.rooms])
  const { data, error, loading, reload } = usePanelFetch<unknown>("mentions", mentionTotal)
  const [onlyMe, setOnlyMe] = useState(false)
  const items = useMemo(
    () => pickArray<MessengerMessage>(data, ["messages", "mentions", "items"]).map((m) => state.messages[m.id] ?? m),
    [data, state.messages]
  )
  const list = onlyMe ? items.filter((m) => m.mentions.includes(me.id)) : items

  return (
    <ListFrame
      data={data}
      error={error}
      loading={loading}
      reload={() => void reload()}
      head={
        <>
          <span className="tabular-nums">{list.length}건</span>
          <label className="ml-auto flex items-center gap-1.5">
            <input type="checkbox" checked={onlyMe} onChange={(e) => setOnlyMe(e.target.checked)} className="size-3.5 accent-[var(--dark)]" />
            @전체 제외
          </label>
        </>
      }
    >
      {list.length === 0 ? (
        <PanelEmpty>나를 멘션한 메시지가 없습니다.</PanelEmpty>
      ) : (
        list.map((m) => {
          const r = state.rooms[m.room_id]
          return (
            <MessageSnippet
              key={m.id}
              message={m}
              roomName={r ? ctx.roomName(r) : undefined}
              onClick={() => jump(m.room_id, m.id, m.parent_id)}
            />
          )
        })
      )}
    </ListFrame>
  )
}

// ── 별표 ───────────────────────────────────────────────────────────────────

export function BookmarksPanel() {
  const ctx = useMessenger()
  const { state } = ctx
  const jump = useJump()
  // store에서 별표 상태가 바뀌면(메시지 메뉴에서 별표) 조용히 다시 불러온다
  const starKey = useMemo(() => {
    let n = 0
    for (const m of Object.values(state.messages)) if (m.bookmarked) n += m.id
    return n
  }, [state.messages])
  const { data, error, loading, reload } = usePanelFetch<unknown>("bookmarks", starKey)
  const [removed, setRemoved] = useState<Set<number>>(() => new Set())

  const items = useMemo(
    () =>
      pickArray<MessengerMessage>(data, ["messages", "bookmarks", "items"])
        .map((m) => state.messages[m.id] ?? m)
        .filter((m) => m.bookmarked !== false && !removed.has(m.id)),
    [data, state.messages, removed]
  )

  async function unstar(m: MessengerMessage) {
    if (state.messages[m.id]) {
      await ctx.toggleBookmark(m.id)
      return
    }
    setRemoved((s) => new Set(s).add(m.id))
    try {
      const now = await toggleBookmark(m.id)
      if (now === true) {
        setRemoved((s) => {
          const next = new Set(s)
          next.delete(m.id)
          return next
        })
      } else ctx.notify("별표를 해제했습니다.")
    } catch (e) {
      setRemoved((s) => {
        const next = new Set(s)
        next.delete(m.id)
        return next
      })
      ctx.notify(errText(e, "별표를 해제하지 못했습니다."), "error")
    }
  }

  return (
    <ListFrame data={data} error={error} loading={loading} reload={() => void reload()} head={<span className="tabular-nums">{items.length}건</span>}>
      {items.length === 0 ? (
        <PanelEmpty>별표한 메시지가 없습니다. 메시지 메뉴에서 별표를 누르면 여기에 모입니다.</PanelEmpty>
      ) : (
        items.map((m) => {
          const r = state.rooms[m.room_id]
          return (
            <MessageSnippet
              key={m.id}
              message={m}
              roomName={r ? ctx.roomName(r) : undefined}
              onClick={() => jump(m.room_id, m.id, m.parent_id)}
              trailing={
                <button
                  type="button"
                  onClick={() => void unstar(m)}
                  className="mt-2 mr-2 shrink-0 rounded-sm p-1 text-gold hover:bg-warm-beige"
                  aria-label="별표 해제"
                  title="별표 해제"
                >
                  <Star className="size-4 fill-current" />
                </button>
              }
            />
          )
        })
      )}
    </ListFrame>
  )
}

// ── 패널 ───────────────────────────────────────────────────────────────────

export interface RightPanelProps {
  tab?: RightPanelTab
  onTabChange?: (tab: RightPanelTab) => void
  onClose?: () => void
  room?: MessengerRoom | null
  threadMessageId?: number | null
  searchQuery?: string
  // ↓ 호환용(받아도 쓰지 않음)
  onJumpToMessage?: (roomId: number, messageId: number, parentId?: number | null) => void
  me?: MessengerMember
  members?: MessengerMember[]
  rooms?: MessengerRoom[]
  isRoomAdmin?: boolean
  threadIncoming?: MessengerMessage[]
  todoUpdates?: MessengerTodo[]
  refreshKey?: unknown
  onOpenThread?: (messageId: number) => void
  onOpenProfile?: (memberId: number) => void
  onOpenDm?: (memberId: number) => void
  onRoomChanged?: (room: MessengerRoom) => void
  onLeft?: (roomId: number) => void
  onMessageChanged?: (message: MessengerMessage) => void
  onTodoChanged?: (todo: MessengerTodo) => void
  renderMessage?: (message: MessengerMessage, ctx: { isRoot: boolean }) => ReactNode
  renderComposer?: (ctx: { roomId: number; parentId: number; onSent: (m: MessengerMessage) => void }) => ReactNode
  className?: string
}

function NeedRoom() {
  return <PanelEmpty>왼쪽에서 대화방을 선택하세요.</PanelEmpty>
}

export function RightPanel(props: RightPanelProps = {}) {
  const ctx = useMessenger()
  const { panel, state } = ctx
  const threadId = props.threadMessageId !== undefined ? props.threadMessageId : panel.threadId
  const tab = props.tab ?? panel.tab
  const threadRoot = threadId != null ? state.messages[threadId] ?? null : null
  const room =
    props.room !== undefined
      ? props.room
      : tab === "thread" && threadRoot
        ? state.rooms[threadRoot.room_id] ?? ctx.activeRoom
        : ctx.activeRoom
  const onTabChange = props.onTabChange ?? ((t: RightPanelTab) => ctx.openPanel(t))
  const onClose = props.onClose ?? ctx.closePanel
  const tabs = TAB_ORDER.filter((t) => t !== "thread" || threadId != null)
  const current: RightPanelTab = tab === "thread" && threadId == null ? "search" : tab
  const meta = TAB_META[current]
  const sub = (current === "files" || current === "thread") && room ? ctx.roomName(room) : ""

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col bg-card", props.className)}>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-warm-tan px-3">
        <h2 className="shrink-0 text-sm font-semibold text-dark">{meta.title}</h2>
        {sub && <span className="min-w-0 truncate text-xs text-text-secondary">{sub}</span>}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto shrink-0 rounded-sm p-1 text-text-secondary hover:bg-warm-beige hover:text-dark"
          aria-label="패널 닫기"
        >
          <X className="size-4" />
        </button>
      </div>
      <nav className="flex shrink-0 border-b border-warm-tan px-1" role="tablist" aria-label="패널 탭">
        {tabs.map((t) => {
          const Icon = TAB_META[t].icon
          const active = t === current
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(t)}
              className={cn(
                // 탭 7개가 좁은 패널(360px)에 다 보이도록 아이콘 위·글자 아래로 나눠 쓴다
                "-mb-px inline-flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap border-b-2 px-0.5 text-[11px]",
                active ? "border-dark font-semibold text-dark" : "border-transparent text-text-secondary hover:text-dark"
              )}
            >
              <Icon className="size-4" aria-hidden />
              {TAB_META[t].label}
            </button>
          )
        })}
      </nav>

      <div className="min-h-0 flex-1" role="tabpanel" aria-label={meta.title}>
        {current === "thread" && threadId != null && <ThreadPanel key={threadId} parentId={threadId} />}
        {current === "files" && (room ? <FilesPanel key={room.id} room={room} /> : <NeedRoom />)}
        {current === "todos" && <TodoPanel key={room?.id ?? "none"} room={room} />}
        {current === "mentions" && <MentionsPanel />}
        {current === "bookmarks" && <BookmarksPanel />}
        {current === "members" && <MembersPanel key={room?.id ?? "none"} room={room} />}
        {current === "search" && <SearchPanel room={room} initialQuery={props.searchQuery ?? panel.searchQuery} />}
      </div>
    </div>
  )
}
