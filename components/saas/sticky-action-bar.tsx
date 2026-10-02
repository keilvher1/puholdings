"use client"

// 긴 입력·마법사 아래 고정 바 — 왼쪽 요약("검침 4개 중 4개 입력 · 저장 안 한 변경 1개"), 오른쪽 [이전] 등 보조 + 주 버튼 1개.
// 스크롤 영역의 아래쪽에 붙는다(sticky). 그림자 대신 위쪽 1px 테두리. 사내 증빙 저장 바와 같은 모양.
//
// 사용 예:
//   <StickyActionBar summary={`검침 4개 중 ${saved}개 입력${dirty ? " · 저장 안 한 변경 있음" : ""}`}
//     secondary={<Button variant="outline" onClick={prev}>이전</Button>}
//     primary={<BusyButton busy={saving} onClick={save}>저장하기</BusyButton>} />

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function StickyActionBar({
  summary,
  secondary,
  primary,
  className,
}: {
  summary?: ReactNode
  secondary?: ReactNode
  primary?: ReactNode
  className?: string
}) {
  return (
    <div
      data-sticky-action-bar=""
      className={cn(
        "sticky bottom-0 z-30 -mx-4 mt-6 border-t border-warm-tan bg-card px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-b-md print:hidden",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {summary && <p className="min-w-0 flex-1 text-[15px] text-[#3f3f4e] [word-break:keep-all]">{summary}</p>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {secondary}
          {primary}
        </div>
      </div>
    </div>
  )
}
