"use client"

// 경로 기반 하위 탭(관리비 정산 3탭·증빙 처리 4탭 등). page-header.tsx가 다시 내보낸다 — import는 "@/components/saas"에서.
// 현재 탭에 aria-current="page", 건수는 중립 CountBadge, 휴대폰에서는 가로 스크롤.
//
// 사용 예:
//   <SubNav label="관리비 정산 메뉴" items={[
//     { href: "/admin/billing", label: "월 마감", exact: true },
//     { href: "/admin/billing/bills", label: "청구서", count: 4 },
//     { href: "/admin/billing/settings", label: "기준 정보" },
//   ]} />

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { CountBadge } from "./status-badge"

export interface SubNavItem {
  href: string
  label: string
  count?: number | null
  /** 경로가 정확히 같을 때만 현재 탭(상위 경로 탭에 쓴다). 기본은 하위 경로도 현재 탭 */
  exact?: boolean
}

function isActive(pathname: string, item: SubNavItem): boolean {
  if (pathname === item.href) return true
  return !item.exact && pathname.startsWith(item.href + "/")
}

export function SubNav({ items, label = "하위 메뉴", className }: { items: SubNavItem[]; label?: string; className?: string }) {
  const pathname = usePathname() ?? ""
  return (
    <nav
      aria-label={label}
      className={cn(
        "mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-warm-tan [scrollbar-width:none] print:hidden [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item) => {
        const active = isActive(pathname, item)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[15px] transition-colors sm:px-4",
              active ? "border-dark font-semibold text-dark" : "border-transparent font-medium text-text-secondary hover:border-warm-tan hover:text-dark",
            )}
          >
            {item.label}
            {/* 링크 이름이 "증빙 올리기 6건"이 되게 srLabel에는 건수만(탭 이름을 두 번 읽지 않게) */}
            <CountBadge count={item.count} srLabel={`${item.count ?? 0}건`} />
          </Link>
        )
      })}
    </nav>
  )
}
