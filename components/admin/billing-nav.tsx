"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const tabs = [
  { href: "/admin/billing", label: "검침 입력" },
  { href: "/admin/billing/bills", label: "청구서" },
  { href: "/admin/billing/items", label: "항목 관리" },
]

export function BillingNav() {
  const pathname = usePathname()
  return (
    <div className="mb-6 flex gap-1 border-b border-warm-tan">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "border-gold text-dark"
                : "border-transparent text-text-secondary hover:text-dark"
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
