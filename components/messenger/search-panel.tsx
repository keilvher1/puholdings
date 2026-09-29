"use client"

// 검색 패널. 오른쪽 패널의 '검색' 탭 내용. 메시지·파일·멤버, 전체 방 또는 이 방. 입력 300ms 뒤 검색.
//
// export function SearchPanel(props: { room: MessengerRoom | null; initialQuery?: string })
//   initialQuery: ctx.panel.searchQuery(사이드바 검색·Ctrl/Cmd+K로 열 때)
// API: GET search?q=&type=messages|files|members&room_id? → { messages } | { files } | { members } (대안 키: results)
// 결과 클릭: 메시지 → 그 방으로 이동(댓글이면 원본 + 댓글 탭), 파일 → 메시지로 이동, 멤버 → 프로필

import { useEffect, useRef, useState } from "react"
import { Loader2, Search, X } from "lucide-react"
import type { MessengerMember, MessengerMessage, MessengerRoom } from "@/lib/messenger-types"
import { messengerApi } from "./api"
import { FileItemRow, normalizeFileItems, type MessengerFileItem } from "./files-panel"
import { MemberAvatar, presenceOf } from "./message-item"
import { useMessenger } from "./store"
import { errText, MessageSnippet, PanelEmpty, PanelError, pickArray, presenceLabel, Segmented, useJump } from "./panel-kit"

type SearchType = "messages" | "files" | "members"

type Result =
  | { type: "messages"; items: MessengerMessage[] }
  | { type: "files"; items: MessengerFileItem[] }
  | { type: "members"; items: MessengerMember[] }

const TYPE_LABEL: Record<SearchType, string> = { messages: "메시지", files: "파일", members: "멤버" }
const TYPE_OBJECT: Record<SearchType, string> = { messages: "메시지를", files: "파일을", members: "멤버를" }

export function SearchPanel({ room, initialQuery = "" }: { room: MessengerRoom | null; initialQuery?: string }) {
  const ctx = useMessenger()
  const jump = useJump()
  const [q, setQ] = useState(initialQuery)
  const [type, setType] = useState<SearchType>("messages")
  const [thisRoom, setThisRoom] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setQ(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const scopeRoomId = thisRoom && room && type !== "members" ? room.id : null

  useEffect(() => {
    const query = q.trim()
    const my = ++seq.current
    if (!query) {
      setResult(null)
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, type })
        if (scopeRoomId != null) params.set("room_id", String(scopeRoomId))
        const res = await messengerApi.get(`search?${params}`)
        if (my !== seq.current) return
        if (type === "messages") setResult({ type, items: pickArray<MessengerMessage>(res, ["messages", "results", "items"]) })
        else if (type === "files") setResult({ type, items: normalizeFileItems(res) })
        else setResult({ type, items: pickArray<MessengerMember>(res, ["members", "results", "items"]) })
        setError(null)
      } catch (e) {
        if (my === seq.current) setError(errText(e, "검색하지 못했습니다."))
      } finally {
        if (my === seq.current) setLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q, type, scopeRoomId])

  const query = q.trim()
  const current = result && result.type === type ? result : null
  const count = current?.items.length ?? 0
  const roomLabel = (id: number) => {
    const r = ctx.state.rooms[id]
    return r ? ctx.roomName(r) : undefined
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-2 border-b border-warm-tan px-3 py-2.5">
        <label className="flex h-9 items-center gap-2 rounded-md border border-warm-tan bg-card px-2 focus-within:border-dark/50">
          {loading ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-text-secondary" aria-hidden />
          ) : (
            <Search className="size-4 shrink-0 text-text-secondary" aria-hidden />
          )}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && q) {
                e.stopPropagation()
                setQ("")
              }
            }}
            placeholder="검색어 입력"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-secondary"
            aria-label="검색어"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} className="rounded-sm p-0.5 text-text-secondary hover:text-dark" aria-label="검색어 지우기">
              <X className="size-4" />
            </button>
          )}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="검색 대상"
            value={type}
            onChange={setType}
            options={(["messages", "files", "members"] as const).map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
          />
          {room && type !== "members" && (
            <label className="ml-auto flex items-center gap-1.5 text-xs text-text-secondary">
              <input type="checkbox" checked={thisRoom} onChange={(e) => setThisRoom(e.target.checked)} className="size-3.5 accent-[var(--dark)]" />이 방에서만
            </label>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!query ? (
          <PanelEmpty>내가 참여한 방의 {TYPE_OBJECT[type]} 찾습니다.</PanelEmpty>
        ) : error ? (
          <PanelError message={error} />
        ) : !current ? (
          loading ? null : <PanelEmpty>검색 중</PanelEmpty>
        ) : count === 0 ? (
          <PanelEmpty>&lsquo;{query}&rsquo; 검색 결과가 없습니다.</PanelEmpty>
        ) : (
          <>
            <p className="px-3 pt-2 pb-1 text-xs tabular-nums text-text-secondary">
              {count}건{count >= 50 ? " (최근 50건까지 표시)" : ""}
            </p>
            {current.type === "messages" && (
              <div>
                {current.items.map((m) => (
                  <MessageSnippet
                    key={m.id}
                    message={m}
                    roomName={roomLabel(m.room_id)}
                    query={query}
                    onClick={() => jump(m.room_id, m.id, m.parent_id)}
                  />
                ))}
              </div>
            )}
            {current.type === "files" && (
              <ul>
                {current.items.map((f) => (
                  <FileItemRow
                    key={`${f.message_id}-${f.pathname}`}
                    item={f}
                    roomName={roomLabel(f.room_id)}
                    onJump={() => jump(f.room_id, f.message_id, f.parent_id)}
                  />
                ))}
              </ul>
            )}
            {current.type === "members" && (
              <ul>
                {current.items.map((raw) => {
                  const m = ctx.state.members[raw.id] ?? raw
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => ctx.openDialog({ name: "profile", memberId: m.id })}
                        className="flex w-full items-center gap-2.5 border-b border-warm-tan/70 px-3 py-2 text-left hover:bg-warm-ivory"
                      >
                        <MemberAvatar member={m} size={32} presence={presenceOf(m)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-dark">
                            {m.display_name}
                            {m.role === "guest" && <span className="ml-1.5 text-xs font-normal text-text-secondary">게스트</span>}
                          </span>
                          <span className="block truncate text-xs text-text-secondary">{m.title || presenceLabel(m)}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}
