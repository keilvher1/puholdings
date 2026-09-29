"use client"

// 파일 모아보기 패널. 오른쪽 패널의 '파일' 탭 내용. 이름 검색 · 전체/이미지/문서 필터 · 이미지 격자.
//
// export function FilesPanel(props: { room: MessengerRoom })
// export interface MessengerFileItem extends MessengerAttachment { message_id; room_id; author_id; created_at }
// export function normalizeFileItems(data: unknown): MessengerFileItem[]   — 검색 패널의 파일 결과에도 사용
// export function FileItemRow(props: { item: MessengerFileItem; roomName?: string; onJump?: () => void })
// API: GET rooms/[id]/files?before=MESSAGE_ID → { files: MessengerFileItem[], has_more } (최신 먼저, 한 번에 최대 100) — '더 보기'로 이어 받기
//   (대안도 받음: 항목이 { attachment, message_id, ... } 이거나 첨부가 든 메시지 배열 { messages })
// 이 방의 마지막 메시지 id가 바뀌면 조용히 다시 불러온다.

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { CornerDownRight, Download, Loader2, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MessengerAttachment, MessengerMessage, MessengerRoom } from "@/lib/messenger-types"
import { fileUrl, messengerApi } from "./api"
import { formatBytes, isImageAttachment } from "./message-item"
import { useMessenger } from "./store"
import { errText, formatDateTime, PanelEmpty, PanelError, PanelLoading, pickArray, Segmented, useJump, usePanelFetch } from "./panel-kit"

export interface MessengerFileItem extends MessengerAttachment {
  message_id: number
  room_id: number
  author_id: number | null
  created_at: string
  parent_id?: number | null // 댓글에 붙은 파일이면 원본 메시지 id(서버가 주면)
}

type RawItem = Partial<MessengerFileItem> & { attachment?: MessengerAttachment; attachments?: MessengerAttachment[] }

export function normalizeFileItems(data: unknown): MessengerFileItem[] {
  const out: MessengerFileItem[] = []
  for (const f of pickArray<RawItem>(data, ["files", "items", "results"])) {
    const base = {
      message_id: Number(f.message_id ?? 0),
      room_id: Number(f.room_id ?? 0),
      author_id: f.author_id ?? null,
      created_at: f.created_at ?? "",
      parent_id: f.parent_id ?? null,
    }
    if (f.attachment) out.push({ ...f.attachment, ...base })
    else if (Array.isArray(f.attachments)) for (const a of f.attachments) out.push({ ...a, ...base })
    else if (f.pathname) out.push({ name: f.name ?? "", pathname: f.pathname, size: f.size ?? 0, type: f.type ?? "", width: f.width, height: f.height, ...base })
  }
  if (out.length === 0) {
    for (const m of pickArray<MessengerMessage>(data, ["messages"])) {
      for (const a of m.attachments ?? []) out.push({ ...a, message_id: m.id, room_id: m.room_id, author_id: m.author_id, created_at: m.created_at, parent_id: m.parent_id })
    }
  }
  return out
}

type Filter = "all" | "image" | "doc"

export function FileItemRow({ item, roomName, onJump }: { item: MessengerFileItem; roomName?: string; onJump?: () => void }) {
  const ctx = useMessenger()
  const image = isImageAttachment(item)
  const ext = (item.name.split(".").pop() || "").toUpperCase().slice(0, 4)
  const openHref = image ? fileUrl(item.pathname) : fileUrl(item.pathname, { download: true, name: item.name })
  return (
    <li className="flex items-center gap-2.5 border-b border-warm-tan/70 px-3 py-2 last:border-b-0">
      <a
        href={openHref}
        target={image ? "_blank" : undefined}
        rel={image ? "noopener noreferrer" : undefined}
        className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-warm-tan bg-warm-beige"
        aria-label={`${item.name} ${image ? "크게 보기" : "내려받기"}`}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(item.pathname)} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="text-[10px] font-semibold text-dark">{ext || "FILE"}</span>
        )}
      </a>
      <div className="min-w-0 flex-1">
        <a
          href={openHref}
          target={image ? "_blank" : undefined}
          rel={image ? "noopener noreferrer" : undefined}
          className="block truncate text-sm font-medium text-dark hover:underline"
          title={item.name}
        >
          {item.name}
        </a>
        <p className="truncate text-xs text-text-secondary">
          <span className="tabular-nums">{formatBytes(item.size)}</span> · {ctx.memberName(item.author_id)}
          {item.created_at ? ` · ${formatDateTime(item.created_at)}` : ""}
          {roomName ? ` · ${roomName}` : ""}
        </p>
      </div>
      <a
        href={fileUrl(item.pathname, { download: true, name: item.name })}
        className="shrink-0 rounded-sm p-1 text-text-secondary hover:bg-warm-ivory hover:text-dark"
        aria-label={`${item.name} 내려받기`}
        title="내려받기"
      >
        <Download className="size-4" />
      </a>
      {onJump && item.message_id > 0 && (
        <button
          type="button"
          onClick={onJump}
          className="shrink-0 rounded-sm p-1 text-text-secondary hover:bg-warm-ivory hover:text-dark"
          aria-label="메시지로 이동"
          title="메시지로 이동"
        >
          <CornerDownRight className="size-4" />
        </button>
      )}
    </li>
  )
}

