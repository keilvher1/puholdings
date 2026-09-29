"use client"

// 투표 카드(메시지 안). message-item(C)이 poll 메시지 본문 자리에 배치한다.
//
// export function PollCard(props: { message: MessengerMessage; poll: MessengerPoll })
// 투표·마감 후 ctx.applyMessage({ ...message, poll }) (응답에 message가 있으면 그것) → sync의 message.updated로도 온다.
// 마감 버튼: 작성자 또는 ctx.canManageRoom(room)
// API: POST polls/[id]/vote { options:number[] } → { poll, message? } (빈 배열이면 투표 취소)
//      POST polls/[id]/close → { poll, message? }

import { useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { MessengerMessage, MessengerPoll } from "@/lib/messenger-types"
import { messengerApi, votePoll } from "./api"
import { useMessenger } from "./store"
import { errText, formatDateTime, pickObject } from "./panel-kit"

export function PollCard({ message, poll }: { message: MessengerMessage; poll: MessengerPoll }) {
  const ctx = useMessenger()
  const { me } = ctx
  const room = ctx.state.rooms[message.room_id]
  const [picked, setPicked] = useState<number[]>(poll.my_votes)
  const [editing, setEditing] = useState(poll.my_votes.length === 0)
  const [busy, setBusy] = useState<"vote" | "close" | null>(null)
  const [showVoters, setShowVoters] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // 마감 시각이 지나면 화면이 스스로 '마감'으로 바뀌도록
  useEffect(() => {
    if (!poll.closes_at || poll.closed) return
    const left = new Date(poll.closes_at).getTime() - Date.now()
    if (left <= 0 || left > 24 * 60 * 60 * 1000) return
    const t = setTimeout(() => setNow(Date.now()), left + 500)
    return () => clearTimeout(t)
  }, [poll.closes_at, poll.closed])

  // 서버·sync에서 내 표가 바뀌면 반영(고르는 중이 아닐 때)
  useEffect(() => {
    if (!editing) setPicked(poll.my_votes)
  }, [poll.my_votes, editing])

  const expired = !!poll.closes_at && new Date(poll.closes_at).getTime() <= now
  const closed = poll.closed || expired
  const voted = poll.my_votes.length > 0
  const showResult = closed || (voted && !editing)
  const total = poll.counts.reduce((a, b) => a + b, 0)
  const max = Math.max(0, ...poll.counts)
  const canClose = !closed && !room?.is_archived && (message.author_id === me.id || (!!room && ctx.canManageRoom(room)))

  function apply(next: MessengerPoll | null, msg: MessengerMessage | null) {
    if (msg) ctx.applyMessage(msg)
    else if (next) ctx.applyMessage({ ...message, poll: next })
  }

  function toggle(i: number) {
    if (closed) return
    if (poll.multiple) setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i].sort((a, b) => a - b)))
    else setPicked([i])
  }

  async function vote(options: number[]) {
    setBusy("vote")
    try {
      const { poll: next, message: msg } = await votePoll(poll.id, options)
      apply(next, msg)
      setEditing(options.length === 0)
      setPicked(next?.my_votes ?? msg?.poll?.my_votes ?? options)
    } catch (e) {
      ctx.notify(errText(e, "투표하지 못했습니다."), "error")
    } finally {
      setBusy(null)
    }
  }

  async function close() {
    if (!window.confirm("투표를 마감할까요? 마감 후에는 투표할 수 없습니다.")) return
    setBusy("close")
    try {
      const res = await messengerApi.post(`polls/${poll.id}/close`)
      const msg = pickObject<MessengerMessage>(res, ["message"])
      apply(pickObject<MessengerPoll>(res, ["poll"]) ?? { ...poll, closed: true }, msg)
    } catch (e) {
      ctx.notify(errText(e, "마감하지 못했습니다."), "error")
    } finally {
      setBusy(null)
    }
  }

  const voterNames = (i: number): string[] =>
    (poll.voters?.find((v) => v.option === i)?.member_ids ?? []).map((id) => (id === me.id ? "나" : ctx.memberName(id)))

  return (
    <div className="rounded-md border border-warm-tan bg-card px-3.5 py-3">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-text-secondary">
        <span>
          투표 · {poll.multiple ? "복수 선택" : "단일 선택"}
          {poll.anonymous ? " · 익명" : ""}
        </span>
        {closed ? (
          <span className="rounded-sm border border-warm-tan bg-warm-beige px-1.5 py-0.5 text-dark">마감</span>
        ) : poll.closes_at ? (
          <span>{formatDateTime(poll.closes_at)} 마감</span>
        ) : null}
      </div>
      <p className="mb-2.5 break-words text-[15px] font-semibold text-dark">{poll.question}</p>

      <ul className="grid gap-1.5">
        {poll.options.map((opt, i) => {
          const count = poll.counts[i] ?? 0
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          if (showResult) {
            const mineVoted = poll.my_votes.includes(i)
            const names = poll.anonymous ? [] : voterNames(i)
            return (
              <li key={i} className="relative overflow-hidden rounded-sm border border-warm-tan">
                <div
                  aria-hidden
                  className={cn("absolute inset-y-0 left-0", count === max && count > 0 ? "bg-gold/25" : "bg-warm-beige")}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center gap-2 px-2.5 py-1.5 text-sm">
                  {mineVoted && <Check className="size-3.5 shrink-0 text-dark" strokeWidth={3} aria-label="내 선택" />}
                  <span className={cn("min-w-0 flex-1 break-words text-dark", mineVoted && "font-semibold")}>{opt}</span>
                  <span className="shrink-0 tabular-nums text-text-secondary">
                    {count}표 · {pct}%
                  </span>
                </div>
                {showVoters && names.length > 0 && (
                  <p className="relative border-t border-warm-tan/70 px-2.5 py-1 text-xs text-text-secondary">{names.join(", ")}</p>
                )}
              </li>
            )
          }
          const on = picked.includes(i)
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-pressed={on}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-sm border px-2.5 py-1.5 text-left text-sm",
                  on ? "border-dark bg-warm-ivory" : "border-warm-tan hover:bg-warm-ivory"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center border",
                    poll.multiple ? "rounded-sm" : "rounded-full",
                    on ? "border-dark bg-dark text-white" : "border-text-secondary"
                  )}
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 break-words text-dark">{opt}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="mr-auto text-xs tabular-nums text-text-secondary">{poll.voter_count}명 참여</span>
        {showResult && !poll.anonymous && poll.voters && poll.voter_count > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowVoters((v) => !v)}>
            {showVoters ? "투표자 숨기기" : "투표자 보기"}
          </Button>
        )}
        {!closed && showResult && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setPicked(poll.my_votes)
              setEditing(true)
            }}
          >
            다시 투표
          </Button>
        )}
        {!closed && !showResult && (
          <>
            {voted && (
              <Button type="button" size="sm" variant="ghost" onClick={() => void vote([])} disabled={!!busy}>
                투표 취소
              </Button>
            )}
            {voted && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={!!busy}>
                결과 보기
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => void vote(picked)} disabled={!!busy || picked.length === 0}>
              {busy === "vote" && <Loader2 className="animate-spin" />}
              투표하기
            </Button>
          </>
        )}
        {canClose && (
          <Button type="button" size="sm" variant="outline" onClick={() => void close()} disabled={!!busy}>
            {busy === "close" && <Loader2 className="animate-spin" />}
            마감
          </Button>
        )}
      </div>
    </div>
  )
}
