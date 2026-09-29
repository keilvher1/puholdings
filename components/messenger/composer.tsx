"use client"

// 메시지 입력창: Enter 전송 · Shift+Enter 줄바꿈(한글 조합 중 Enter 무시) · @멘션 자동완성 · 파일 첨부(버튼·붙여넣기·끌어다 놓기) ·
// 이모지 빠른 입력 · 투표/할 일 만들기 · 방별 임시 저장 · 빈 입력창에서 ↑ 키로 마지막 내 메시지 수정.
// 댓글 패널(담당 D)에서도 쓸 수 있다: <Composer room={room} parentId={messageId} placeholder="댓글 입력" />

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MutableRefObject } from "react"
import { BarChart3, ListTodo, Loader2, Paperclip, Plus, SendHorizontal, Smile, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { MessengerAttachment, MessengerMember, MessengerRoom } from "@/lib/messenger-types"
import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_MESSAGE_LENGTH, MESSENGER_MAX_FILE_BYTES } from "@/lib/messenger-types"
import { uploadFile } from "./api"
import { useMessenger } from "./store"
import { MemberAvatar, formatBytes } from "./message-item"

// 방별 임시 저장(같은 탭 안에서만). 키: 방id:부모id
const drafts = new Map<string, string>()

const EMOJIS = ["😀", "😂", "😊", "😍", "🤔", "😅", "😢", "😮", "👍", "👏", "🙏", "💪", "❤️", "🔥", "🎉", "✅", "❌", "⚠️", "📌", "📎", "👀", "☕", "🙇", "👌"]

interface StagedFile {
  key: string
  file: File
  status: "uploading" | "done" | "error"
  progress: number
  attachment?: MessengerAttachment
  error?: string
  abort: AbortController
}

interface MentionPick {
  name: string
  id: number // -1: 전체
}

