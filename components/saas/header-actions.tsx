"use client"

// PageHeader 오른쪽 보조 버튼·⋯ 메뉴(page-header.tsx 내부용, 서버 컴포넌트인 PageHeader가 쓴다).
// 데스크톱: [보조 버튼들] [⋯(링크 메뉴)]. 휴대폰: [⋯] 하나 — 누르면 보조 버튼과 링크가 헤더 아래 한 줄로 펼쳐진다.
// 보조 버튼은 한 번만 그려 둔다(펼침은 CSS로) — 보조 버튼이 연 대화상자가 메뉴를 닫을 때 같이 사라지지 않게.

import { useState, type ReactNode } from "react"
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

export interface HeaderMoreLink {
  label: string
  href: string
  danger?: boolean
}

export function HeaderSecondary({ secondary, more = [], title }: { secondary?: ReactNode; more?: HeaderMoreLink[]; title: string }) {
  const [open, setOpen] = useState(false)
  const hasSecondary = secondary !== undefined && secondary !== null && secondary !== false
  const safe = more.filter((m) => !m.danger)
  const danger = more.filter((m) => m.danger)
  const sorted = [...safe, ...danger]
  if (!hasSecondary && sorted.length === 0) return null
  return (
    <>
      {/* 휴대폰 ⋯ : 보조 버튼과 링크를 펼친다 */}
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="size-11 hover:bg-warm-beige hover:text-dark sm:hidden"
        aria-label={`${title} 동작 더 보기`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Ellipsis aria-hidden />
      </Button>
      <div
        className={cn(
          "items-center gap-2",
          open ? "order-last flex basis-full flex-wrap pt-1 sm:order-none sm:basis-auto sm:pt-0" : "hidden sm:flex",
        )}
      >
        {/* 화면이 넘긴 보조 버튼은 형제 없는 감싸개(contents) 안에 — 늦게 오는 JS 조각 때문에 useId가 어긋나지 않게(admin-shell.tsx 머리 주석) */}
        {hasSecondary && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="contents">{secondary}</div>
          </div>
        )}
        {/* 휴대폰 펼침 안의 링크 */}
        {sorted.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 sm:hidden">
            {sorted.map((m) => (
              <Button key={m.href + m.label} asChild variant="outline" size="sm" className={cn("h-11 hover:bg-warm-beige hover:text-dark", m.danger && "text-red-800")}>
                <Link href={m.href}>{m.label}</Link>
              </Button>
            ))}
          </div>
        )}
      </div>
      {/* 데스크톱 ⋯ : 링크 메뉴 */}
      {sorted.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon-sm" className="hidden hover:bg-warm-beige hover:text-dark sm:inline-flex" aria-label={`${title} 동작 더 보기`}>
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="app-shell min-w-48">
            {safe.map((m) => (
              <DropdownMenuItem key={m.href + m.label} asChild className="min-h-9 text-[15px]">
                <Link href={m.href}>{m.label}</Link>
              </DropdownMenuItem>
            ))}
            {danger.length > 0 && safe.length > 0 && <DropdownMenuSeparator />}
            {danger.map((m) => (
              <DropdownMenuItem key={m.href + m.label} asChild className="min-h-9 text-[15px] text-red-800 focus:text-red-800">
                <Link href={m.href}>{m.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )
}
