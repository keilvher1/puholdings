"use client"

// 댓글(스레드) 패널. 오른쪽 패널의 '댓글' 탭 내용.
//
// export function ThreadPanel(props: { parentId: number })
// - 원본·댓글은 C의 store(state.messages / threadReplies)에서 읽고, 열 때 ctx.loadThread(parentId)로 한 번 받아 온다.
//   이후 댓글은 sync(message.created, parent_id)로 store에 들어와 자동 반영된다.
// - 메시지는 C의 <MessageItem inThread />로 그린다(반응·수정·삭제·별표 메뉴 동일). 보내는 중인 댓글은 pendingFor로 표시.
// - 입력은 C의 <Composer room parentId />(멘션·첨부·이모지 동일).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CornerUpLeft } from "lucide-react"
import { Composer } from "./composer"
import { MessageItem } from "./message-item"
import { pendingAsMessage, pendingFor, threadReplies, useMessenger } from "./store"
import { PanelEmpty, PanelError, PanelLoading } from "./panel-kit"

export function ThreadPanel({ parentId }: { parentId: number }) {
  const ctx = useMessenger()
  const { state, me } = ctx
  const root = state.messages[parentId] ?? null
  const loaded = !!state.threadLoaded[parentId]
  const room = root ? state.rooms[root.room_id] ?? null : null
  const replies = useMemo(() => threadReplies(state, parentId), [state, parentId])
  const pending = useMemo(() => (root ? pendingFor(state, root.room_id, parentId) : []), [state, root, parentId])
  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const loadThread = ctx.loadThread
  const [attempted, setAttempted] = useState(false)

  const load = useCallback(async () => {
    setAttempted(false)
    await loadThread(parentId)
    setAttempted(true)
  }, [parentId, loadThread])

  useEffect(() => {
    stick.current = true
    void load()
  }, [load])

  // 새 댓글이 오면 아래로(위로 올려 읽는 중이면 그대로)
  useEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [replies.length, pending.length, loaded])

  if (!root) {
    if (loaded) return <PanelEmpty>원본 메시지를 찾을 수 없습니다.</PanelEmpty>
    return attempted ? <PanelError message="댓글을 불러오지 못했습니다." onRetry={() => void load()} /> : <PanelLoading />
  }

  const count = replies.filter((r) => !r.deleted).length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto py-2"
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
      >
        <MessageItem message={root} inThread />
        <div className="px-4 pb-1">
          <button
            type="button"
            onClick={() => ctx.jumpToMessage(root.room_id, root.id)}
            className="inline-flex items-center gap-1 text-xs text-text-secondary underline-offset-2 hover:text-dark hover:underline"
          >
            <CornerUpLeft className="size-3.5" aria-hidden />
            대화에서 보기
          </button>
        </div>
        <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-text-secondary">
          <span className="shrink-0 font-medium tabular-nums">댓글 {count}개</span>
          <span className="h-px flex-1 bg-warm-tan" aria-hidden />
        </div>
        {!loaded && replies.length === 0 ? (
          attempted ? (
            <PanelError message="댓글을 불러오지 못했습니다." onRetry={() => void load()} />
          ) : (
            <PanelLoading />
          )
        ) : replies.length === 0 && pending.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-text-secondary">첫 댓글을 남겨 보세요.</p>
        ) : null}
        {replies.map((m, i) => {
          const prev = replies[i - 1]
          const compact =
            !!prev &&
            !prev.deleted &&
            prev.author_id === m.author_id &&
            m.author_id != null &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
          return <MessageItem key={m.id} message={m} inThread compact={compact} />
        })}
        {pending.map((p) => (
          <MessageItem key={p.temp_id} message={pendingAsMessage(p, me.id)} pending={p} inThread />
        ))}
      </div>
      {room ? (
        <Composer
          key={`${room.id}:${parentId}`}
          room={room}
          parentId={parentId}
          placeholder={room.is_archived ? "보관된 토픽에는 댓글을 쓸 수 없습니다." : "댓글 입력"}
        />
      ) : (
        <p className="border-t border-warm-tan px-4 py-3 text-xs text-text-secondary">이 방에 참여하고 있지 않아 댓글을 쓸 수 없습니다.</p>
      )}
    </div>
  )
}
