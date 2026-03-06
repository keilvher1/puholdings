"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  LayoutDashboard, 
  Newspaper, 
  Briefcase, 
  BarChart3, 
  MessageSquare,
  LogOut,
  Settings
} from "lucide-react"
import type { AdminUser } from "@/lib/auth"

const navItems = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/news", label: "최신 소식", icon: Newspaper },
  { href: "/admin/portfolio", label: "포트폴리오", icon: Briefcase },
  { href: "/admin/stats", label: "통계", icon: BarChart3 },
  { href: "/admin/inquiries", label: "문의 관리", icon: MessageSquare },
]

export function AdminSidebar({ user }: { user: AdminUser }) {
  const pathname = usePathname()

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" })
    window.location.href = "/admin/login"
  }

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-warm-tan bg-card">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-warm-tan px-6">
          <Link href="/admin" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-dark text-primary-foreground text-sm font-bold">
              PU
            </div>
            <span className="font-semibold text-dark">CMS</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== "/admin" && pathname.startsWith(item.href))
            const Icon = item.icon
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
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

        {/* User section */}
        <div className="border-t border-warm-tan p-4">
          <div className="mb-3 px-3">
            <p className="text-sm font-medium text-dark">{user.name || "관리자"}</p>
            <p className="text-xs text-text-secondary">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-warm-beige hover:text-dark transition-colors"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>
      </div>
    </aside>
  )
}
