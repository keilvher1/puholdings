"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Newspaper,
  Briefcase,
  BarChart3,
  MessageSquare,
  Megaphone,
  Building2,
  Mail,
  Receipt,
  DoorOpen,
  ClipboardList,
  Layout,
  LogOut,
  ExternalLink,
  Menu,
} from "lucide-react"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import type { AdminUser } from "@/lib/auth"

const NAV_SECTIONS: {
  label: string | null
  items: { href: string; label: string; icon: typeof LayoutDashboard }[]
}[] = [
  {
    label: null,
    items: [{ href: "/admin", label: "대시보드", icon: LayoutDashboard }],
  },
  {
    label: "홈페이지 관리",
    items: [
      { href: "/admin/site", label: "사이트 콘텐츠", icon: Layout },
      { href: "/admin/news", label: "최신 소식", icon: Newspaper },
      { href: "/admin/popups", label: "팝업", icon: Megaphone },
      { href: "/admin/portfolio", label: "포트폴리오", icon: Briefcase },
      { href: "/admin/stats", label: "통계", icon: BarChart3 },
      { href: "/admin/inquiries", label: "문의 관리", icon: MessageSquare },
    ],
  },
  {
    label: "입주기업 운영",
    items: [
      { href: "/admin/tenants", label: "입주기업", icon: Building2 },
      { href: "/admin/rooms", label: "호실 현황", icon: DoorOpen },
      { href: "/admin/billing", label: "관리비 정산", icon: Receipt },
      { href: "/admin/programs", label: "프로그램", icon: ClipboardList },
    ],
  },
  {
    label: "시스템",
    items: [{ href: "/admin/emails", label: "메일", icon: Mail }],
  },
]

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin"
  return pathname === href || pathname.startsWith(href + "/")
}

function NavContent({ user, onNavigate }: { user: AdminUser; onNavigate?: () => void }) {
  const pathname = usePathname()

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" })
    window.location.href = "/admin/login"
  }

  return (
    <div className="flex h-full flex-col bg-dark">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-5">
        <Link href="/admin" onClick={onNavigate} className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold text-sm font-black text-dark">
            PU
          </div>
          <div className="leading-tight">
            <p className="text-[13px] font-bold text-primary-foreground">포항연합기술지주</p>
            <p className="text-[10px] tracking-widest text-gold/70">ADMIN</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-5" : ""}>
            {section.label && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold/50">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActivePath(pathname, item.href)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                      active
                        ? "bg-white/10 text-primary-foreground"
                        : "text-primary-foreground/55 hover:bg-white/5 hover:text-primary-foreground"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-gold" : "text-primary-foreground/40 group-hover:text-gold/70"}`} />
                    {item.label}
                    {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold" />}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: site link + user */}
      <div className="shrink-0 border-t border-white/10 p-3">
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-primary-foreground/50 transition-colors hover:bg-white/5 hover:text-primary-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          홈페이지 보기
        </a>
        <div className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/20 text-xs font-bold text-gold">
            {(user.name || user.email || "A").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-xs font-medium text-primary-foreground">{user.name || "관리자"}</p>
            <p className="truncate text-[10px] text-primary-foreground/40">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            title="로그아웃"
            className="rounded-md p-1.5 text-primary-foreground/40 transition-colors hover:bg-white/10 hover:text-primary-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// 데스크톱 고정 사이드바
export function AdminSidebar({ user }: { user: AdminUser }) {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 md:block">
      <NavContent user={user} />
    </aside>
  )
}

// 모바일 상단 바 + 드로어
export function AdminMobileBar({ user }: { user: AdminUser }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-warm-tan bg-dark px-4 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="rounded-md p-1.5 text-primary-foreground/70 hover:bg-white/10" aria-label="메뉴 열기">
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 border-0 p-0 [&>button]:text-primary-foreground">
          <SheetTitle className="sr-only">관리자 메뉴</SheetTitle>
          <NavContent user={user} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gold text-xs font-black text-dark">PU</div>
        <span className="text-sm font-semibold text-primary-foreground">관리자</span>
      </div>
    </div>
  )
}
