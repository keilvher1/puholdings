"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut, Settings, LayoutDashboard } from "lucide-react"

const navItems = [
  { href: "/portal", label: "대시보드", icon: LayoutDashboard },
  { href: "/portal/settings", label: "설정", icon: Settings },
]

export function PortalNav({
  tenantName,
  userName,
}: {
  tenantName: string
  userName: string | null
}) {
  const pathname = usePathname()

  const handleLogout = async () => {
    await fetch("/api/portal/logout", { method: "POST" })
    window.location.href = "/portal/login"
  }

  return (
    <header className="sticky top-0 z-40 border-b border-warm-tan bg-card">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/portal" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-dark text-primary-foreground text-sm font-bold">
              PU
            </div>
            <div>
              <p className="text-sm font-semibold text-dark leading-tight">{tenantName || "입주기업 포털"}</p>
              <p className="text-xs text-text-secondary leading-tight">입주기업 포털</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/portal" && pathname.startsWith(item.href))
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-dark text-primary-foreground"
                      : "text-text-secondary hover:bg-warm-beige hover:text-dark"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {userName && <span className="hidden text-sm text-text-secondary sm:inline">{userName} 님</span>}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-warm-beige hover:text-dark transition-colors"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>
      </div>
    </header>
  )
}
