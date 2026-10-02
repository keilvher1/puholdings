"use client"

// 단일 선택 보기 탭(ToggleGroup 기반) — "전체 22 · 확인 필요 2 · 준비 완료 18"처럼 건수와 함께. 휴대폰에서는 가로 스크롤.
// 선택값은 부르는 쪽이 useUrlState로 주소에 남긴다. 배지와 달리 누를 수 있다.
// 탭 너비는 글자 너비대로(flex-none). 휴대폰(640px 미만)에서는 누름 영역 44px, 그 이상 36px.
//
// 사용 예:
//   const [view, setView] = useUrlState("view", "all")
//   <FilterTabs label="보기" value={view} onValueChange={setView}
//     options={[{ value: "all", label: "전체", count: 22 }, { value: "review", label: "확인 필요", count: 2 }]} />
//   // 색 견본이 붙는 범례 탭(호실 상태 등): swatch는 장식이라 aria-hidden으로 넘긴다
//   options={[{ value: "vacant", label: "공실", count: 4, swatch: <span aria-hidden className="size-3 rounded-sm border bg-white" /> }]}

import type { ReactNode } from "react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

export interface FilterTabOption {
  value: string
  /** 탭 글자. 보통 문자열, 필요하면 ReactNode(굵은 글자 등) */
  label: ReactNode
  count?: number | null
  /** 글자 앞 견본(색 칸·아이콘). 장식이면 aria-hidden을 붙여 넘긴다 */
  swatch?: ReactNode
  /** 화면 읽기용 이름을 따로 줄 때(label이 ReactNode라 이름이 어색할 때) */
  ariaLabel?: string
}

export function FilterTabs({
  options,
  value,
  onValueChange,
  label,
  className,
  itemClassName,
  wrap = false,
}: {
  options: FilterTabOption[]
  value: string
  onValueChange: (value: string) => void
  /** 화면 읽기 프로그램용 묶음 이름(예: "청구서 보기") */
  label: string
  className?: string
  /** 탭 칸에 덧붙일 클래스(드물게) */
  itemClassName?: string
  /** true면 가로 스크롤 대신 줄을 바꿔 모두 보인다(범례처럼 한눈에 봐야 할 때) */
  wrap?: boolean
}) {
  return (
    <div className={cn(wrap ? "max-w-full" : "-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => {
          if (v) onValueChange(v) // 같은 탭을 다시 눌러 선택이 풀리지 않게
        }}
        aria-label={label}
        className={wrap ? "w-auto flex-wrap justify-start gap-1.5" : "w-max gap-1"}
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            aria-label={o.ariaLabel}
            className={cn(
              "h-11 flex-none shrink-0 gap-1.5 rounded-md border border-warm-tan bg-card px-3 text-[15px] font-medium text-[#3f3f4e] hover:bg-warm-beige hover:text-dark sm:h-9",
              "data-[state=on]:border-dark data-[state=on]:bg-dark data-[state=on]:text-primary-foreground",
              itemClassName,
            )}
          >
            {o.swatch}
            {o.label}
            {o.count !== undefined && o.count !== null && <span className="tabular-nums">{o.count}</span>}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
