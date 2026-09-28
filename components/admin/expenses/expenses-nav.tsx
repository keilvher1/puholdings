"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { FolderKanban, ListChecks, Upload } from "lucide-react"

// 사업비 정산 하위 탭(BillingNav 패턴). 모바일에서는 가로로 스크롤된다.
const tabs = [
  { href: "/admin/expenses", label: "증빙 올리기", icon: Upload },
  { href: "/admin/expenses/receipts", label: "증빙 내역", icon: ListChecks },
  { href: "/admin/expenses/projects", label: "사업·프로젝트", icon: FolderKanban },
]

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin/expenses") return pathname === href
  return pathname === href || pathname.startsWith(href + "/")
}

export function ExpensesNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="사업비 정산 메뉴" className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-warm-tan [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const active = isActive(pathname, tab.href)
        const Icon = tab.icon
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 ${
              active ? "border-gold text-dark" : "border-transparent text-text-secondary hover:text-dark"
            }`}
          >
            <Icon className={`h-4 w-4 ${active ? "text-gold" : "text-text-tertiary"}`} />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
