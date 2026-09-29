"use client"

// 메신저 부가 화면(담당 D) 공용 조각. 담당 C의 api.ts(messengerApi)·store.ts(useMessenger)·message-item.tsx(아바타 등)를 쓴다.
//
// export
//   errText(e, fallback) · pickArray(data, keys) · pickObject(data, keys)   — 응답 키가 조금 달라도 동작하도록
//   formatDateTime(iso) · todayYmd() · formatDue('YYYY-MM-DD') · isOverdue(todo) · stripMentionTokens(body) · presenceLabel(member)
//   usePanelFetch<T>(path|null, refreshKey?) → { data, error, loading, reload }   — refreshKey가 바뀌면 조용히 재조회
//   useRoomMembers(room|null) → MessengerMember[]   — 방 참여자(ctx.state.members에서)
//   useOpenDm() → (memberId) => Promise<void>        — 기존 1:1 대화가 있으면 열고, 없으면 만들어 연다
//   useJump() → (roomId, messageId, parentId?) => void — 댓글이면 원본으로 이동하고 댓글 탭을 연다
//   <MessageSnippet message roomName? query? onClick? trailing? />   — 멘션·별표·검색 결과 한 칸
//   <MemberPicker members selected onChange exclude? disabledIds? emptyText? />
//   <PanelEmpty> · <PanelLoading /> · <PanelError message onRetry? /> · <InlineError message />
//   <Segmented value onChange options />             — 패널 머리의 작은 전환 버튼 묶음

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AlertCircle, Loader2, Paperclip } from "lucide-react"
import { cn } from "@/lib/utils"
import { MENTION_RE, type MessengerMember, type MessengerMessage, type MessengerRoom, type MessengerTodo } from "@/lib/messenger-types"
import { messengerApi } from "./api"
import { MemberAvatar, presenceOf } from "./message-item"
import { useMessenger } from "./store"

// ── 응답 도우미 ─────────────────────────────────────────────────────────────

export function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

export function pickArray<T>(data: unknown, keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[]
  if (!data || typeof data !== "object") return []
  const obj = data as Record<string, unknown>
  for (const k of keys) if (Array.isArray(obj[k])) return obj[k] as T[]
  return []
}

export function pickObject<T>(data: unknown, keys: string[]): T | null {
  if (!data || typeof data !== "object") return null
  const obj = data as Record<string, unknown>
  for (const k of keys) {
    const v = obj[k]
    if (v && typeof v === "object" && !Array.isArray(v)) return v as T
  }
  return null
}

// ── 형식 ────────────────────────────────────────────────────────────────────

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function timeOf(d: Date): string {
  return d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })
}

// 오늘이면 시각만, 올해면 'M월 D일 시각', 아니면 'YYYY. M. D.'
export function formatDateTime(iso: string | null | undefined): string {
  const d = toDate(iso)
  if (!d) return ""
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return timeOf(d)
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일 ${timeOf(d)}`
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function todayYmd(): string {
  return ymd(new Date())
}

export function addDaysYmd(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return ymd(d)
}

// 'YYYY-MM-DD' → '9월 30일(화)'. 올해가 아니면 연도 포함.
export function formatDue(date: string | null | undefined): string {
  if (!date) return ""
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!m) return date
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const base = `${Number(m[2])}월 ${Number(m[3])}일(${"일월화수목금토"[d.getDay()]})`
  return d.getFullYear() === new Date().getFullYear() ? base : `${m[1]}년 ${base}`
}

export function isOverdue(todo: Pick<MessengerTodo, "due_date" | "done">): boolean {
  if (!todo.due_date || todo.done) return false
  return todo.due_date.slice(0, 10) < todayYmd()
}

export function stripMentionTokens(body: string): string {
  return body.replace(new RegExp(MENTION_RE.source, "g"), (_m, name: string) => `@${name}`)
}

export function presenceLabel(member: MessengerMember): string {
  const p = presenceOf(member)
  if (p === "away") return "자리 비움"
  if (p === "online") return "접속 중"
  return member.last_seen_at ? `최근 접속 ${formatDateTime(member.last_seen_at)}` : "접속 기록 없음"
}

// ── 훅 ─────────────────────────────────────────────────────────────────────

// path가 바뀌면 로딩 표시와 함께, refreshKey만 바뀌면 조용히 다시 불러온다. 늦게 온 이전 응답은 버린다.
export function usePanelFetch<T>(path: string | null, refreshKey?: unknown) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)
  const lastPath = useRef<string | null>(null)

  const load = useCallback(
    async (quiet: boolean) => {
      if (!path) return
      const my = ++seq.current
      if (!quiet) setLoading(true)
      try {
        const json = await messengerApi.get<T>(path)
        if (my !== seq.current) return
        setData(json)
        setError(null)
      } catch (e) {
        if (my !== seq.current) return
        if (!quiet) setError(errText(e, "불러오지 못했습니다."))
      } finally {
        if (my === seq.current) setLoading(false)
      }
    },
    [path]
  )

  useEffect(() => {
    if (!path) {
      setData(null)
      setError(null)
      lastPath.current = null
      return
    }
    const changed = lastPath.current !== path
    lastPath.current = path
    if (changed) setData(null)
    void load(!changed)
  }, [path, refreshKey, load])

  const reload = useCallback(() => load(false), [load])
  return { data, error, loading, reload }
}

export function useRoomMembers(room: Pick<MessengerRoom, "member_ids"> | null | undefined): MessengerMember[] {
  const { state } = useMessenger()
  return useMemo(() => {
    const all = Object.values(state.members)
    if (!room) return all
    const ids = new Set(room.member_ids)
    return all.filter((m) => ids.has(m.id))
  }, [state.members, room])
}

// C의 ctx.openDm(1:1 대화가 있으면 열고, 없으면 만들어 연다)을 그대로 쓴다.
export function useOpenDm() {
  return useMessenger().openDm
}

export function useJump() {
  const { jumpToMessage, openPanel, state, notify } = useMessenger()
  return useCallback(
    (roomId: number, messageId: number, parentId?: number | null) => {
      if (!state.rooms[roomId]) {
        notify("참여하지 않은 방의 메시지입니다.", "error")
        return
      }
      if (parentId) {
        jumpToMessage(roomId, parentId)
        openPanel("thread", { threadId: parentId })
        return
      }
      jumpToMessage(roomId, messageId)
    },
    [jumpToMessage, openPanel, state.rooms, notify]
  )
}

// ── 본문 요약(검색어 강조) ──────────────────────────────────────────────────

const INLINE_RE = new RegExp(`${MENTION_RE.source}|\\*\\*([^*\\n]+)\\*\\*|\`([^\`\\n]+)\``, "g")

