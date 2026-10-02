"use client"

// 표 위 한 줄 필터: 검색 칸(보이는 레이블은 sr-only라도 반드시 있음) + 선택 필터들 + 켜진 조건 칩("상태: 기한 지남 ×")
// + [조건 지우기] + 오른쪽 요약("조회 22건 · 합계 10,637,510원").
//
// 사용 예:
//   <FilterBar
//     search={{ value: q, onChange: setQ, label: "기업 이름 검색", placeholder: "기업 이름" }}
//     filters={<MonthPicker value={period} onChange={setPeriod} />}
//     chips={status ? [{ label: `상태: ${statusMeta("bill", status).label}`, onRemove: () => setStatus(null) }] : []}
//     onClearAll={() => setF({ q: null, status: null })}
//     summary={<>조회 {rows.length}건 · 합계 {won(sum)}</>}
//   />

import { useId, type ReactNode } from "react"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface FilterChip {
  label: string
  onRemove: () => void
}

export function FilterBar({
  search,
  filters,
  chips = [],
  onClearAll,
  summary,
  className,
}: {
  search?: { value: string; onChange: (value: string) => void; label: string; placeholder?: string }
  filters?: ReactNode
  chips?: FilterChip[]
  onClearAll?: () => void
  summary?: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn("mb-3 space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {search && (
          <div className="relative w-full sm:w-64">
            <label htmlFor={id} className="sr-only">
              {search.label}
            </label>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-secondary" aria-hidden />
            <Input
              id={id}
              type="search"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? search.label}
              className="h-9 bg-card pl-8 text-[15px]"
            />
          </div>
        )}
        {filters}
        {summary && <div className="ml-auto text-[15px] tabular-nums text-[#3f3f4e]">{summary}</div>}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <span key={c.label} className="inline-flex h-8 items-center gap-1 rounded-md border border-warm-tan bg-warm-beige pl-2.5 pr-1 text-sm text-dark">
              {c.label}
              <button
                type="button"
                onClick={c.onRemove}
                aria-label={`${c.label} 조건 지우기`}
                className="inline-flex size-6 items-center justify-center rounded-sm hover:bg-warm-tan/60"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
          {onClearAll && (
            <Button type="button" variant="ghost" size="sm" className="h-8 text-link underline underline-offset-2 hover:bg-warm-beige" onClick={onClearAll}>
              조건 지우기
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
