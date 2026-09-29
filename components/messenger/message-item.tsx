"use client"

// 메시지 한 개 + 공용 표현 조각(아바타·시간·본문 렌더러·첨부).
// 담당 D(thread-panel 등)도 import해 쓸 수 있다:
//   <MessageItem message={m} inThread />      — 댓글 패널에서(댓글 버튼·댓글 수 숨김)
//   <MemberAvatar member={m} size={32} />      · presenceOf(member)
//   <MessageBody body={m.body} />              · <AttachmentList attachments={...} />
//   formatTime(iso) · formatDateLabel(iso) · formatBytes(n)

import { Fragment, useEffect, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type MouseEvent, type ReactNode } from "react"
import {
  Bell,
  Copy,
  Download,
  FileText,
  ListTodo,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  RotateCw,
  Share2,
  SmilePlus,
  Star,
  Trash2,
  Webhook,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { MessengerAttachment, MessengerMember, MessengerMessage } from "@/lib/messenger-types"
import { MAX_MESSAGE_LENGTH, QUICK_REACTIONS } from "@/lib/messenger-types"
import { fileUrl } from "./api"
import { mentionsMe, type PendingMessage, useMessenger } from "./store"
import { PollCard } from "./poll-card"
import { TodoCard } from "./todo-card"

// ── 시간·크기 표기 ───────────────────────────────────────────────────────────

const TIME_FMT = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" })
const DATE_FMT = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" })
const SHORT_DATE_FMT = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" })

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : TIME_FMT.format(d)
}

export function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

// 날짜 구분선: 오늘 / 어제 / 2026년 9월 29일 (화)
export function formatDateLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (dayKey(iso) === dayKey(today.toISOString())) return "오늘"
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "어제"
  return DATE_FMT.format(d)
}

// 목록용 짧은 시각: 오늘이면 시각, 아니면 월.일
export function formatShortStamp(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return dayKey(iso) === dayKey(new Date().toISOString()) ? TIME_FMT.format(d) : SHORT_DATE_FMT.format(d)
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0B"
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

// ── 아바타·접속 상태 ─────────────────────────────────────────────────────────

export type Presence = "online" | "away" | "offline"

// 최근 3분 안에 동기화했으면 접속 중으로 본다.
export function presenceOf(m: Pick<MessengerMember, "away" | "last_seen_at">): Presence {
  if (m.away) return "away"
  if (!m.last_seen_at) return "offline"
  const t = new Date(m.last_seen_at).getTime()
  return Date.now() - t < 3 * 60 * 1000 ? "online" : "offline"
}

function initials(name: string): string {
  const n = name.trim()
  if (!n) return "?"
  // 한글 이름은 뒤 두 글자(예: 홍길동 → 길동), 영문은 앞 글자 두 개
  if (/[가-힣]/.test(n)) return n.replace(/\s+/g, "").slice(-2)
  const parts = n.split(/\s+/)
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase()
}

export function MemberAvatar({
  member,
  label,
  color,
  size = 36,
  presence,
  icon,
  className,
}: {
  member?: Pick<MessengerMember, "display_name" | "avatar_color"> | null
  label?: string // member가 없을 때(웹훅·시스템) 표시 이름
  icon?: ReactNode // 이니셜 대신 보일 아이콘(웹훅·시스템 발신자)
  color?: string
  size?: number
  presence?: Presence
  className?: string
}) {
  const name = member?.display_name ?? label ?? "?"
  const bg = color ?? member?.avatar_color ?? "#475569"
  const dot = Math.max(8, Math.round(size / 4))
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }} aria-hidden>
      <span
        className="flex h-full w-full items-center justify-center rounded-md font-semibold text-white"
        style={{ backgroundColor: bg, fontSize: Math.max(10, Math.round(size * 0.36)) }}
      >
        {icon ?? initials(name)}
      </span>
      {presence && presence !== "offline" && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-card",
            presence === "online" ? "bg-green-600" : "bg-amber-500"
          )}
          style={{ width: dot, height: dot }}
        />
      )}
    </span>
  )
}

// ── 본문 렌더러(간단 마크다운) ───────────────────────────────────────────────
// 지원: @멘션 토큰, **굵게**, `코드`, ```코드 블록```, [링크](https://…), [링크](/사이트 안 경로), 맨 URL 자동 링크, 줄바꿈.
// 사이트 안 경로는 '/'로 시작하고 '//'·'/\'(다른 사이트로 해석됨)는 받지 않는다. 다른 스킴(javascript: 등)은 링크로 만들지 않는다.