export function FilesPanel({ room }: { room: MessengerRoom }) {
  const ctx = useMessenger()
  const jump = useJump()
  const { data, error, loading, reload } = usePanelFetch<unknown>(`rooms/${room.id}/files`, room.last_message?.id ?? 0)
  const [filter, setFilter] = useState<Filter>("all")
  const [q, setQ] = useState("")
  const [more, setMore] = useState<{ items: MessengerFileItem[]; hasMore: boolean } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const items = useMemo(() => {
    const seen = new Set<string>()
    const out: MessengerFileItem[] = []
    for (const f of [...normalizeFileItems(data), ...(more?.items ?? [])]) {
      const k = `${f.message_id}-${f.pathname}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push(f)
    }
    return out
  }, [data, more])
  const hasMore = more ? more.hasMore : !!(data as { has_more?: boolean } | null)?.has_more

  async function loadMore() {
    const last = items.reduce((min, f) => (f.message_id > 0 && f.message_id < min ? f.message_id : min), Number.MAX_SAFE_INTEGER)
    if (last === Number.MAX_SAFE_INTEGER) return
    setLoadingMore(true)
    try {
      const res = await messengerApi.get<{ has_more?: boolean }>(`rooms/${room.id}/files?before=${last}`)
      setMore((prev) => ({ items: [...(prev?.items ?? []), ...normalizeFileItems(res)], hasMore: !!res.has_more }))
    } catch (e) {
      ctx.notify(errText(e, "파일을 더 불러오지 못했습니다."), "error")
    } finally {
      setLoadingMore(false)
    }
  }
  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    return items
      .filter((f) => (filter === "all" ? true : filter === "image" ? isImageAttachment(f) : !isImageAttachment(f)))
      .filter((f) => !n || f.name.toLowerCase().includes(n))
      .sort((a, b) => b.message_id - a.message_id || (b.created_at || "").localeCompare(a.created_at || ""))
  }, [items, filter, q])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-2 border-b border-warm-tan px-3 py-2.5">
        <label className="flex h-8 items-center gap-2 rounded-md border border-warm-tan px-2 focus-within:border-dark/50">
          <Search className="size-4 shrink-0 text-text-secondary" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="파일 이름 검색"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-secondary"
            aria-label="파일 이름 검색"
          />
        </label>
        <div className="flex items-center gap-2">
          <Segmented
            label="파일 종류"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "전체" },
              { value: "image", label: "이미지" },
              { value: "doc", label: "문서·기타" },
            ]}
          />
          <span className="ml-auto text-xs tabular-nums text-text-secondary">
            {list.length}개{hasMore ? "+" : ""}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && !data ? (
          <PanelError message={error} onRetry={() => void reload()} />
        ) : loading && !data ? (
          <PanelLoading />
        ) : list.length === 0 ? (
          <PanelEmpty>{items.length === 0 ? "이 방에 올라온 파일이 없습니다." : "조건에 맞는 파일이 없습니다."}</PanelEmpty>
        ) : filter === "image" ? (
          <div className="grid grid-cols-3 gap-1 p-2">
            {list.map((f) => (
              <a
                key={`${f.message_id}-${f.pathname}`}
                href={fileUrl(f.pathname)}
                target="_blank"
                rel="noopener noreferrer"
                title={`${f.name} · ${ctx.memberName(f.author_id)}`}
                className={cn("block aspect-square overflow-hidden rounded-sm border border-warm-tan bg-warm-beige")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(f.pathname)} alt={f.name} loading="lazy" className="size-full object-cover" />
              </a>
            ))}
          </div>
        ) : (
          <ul>
            {list.map((f) => (
              <FileItemRow
                key={`${f.message_id}-${f.pathname}`}
                item={f}
                onJump={() => jump(f.room_id || room.id, f.message_id, f.parent_id)}
              />
            ))}
          </ul>
        )}
        {hasMore && data !== null && (
          <div className="border-t border-warm-tan/70 px-3 py-2.5 text-center">
            <Button type="button" size="sm" variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore && <Loader2 className="animate-spin" />}
              이전 파일 더 보기
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