function highlight(text: string, query: string | undefined, keyBase: string): ReactNode[] {
  const q = query?.trim()
  if (!q) return [text]
  const out: ReactNode[] = []
  const lower = text.toLowerCase()
  const ql = q.toLowerCase()
  let i = 0
  let k = 0
  while (i < text.length) {
    const j = lower.indexOf(ql, i)
    if (j < 0) {
      out.push(text.slice(i))
      break
    }
    if (j > i) out.push(text.slice(i, j))
    out.push(
      <mark key={`${keyBase}-${k++}`} className="rounded-sm bg-gold/30 px-0.5 text-dark">
        {text.slice(j, j + q.length)}
      </mark>
    )
    i = j + q.length
  }
  return out
}

// 멘션은 굵게, **굵게**·`코드`는 기호만 뗀 글자로. 검색어는 강조.
export function renderSnippet(body: string, meId: number, query?: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = new RegExp(INLINE_RE.source, "g")
  let last = 0
  let n = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    if (m.index > last) out.push(...highlight(body.slice(last, m.index), query, `t${n++}`))
    if (m[1] !== undefined) {
      const mine = m[2] === "all" || Number(m[2]) === meId
      out.push(
        <span key={`m${n++}`} className={cn("rounded-sm px-0.5 font-semibold", mine ? "bg-gold/30 text-dark" : "text-dark")}>
          @{m[1]}
        </span>
      )
    } else {
      out.push(...highlight(m[3] ?? m[4] ?? "", query, `b${n++}`))
    }
    last = re.lastIndex
  }
  if (last < body.length) out.push(...highlight(body.slice(last), query, `e${n++}`))
  return out
}

export function MessageSnippet({
  message,
  roomName,
  query,
  onClick,
  trailing,
}: {
  message: MessengerMessage
  roomName?: string
  query?: string
  onClick?: () => void
  trailing?: ReactNode
}) {
  const { state, me } = useMessenger()
  const author = message.author_id != null ? state.members[message.author_id] : undefined
  const name = message.author_id == null ? message.author_label || "알림" : author?.display_name || "알 수 없음"
  const inner = (
    <>
      <MemberAvatar member={author} label={name} size={28} className="mt-0.5" />
      <span className="block min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5 text-xs text-text-secondary">
          <span className="truncate text-sm font-semibold text-dark">{name}</span>
          {roomName && <span className="min-w-0 truncate">· {roomName}</span>}
          <span className="ml-auto shrink-0 tabular-nums">{formatDateTime(message.created_at)}</span>
        </span>
        {message.deleted ? (
          <span className="mt-0.5 block text-sm text-text-secondary">삭제된 메시지입니다.</span>
        ) : (
          <>
            {message.body && (message.kind === "text" || message.kind === "file" || message.kind === "system") && (
              <span className="mt-0.5 line-clamp-3 block whitespace-pre-wrap break-words text-sm leading-relaxed text-dark">
                {renderSnippet(message.body, me.id, query)}
              </span>
            )}
            {message.poll && <span className="mt-0.5 block text-sm text-dark">[투표] {message.poll.question}</span>}
            {message.todo && <span className="mt-0.5 block text-sm text-dark">[할 일] {message.todo.title}</span>}
            {message.attachments.length > 0 && (
              <span className="mt-1 flex items-center gap-1 text-xs text-text-secondary">
                <Paperclip className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {message.attachments[0].name}
                  {message.attachments.length > 1 && ` 외 ${message.attachments.length - 1}개`}
                </span>
              </span>
            )}
            {message.parent_id != null && <span className="mt-1 block text-xs text-text-secondary">댓글</span>}
          </>
        )}
      </span>
    </>
  )
  return (
    <div className="flex items-start border-b border-warm-tan/70 last:border-b-0">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 flex-1 gap-2.5 px-3 py-2.5 text-left hover:bg-warm-ivory focus-visible:bg-warm-ivory focus-visible:outline-none"
        >
          {inner}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 gap-2.5 px-3 py-2.5">{inner}</div>
      )}
      {trailing}
    </div>
  )
}

