"use client"

// 행 끝 ⋯ 메뉴 — 트리거 이름에 대상 이름을 넣는다("(주)솔바람테크 동작 더 보기"). 위험 항목은 맨 아래, 빨간 글자, 구분선 위.
// 행의 주 동작 1개는 메뉴 밖 글자 버튼으로 둔다. PageHeader의 moreMenu 슬롯에도 넣을 수 있다.
//
// 사용 예:
//   <RowActions label={tenant.name} items={[
//     { label: "정보 수정", onSelect: () => openEdit(tenant) },
//     { label: "청구서 보기", href: billsHref({ tenant: tenant.id }) },
//     { label: "기업 삭제", onSelect: () => remove(tenant), danger: true },   // remove 안에서 useConfirm으로 확인
//   ]} />

import Link from "next/link"
import { Ellipsis } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export interface RowActionItem {
  label: string
  onSelect?: () => void
  href?: string
  danger?: boolean
  disabled?: boolean
  /** 비활성일 때 이유(메뉴 안에 작은 글자로) */
  disabledReason?: string
}

export function RowActions({
  label,
  items,
  triggerLabel,
  align = "end",
  className,
}: {
  /** 대상 이름(예: 기업명) */
  label: string
  items: RowActionItem[]
  /** 트리거 aria-label을 직접 줄 때(기본 "<label> 동작 더 보기") */
  triggerLabel?: string
  align?: "start" | "end"
  className?: string
}) {
  const safe = items.filter((i) => !i.danger)
  const danger = items.filter((i) => i.danger)
  const render = (it: RowActionItem) => {
    const cls = cn("min-h-9 text-[15px]", it.danger && "text-red-800 focus:bg-red-50 focus:text-red-800")
    const reason = it.disabled && it.disabledReason ? <span className="block text-sm text-[#3f3f4e]">{it.disabledReason}</span> : null
    if (it.href && !it.disabled) {
      return (
        <DropdownMenuItem key={it.label} asChild className={cls}>
          <Link href={it.href}>{it.label}</Link>
        </DropdownMenuItem>
      )
    }
    return (
      <DropdownMenuItem key={it.label} disabled={it.disabled} onSelect={() => it.onSelect?.()} className={cn(cls, "flex-col items-start gap-0")}>
        <span>{it.label}</span>
        {reason}
      </DropdownMenuItem>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={triggerLabel ?? `${label} 동작 더 보기`}
          className={cn("text-[#3f3f4e] hover:bg-warm-beige hover:text-dark", className)}
        >
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="app-shell min-w-48">
        {safe.map(render)}
        {danger.length > 0 && safe.length > 0 && <DropdownMenuSeparator />}
        {danger.map(render)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
