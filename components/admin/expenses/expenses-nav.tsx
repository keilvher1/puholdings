"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

// 사업비 정산 하위 탭(BillingNav와 같은 글자 탭). 모바일에서는 가로로 스크롤된다.
const tabs = [
  { href: "/admin/expenses", label: "증빙 올리기" },
  { href: "/admin/expenses/receipts", label: "증빙 내역" },
  { href: "/admin/expenses/projects", label: "사업·프로젝트" },
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
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors sm:px-4",
              active ? "border-gold font-semibold text-dark" : "border-transparent font-medium text-text-secondary hover:text-dark"
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
