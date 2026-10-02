"use client"

// 사내 메신저 루트: 상태(useReducer) · 시작(bootstrap) · 동기화(sync 폴링) · 읽음 처리 · 알림 · 화면 배치.
// 사용: <Messenger variant="admin" /> (관리자 레이아웃 안) / <Messenger variant="portal" /> (포털)
// 높이: 부모가 높이를 주지 않아도 되도록 variant별 기본 높이를 쓴다. 페이지에서 className으로 덮어쓸 수 있다.
//
// 담당 D 컴포넌트는 useMessenger()(store.ts)로 상태·동작을 받고, 열림 여부 등 최소한의 props만 여기서 넘긴다.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Toaster } from "@/components/ui/sonner"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { MessengerMessage, MessengerRoom, MessengerTodo, ReactionSummary } from "@/lib/messenger-types"
import { SYNC_INTERVAL_HIDDEN, SYNC_INTERVAL_VISIBLE } from "@/lib/messenger-types"
import * as api from "./api"
import {
  MessengerContext,
  initialMessengerState,
  memberName as memberNameOf,
  messagePreview,
  messengerReducer,
  notifyCandidates,
  roomDisplayName,
  totalUnread,
  type MessengerContextValue,
  type MessengerDialog,
  type PanelState,
  type RightPanelTab,
  useMessenger,
} from "./store"
import { MessengerSidebar } from "./sidebar"
import { RoomView, ShareDialog } from "./room-view"
import { RightPanel } from "./right-panel"
import { PollDialog } from "./poll-dialog"
import { TodoDialog } from "./todo-dialog"
import { ProfileDialog } from "./profile-dialog"
import {
  BrowseTopicsDialog,
  CreateTopicDialog,
  InviteDialog,
  RoomSettingsDialog,
  StartDmDialog,
  WebhooksDialog,
} from "./room-dialogs"

const HEIGHT_CLASS: Record<"admin" | "portal", string> = {
  // 관리자: 1024px 미만은 모바일 상단 바(h-14) 아래 전체, lg 이상(고정 사이드바)은 화면 전체
  admin: "h-[calc(100dvh-3.5rem)] lg:h-dvh",
  // 포털: 상단 내비(h-16) + main 위아래 여백(py-8) 제외
  portal: "h-[calc(100dvh-8rem)] min-h-[480px] rounded-md border border-warm-tan",
}

function readRoomFromUrl(): number | null {
  if (typeof window === "undefined") return null
  const v = Number(new URLSearchParams(window.location.search).get("room"))
  return Number.isInteger(v) && v > 0 ? v : null
}

function writeRoomToUrl(roomId: number | null) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (roomId) url.searchParams.set("room", String(roomId))
  else url.searchParams.delete("room")
  window.history.replaceState(window.history.state, "", url.toString())
}

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible")
    update()
    document.addEventListener("visibilitychange", update)
    return () => document.removeEventListener("visibilitychange", update)
  }, [])
  return visible
}

function useIsWide(query: string): boolean {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setWide(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [query])
  return wide
}

function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

function toggleReactionLocal(m: MessengerMessage, emoji: string, meId: number): MessengerMessage {
  const list: ReactionSummary[] = m.reactions.map((r) => ({ ...r, member_ids: [...r.member_ids] }))
  const idx = list.findIndex((r) => r.emoji === emoji)
  if (idx < 0) {
    list.push({ emoji, count: 1, member_ids: [meId] })
  } else {
    const r = list[idx]
    if (r.member_ids.includes(meId)) {
      r.member_ids = r.member_ids.filter((id) => id !== meId)
      r.count = Math.max(0, r.count - 1)
      if (r.count === 0) list.splice(idx, 1)
    } else {
      r.member_ids.push(meId)
      r.count += 1
    }
  }
  return { ...m, reactions: list }
}

