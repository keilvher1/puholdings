"use client"

// 방의 메시지 목록: 날짜 구분선 · 같은 작성자 연속 묶음 · "새 메시지" 구분선 · 위로 스크롤하면 이전 페이지 ·
// 맨 아래 붙어 있으면 새 메시지를 따라 내려감(아니면 "새 메시지 N개" 버튼) · 메시지로 이동(검색·멘션·공지).

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, Hash, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MessengerMessage, MessengerRoom } from "@/lib/messenger-types"
import { pendingAsMessage, pendingFor, timelineMessages, useMessenger, type PendingMessage } from "./store"
import { MessageItem, dayKey, formatDateLabel } from "./message-item"

const GROUP_GAP_MS = 5 * 60 * 1000
const NEAR_BOTTOM_PX = 120

interface Row {
  message: MessengerMessage
  pending?: PendingMessage
  compact: boolean
  dateLabel: string | null
  newDivider: boolean
}

export function MessageList({
  room,
  editingId,
  onEditDone,
}: {
  room: MessengerRoom
  editingId: number | null // ↑ 키 등으로 편집 중인 내 메시지
  onEditDone: () => void
}) {
  const ctx = useMessenger()
  const { state, me } = ctx
  const tl = state.timelines[room.id]
  const loaded = !!tl?.loaded
  const hasMore = !!tl?.hasMore
  const loadingOlder = !!tl?.loadingOlder

  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  const [unseen, setUnseen] = useState(0)
  const [highlightId, setHighlightId] = useState<number | null>(null)

  // 방을 열 때의 읽음 위치(이후에 읽음 처리돼도 구분선은 그대로 둔다)
  const [readSnapshot] = useState<number | null>(() => (room.unread_count > 0 ? room.last_read_message_id ?? 0 : null))

  const messages = useMemo(() => timelineMessages(state, room.id), [state, room.id])
  const pendings = useMemo(() => pendingFor(state, room.id, null), [state, room.id])

  const rows = useMemo<Row[]>(() => {
    const all: { message: MessengerMessage; pending?: PendingMessage }[] = [
      ...messages.map((m) => ({ message: m })),
      ...pendings.map((p) => ({ message: pendingAsMessage(p, me.id), pending: p })),
    ]
    const out: Row[] = []
    let prev: MessengerMessage | null = null
    let dividerPlaced = false
    for (const it of all) {
      const m = it.message
      const dateLabel = !prev || dayKey(prev.created_at) !== dayKey(m.created_at) ? formatDateLabel(m.created_at) : null
      const newDivider =
        !dividerPlaced &&
        readSnapshot !== null &&
        !it.pending &&
        m.id > readSnapshot &&
        m.author_id !== me.id &&
        messages.length > 0 &&
        m.id !== messages[0].id // 첫 메시지 위에는 굳이 긋지 않는다
      if (newDivider) dividerPlaced = true
      const compact =
        !!prev &&
        !dateLabel &&
        !newDivider &&
        prev.author_id !== null &&
        prev.author_id === m.author_id &&
        prev.kind !== "system" &&
        m.kind !== "system" &&
        !m.shared_from &&
        new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_GAP_MS
      out.push({ message: m, pending: it.pending, compact, dateLabel, newDivider })
      prev = m
    }
    return out
  }, [messages, pendings, me.id, readSnapshot])

  // ── 스크롤 ────────────────────────────────────────────────────────────────
  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" })
    atBottomRef.current = true
    setAtBottom(true)
    setUnseen(0)
  }, [])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    if (near !== atBottomRef.current) {
      atBottomRef.current = near
      setAtBottom(near)
    }
    if (near) setUnseen(0)
    if (el.scrollTop < 200 && hasMore && !loadingOlder && loaded) void ctx.loadOlder(room.id)
  }, [hasMore, loadingOlder, loaded, ctx, room.id])

  // 이전 페이지를 위에 붙일 때 보던 위치 유지
  const firstId = messages[0]?.id ?? null
  const prevFirstId = useRef<number | null>(null)
  const prevScrollHeight = useRef(0)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (prevFirstId.current !== null && firstId !== null && firstId < prevFirstId.current) {
      el.scrollTop += el.scrollHeight - prevScrollHeight.current
    }
    prevFirstId.current = firstId
    prevScrollHeight.current = el.scrollHeight
  })

  // 첫 로드: 새 메시지 구분선이 있으면 그 위치, 없으면 맨 아래
  const initialScrolled = useRef(false)
  useLayoutEffect(() => {
    if (!loaded || initialScrolled.current) return
    initialScrolled.current = true
    const el = scrollRef.current
    if (!el) return
    const divider = el.querySelector<HTMLElement>("[data-new-divider]")
    if (divider) {
      el.scrollTop = Math.max(0, divider.offsetTop - 80)
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
      atBottomRef.current = near
      setAtBottom(near)
    } else {
      scrollToBottom()
    }
  }, [loaded, scrollToBottom])

  // 새 메시지가 아래에 붙으면: 맨 아래였거나 내가 보낸 것이면 따라 내려가고, 아니면 개수만 센다
  const lastRow = rows[rows.length - 1]
  const lastKey = lastRow ? lastRow.message.id : 0
  const prevLastKey = useRef(lastKey)
  const lastKeySynced = useRef(false)
  useLayoutEffect(() => {
    // 첫 로드가 끝난 커밋(바로 위 효과가 먼저 initialScrolled를 켠다)에서 붙은 메시지는 "새로 온 것"이 아니다
    if (!initialScrolled.current || !lastKeySynced.current) {
      prevLastKey.current = lastKey
      lastKeySynced.current = initialScrolled.current
      return
    }
    if (lastKey === prevLastKey.current) return
    prevLastKey.current = lastKey
    const mine = lastRow && (lastRow.pending || lastRow.message.author_id === me.id)
    if (atBottomRef.current || mine) scrollToBottom()
    else setUnseen((n) => n + 1)
  }, [lastKey, lastRow, me.id, scrollToBottom])

  // 이미지가 늦게 커져도 맨 아래에 붙어 있게
  useEffect(() => {
    const content = contentRef.current
    if (!content || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current) {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      }
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [])

  // 내용이 짧아 스크롤이 안 생기면 이전 페이지를 더 받아 채운다
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !loaded || !hasMore || loadingOlder) return
    if (el.scrollHeight <= el.clientHeight + 40) void ctx.loadOlder(room.id)
  }, [loaded, hasMore, loadingOlder, messages.length, ctx, room.id])

  // ── 메시지로 이동 ────────────────────────────────────────────────────────
  const jump = ctx.jumpTarget
  const jumpHandled = useRef<number | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jumpPages = useRef<{ nonce: number; count: number }>({ nonce: 0, count: 0 })
  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
  }, [])
  useEffect(() => {
    if (!jump || jump.roomId !== room.id || !loaded) return
    if (jumpHandled.current === jump.nonce) return
    const el = scrollRef.current
    const target = el?.querySelector<HTMLElement>(`[data-message-id="${jump.messageId}"]`)
    if (target && el) {
      jumpHandled.current = jump.nonce
      el.scrollTop = Math.max(0, target.offsetTop - el.clientHeight / 3)
      setHighlightId(jump.messageId)
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
      highlightTimer.current = setTimeout(() => setHighlightId(null), 2400)
      return
    }
    const oldest = messages[0]?.id ?? 0
    if (hasMore && !loadingOlder && jump.messageId < oldest) {
      // 이전 페이지를 최대 20번(약 1,000개)까지 거슬러 올라간다
      if (jumpPages.current.nonce !== jump.nonce) jumpPages.current = { nonce: jump.nonce, count: 0 }
      if (jumpPages.current.count >= 20) {
        jumpHandled.current = jump.nonce
        ctx.notify("너무 오래된 메시지라 여기서 바로 이동할 수 없습니다. 위로 스크롤해 찾아 주세요.", "error")
        return
      }
      jumpPages.current.count += 1
      void ctx.loadOlder(room.id)
    } else if (!hasMore || jump.messageId >= oldest) {
      if (!loadingOlder) {
        jumpHandled.current = jump.nonce
        if (!state.messages[jump.messageId]) ctx.notify("메시지를 찾지 못했습니다(삭제되었거나 댓글일 수 있습니다).", "error")
      }
    }
  }, [jump, room.id, loaded, messages, hasMore, loadingOlder, ctx, state.messages])

  // ── 그리기 ────────────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-secondary">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> 메시지를 불러오는 중
      </div>
    )
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} className="relative h-full overflow-y-auto overscroll-contain" role="log" aria-label="메시지">
        <div ref={contentRef} className="pb-3">
          {hasMore ? (
            <div className="flex h-10 items-center justify-center text-xs text-text-secondary">
              {loadingOlder ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> 이전 메시지를 불러오는 중
                </>
              ) : (
                <button type="button" className="underline underline-offset-2" onClick={() => void ctx.loadOlder(room.id)}>
                  이전 메시지 더 보기
                </button>
              )}
            </div>
          ) : (
            <RoomIntro room={room} />
          )}

          {rows.map((r) => (
            <Fragment key={r.pending ? `p${r.pending.temp_id}` : r.message.id}>
              {r.dateLabel && (
                // 날짜 구분선은 고정(sticky)하지 않는다 — 떠 있는 칩이 이름·시각·파일명을 가려서
                <div className="flex items-center gap-3 px-4 py-2" role="separator">
                  <span className="h-px flex-1 bg-warm-tan" />
                  <span className="rounded-sm border border-warm-tan bg-card px-2 py-0.5 text-xs font-medium text-dark">{r.dateLabel}</span>
                  <span className="h-px flex-1 bg-warm-tan" />
                </div>
              )}
              {r.newDivider && (
                <div data-new-divider className="flex items-center gap-3 px-4 py-1.5" role="separator">
                  <span className="h-px flex-1 bg-destructive/60" />
                  <span className="text-xs font-semibold text-destructive">여기부터 새 메시지</span>
                  <span className="h-px flex-1 bg-destructive/60" />
                </div>
              )}
              <MessageItem
                message={r.message}
                pending={r.pending}
                compact={r.compact}
                highlighted={highlightId === r.message.id}
                editing={editingId === r.message.id ? true : undefined}
                onEditDone={editingId === r.message.id ? onEditDone : undefined}
              />
            </Fragment>
          ))}
        </div>
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className={cn(
            "absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            unseen > 0 ? "border-dark bg-dark text-primary-foreground" : "border-warm-tan bg-card text-dark"
          )}
        >
          <ArrowDown className="h-3.5 w-3.5" aria-hidden />
          {unseen > 0 ? `새 메시지 ${unseen}개` : "맨 아래로"}
        </button>
      )}
    </div>
  )
}

function RoomIntro({ room }: { room: MessengerRoom }) {
  const ctx = useMessenger()
  const name = ctx.roomName(room)
  return (
    <div className="px-4 pb-2 pt-6">
      {room.kind === "topic" ? (
        <>
          <p className="flex items-center gap-1.5 text-base font-semibold text-dark">
            <Hash className="h-4 w-4 text-text-secondary" aria-hidden />
            {name}
          </p>
          <p className="mt-1 text-sm text-text-secondary [word-break:keep-all]">
            {room.description || "토픽의 첫 메시지입니다."}
          </p>
        </>
      ) : (
        <>
          <p className="text-base font-semibold text-dark">{name}</p>
          <p className="mt-1 text-sm text-text-secondary">대화의 처음입니다.</p>
        </>
      )}
    </div>
  )
}