const INLINE_RE =
  /@\[([^\]]{1,60})\]\(m:(\d+|all)\)|\*\*([^*\n]+?)\*\*|`([^`\n]+)`|\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+|\/(?![\/\\])[^\s)\\]*)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return null
  }
}

// 링크 글자가 주소처럼 보이면(https://… 또는 example.com/…) 그 호스트. 아니면 null.
function textHost(text: string): string | null {
  const t = text.trim()
  if (/^https?:\/\//i.test(t)) return hostOf(t)
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t)) return hostOf(`https://${t}`)
  return null
}

const LINK_CLASS = "text-blue-700 underline underline-offset-2 hover:text-blue-900"

// [글자](주소) 링크. 글자와 실제 목적지가 다르게 보이지 않도록(피싱 방지):
// - 사이트 안 경로: 같은 탭 링크.
// - 글자가 주소처럼 보이는데 호스트가 다르면 실제 주소를 그대로 보여 준다.
// - 글자가 일반 문구면 뒤에 실제 호스트를 작게 붙인다.
function renderLink(key: string, text: string, href: string): ReactNode {
  if (href.startsWith("/")) {
    return (
      <a key={key} href={href} className={LINK_CLASS}>
        {text}
      </a>
    )
  }
  const host = hostOf(href)
  const shown = textHost(text)
  if (shown !== null && shown !== host) {
    return (
      <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={cn("break-all", LINK_CLASS)}>
        {href}
      </a>
    )
  }
  return (
    <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
      {text}
      {shown === null && host && <span className="ml-0.5 text-xs text-text-secondary no-underline">({host})</span>}
    </a>
  )
}

function renderInline(text: string, meId: number | null, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  INLINE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const key = `${keyBase}-${i++}`
    if (m[1] !== undefined) {
      const isMe = m[2] === "all" || (meId !== null && Number(m[2]) === meId)
      out.push(
        <span
          key={key}
          className={cn("rounded-sm px-0.5 font-semibold", isMe ? "bg-gold/30 text-dark" : "bg-warm-beige text-dark")}
        >
          @{m[1]}
        </span>
      )
    } else if (m[3] !== undefined) {
      out.push(
        <strong key={key} className="font-semibold">
          {m[3]}
        </strong>
      )
    } else if (m[4] !== undefined) {
      out.push(
        <code key={key} className="rounded-sm border border-warm-tan bg-warm-ivory px-1 font-mono text-[13px]">
          {m[4]}
        </code>
      )
    } else if (m[5] !== undefined) {
      out.push(renderLink(key, m[5], m[6]))
    } else if (m[7] !== undefined) {
      out.push(
        <a key={key} href={m[7]} target="_blank" rel="noopener noreferrer" className="break-all text-blue-700 underline underline-offset-2 hover:text-blue-900">
          {m[7]}
        </a>
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function MessageBody({ body, className }: { body: string; className?: string }) {
  const ctx = useMessenger()
  const meId = ctx.me.id
  const blocks = useMemo(() => {
    // ```로 감싼 코드 블록과 일반 글을 나눈다
    const parts: { code: boolean; text: string }[] = []
    const re = /```(?:[a-zA-Z0-9_-]*\n)?([\s\S]*?)```/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(body))) {
      if (m.index > last) parts.push({ code: false, text: body.slice(last, m.index) })
      parts.push({ code: true, text: m[1].replace(/\n$/, "") })
      last = m.index + m[0].length
    }
    if (last < body.length) parts.push({ code: false, text: body.slice(last) })
    return parts
  }, [body])

  return (
    <div className={cn("whitespace-pre-wrap break-words text-[15px] leading-6 text-dark [word-break:break-word]", className)}>
      {blocks.map((b, bi) =>
        b.code ? (
          <pre
            key={bi}
            className="my-1 overflow-x-auto whitespace-pre rounded-md border border-warm-tan bg-warm-ivory px-3 py-2 font-mono text-[13px] leading-5"
          >
            {b.text}
          </pre>
        ) : (
          <Fragment key={bi}>{renderInline(b.text, meId, String(bi))}</Fragment>
        )
      )}
    </div>
  )
}

// ── 첨부 ─────────────────────────────────────────────────────────────────────

export function isImageAttachment(a: Pick<MessengerAttachment, "type" | "name">): boolean {
  if (a.type === "image/svg+xml") return false
  return a.type.startsWith("image/") || /\.(jpe?g|png|gif|webp)$/i.test(a.name)
}

export function AttachmentList({ attachments, className }: { attachments: MessengerAttachment[]; className?: string }) {
  if (attachments.length === 0) return null
  const images = attachments.filter(isImageAttachment)
  const files = attachments.filter((a) => !isImageAttachment(a))
  return (
    <div className={cn("mt-1.5 space-y-1.5", className)}>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {images.map((a) => (
            <ImageThumb key={a.pathname} a={a} single={images.length === 1} />
          ))}
        </div>
      )}
      {files.map((a) => (
        <FileCard key={a.pathname} a={a} />
      ))}
    </div>
  )
}