export function Messenger({ variant, className }: { variant: "admin" | "portal"; className?: string }) {
  const [state, dispatch] = useReducer(messengerReducer, initialMessengerState)
  const stateRef = useRef(state)
  stateRef.current = state

  const [activeRoomId, setActiveRoomId] = useState<number | null>(null)
  const activeRef = useRef<number | null>(null)
  activeRef.current = activeRoomId
  const visible = useDocumentVisible()
  const visibleRef = useRef(true)
  visibleRef.current = visible
  const panelInline = useIsWide("(min-width: 1280px)")

  const [panel, setPanel] = useState<PanelState>({ open: false, tab: "thread", threadId: null, searchQuery: "" })
  const [dialog, setDialog] = useState<MessengerDialog | null>(null)
  const [jumpTarget, setJumpTarget] = useState<MessengerContextValue["jumpTarget"]>(null)

  const notify = useCallback((text: string, tone: "info" | "error" = "info") => {
    if (tone === "error") toast.error(text)
    else toast(text)
  }, [])

  // ── 시작 ──────────────────────────────────────────────────────────────────
  const bootstrap = useCallback(async () => {
    try {
      const data = await api.fetchBootstrap()
      dispatch({ type: "bootstrap", data })
      const current = activeRef.current ?? readRoomFromUrl()
      if (current && !data.rooms.some((r) => r.id === current)) {
        setActiveRoomId(null)
        writeRoomToUrl(null)
      } else if (current) {
        setActiveRoomId(current)
      }
    } catch (e) {
      const status = e instanceof api.MessengerApiError ? e.status : null
      dispatch({ type: "error", error: errText(e, "메신저를 불러오지 못했습니다."), status })
    }
  }, [])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  // ── 동기화 폴링 ──────────────────────────────────────────────────────────
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncBusy = useRef(false)
  const syncNow = useRef<() => void>(() => {})

  const showBrowserNotifications = useCallback((cands: ReturnType<typeof notifyCandidates>) => {
    if (cands.length === 0) return
    if (typeof window === "undefined" || !("Notification" in window)) return
    if (Notification.permission !== "granted") return
    if (document.visibilityState === "visible" && document.hasFocus()) return
    const s = stateRef.current
    for (const c of cands.slice(-3)) {
      const author = c.message.author_id ? memberNameOf(s.members, c.message.author_id) : c.message.author_label || "알림"
      const room = roomDisplayName(c.room, s.members, s.me?.id)
      try {
        const n = new Notification(c.room.kind === "dm" ? author : `${room} · ${author}`, {
          body: (c.mention ? "[멘션] " : "") + messagePreview(c.message).slice(0, 140),
          tag: `messenger-${c.room.id}`,
        })
        n.onclick = () => {
          window.focus()
          setActiveRoomId(c.room.id)
          writeRoomToUrl(c.room.id)
          n.close()
        }
      } catch {
        // 일부 브라우저(모바일)는 페이지에서 직접 Notification 생성을 막는다
      }
    }
  }, [])

  useEffect(() => {
    if (state.phase !== "ready") return
    let stopped = false
    const controller = new AbortController()

    const schedule = (ms: number) => {
      if (stopped) return
      if (syncTimer.current) clearTimeout(syncTimer.current)
      syncTimer.current = setTimeout(run, ms)
    }
    const interval = () => (visibleRef.current ? SYNC_INTERVAL_VISIBLE : SYNC_INTERVAL_HIDDEN)

    async function run() {
      if (stopped) return
      if (syncBusy.current) return schedule(interval())
      syncBusy.current = true
      let wait = interval()
      try {
        const before = stateRef.current
        const res = await api.fetchSync(before.cursor, controller.signal)
        if (stopped) return
        if (res.reset) {
          await bootstrap()
        } else {
          const ctx = { activeRoomId: activeRef.current, visible: visibleRef.current }
          if (res.events.length > 0) {
            const cands = notifyCandidates(stateRef.current, res.events, ctx)
            dispatch({ type: "sync", events: res.events, cursor: res.cursor, ctx })
            showBrowserNotifications(cands)
          } else if (res.cursor !== before.cursor) {
            dispatch({ type: "sync", events: [], cursor: res.cursor, ctx })
          }
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError" || stopped) return
        const status = e instanceof api.MessengerApiError ? e.status : null
        if (status === 401) {
          dispatch({ type: "error", error: "로그인이 만료되었습니다. 다시 로그인해 주세요.", status })
          stopped = true
          return
        }
        wait = Math.min(30000, interval() * 3) // 일시 오류: 조금 늦춰 다시
      } finally {
        syncBusy.current = false
      }
      schedule(wait)
    }

    syncNow.current = () => schedule(0)
    schedule(interval())
    return () => {
      stopped = true
      controller.abort()
      if (syncTimer.current) clearTimeout(syncTimer.current)
      syncNow.current = () => {}
    }
  }, [state.phase, bootstrap, showBrowserNotifications])

  // 화면이 다시 보이면 바로 동기화
  useEffect(() => {
    if (visible) syncNow.current()
  }, [visible])

  // 모르는 멤버 id가 보이면 멤버 목록 다시
  useEffect(() => {
    if (!state.membersStale || state.phase !== "ready") return
    const t = setTimeout(() => {
      api
        .fetchMembers()
        .then((members) => dispatch({ type: "setMembers", members }))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [state.membersStale, state.phase])

  // 접속 표시: 구성원 목록(last_seen_at)을 1분마다 다시 받는다(화면이 보일 때만).
  // 새로 받은 목록으로 다시 그려지므로 '3분 안 접속' 판정도 함께 갱신된다.
  useEffect(() => {
    if (state.phase !== "ready" || !visible) return
    const refresh = () => {
      api
        .fetchMembers()
        .then((members) => dispatch({ type: "setMembers", members }))
        .catch(() => {})
    }
    const t = setInterval(refresh, 60_000)
    return () => clearInterval(t)
  }, [state.phase, visible])

  // ── 방 열기·불러오기 ─────────────────────────────────────────────────────
  const openRoom = useCallback((roomId: number | null) => {
    setActiveRoomId(roomId)
    writeRoomToUrl(roomId)
    setPanel((p) => (p.tab === "thread" ? { ...p, open: false, threadId: null } : p))
  }, [])

  const loadingRooms = useRef(new Set<number>())
  const ensureRoomLoaded = useCallback(async (roomId: number) => {
    const tl = stateRef.current.timelines[roomId]
    if ((tl && tl.loaded) || loadingRooms.current.has(roomId)) return
    loadingRooms.current.add(roomId)
    try {
      const page = await api.fetchMessages(roomId, { limit: 50 })
      dispatch({ type: "messagesLoaded", roomId, page, mode: "initial" })
    } catch (e) {
      notify(errText(e, "메시지를 불러오지 못했습니다."), "error")
    } finally {
      loadingRooms.current.delete(roomId)
    }
  }, [notify])

  const loadOlder = useCallback(async (roomId: number): Promise<boolean> => {
    const tl = stateRef.current.timelines[roomId]
    if (!tl || !tl.loaded || !tl.hasMore || tl.loadingOlder) return false
    dispatch({ type: "loadingOlder", roomId, value: true })
    try {
      const page = await api.fetchMessages(roomId, { before: tl.ids[0] ?? null, limit: 50 })
      dispatch({ type: "messagesLoaded", roomId, page, mode: "older" })
      return page.has_more
    } catch (e) {
      dispatch({ type: "loadingOlder", roomId, value: false })
      notify(errText(e, "이전 메시지를 불러오지 못했습니다."), "error")
      return false
    }
  }, [notify])

  useEffect(() => {
    if (state.phase === "ready" && activeRoomId && state.rooms[activeRoomId]) void ensureRoomLoaded(activeRoomId)
  }, [state.phase, activeRoomId, state.rooms, ensureRoomLoaded])

  // 보던 방이 사라지면(강퇴·나가기) 닫는다
  useEffect(() => {
    if (state.phase === "ready" && activeRoomId && !state.rooms[activeRoomId]) {
      setActiveRoomId(null)
      writeRoomToUrl(null)
    }
  }, [state.phase, state.rooms, activeRoomId])

  // 다른 사람이 읽으면 최근 페이지를 다시 받아 "안 읽은 사람 수"를 맞춘다(보고 있는 방만, 1.5초 모아서)
  const activeStale = activeRoomId ? state.timelines[activeRoomId]?.staleReads : false
  useEffect(() => {
    if (!activeRoomId || !activeStale || !visible) return
    const roomId = activeRoomId
    const t = setTimeout(() => {
      api
        .fetchMessages(roomId, { limit: 50 })
        .then((page) => dispatch({ type: "messagesLoaded", roomId, page, mode: "latest" }))
        .catch(() => {})
    }, 1500)
    return () => clearTimeout(t)
  }, [activeRoomId, activeStale, visible])

  // ── 읽음 처리: 보고 있는 방에 새 메시지가 있으면 1초 뒤 last_read 갱신 ──────
  const activeRoom = activeRoomId ? state.rooms[activeRoomId] ?? null : null
  const activeTl = activeRoomId ? state.timelines[activeRoomId] : undefined
  const newestLoaded = activeTl && activeTl.ids.length ? activeTl.ids[activeTl.ids.length - 1] : 0
  // 댓글(나를 멘션한 댓글 포함)까지 읽음으로 올린다 — 서버 멘션 수는 댓글도 센다. 서버가 방의 최대 id로 상한을 둔다.
  const maxSeenInRoom = activeRoomId ? state.maxSeen[activeRoomId] ?? 0 : 0
  const readTarget = activeTl?.loaded
    ? Math.max(newestLoaded, activeRoom?.last_message?.id ?? 0, maxSeenInRoom)
    : newestLoaded
  const lastRead = activeRoom?.last_read_message_id ?? 0
  useEffect(() => {
    if (!activeRoomId || !visible || !activeTl?.loaded) return
    if (readTarget <= lastRead) return
    const roomId = activeRoomId
    const target = readTarget
    const t = setTimeout(() => {
      dispatch({ type: "markRead", roomId, messageId: target })
      api.patchRoomMe(roomId, { last_read_message_id: target }).catch(() => {})
    }, 1000)
    return () => clearTimeout(t)
  }, [activeRoomId, visible, activeTl?.loaded, readTarget, lastRead])

  // ── 문서 제목에 안 읽은 수 ───────────────────────────────────────────────
  const unreadTotal = useMemo(() => totalUnread(state.rooms), [state.rooms])
  const baseTitle = useRef<string | null>(null)
  useEffect(() => {
    if (baseTitle.current === null) baseTitle.current = document.title.replace(/^\(\d+\+?\)\s*/, "")
    const base = baseTitle.current
    document.title = unreadTotal > 0 ? `(${unreadTotal > 99 ? "99+" : unreadTotal}) ${base}` : base
  }, [unreadTotal])
  useEffect(() => {
    return () => {
      if (baseTitle.current !== null) document.title = baseTitle.current
    }
  }, [])

  // ── 패널·다이얼로그 ──────────────────────────────────────────────────────
  const openPanel = useCallback((tab: RightPanelTab, opts: { threadId?: number | null; searchQuery?: string } = {}) => {
    setPanel((p) => ({
      open: true,
      tab,
      threadId: tab === "thread" ? opts.threadId ?? p.threadId : p.threadId,
      searchQuery: opts.searchQuery ?? p.searchQuery,
    }))
  }, [])
  const closePanel = useCallback(() => setPanel((p) => ({ ...p, open: false })), [])
  const openDialog = useCallback((d: MessengerDialog) => setDialog(d), [])
  const closeDialog = useCallback(() => setDialog(null), [])

  const jumpToMessage = useCallback(
    (roomId: number, messageId: number) => {
      const s = stateRef.current
      if (!s.rooms[roomId]) {
        notify("참여하지 않은 방의 메시지입니다.", "error")
        return
      }
      const m = s.messages[messageId]
      if (activeRef.current !== roomId) {
        setActiveRoomId(roomId)
        writeRoomToUrl(roomId)
      }
      if (m?.parent_id) {
        // 댓글이면 원본으로 이동하고 댓글 패널을 연다
        setPanel((p) => ({ ...p, open: true, tab: "thread", threadId: m.parent_id }))
        setJumpTarget({ roomId, messageId: m.parent_id, nonce: Date.now() })
        return
      }
      setJumpTarget({ roomId, messageId, nonce: Date.now() })
    },
    [notify]
  )

  // ── 동작 ─────────────────────────────────────────────────────────────────
  const ctxNow = () => ({ activeRoomId: activeRef.current, visible: visibleRef.current })

  const deliver = useCallback(async (tempId: number, roomId: number, input: api.SendMessageInput): Promise<boolean> => {
    try {
      const msg = await api.sendMessage(roomId, input)
      dispatch({ type: "upsertMessage", message: msg, ctx: ctxNow() })
      dispatch({ type: "pendingRemove", tempId })
      if (!msg.parent_id) dispatch({ type: "markRead", roomId, messageId: msg.id })
      return true
    } catch (e) {
      dispatch({ type: "pendingFail", tempId, error: errText(e, "보내지 못했습니다.") })
      return false
    }
  }, [])

  const tempSeq = useRef(0)
  const send = useCallback(
    async (roomId: number, input: api.SendMessageInput) => {
      tempSeq.current += 1
      const tempId = -(Date.now() * 100 + (tempSeq.current % 100))
      dispatch({
        type: "pendingAdd",
        pending: {
          temp_id: tempId,
          room_id: roomId,
          parent_id: input.parent_id ?? null,
          body: input.body,
          attachments: input.attachments ?? [],
          mentions: input.mentions ?? [],
          created_at: new Date().toISOString(),
          status: "sending",
        },
      })
      return deliver(tempId, roomId, input)
    },
    [deliver]
  )

  const retryPending = useCallback(
    async (tempId: number) => {
      const p = stateRef.current.pending.find((x) => x.temp_id === tempId)
      if (!p) return
      dispatch({ type: "pendingRetry", tempId })
      await deliver(tempId, p.room_id, {
        body: p.body,
        attachments: p.attachments,
        parent_id: p.parent_id,
        mentions: p.mentions,
      })
    },
    [deliver]
  )
  const discardPending = useCallback((tempId: number) => dispatch({ type: "pendingRemove", tempId }), [])

  const editMessage = useCallback(
    async (messageId: number, body: string) => {
      try {
        const msg = await api.editMessage(messageId, body)
        const cur = stateRef.current.messages[messageId]
        if (msg) dispatch({ type: "upsertMessage", message: msg })
        else if (cur) dispatch({ type: "upsertMessage", message: { ...cur, body, edited_at: new Date().toISOString() } })
        return true
      } catch (e) {
        notify(errText(e, "수정하지 못했습니다."), "error")
        return false
      }
    },
    [notify]
  )

  const deleteMessage = useCallback(
    async (messageId: number) => {
      try {
        await api.deleteMessage(messageId)
        dispatch({ type: "removeMessageLocal", messageId })
        return true
      } catch (e) {
        notify(errText(e, "삭제하지 못했습니다."), "error")
        return false
      }
    },
    [notify]
  )

  const toggleReaction = useCallback(
    async (messageId: number, emoji: string) => {
      const s = stateRef.current
      const cur = s.messages[messageId]
      if (!cur || !s.me) return
      dispatch({ type: "upsertMessage", message: toggleReactionLocal(cur, emoji, s.me.id) })
      try {
        const msg = await api.toggleReaction(messageId, emoji)
        if (msg) dispatch({ type: "upsertMessage", message: msg })
      } catch (e) {
        const now = stateRef.current.messages[messageId]
        if (now) dispatch({ type: "upsertMessage", message: toggleReactionLocal(now, emoji, s.me.id) })
        notify(errText(e, "반응을 남기지 못했습니다."), "error")
      }
    },
    [notify]
  )

  const toggleBookmark = useCallback(
    async (messageId: number) => {
      const cur = stateRef.current.messages[messageId]
      if (!cur) return
      const want = !cur.bookmarked
      dispatch({ type: "upsertMessage", message: { ...cur, bookmarked: want } })
      try {
        const result = await api.toggleBookmark(messageId)
        const now = stateRef.current.messages[messageId]
        if (result !== null && now && now.bookmarked !== result) {
          dispatch({ type: "upsertMessage", message: { ...now, bookmarked: result } })
        }
        notify(want ? "별표에 추가했습니다." : "별표를 해제했습니다.")
      } catch (e) {
        const now = stateRef.current.messages[messageId]
        if (now) dispatch({ type: "upsertMessage", message: { ...now, bookmarked: !want } })
        notify(errText(e, "별표를 바꾸지 못했습니다."), "error")
      }
    },
    [notify]
  )

  const pinAnnouncement = useCallback(
    async (roomId: number, messageId: number | null) => {
      try {
        const room = await api.patchRoom(roomId, { announcement_message_id: messageId })
        if (room) dispatch({ type: "upsertRoom", room })
        else {
          const m = messageId ? stateRef.current.messages[messageId] ?? null : null
          dispatch({ type: "patchRoom", roomId, patch: { announcement: m } })
        }
        notify(messageId ? "공지로 고정했습니다." : "공지를 내렸습니다.")
      } catch (e) {
        notify(errText(e, "공지를 바꾸지 못했습니다."), "error")
      }
    },
    [notify]
  )

  const toggleRoomFlag = useCallback(
    async (roomId: number, key: "starred" | "muted") => {
      const room = stateRef.current.rooms[roomId]
      if (!room) return
      const value = !room[key]
      dispatch({ type: "patchRoom", roomId, patch: { [key]: value } })
      try {
        await api.patchRoomMe(roomId, { [key]: value })
      } catch (e) {
        dispatch({ type: "patchRoom", roomId, patch: { [key]: !value } })
        notify(errText(e, "설정을 바꾸지 못했습니다."), "error")
      }
    },
    [notify]
  )
  const toggleStar = useCallback((roomId: number) => toggleRoomFlag(roomId, "starred"), [toggleRoomFlag])
  const toggleMute = useCallback((roomId: number) => toggleRoomFlag(roomId, "muted"), [toggleRoomFlag])

  const leaveRoom = useCallback(
    async (roomId: number) => {
      const me = stateRef.current.me
      if (!me) return false
      try {
        await api.removeRoomMember(roomId, me.id)
        dispatch({ type: "removeRoom", roomId })
        if (activeRef.current === roomId) openRoom(null)
        return true
      } catch (e) {
        notify(errText(e, "나가지 못했습니다."), "error")
        return false
      }
    },
    [notify, openRoom]
  )

  const loadThread = useCallback(
    async (parentId: number) => {
      try {
        const { parent, replies } = await api.fetchThread(parentId)
        dispatch({ type: "threadLoaded", parentId, parent, replies })
      } catch (e) {
        notify(errText(e, "댓글을 불러오지 못했습니다."), "error")
      }
    },
    [notify]
  )

  const refreshMembers = useCallback(async () => {
    try {
      const members = await api.fetchMembers()
      dispatch({ type: "setMembers", members })
    } catch {
      // 조용히 무시(다음 동기화 때 다시)
    }
  }, [])

  const applyRoom = useCallback(
    (room: MessengerRoom, open = false) => {
      dispatch({ type: "upsertRoom", room })
      if (open) openRoom(room.id)
    },
    [openRoom]
  )
  const openDm = useCallback(
    async (memberId: number) => {
      const s = stateRef.current
      if (!s.me) return
      const want = Array.from(new Set([s.me.id, memberId])).sort((a, b) => a - b).join(",")
      const existing = Object.values(s.rooms).find(
        (r) => r.kind === "dm" && Array.from(new Set(r.member_ids)).sort((a, b) => a - b).join(",") === want
      )
      if (existing) {
        openRoom(existing.id)
        return
      }
      try {
        const room = await api.createRoom({ kind: "dm", member_ids: memberId === s.me.id ? [] : [memberId] })
        dispatch({ type: "upsertRoom", room })
        openRoom(room.id)
      } catch (e) {
        notify(errText(e, "대화를 시작하지 못했습니다."), "error")
      }
    },
    [openRoom, notify]
  )

  const applyMessage = useCallback((message: MessengerMessage) => dispatch({ type: "upsertMessage", message, ctx: ctxNow() }), [])
  const applyTodo = useCallback((todo: MessengerTodo) => dispatch({ type: "upsertTodo", todo }), [])

  const me = state.me
  const isMember = me?.role === "member"
  const memberName = useCallback((id: number | null | undefined) => memberNameOf(stateRef.current.members, id), [])
  const roomName = useCallback((room: MessengerRoom) => roomDisplayName(room, stateRef.current.members, stateRef.current.me?.id), [])
  const canManageRoom = useCallback(
    (room: MessengerRoom) => {
      const m = stateRef.current.me
      if (!m || m.role !== "member" || room.kind !== "topic") return false
      if (room.created_by === m.id) return true
      // 방 안 내 역할(my_role)을 서버가 주면 그것을 따르고, 없으면 정회원 모두에게 메뉴를 보인다(권한은 서버가 최종 확인)
      const myRole = (room as MessengerRoom & { my_role?: string }).my_role
      return myRole === undefined ? true : myRole === "admin"
    },
    []
  )

  // Ctrl/Cmd+K: 검색 패널
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        openPanel("search")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openPanel])

  const value = useMemo<MessengerContextValue | null>(() => {
    if (!me) return null
    return {
      variant,
      state,
      dispatch,
      me,
      isMember,
      activeRoomId,
      activeRoom,
      openRoom,
      jumpToMessage,
      jumpTarget,
      panel,
      openPanel,
      closePanel,
      dialog,
      openDialog,
      closeDialog,
      send,
      retryPending,
      discardPending,
      editMessage,
      deleteMessage,
      toggleReaction,
      toggleBookmark,
      pinAnnouncement,
      toggleStar,
      toggleMute,
      leaveRoom,
      loadThread,
      ensureRoomLoaded,
      loadOlder,
      refreshMembers,
      applyRoom,
      applyMessage,
      applyTodo,
      openDm,
      notify,
      memberName,
      roomName,
      canManageRoom,
    }
  }, [
    variant, state, me, isMember, activeRoomId, activeRoom, openRoom, jumpToMessage, jumpTarget, panel, openPanel, closePanel,
    dialog, openDialog, closeDialog, send, retryPending, discardPending, editMessage, deleteMessage, toggleReaction,
    toggleBookmark, pinAnnouncement, toggleStar, toggleMute, leaveRoom, loadThread, ensureRoomLoaded, loadOlder,
    refreshMembers, applyRoom, applyMessage, applyTodo, openDm, notify, memberName, roomName, canManageRoom,
  ])

  const frame = cn("flex w-full overflow-hidden bg-card text-dark", HEIGHT_CLASS[variant], className)

  if (!value) {
    return (
      <div className={cn(frame, "items-center justify-center p-6")}>
        {state.phase === "error" ? (
          <StartError status={state.errorStatus} message={state.error} onRetry={() => void bootstrap()} variant={variant} />
        ) : (
          <span className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            메신저를 불러오는 중
          </span>
        )}
      </div>
    )
  }

  const showPanel = panel.open
  return (
    <MessengerContext.Provider value={value}>
      <div className={frame}>
        {/* 왼쪽: 방 목록(모바일에서는 방을 열면 숨김) */}
        <div
          className={cn(
            "w-full shrink-0 border-r border-warm-tan md:flex md:w-64 lg:w-72",
            activeRoomId ? "hidden" : "flex"
          )}
        >
          <MessengerSidebar />
        </div>

        {/* 가운데: 대화창 */}
        <div className={cn("min-w-0 flex-1 flex-col", activeRoomId ? "flex" : "hidden md:flex")}>
          {activeRoom ? <RoomView key={activeRoom.id} room={activeRoom} /> : <NoRoom />}
        </div>

        {/* 오른쪽: 패널(넓은 화면은 옆 칸, 좁은 화면은 시트) */}
        {panelInline ? (
          showPanel && (
            <aside className="flex w-[360px] shrink-0 flex-col border-l border-warm-tan bg-card" aria-label="보조 패널">
              <RightPanel />
            </aside>
          )
        ) : (
          <Sheet open={showPanel} onOpenChange={(o) => !o && closePanel()}>
            <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md [&>button:last-child]:hidden">
              <SheetTitle className="sr-only">보조 패널</SheetTitle>
              <div className="flex h-full min-h-0 flex-col">
                <RightPanel />
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
      <DialogHost />
      <Toaster theme="light" position="bottom-center" richColors closeButton />
    </MessengerContext.Provider>
  )
}

function StartError({
  status,
  message,
  onRetry,
  variant,
}: {
  status: number | null
  message: string | null
  onRetry: () => void
  variant: "admin" | "portal"
}) {
  const needLogin = status === 401
  const notReady = status === 503 || status === 500
  return (
    <div className="max-w-sm text-center">
      <p className="text-sm font-semibold text-dark">
        {needLogin ? "로그인이 필요합니다" : notReady ? "메신저를 사용할 수 없습니다" : "메신저를 불러오지 못했습니다"}
      </p>
      <p className="mt-1 text-sm text-text-secondary [word-break:keep-all]">
        {message || "잠시 후 다시 시도해 주세요."}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        {needLogin ? (
          <Button size="sm" asChild>
            <a href={variant === "admin" ? "/admin/login" : "/portal/login"}>로그인</a>
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onRetry}>
            다시 시도
          </Button>
        )}
      </div>
    </div>
  )
}

function NoRoom() {
  return (
    <div className="flex h-full items-center justify-center bg-warm-ivory/40 p-6">
      <p className="text-sm text-text-secondary">왼쪽에서 토픽이나 대화를 선택하세요.</p>
    </div>
  )
}

// 열린 다이얼로그 하나만 그린다(닫으면 언마운트 → 입력 상태 초기화).
// 담당 D 다이얼로그는 useMessenger()로 상태·반영 함수를 받으므로 open/onOpenChange와 대상 id만 넘긴다.
function DialogHost() {
  const ctx = useMessenger()
  const d = ctx.dialog
  if (!d) return null
  const onOpenChange = (open: boolean) => {
    if (!open) ctx.closeDialog()
  }
  switch (d.name) {
    case "createTopic":
      return <CreateTopicDialog open onOpenChange={onOpenChange} />
    case "browseTopics":
      return <BrowseTopicsDialog open onOpenChange={onOpenChange} />
    case "startDm":
      return <StartDmDialog open onOpenChange={onOpenChange} initialMemberIds={d.memberIds} />
    case "invite":
      return <InviteDialog open onOpenChange={onOpenChange} roomId={d.roomId} />
    case "roomSettings":
      return <RoomSettingsDialog open onOpenChange={onOpenChange} roomId={d.roomId} />
    case "webhooks":
      return <WebhooksDialog open onOpenChange={onOpenChange} roomId={d.roomId} />
    case "profile":
      return <ProfileDialog open onOpenChange={onOpenChange} memberId={d.memberId} />
    case "poll":
      return <PollDialog open onOpenChange={onOpenChange} roomId={d.roomId} />
    case "todo":
      return (
        <TodoDialog open onOpenChange={onOpenChange} roomId={d.roomId} messageId={d.messageId ?? null} defaultTitle={d.defaultTitle} />
      )
    case "share":
      return <ShareDialog open onOpenChange={onOpenChange} messageId={d.messageId} />
    default:
      return null
  }
}