// ── 상태 표시 ───────────────────────────────────────────────────────────────

export function PanelEmpty({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-4 py-10 text-center text-sm text-text-secondary [word-break:keep-all]", className)}>{children}</div>
}

export function PanelLoading({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-text-secondary">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

export function PanelError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="px-4 py-8 text-center text-sm">
      <p className="inline-flex items-center gap-1.5 text-destructive">
        <AlertCircle className="size-4 shrink-0" aria-hidden />
        {message}
      </p>
      {onRetry && (
        <div className="mt-2">
          <button type="button" onClick={onRetry} className="text-sm text-dark underline underline-offset-2">
            다시 시도
          </button>
        </div>
      )}
    </div>
  )
}

export function InlineError({ message, className }: { message: string | null | undefined; className?: string }) {
  if (!message) return null
  return (
    <p role="alert" className={cn("flex items-center gap-1.5 text-xs text-destructive", className)}>
      <AlertCircle className="size-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  label: string
}) {
  return (
    <div className="flex gap-1" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-sm border px-2 text-xs tabular-nums",
            value === o.value ? "border-dark bg-dark text-white" : "border-warm-tan text-text-secondary hover:text-dark"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── 멤버 선택 ───────────────────────────────────────────────────────────────

export function MemberPicker({
  members,
  selected,
  onChange,
  exclude = [],
  disabledIds = [],
  emptyText = "선택할 수 있는 멤버가 없습니다.",
  className,
}: {
  members: MessengerMember[]
  selected: number[]
  onChange: (ids: number[]) => void
  exclude?: number[]
  disabledIds?: number[]
  emptyText?: string
  className?: string
}) {
  const [q, setQ] = useState("")
  const list = useMemo(() => {
    const ex = new Set(exclude)
    const needle = q.trim().toLowerCase()
    return members
      .filter((m) => !ex.has(m.id))
      .filter((m) => !needle || m.display_name.toLowerCase().includes(needle) || (m.title || "").toLowerCase().includes(needle))
      .sort((a, b) => (a.role !== b.role ? (a.role === "member" ? -1 : 1) : a.display_name.localeCompare(b.display_name, "ko")))
  }, [members, exclude, q])
  const sel = new Set(selected)
  const dis = new Set(disabledIds)
  const byId = new Map(members.map((m) => [m.id, m]))

  function toggle(id: number) {
    if (dis.has(id)) return
    onChange(sel.has(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  return (
    <div className={cn("rounded-md border border-warm-tan", className)}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-warm-tan px-2 py-2">
          {selected.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className="inline-flex h-6 items-center gap-1 rounded-sm border border-warm-tan bg-warm-beige px-1.5 text-xs text-dark hover:bg-warm-tan"
              aria-label={`${byId.get(id)?.display_name ?? "알 수 없음"} 선택 해제`}
            >
              {byId.get(id)?.display_name ?? "알 수 없음"}
              <span aria-hidden className="text-text-secondary">
                ×
              </span>
            </button>
          ))}
        </div>
      )}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="이름·소속 검색"
        className="h-9 w-full border-b border-warm-tan bg-transparent px-3 text-sm outline-none placeholder:text-text-secondary"
        aria-label="멤버 검색"
      />
      <ul className="max-h-56 overflow-y-auto py-1" role="listbox" aria-multiselectable>
        {list.length === 0 && <li className="px-3 py-4 text-center text-sm text-text-secondary">{emptyText}</li>}
        {list.map((m) => {
          const disabled = dis.has(m.id)
          const checked = sel.has(m.id) || disabled
          return (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={checked}
                disabled={disabled}
                onClick={() => toggle(m.id)}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-warm-ivory disabled:opacity-60"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-sm border text-[10px] leading-none",
                    checked ? "border-dark bg-dark text-white" : "border-text-secondary bg-card"
                  )}
                >
                  {checked ? "✓" : ""}
                </span>
                <MemberAvatar member={m} size={22} />
                <span className="min-w-0 flex-1 truncate text-sm text-dark">
                  {m.display_name}
                  {m.title && <span className="ml-1.5 text-xs text-text-secondary">{m.title}</span>}
                </span>
                {m.role === "guest" && (
                  <span className="shrink-0 rounded-sm border border-warm-tan px-1 text-xs text-text-secondary">게스트</span>
                )}
                {disabled && <span className="shrink-0 text-xs text-text-secondary">참여 중</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