function ImageThumb({ a, single }: { a: MessengerAttachment; single: boolean }) {
  const [failed, setFailed] = useState(false)
  const w = a.width ?? 0
  const h = a.height ?? 0
  const maxW = single ? 360 : 180
  const maxH = single ? 280 : 180
  let style: CSSProperties | undefined
  if (w > 0 && h > 0) {
    const scale = Math.min(1, maxW / w, maxH / h)
    style = { width: Math.round(w * scale), height: Math.round(h * scale) }
  }
  if (failed) return <FileCard a={a} />
  return (
    <a
      href={fileUrl(a.pathname)}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-md border border-warm-tan bg-warm-ivory outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      title={a.name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={fileUrl(a.pathname)}
        alt={a.name}
        loading="lazy"
        onError={() => setFailed(true)}
        style={style ?? { maxWidth: maxW, maxHeight: maxH }}
        className="block object-cover"
      />
    </a>
  )
}

function FileCard({ a }: { a: MessengerAttachment }) {
  const ext = (a.name.split(".").pop() || "").toUpperCase().slice(0, 4)
  return (
    <div className="flex w-full max-w-sm items-center gap-2.5 rounded-md border border-warm-tan bg-card px-2.5 py-2">
      <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-sm bg-warm-beige text-text-secondary">
        <FileText className="h-4 w-4" aria-hidden />
        {ext && <span className="text-[9px] font-semibold leading-none">{ext}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <a
          href={fileUrl(a.pathname)}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-medium text-dark hover:underline"
          title={a.name}
        >
          {a.name}
        </a>
        <span className="block text-xs text-text-secondary tabular-nums">{formatBytes(a.size)}</span>
      </span>
      <a
        href={fileUrl(a.pathname, { download: true, name: a.name })}
        className="rounded-md p-1.5 text-text-secondary outline-none hover:bg-warm-beige hover:text-dark focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label={`${a.name} 내려받기`}
        title="내려받기"
      >
        <Download className="h-4 w-4" />
      </a>
    </div>
  )
}

// 커넥트(웹훅) 블록: 왼쪽 색 막대 + 제목·설명 목록
export function ConnectBlock({ color, info }: { color: string; info: { title: string; description: string }[] }) {
  if (info.length === 0) return null
  const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "var(--warm-tan)"
  return (
    <div className="mt-1.5 max-w-xl space-y-1.5 border-l-4 py-0.5 pl-3" style={{ borderLeftColor: safeColor }}>
      {info.map((it, i) => (
        <div key={i}>
          {it.title && <p className="text-sm font-semibold text-dark">{it.title}</p>}
          {it.description && <p className="whitespace-pre-wrap break-words text-sm text-dark/90">{it.description}</p>}
        </div>
      ))}
    </div>
  )
}

// ── 메시지 ───────────────────────────────────────────────────────────────────

// 편집용: 멘션 토큰을 '@이름'으로 보여 주고, 저장할 때 원래 토큰으로 되돌린다.
const MENTION_TOKEN_RE = /@\[([^\]]{1,60})\]\(m:(\d+|all)\)/g

function toEditable(body: string): { text: string; tokens: { name: string; token: string }[] } {
  const tokens: { name: string; token: string }[] = []
  const text = body.replace(MENTION_TOKEN_RE, (full, name: string) => {
    tokens.push({ name, token: full })
    return `@${name}`
  })
  return { text, tokens }
}

function fromEditable(text: string, tokens: { name: string; token: string }[]): string {
  let out = text
  for (const t of tokens) {
    const plain = `@${t.name}`
    const idx = out.indexOf(plain)
    if (idx >= 0) out = out.slice(0, idx) + t.token + out.slice(idx + plain.length)
  }
  return out
}

export interface MessageItemProps {
  message: MessengerMessage
  compact?: boolean // 같은 작성자 연속 메시지(아바타·이름 생략)
  inThread?: boolean // 댓글 패널 안(댓글 버튼·댓글 수 숨김)
  pending?: PendingMessage // 보내는 중·실패한 내 메시지
  highlighted?: boolean // 이동 대상 강조
  editing?: boolean // (선택) 목록이 편집 상태를 관리할 때(↑ 키로 마지막 내 메시지 수정)
  onEditDone?: () => void
}

export function MessageItem({ message: m, compact = false, inThread = false, pending, highlighted = false, editing: editingProp, onEditDone }: MessageItemProps) {
  const ctx = useMessenger()
  const { me, state } = ctx
  const [editingLocal, setEditingLocal] = useState(false)
  const editing = editingProp ?? editingLocal
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [touchOpen, setTouchOpen] = useState(false)
  const [reactOpen, setReactOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const author = m.author_id ? state.members[m.author_id] : null
  const isMine = m.author_id === me.id
  const room = state.rooms[m.room_id]
  const isBot = !m.author_id
  const mentioned = mentionsMe(m, me.id)
  const canManage = room ? ctx.canManageRoom(room) : false
  const isPending = !!pending
  const actionable = !isPending && !m.deleted
  const endEdit = () => {
    setEditingLocal(false)
    onEditDone?.()
  }

  // 시스템 한 줄(참여·퇴장 등): 발신자 이름·커넥트가 없는 system 메시지
  if (m.kind === "system" && !m.author_label && m.connect_info.length === 0 && m.attachments.length === 0) {
    return (
      <div data-message-id={m.id} className="px-4 py-1 text-center text-xs text-text-secondary [word-break:keep-all]">
        {m.body.replace(MENTION_TOKEN_RE, "@$1")}
        <span className="ml-1.5 tabular-nums">{formatTime(m.created_at)}</span>
      </div>
    )
  }

  const displayName = author?.display_name ?? (m.author_label || (m.author_id ? "알 수 없음" : "알림"))

  const onRowClick = (e: MouseEvent) => {
    if (typeof window === "undefined" || !window.matchMedia("(hover: none)").matches) return
    if ((e.target as HTMLElement).closest("a,button,input,textarea,[role=menu]")) return
    setTouchOpen((v) => !v)
  }

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(m.body.replace(MENTION_TOKEN_RE, "@$1"))
      ctx.notify("복사했습니다.")
    } catch {
      ctx.notify("복사하지 못했습니다.", "error")
    }
  }

  const showActions = actionable && !editing
  const reactionNames = (ids: number[]) => ids.map((id) => ctx.memberName(id)).join(", ")

  return (
    <div
      data-message-id={m.id}
      onClick={onRowClick}
      className={cn(
        "group relative flex gap-3 px-4 transition-colors",
        compact ? "py-0.5" : "pt-2 pb-0.5",
        mentioned && !m.deleted ? "border-l-2 border-gold bg-gold/5 pl-[14px]" : "",
        highlighted ? "bg-gold/20" : "hover:bg-warm-ivory/70",
        isPending && pending?.status === "sending" && "opacity-60"
      )}
    >
      {/* 왼쪽 칸: 아바타 또는(연속 메시지) 시각 */}
      <div className="w-9 shrink-0">
        {compact ? (
          <span className="block pt-1 text-right text-[11px] leading-5 text-text-secondary opacity-0 tabular-nums group-hover:opacity-100">
            {formatTime(m.created_at).replace(/^(오전|오후)\s*/, "")}
          </span>
        ) : author ? (
          <button
            type="button"
            onClick={() => ctx.openDialog({ name: "profile", memberId: author.id })}
            className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label={`${author.display_name} 프로필`}
          >
            <MemberAvatar member={author} size={36} />
          </button>
        ) : (
          <MemberAvatar
            label={displayName}
            color={isBot ? "#1a1a2e" : undefined}
            icon={isBot ? m.author_label ? <Webhook className="size-4" /> : <Bell className="size-4" /> : undefined}
            size={36}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex flex-wrap items-baseline gap-x-2 leading-5">
            <span className="text-sm font-bold text-dark">{displayName}</span>
            {isBot && (
              <span className="rounded-sm border border-warm-tan bg-warm-beige px-1 text-[11px] font-medium text-dark">
                {m.author_label ? "연동" : "시스템"}
              </span>
            )}
            {author?.role === "guest" && (
              <span className="rounded-sm border border-warm-tan px-1 text-[11px] text-text-secondary">게스트</span>
            )}
            {author?.title && <span className="max-w-[16rem] truncate text-xs text-text-secondary">{author.title}</span>}
            <span className="text-xs text-text-secondary tabular-nums" title={new Date(m.created_at).toLocaleString("ko-KR")}>
              {formatTime(m.created_at)}
            </span>
          </div>
        )}

        {m.shared_from && !m.deleted && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-text-secondary">
            {m.kind === "todo" ? (
              <>
                <ListTodo className="h-3 w-3" aria-hidden />
                {m.shared_from.author_name ? `${m.shared_from.author_name}님의 메시지를 할 일로 등록` : "메시지를 할 일로 등록"}
              </>
            ) : (
              <>
                <Share2 className="h-3 w-3" aria-hidden />
                {m.shared_from.room_name ? `${m.shared_from.room_name}에서 ` : ""}
                {m.shared_from.author_name ? `${m.shared_from.author_name}님의 메시지를 공유` : "메시지 공유"}
              </>
            )}
          </p>
        )}

        {m.deleted ? (
          <p className="text-sm italic text-text-secondary">삭제된 메시지입니다.</p>
        ) : editing ? (
          <EditBox message={m} onDone={endEdit} />
        ) : (
          <>
            {m.body && (m.kind !== "poll" || !m.poll) && (m.kind !== "todo" || !m.todo) && (
              <div className={cn(m.shared_from && "mt-1 border-l-2 border-warm-tan pl-2.5")}>
                <MessageBody body={m.body} />
              </div>
            )}
            <ConnectBlock color={m.connect_color} info={m.connect_info} />
            <AttachmentList attachments={m.attachments} />
            {m.poll && (
              <div className="mt-1.5 max-w-md">
                <PollCard message={m} poll={m.poll} />
              </div>
            )}
            {m.todo && (
              <div className="mt-1.5 max-w-md">
                <TodoCard message={m} todo={m.todo} />
              </div>
            )}
          </>
        )}

        {/* 수정됨 · 안 읽은 사람 수 · 전송 상태 */}
        {(m.edited_at || m.unread_by > 0 || isPending) && !m.deleted && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs leading-5">
            {m.edited_at && <span className="text-text-secondary">(수정됨)</span>}
            {m.unread_by > 0 && !isPending && (
              <span className="font-semibold text-amber-700 tabular-nums" title={`${m.unread_by}명이 아직 읽지 않았습니다`}>
                {m.unread_by}
              </span>
            )}
            {pending?.status === "sending" && <span className="text-text-secondary">보내는 중</span>}
            {pending?.status === "failed" && (
              <span className="inline-flex flex-wrap items-center gap-2 text-destructive">
                {pending.error || "보내지 못했습니다."}
                <button
                  type="button"
                  onClick={() => void ctx.retryPending(pending.temp_id)}
                  className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2"
                >
                  <RotateCw className="h-3 w-3" aria-hidden /> 다시 보내기
                </button>
                <button type="button" onClick={() => ctx.discardPending(pending.temp_id)} className="font-medium underline underline-offset-2">
                  지우기
                </button>
              </span>
            )}
          </div>
        )}

        {/* 반응 */}
        {m.reactions.length > 0 && !m.deleted && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {m.reactions.map((r) => {
              const mine = r.member_ids.includes(me.id)
              return (
                <button
                  key={r.emoji}
                  type="button"
                  disabled={!actionable}
                  onClick={() => void ctx.toggleReaction(m.id, r.emoji)}
                  title={reactionNames(r.member_ids)}
                  aria-pressed={mine}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    mine ? "border-dark/60 bg-warm-beige font-semibold text-dark" : "border-warm-tan bg-card text-dark hover:bg-warm-ivory"
                  )}
                >
                  <span className="text-sm leading-none">{r.emoji}</span>
                  <span className="tabular-nums">{r.count}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* 댓글 요약 */}
        {!inThread && m.reply_count > 0 && !isPending && (
          <button
            type="button"
            onClick={() => ctx.openPanel("thread", { threadId: m.id })}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-semibold text-blue-700 outline-none hover:bg-warm-beige focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            댓글 {m.reply_count}
            {m.last_reply_at && <span className="font-normal text-text-secondary">· 마지막 {formatShortStamp(m.last_reply_at)}</span>}
          </button>
        )}
      </div>

      {/* 마우스를 올리면 나오는 동작 줄 */}
      {showActions && (
        <div
          className={cn(
            "absolute -top-3 right-3 z-10 items-center rounded-md border border-warm-tan bg-card p-0.5",
            touchOpen || reactOpen || menuOpen ? "flex" : "hidden group-hover:flex group-focus-within:flex"
          )}
        >
          <Popover open={reactOpen} onOpenChange={setReactOpen}>
            <PopoverTrigger asChild>
              <ToolButton label="반응 남기기">
                <SmilePlus />
              </ToolButton>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-1.5">
              <div className="grid grid-cols-8 gap-0.5">
                {QUICK_REACTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      setReactOpen(false)
                      void ctx.toggleReaction(m.id, e)
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-warm-beige"
                    aria-label={`반응 ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          {!inThread && (
            <ToolButton label="댓글" onClick={() => ctx.openPanel("thread", { threadId: m.id })}>
              <MessageSquare />
            </ToolButton>
          )}
          <ToolButton label={m.bookmarked ? "별표 해제" : "별표"} onClick={() => void ctx.toggleBookmark(m.id)}>
            <Star className={cn(m.bookmarked && "fill-gold text-gold")} />
          </ToolButton>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <ToolButton label="더 보기">
                <MoreHorizontal />
              </ToolButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => ctx.openDialog({ name: "share", messageId: m.id })}>
                <Share2 /> 다른 방에 공유
              </DropdownMenuItem>
              {room && room.kind === "topic" && ctx.isMember && !m.parent_id && (
                room.announcement?.id === m.id ? (
                  <DropdownMenuItem onSelect={() => void ctx.pinAnnouncement(room.id, null)}>
                    <Pin /> 공지 내리기
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => void ctx.pinAnnouncement(room.id, m.id)}>
                    <Pin /> 공지로 고정
                  </DropdownMenuItem>
                )
              )}
              <DropdownMenuItem
                onSelect={() =>
                  ctx.openDialog({
                    name: "todo",
                    roomId: m.room_id,
                    messageId: m.id,
                    defaultTitle: m.body.replace(MENTION_TOKEN_RE, "@$1").replace(/\s+/g, " ").trim().slice(0, 300),
                  })
                }
              >
                <ListTodo /> 할 일로 만들기
              </DropdownMenuItem>
              {m.body && (
                <DropdownMenuItem onSelect={() => void copyText()}>
                  <Copy /> 텍스트 복사
                </DropdownMenuItem>
              )}
              {(isMine || canManage) && <DropdownMenuSeparator />}
              {isMine && (m.kind === "text" || m.kind === "file") && (
                <DropdownMenuItem onSelect={() => setEditingLocal(true)}>
                  <Pencil /> 수정
                </DropdownMenuItem>
              )}
              {(isMine || canManage) && (
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 /> 삭제
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>메시지를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              삭제하면 모든 참여자에게 &lsquo;삭제된 메시지입니다&rsquo;로 보이고 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void ctx.deleteMessage(m.id)}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ToolButton({ label, children, className, ...rest }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-sm text-text-secondary outline-none hover:bg-warm-beige hover:text-dark focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:h-4 [&_svg]:w-4",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

function EditBox({ message, onDone }: { message: MessengerMessage; onDone: () => void }) {
  const ctx = useMessenger()
  const initial = useMemo(() => toEditable(message.body), [message.body])
  const [text, setText] = useState(initial.text)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const save = async () => {
    const body = fromEditable(text, initial.tokens).trim()
    if (!body && message.attachments.length === 0) return
    if (body === message.body.trim()) return onDone()
    setSaving(true)
    const ok = await ctx.editMessage(message.id, body)
    setSaving(false)
    if (ok) onDone()
  }

  return (
    <div className="mt-1">
      <textarea
        ref={ref}
        value={text}
        maxLength={MAX_MESSAGE_LENGTH}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            void save()
          } else if (e.key === "Escape") {
            e.preventDefault()
            onDone()
          }
        }}
        rows={Math.min(8, Math.max(2, text.split("\n").length))}
        className="w-full resize-none rounded-md border border-warm-tan bg-card px-3 py-2 text-[15px] leading-6 text-dark outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label="메시지 수정"
      />
      <div className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          저장
        </Button>
        <Button size="sm" variant="outline" onClick={onDone} disabled={saving}>
          취소
        </Button>
        <span>Enter 저장 · Esc 취소</span>
      </div>
    </div>
  )
}