interface Suggest {
  query: string
  start: number // '@' 위치
  items: { id: number; name: string; sub: string; member?: MessengerMember }[]
  index: number
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// '@이름' → '@[이름](m:ID)' 로 바꾸고 멘션 id 목록을 만든다.
export function encodeMentions(text: string, picks: MentionPick[]): { body: string; mentions: number[] } {
  let body = text
  const ids = new Set<number>()
  // 긴 이름부터(‘김철’과 ‘김철수’가 겹칠 때)
  const uniq = Array.from(new Map(picks.map((p) => [p.name, p])).values()).sort((a, b) => b.name.length - a.name.length)
  for (const p of uniq) {
    const re = new RegExp(`(^|[^\\w\\]])@${escapeRe(p.name)}(?![\\w가-힣])`, "g")
    let hit = false
    body = body.replace(re, (_all, pre: string) => {
      hit = true
      return `${pre}@[${p.name}](m:${p.id === -1 ? "all" : p.id})`
    })
    if (hit) ids.add(p.id)
  }
  return { body, mentions: Array.from(ids) }
}

export function Composer({
  room,
  parentId = null,
  placeholder,
  autoFocus = false,
  onEditLast,
  filesRef,
  className,
}: {
  room: MessengerRoom
  parentId?: number | null
  placeholder?: string
  autoFocus?: boolean
  onEditLast?: () => void // 빈 입력창에서 ↑
  filesRef?: MutableRefObject<((files: File[]) => void) | null> // 대화창 끌어다 놓기가 파일을 넘기는 통로
  className?: string
}) {
  const ctx = useMessenger()
  const { state, me } = ctx
  const draftKey = `${room.id}:${parentId ?? 0}`
  const [text, setText] = useState(() => drafts.get(draftKey) ?? "")
  const [picks, setPicks] = useState<MentionPick[]>([])
  const [files, setFiles] = useState<StagedFile[]>([])
  const [suggest, setSuggest] = useState<Suggest | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const filesStateRef = useRef<StagedFile[]>([])
  filesStateRef.current = files

  const disabled = room.is_archived

  // 임시 저장
  useEffect(() => {
    if (text) drafts.set(draftKey, text)
    else drafts.delete(draftKey)
  }, [text, draftKey])

  // 높이 자동 조절(최대 200px)
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(200, el.scrollHeight)}px`
  }, [text])

  useEffect(() => {
    if (autoFocus && !disabled) taRef.current?.focus()
  }, [autoFocus, disabled])

  // 언마운트 시 진행 중 업로드 취소
  useEffect(() => {
    return () => {
      for (const f of filesStateRef.current) if (f.status === "uploading") f.abort.abort()
    }
  }, [])

  // ── 파일 ──────────────────────────────────────────────────────────────────
  const addFiles = useCallback(
    (list: File[]) => {
      if (disabled || list.length === 0) return
      const room_id = room.id
      const current = filesStateRef.current.filter((f) => f.status !== "error").length
      const room_left = MAX_ATTACHMENTS_PER_MESSAGE - current
      if (room_left <= 0) {
        ctx.notify(`파일은 한 번에 ${MAX_ATTACHMENTS_PER_MESSAGE}개까지 보낼 수 있습니다.`, "error")
        return
      }
      const accepted = list.slice(0, room_left)
      if (list.length > room_left) ctx.notify(`파일은 한 번에 ${MAX_ATTACHMENTS_PER_MESSAGE}개까지 보낼 수 있습니다.`, "error")
      const staged: StagedFile[] = []
      for (const file of accepted) {
        if (file.size > MESSENGER_MAX_FILE_BYTES) {
          ctx.notify(`${file.name}: ${formatBytes(MESSENGER_MAX_FILE_BYTES)}보다 큰 파일은 올릴 수 없습니다.`, "error")
          continue
        }
        staged.push({
          key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          status: "uploading",
          progress: 0,
          abort: new AbortController(),
        })
      }
      if (staged.length === 0) return
      setFiles((prev) => [...prev, ...staged])
      for (const s of staged) {
        uploadFile(room_id, s.file, {
          signal: s.abort.signal,
          onProgress: (p) => setFiles((prev) => prev.map((f) => (f.key === s.key ? { ...f, progress: p.percentage } : f))),
        })
          .then((attachment) =>
            setFiles((prev) => prev.map((f) => (f.key === s.key ? { ...f, status: "done", progress: 100, attachment } : f)))
          )
          .catch((e: unknown) => {
            if ((e as Error)?.name === "AbortError") return
            setFiles((prev) =>
              prev.map((f) =>
                f.key === s.key ? { ...f, status: "error", error: e instanceof Error ? e.message : "올리지 못했습니다." } : f
              )
            )
          })
      }
      taRef.current?.focus()
    },
    [disabled, room.id, ctx]
  )

  useEffect(() => {
    if (!filesRef) return
    filesRef.current = addFiles
    return () => {
      if (filesRef.current === addFiles) filesRef.current = null
    }
  }, [filesRef, addFiles])

  const removeFile = (key: string) => {
    setFiles((prev) => {
      const f = prev.find((x) => x.key === key)
      if (f?.status === "uploading") f.abort.abort()
      return prev.filter((x) => x.key !== key)
    })
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const list = Array.from(e.clipboardData.files ?? [])
    if (list.length > 0) {
      e.preventDefault()
      // 붙여넣은 스크린샷은 이름이 image.png로 같아서 시각을 붙인다
      const named = list.map((f) =>
        f.name === "image.png" || !f.name
          ? new File([f], `붙여넣은 이미지 ${new Date().toLocaleTimeString("ko-KR").replace(/[: ]/g, "")}.png`, { type: f.type || "image/png" })
          : f
      )
      addFiles(named)
    }
  }

  // ── 멘션 자동완성 ────────────────────────────────────────────────────────
  const roomMembers = useMemo(
    () => room.member_ids.map((id) => state.members[id]).filter((m): m is MessengerMember => !!m && m.id !== me.id),
    [room.member_ids, state.members, me.id]
  )

  const updateSuggest = useCallback(
    (value: string, caret: number) => {
      const before = value.slice(0, caret)
      const m = /(^|\s)@([^\s@]{0,20})$/.exec(before)
      if (!m) {
        setSuggest(null)
        return
      }
      const query = m[2].toLowerCase()
      const start = caret - m[2].length - 1
      const items: Suggest["items"] = []
      if (room.kind === "topic" && ("전체".includes(query) || "all".startsWith(query))) {
        items.push({ id: -1, name: "전체", sub: `이 토픽 참여자 ${room.member_ids.length}명에게 알림` })
      }
      for (const mem of roomMembers) {
        if (!query || mem.display_name.toLowerCase().includes(query) || mem.title.toLowerCase().includes(query)) {
          items.push({ id: mem.id, name: mem.display_name, sub: mem.title, member: mem })
        }
        if (items.length >= 8) break
      }
      setSuggest(items.length ? { query, start, items, index: 0 } : null)
    },
    [room.kind, room.member_ids.length, roomMembers]
  )

  const applySuggest = (item: Suggest["items"][number]) => {
    const el = taRef.current
    if (!el || !suggest) return
    const caret = el.selectionStart ?? text.length
    const insert = `@${item.name} `
    const next = text.slice(0, suggest.start) + insert + text.slice(caret)
    setText(next)
    setPicks((p) => [...p, { name: item.name, id: item.id }])
    setSuggest(null)
    requestAnimationFrame(() => {
      const pos = suggest.start + insert.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  const insertAtCaret = (s: string) => {
    const el = taRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const next = text.slice(0, start) + s + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(start + s.length, start + s.length)
    })
  }

  // ── 보내기 ───────────────────────────────────────────────────────────────
  const uploading = files.some((f) => f.status === "uploading")
  const ready = files.filter((f) => f.status === "done" && f.attachment)
  const canSend = !disabled && !uploading && (text.trim().length > 0 || ready.length > 0) && text.length <= MAX_MESSAGE_LENGTH

  const submit = () => {
    if (!canSend) {
      if (uploading) ctx.notify("파일을 올리는 중입니다. 끝나면 보내 주세요.")
      return
    }
    const { body, mentions } = encodeMentions(text.trim(), picks)
    const attachments = ready.map((f) => f.attachment as MessengerAttachment)
    setText("")
    setPicks([])
    setFiles((prev) => prev.filter((f) => f.status === "error"))
    setSuggest(null)
    drafts.delete(draftKey)
    void ctx.send(room.id, { body, attachments, parent_id: parentId, mentions })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return // 한글 조합 중
    if (suggest) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSuggest({ ...suggest, index: (suggest.index + 1) % suggest.items.length })
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setSuggest({ ...suggest, index: (suggest.index - 1 + suggest.items.length) % suggest.items.length })
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        applySuggest(suggest.items[suggest.index])
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setSuggest(null)
        return
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
      return
    }
    if (e.key === "ArrowUp" && !text && files.length === 0 && onEditLast) {
      e.preventDefault()
      onEditLast()
    }
  }

  if (disabled) {
    return (
      <div className={cn("border-t border-warm-tan bg-warm-ivory px-4 py-3 text-center text-sm text-text-secondary", className)}>
        보관된 토픽입니다. 메시지를 보낼 수 없습니다.
      </div>
    )
  }

  const over = text.length > MAX_MESSAGE_LENGTH
  const nearLimit = text.length > MAX_MESSAGE_LENGTH - 500
  const ph = placeholder ?? (parentId ? "댓글 입력" : `${ctx.roomName(room)}에 메시지 보내기`)

  return (
    <div className={cn("shrink-0 border-t border-warm-tan bg-card px-3 pb-3 pt-2", className)}>
      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="첨부 파일">
          {files.map((f) => (
            <li
              key={f.key}
              className={cn(
                "flex max-w-[16rem] items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                f.status === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-warm-tan bg-warm-ivory text-dark"
              )}
              title={f.error || f.file.name}
            >
              {f.status === "uploading" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />}
              <span className="min-w-0 truncate">{f.file.name}</span>
              <span className="shrink-0 tabular-nums text-text-secondary">
                {f.status === "uploading" ? `${Math.round(f.progress)}%` : f.status === "error" ? "실패" : formatBytes(f.file.size)}
              </span>
              <button
                type="button"
                onClick={() => removeFile(f.key)}
                aria-label={`${f.file.name} 빼기`}
                className="shrink-0 rounded p-0.5 text-text-secondary hover:bg-warm-beige hover:text-dark"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        {suggest && (
          <ul
            role="listbox"
            aria-label="멘션할 사람"
            className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-72 overflow-y-auto rounded-md border border-warm-tan bg-popover p-1"
          >
            {suggest.items.map((it, i) => (
              <li key={it.id} role="option" aria-selected={i === suggest.index}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    applySuggest(it)
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left",
                    i === suggest.index ? "bg-warm-beige" : "hover:bg-warm-ivory"
                  )}
                >
                  {it.member ? (
                    <MemberAvatar member={it.member} size={24} />
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-dark text-[11px] font-semibold text-primary-foreground">@</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-dark">{it.name}</span>
                    {it.sub && <span className="block truncate text-xs text-text-secondary">{it.sub}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-1.5 rounded-md border border-warm-tan bg-card px-1.5 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="첨부·만들기"
                title="첨부·만들기"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary outline-none hover:bg-warm-beige hover:text-dark focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Plus className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-44">
              <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                <Paperclip /> 파일 첨부
              </DropdownMenuItem>
              {!parentId && (
                <>
                  <DropdownMenuItem onSelect={() => ctx.openDialog({ name: "poll", roomId: room.id })}>
                    <BarChart3 /> 투표 만들기
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => ctx.openDialog({ name: "todo", roomId: room.id })}>
                    <ListTodo /> 할 일 만들기
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []))
              e.target.value = ""
            }}
          />

          <textarea
            ref={taRef}
            value={text}
            rows={1}
            placeholder={ph}
            aria-label={ph}
            onChange={(e) => {
              setText(e.target.value)
              updateSuggest(e.target.value, e.target.selectionStart ?? e.target.value.length)
            }}
            onSelect={(e) => {
              const el = e.currentTarget
              if (suggest) updateSuggest(el.value, el.selectionStart ?? el.value.length)
            }}
            onBlur={() => setTimeout(() => setSuggest(null), 120)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            className="max-h-[200px] min-h-8 flex-1 resize-none bg-transparent px-1 py-1 text-[15px] leading-6 text-dark outline-none placeholder:text-text-secondary"
          />

          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="이모지"
                title="이모지"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary outline-none hover:bg-warm-beige hover:text-dark focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Smile className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-auto p-1.5">
              <div className="grid grid-cols-8 gap-0.5">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      insertAtCaret(e)
                      setEmojiOpen(false)
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-warm-beige"
                    aria-label={e}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            size="icon-sm"
            onClick={submit}
            disabled={!canSend}
            aria-label="보내기"
            title={uploading ? "파일을 올리는 중" : "보내기 (Enter)"}
            className="shrink-0"
          >
            <SendHorizontal />
          </Button>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 px-1 text-xs text-text-secondary">
        <span className="hidden truncate sm:inline">Enter 보내기 · Shift+Enter 줄바꿈 · @ 멘션</span>
        {nearLimit && (
          <span className={cn("ml-auto tabular-nums", over && "font-semibold text-destructive")}>
            {text.length.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}
