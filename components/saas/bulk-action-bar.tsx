"use client"

// 일괄 선택 바 — 행을 고르면 화면 아래에 고정: "3건 선택 · 합계 1,034,000원" + [선택 해제] + 동작 버튼(주 1개).
// "전체 선택"은 지금 보이는(걸러진) 행에만 건다(SelectAllCheckbox에 보이는 행 수를 넘긴다). 그림자 대신 위쪽 1px 테두리.
// 관리자 화면 기준으로 데스크톱 사이드바(256px)를 비켜 선다(sidebarOffset=false로 끈다).
//
// 사용 예:
//   <SelectAllCheckbox total={visible.length} selected={visible.filter((r) => sel.has(r.id)).length}
//     onToggle={(all) => setSel(all ? new Set(visible.map((r) => r.id)) : new Set())} label="보이는 청구서 모두 선택" />
//   <BulkActionBar count={sel.size} summary={<>합계 {won(sum)}</>} onClear={() => setSel(new Set())}>
//     <Button onClick={openPay}>{sel.size}건 납부 완료로 바꾸기</Button>
//   </BulkActionBar>

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

export function BulkActionBar({
  count,
  summary,
  onClear,
  sidebarOffset = true,
  className,
  children,
}: {
  count: number
  summary?: ReactNode
  onClear: () => void
  sidebarOffset?: boolean
  className?: string
  children: ReactNode
}) {
  if (count <= 0) return null
  return (
    <div
      role="region"
      aria-label="선택한 항목 동작"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-warm-tan bg-card pb-[env(safe-area-inset-bottom)] print:hidden",
        sidebarOffset && "lg:left-64",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <p className="text-[15px] font-medium text-dark tabular-nums" aria-live="polite">
          {count}건 선택
          {summary ? <span className="text-[#3f3f4e]"> · {summary}</span> : null}
        </p>
        <Button type="button" variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark" onClick={onClear}>
          선택 해제
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  )
}

/** 머리글 체크박스: 일부만 골랐으면 "일부 선택" 상태로 보인다. total = 지금 보이는(걸러진) 행 수 */
export function SelectAllCheckbox({
  total,
  selected,
  onToggle,
  label = "보이는 항목 모두 선택",
}: {
  total: number
  selected: number
  onToggle: (selectAll: boolean) => void
  label?: string
}) {
  const state: boolean | "indeterminate" = selected === 0 ? false : selected >= total ? true : "indeterminate"
  return (
    <Checkbox
      checked={state}
      disabled={total === 0}
      onCheckedChange={() => onToggle(state !== true)}
      aria-label={label}
    />
  )
}
