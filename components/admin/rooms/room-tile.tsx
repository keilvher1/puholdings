"use client"

// 호실 타일과 범례 견본. 상태는 색·글자·테두리 3중으로 보인다(색만으로 구분하지 않는다, 계획서 4.3.1):
//   입주 중 = 흰 바탕·진한 글자, 퇴실 예정 = 호박색 굵은 테두리 + "10월 31일 퇴실 · 29일 남음",
//   공실 = 점선 테두리 + "공실", 사용 불가 = 회색 빗금 + "사용 불가". 글자는 12px 이상(코드 16px/600 · 기업명 15px · 면적 14px).

import type { CSSProperties } from "react"
import { ToneBadge } from "@/components/saas"
import { statusMeta } from "@/lib/status"
import { cn } from "@/lib/utils"
import { leavingText, legendOf, pyeongText, type BoardRoom, type LegendKey } from "./move-model"

// 빗금(사용 불가): CSS 그라데이션 대신 작은 SVG 무늬(차분한 회색 사선)
const HATCH: CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Cpath d='M-2 2l4-4M0 8l8-8M6 10l4-4' stroke='%23d9d4c7' stroke-width='1.5'/%3E%3C/svg%3E\")",
  backgroundColor: "#f4f2ec",
}

export const TILE_CLASS: Record<Exclude<LegendKey, "all">, string> = {
  occupied: "border border-warm-tan bg-card text-dark",
  leaving: "border-2 border-amber-500 bg-card text-dark",
  vacant: "border border-dashed border-[#8a8a99] bg-transparent text-dark",
  unavailable: "border border-warm-tan text-[#3f3f4e]",
}

/** 범례 칩 안의 작은 견본(타일 모양) */
export function LegendSwatch({ kind }: { kind: Exclude<LegendKey, "all"> }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-3.5 shrink-0 rounded-[3px]", TILE_CLASS[kind], kind === "leaving" && "border-[2px]")}
      style={kind === "unavailable" ? HATCH : undefined}
    />
  )
}

export function RoomTile({
  room,
  match,
  onOpen,
  selected,
}: {
  room: BoardRoom
  /** 검색 결과: true 맞음(진하게) · false 안 맞음(흐리게) · null 검색 안 함 */
  match: boolean | null
  onOpen: () => void
  selected?: boolean
}) {
  const kind = legendOf(room.state)
  const leaving = kind === "leaving" ? leavingText(room.ended_at, room.dday) : null
  // 받을 돈 배지는 기한이 지난 청구서가 있을 때만(이번 달 납부 대기는 흔한 정상 상태라 표시하지 않는다, 계획서 2.3).
  // 청구서 배지(billBadge)와 같은 말을 쓰려고 "기한 지남"은 isPastDue(overdue 또는 기한 < 오늘)만 센다.
  // 기한 없이 오래된 건(발행 후 31일 이상)은 청구서 화면에서 "납부 대기 · 발행 후 n일"로 보이므로 여기서 "기한 지남"이라 부르지 않는다.
  const pastDue = typeof room.unpaid_past_due_count === "number" ? room.unpaid_past_due_count : 0
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex min-h-[92px] min-w-0 flex-col items-start rounded-md p-3 text-left transition-colors hover:border-dark",
        TILE_CLASS[kind],
        match === false && "opacity-40",
        match === true && "ring-2 ring-dark ring-offset-1",
      )}
      style={kind === "unavailable" ? HATCH : undefined}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-base font-semibold leading-tight tabular-nums">{room.code}</span>
        {pastDue > 0 && (
          <ToneBadge tone="danger" icon={false}>
            기한 지남 {pastDue}건
          </ToneBadge>
        )}
      </span>
      <span className="mt-1 line-clamp-2 w-full text-[15px] leading-snug [word-break:keep-all]">
        {kind === "vacant" || kind === "unavailable" ? statusMeta("room", kind).label : room.tenant_name || "-"}
      </span>
      <span className="mt-1 text-sm text-[#5f6070] tabular-nums">{pyeongText(room.pyeong)}</span>
      {leaving && (
        // 줄을 바꿀 자리는 구분자 뒤 빈칸 하나: "10월 31일 퇴실 ·" / "29일 남음"(각 덩어리는 끊지 않는다, 타일 밖으로 넘치지 않게)
        <span className="mt-0.5 w-full min-w-0 text-sm font-medium text-amber-800">
          {leaving.split(" · ").map((part, i, all) => (
            <span key={i}>
              {i > 0 ? " " : ""}
              <span className="whitespace-nowrap">
                {part}
                {i < all.length - 1 ? " ·" : ""}
              </span>
            </span>
          ))}
        </span>
      )}
      {kind === "occupied" && <span className="sr-only">{statusMeta("room", "occupied").label}</span>}
    </button>
  )
}
