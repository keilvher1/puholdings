"use client"

// 월 고르기 — [◀] 2026년 10월 [▶] + 가운데를 누르면 최근 24개월 목록(Popover + Command). input type=month를 대체한다.
// value는 "YYYY-MM". describe로 목록에 상태 글자("발행 완료", "작성 중 22건")를 붙일 수 있다.
//
// 사용 예:
//   const [month, setMonth] = useUrlState("month", progress.usageMonth, { mode: "server" })
//   <MonthPicker label="전기 사용월" value={month} onChange={setMonth} format={(ym) => usageToBill(ym)}
//     describe={(ym) => statusByMonth[ym]} max={thisMonthKST()} />

import { useState } from "react"
import { ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { addMonths, isYm, month as monthLabel, thisMonthKST } from "@/lib/format"
import { cn } from "@/lib/utils"

export function MonthPicker({
  value,
  onChange,
  label = "월",
  describe,
  format = monthLabel,
  min,
  max,
  count = 24,
  className,
}: {
  value: string
  onChange: (ym: string) => void
  /** 화면 읽기 프로그램용 이름(예: "청구월") */
  label?: string
  describe?: (ym: string) => string | null | undefined
  /** 가운데 글자 모양(기본 "2026년 10월") */
  format?: (ym: string) => string
  min?: string
  max?: string
  /** 목록 길이(기본 24개월) */
  count?: number
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const cur = isYm(value) ? value : thisMonthKST()
  const top = max && isYm(max) ? (max > cur ? max : cur) : (cur > thisMonthKST() ? cur : thisMonthKST())
  const months = Array.from({ length: count }, (_, i) => addMonths(top, -i)).filter((ym) => !min || ym >= min)
  const prev = addMonths(cur, -1)
  const next = addMonths(cur, 1)
  const canPrev = !min || prev >= min
  const canNext = !max || next <= max
  const outline = "hover:bg-warm-beige hover:text-dark"

  return (
    <div role="group" aria-label={label} className={cn("inline-flex items-center gap-1", className)}>
      <Button type="button" variant="outline" size="icon-sm" className={outline} disabled={!canPrev} onClick={() => onChange(prev)} aria-label={`이전 달(${monthLabel(prev)})`}>
        <ChevronLeft aria-hidden />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className={cn("min-w-36 justify-between tabular-nums", outline)} aria-label={`${label}: ${format(cur)} — 다른 달 고르기`}>
            <span className="text-[15px] font-semibold text-dark">{format(cur)}</span>
            <ChevronsUpDown className="text-[#3f3f4e]" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="app-shell w-72 p-0">
          <Command>
            <CommandInput placeholder="예: 2026년 9월" aria-label={`${label} 찾기`} />
            <CommandList className="max-h-72">
              <CommandEmpty>맞는 달이 없어요</CommandEmpty>
              <CommandGroup>
                {months.map((ym) => {
                  const note = describe?.(ym)
                  return (
                    <CommandItem
                      key={ym}
                      value={`${ym} ${monthLabel(ym)} ${format(ym)}`}
                      onSelect={() => {
                        onChange(ym)
                        setOpen(false)
                      }}
                      aria-current={ym === cur ? "date" : undefined}
                      className={cn("flex min-h-9 items-center justify-between gap-2 text-[15px]", ym === cur && "font-semibold")}
                    >
                      <span>{format(ym)}</span>
                      {note && <span className="text-sm text-[#3f3f4e]">{note}</span>}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button type="button" variant="outline" size="icon-sm" className={outline} disabled={!canNext} onClick={() => onChange(next)} aria-label={`다음 달(${monthLabel(next)})`}>
        <ChevronRight aria-hidden />
      </Button>
    </div>
  )
}
