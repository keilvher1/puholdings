"use client"

// 데이터 조회 없는 검색 콤보박스(Popover + Command). 목록(items)은 부르는 쪽이 넘긴다.
// onCreate가 있으면 맨 아래 "‘○○’ 새로 등록" 항목이 생긴다. 새 메일 받는 곳(WP1)·입주 기업(WP4)·추가 청구 기업(WP7)이 같이 쓴다.
//
// 사용 예:
//   <Label htmlFor="tenant">입주 기업</Label>
//   <SearchCombobox id="tenant" items={tenants.map((t) => ({ value: String(t.id), label: t.name, hint: t.room ?? undefined }))}
//     value={tenantId} onSelect={(v) => setTenantId(v)} placeholder="기업 이름으로 찾기"
//     onCreate={(text) => openNewTenant(text)} emptyText="맞는 기업이 없어요" />

import { useState, type ReactNode } from "react"
import { ChevronsUpDown, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface ComboItem {
  value: string
  label: string
  /** 보조 글자(호실·이메일 등) */
  hint?: string
  /** 오른쪽 작은 배지(StatusBadge 등) */
  badge?: ReactNode
  disabled?: boolean
}

export function SearchCombobox({
  items,
  value,
  onSelect,
  onCreate,
  createLabel = (text) => `‘${text}’ 새로 등록`,
  placeholder = "찾기",
  emptyText = "맞는 항목이 없어요",
  id,
  invalid = false,
  disabled = false,
  className,
  "aria-describedby": describedBy,
}: {
  items: ComboItem[]
  value: string | null
  onSelect: (value: string, item: ComboItem) => void
  onCreate?: (text: string) => void
  createLabel?: (text: string) => string
  placeholder?: string
  emptyText?: string
  /** 보이는 <Label htmlFor>와 잇는 id(트리거 버튼에 붙는다) */
  id?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
  "aria-describedby"?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const selected = items.find((i) => i.value === value) ?? null
  const q = query.trim()
  const exact = q !== "" && items.some((i) => i.label === q)
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery("")
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          className={cn("h-10 w-full justify-between bg-card px-3 text-left text-base font-normal hover:bg-warm-beige hover:text-dark", className)}
        >
          <span className={cn("truncate", !selected && "text-text-secondary")}>{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="shrink-0 text-[#3f3f4e]" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="app-shell w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command>
          <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} aria-label={placeholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map((it) => (
                <CommandItem
                  key={it.value}
                  value={`${it.label} ${it.hint ?? ""} ${it.value}`}
                  disabled={it.disabled}
                  onSelect={() => {
                    onSelect(it.value, it)
                    setOpen(false)
                    setQuery("")
                  }}
                  className="flex min-h-10 items-center justify-between gap-2 text-[15px]"
                >
                  <span className="min-w-0">
                    <span className={cn("block truncate", it.value === value && "font-semibold")}>{it.label}</span>
                    {it.hint && <span className="block truncate text-sm text-[#3f3f4e]">{it.hint}</span>}
                  </span>
                  {it.badge}
                </CommandItem>
              ))}
            </CommandGroup>
            {onCreate && q !== "" && !exact && (
              <CommandGroup>
                <CommandItem
                  value={`__create__ ${q}`}
                  onSelect={() => {
                    onCreate(q)
                    setOpen(false)
                    setQuery("")
                  }}
                  className="min-h-10 text-[15px] text-link"
                >
                  <Plus aria-hidden />
                  {createLabel(q)}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
