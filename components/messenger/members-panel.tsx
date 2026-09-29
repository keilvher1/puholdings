"use client"

// 멤버 패널. 오른쪽 패널의 '멤버' 탭 내용. '이 방' 참여자 / '전체'(내가 볼 수 있는 멤버) 전환.
//
// export function MembersPanel(props: { room: MessengerRoom | null })
// - 이름 클릭 → 프로필(ctx.openDialog profile), 말풍선 → 1:1 대화(useOpenDm)
// - 초대(정회원·토픽·보관 안 됨) → ctx.openDialog({ name: "invite", roomId })
// - 메뉴: 본인이면 '방 나가기'(ctx.leaveRoom), 토픽 관리자면 '내보내기'(DELETE rooms/[id]/members/[memberId])
// - 게스트에게는 같은 방 참여자만 보인다(서버가 members 범위를 제한)

import { useMemo, useState } from "react"
import { MessageSquare, MoreHorizontal, Search, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { MessengerMember, MessengerRoom } from "@/lib/messenger-types"
import { removeRoomMember } from "./api"
import { MemberAvatar, presenceOf } from "./message-item"
import { useMessenger } from "./store"
import { errText, PanelEmpty, presenceLabel, Segmented, useOpenDm } from "./panel-kit"

type Scope = "room" | "all"

const PRESENCE_RANK = { online: 0, away: 1, offline: 2 } as const

export function MembersPanel({ room }: { room: MessengerRoom | null }) {
  const ctx = useMessenger()
  const { me, state } = ctx
  const openDm = useOpenDm()
  const [scope, setScope] = useState<Scope>(room ? "room" : "all")
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState<number | null>(null)
  const effective: Scope = room ? scope : "all"
  const manage = !!room && ctx.canManageRoom(room)
  const canInvite = !!room && room.kind === "topic" && ctx.isMember && !room.is_archived

  const list = useMemo(() => {
    const all = Object.values(state.members)
    if (!all.some((m) => m.id === me.id)) all.push(me)
    const ids = effective === "room" && room ? new Set(room.member_ids) : null
    const n = q.trim().toLowerCase()
    return all
      .filter((m) => !ids || ids.has(m.id))
      .filter((m) => !n || m.display_name.toLowerCase().includes(n) || (m.title || "").toLowerCase().includes(n))
      .sort((a, b) => {
        if (a.id === me.id) return -1
        if (b.id === me.id) return 1
        if (a.role !== b.role) return a.role === "member" ? -1 : 1
        return PRESENCE_RANK[presenceOf(a)] - PRESENCE_RANK[presenceOf(b)] || a.display_name.localeCompare(b.display_name, "ko")
      })
  }, [state.members, me, room, effective, q])

  const online = list.filter((m) => presenceOf(m) === "online").length
  const missing = effective === "room" && room ? room.member_ids.filter((id) => !state.members[id] && id !== me.id).length : 0

  async function remove(m: MessengerMember) {
    if (!room) return
    if (m.id === me.id) {
      if (!window.confirm("이 방에서 나갈까요?")) return
      await ctx.leaveRoom(room.id)
      return
    }
    if (!window.confirm(`${m.display_name}님을 이 방에서 내보낼까요?`)) return
    setBusy(m.id)
    try {
      await removeRoomMember(room.id, m.id)
      ctx.dispatch({ type: "patchRoom", roomId: room.id, patch: { member_ids: room.member_ids.filter((id) => id !== m.id) } })
      ctx.notify(`${m.display_name}님을 내보냈습니다.`)
    } catch (e) {
      ctx.notify(errText(e, "내보내지 못했습니다."), "error")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-2 border-b border-warm-tan px-3 py-2.5">
        <div className="flex items-center gap-2">
          {room ? (
            <Segmented
              label="멤버 범위"
              value={effective}
              onChange={setScope}
              options={[
                { value: "room", label: `이 방 ${room.member_ids.length}` },
                { value: "all", label: "전체" },
              ]}
            />
          ) : (
            <span className="text-sm font-medium text-dark">멤버</span>
          )}
          <span className="text-xs tabular-nums text-text-secondary">접속 {online}</span>
          {canInvite && (
            <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => ctx.openDialog({ name: "invite", roomId: room!.id })}>
              <UserPlus />
              초대
            </Button>
          )}
        </div>
        <label className="flex h-8 items-center gap-2 rounded-md border border-warm-tan px-2 focus-within:border-dark/50">
          <Search className="size-4 shrink-0 text-text-secondary" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름·소속 검색"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-secondary"
            aria-label="멤버 검색"
          />
        </label>
        {!ctx.isMember && effective === "all" && <p className="text-xs text-text-secondary">게스트는 같은 방에 참여한 사람만 볼 수 있습니다.</p>}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {list.length === 0 && (
          <li>
            <PanelEmpty>{q ? "검색 결과가 없습니다." : "멤버가 없습니다."}</PanelEmpty>
          </li>
        )}
        {list.map((m) => {
          const isMe = m.id === me.id
          const isCreator = room?.kind === "topic" && room.created_by === m.id
          const canRemove = effective === "room" && !!room && (isMe || (manage && room.kind === "topic"))
          return (
            <li key={m.id} className="group flex items-center gap-1.5 border-b border-warm-tan/60 px-3 py-2 last:border-b-0 hover:bg-warm-ivory/60">
              <button
                type="button"
                onClick={() => ctx.openDialog({ name: "profile", memberId: m.id })}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <MemberAvatar member={m} size={32} presence={presenceOf(m)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-dark">{m.display_name}</span>
                    {isMe && <span className="shrink-0 text-xs text-text-secondary">(나)</span>}
                    {m.role === "guest" && (
                      <span className="shrink-0 rounded-sm border border-warm-tan px-1 text-xs leading-4 text-text-secondary">게스트</span>
                    )}
                    {isCreator && <span className="shrink-0 text-xs text-text-secondary">개설자</span>}
                  </span>
                  <span className="block truncate text-xs text-text-secondary">{m.status_text || m.title || presenceLabel(m)}</span>
                </span>
              </button>
              {!isMe && (
                <button
                  type="button"
                  onClick={() => void openDm(m.id)}
                  className="shrink-0 rounded-sm p-1 text-text-secondary hover:bg-warm-beige hover:text-dark"
                  aria-label={`${m.display_name}님과 대화`}
                  title="대화하기"
                >
                  <MessageSquare className="size-4" />
                </button>
              )}
              {canRemove && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={busy === m.id}
                      className="shrink-0 rounded-sm p-1 text-text-secondary hover:bg-warm-beige hover:text-dark"
                      aria-label={`${m.display_name} 메뉴`}
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => ctx.openDialog({ name: "profile", memberId: m.id })}>프로필 보기</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => void remove(m)}>
                      {isMe ? "방 나가기" : "내보내기"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          )
        })}
        {missing > 0 && <li className="px-3 py-2 text-xs text-text-secondary">정보를 불러오지 못한 참여자 {missing}명</li>}
      </ul>
    </div>
  )
}
