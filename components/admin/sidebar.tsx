"use client"

// 관리자 셸 — 고정 사이드바(1024px 이상)와 모바일 바 + 서랍(1024px 미만). WP0b(계획서 3.1·4.1.1).
// 메뉴 정의·화면 이름은 lib/help/shell.ts. 배지 값은 레이아웃(app/admin/layout.tsx)이 getAdminTodo() → sidebarBadges()로 1회 조회해 넘긴다.
//
// 사용 예(레이아웃):
//   <AdminSidebar user={session} badges={badges} />
//   <AdminMobileBar user={session} badges={badges} />
//
// 높이 예산(1280×600, 150% 배율): 로고 줄 56 + 홈 36 + 그룹 3개 × (제목 32 + 항목 36 × n) + 접힌 그룹 36 + 사용자 줄 56 = 568px
// (+ 메뉴 영역 위아래 여백 16 + 접힌 그룹 위 간격 8 = 592px, 가용 600px. 계획서의 "584"는 같은 식의 덧셈 오류).
// 그래도 넘치면 로고·사용자 줄은 고정, 메뉴 영역(<nav>)만 세로로 스크롤한다(어두운 바탕용 얇은 스크롤바).

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  Briefcase,
  Building2,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  DoorOpen,
  ExternalLink,
  Home,
  Layout,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  MessageSquare,
  MessagesSquare,
  Newspaper,
  Receipt,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CountBadge } from "@/components/saas/status-badge"
import { cn } from "@/lib/utils"
import type { AdminUser } from "@/lib/auth"
import type { SidebarBadges } from "@/lib/admin-todo"
import {
  ADMIN_HOME_ITEM,
  ADMIN_NAV,
  adminBadgeSrLabel,
  adminScreenName,
  isActiveHref,
  type AdminNavGroup,
  type AdminNavItem,
  type AdminNavKey,
} from "@/lib/help/shell"

const ICONS: Record<AdminNavKey, LucideIcon> = {
  home: Home,
  billing: Receipt,
  expenses: Wallet,
  rooms: DoorOpen,
  tenants: Building2,
  programs: ClipboardList,
  messenger: MessagesSquare,
  inquiries: MessageSquare,
  emails: Mail,
  site: Layout,
  news: Newspaper,
  popups: Megaphone,
  portfolio: Briefcase,
  stats: BarChart3,
}

export interface AdminShellProps {
  user: AdminUser
  /** 메뉴 건수 배지. 조회 실패·세션 없음이면 null(배지만 숨김) */
  badges?: SidebarBadges | null
}

// 메뉴 한 줄. 고정 사이드바 36px(높이 예산), 1024px 미만 서랍 44px(휴대폰 누름 영역, 계획서 2.4).
// 활성: aria-current="page" + 왼쪽 3px 금색 막대 + 굵은 글자
const ROW = "relative flex w-full items-center gap-3 rounded-md px-3 text-[15px] transition-colors"
/** 서랍(onNavigate가 있음)이면 44px, 고정 사이드바면 36px */
const rowHeight = (inDrawer: boolean) => (inDrawer ? "h-11" : "h-9")
const ROW_IDLE = "font-medium text-white/75 hover:bg-white/5 hover:text-white"
const ROW_ACTIVE = "bg-white/10 font-semibold text-white"

function ActiveBar() {
  return <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gold" />
}

function NavLink({
  item,
  pathname,
  badges,
  onNavigate,
  indent = false,
}: {
  item: AdminNavItem
  pathname: string
  badges: SidebarBadges | null
  onNavigate?: () => void
  indent?: boolean
}) {
  const active = isActiveHref(pathname, item.href)
  const Icon = ICONS[item.key]
  const count = item.badge && badges ? badges[item.badge] : 0
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(ROW, rowHeight(!!onNavigate), active ? ROW_ACTIVE : ROW_IDLE, indent && "pl-9")}
    >
      {active && <ActiveBar />}
      <Icon aria-hidden className={cn("h-4 w-4 shrink-0", active ? "text-gold" : "text-white/55")} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge && (
        <CountBadge count={count} srLabel={adminBadgeSrLabel(item.badge, count)} className="bg-white/15 text-white" />
      )}
    </Link>
  )
  if (!item.oldName) return link
  // 바뀐 이름은 다음 라운드까지 옛 이름을 툴팁으로 둔다
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="text-sm">
        {item.label} — 전 {item.oldName}
      </TooltipContent>
    </Tooltip>
  )
}

function NavGroup({
  group,
  pathname,
  badges,
  onNavigate,
}: {
  group: AdminNavGroup
  pathname: string
  badges: SidebarBadges | null
  onNavigate?: () => void
}) {
  const headingId = `admin-nav-${group.key}`
  return (
    <div role="group" aria-labelledby={headingId}>
      {/* 그룹 제목: 24px + 위 간격 8px, 13px, 대문자·자간 효과 없음. 금색은 글자에 쓰지 않는다(계획서 2.4) — 흰색 65%(어두운 바탕 약 7:1) */}
      <p id={headingId} className="mt-2 flex h-6 items-end px-3 pb-1 text-[13px] font-semibold leading-none text-white/65">
        {group.label}
      </p>
      {group.items.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} badges={badges} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

// 접히는 그룹("홈페이지"). 기본 접힘. 접혀 있어도 안에 현재 화면이 있으면 그룹 줄을 활성으로 표시한다.
function CollapsibleGroup({
  group,
  pathname,
  badges,
  onNavigate,
}: {
  group: AdminNavGroup
  pathname: string
  badges: SidebarBadges | null
  onNavigate?: () => void
}) {
  const [open, setOpen] = useState(false)
  const containsCurrent = group.items.some((item) => isActiveHref(pathname, item.href))
  const showActive = containsCurrent && !open
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(ROW, rowHeight(!!onNavigate), showActive ? ROW_ACTIVE : ROW_IDLE, "text-left")}
        aria-label={`${group.label} 메뉴 ${group.items.length}개${containsCurrent ? " (지금 화면이 들어 있어요)" : ""}`}
      >
        {showActive && <ActiveBar />}
        <ChevronRight
          aria-hidden
          className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-90", showActive ? "text-gold" : "text-white/55")}
        />
        <span className="min-w-0 flex-1 truncate">
          {group.label} <span className="font-normal text-white/60">({group.items.length})</span>
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {group.items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} badges={badges} onNavigate={onNavigate} indent />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

function UserMenu({ user }: { user: AdminUser }) {
  const name = user.name || "관리자"
  const initial = (user.name || user.email || "관").slice(0, 1).toUpperCase()

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" })
    } finally {
      window.location.href = "/admin/login"
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-10 w-full items-center gap-3 rounded-md px-2 text-left text-white/85 transition-colors hover:bg-white/5 hover:text-white"
        aria-label={`${name} 계정 메뉴 열기`}
      >
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white"
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{name}</span>
        <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 text-white/55" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="text-sm font-normal text-text-secondary">
          <span className="block truncate font-medium text-dark">{name}</span>
          <span className="block truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer text-[15px] focus:bg-warm-beige focus:text-dark">
          <a href="/" target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden className="h-4 w-4" />
            홈페이지 보기
            <span className="sr-only">(새 창)</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleLogout} className="cursor-pointer text-[15px] focus:bg-warm-beige focus:text-dark">
          <LogOut aria-hidden className="h-4 w-4" />
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Logo({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/admin" onClick={onNavigate} className="flex items-center gap-3 rounded-md" aria-label="포항연합기술지주 관리자 홈">
      <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-md bg-gold text-sm font-black text-dark">
        PU
      </span>
      <span className="text-[15px] font-bold text-white">포항연합기술지주</span>
    </Link>
  )
}

function NavContent({
  user,
  badges,
  onNavigate,
  closeButton,
}: {
  user: AdminUser
  badges: SidebarBadges | null
  onNavigate?: () => void
  closeButton?: React.ReactNode
}) {
  const pathname = usePathname() || "/admin"
  return (
    <div className="flex h-full flex-col bg-dark" data-surface="dark">
      {/* 로고 줄 56px(고정) */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <Logo onNavigate={onNavigate} />
        {closeButton}
      </div>

      {/* 메뉴 영역만 스크롤 */}
      <nav
        aria-label="관리자 메뉴"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 [scrollbar-color:rgba(255,255,255,0.28)_transparent] [scrollbar-width:thin]"
      >
        <NavLink item={ADMIN_HOME_ITEM} pathname={pathname} badges={badges} onNavigate={onNavigate} />
        {ADMIN_NAV.map((group) =>
          group.collapsible ? (
            <div key={group.key} className="mt-2">
              <CollapsibleGroup group={group} pathname={pathname} badges={badges} onNavigate={onNavigate} />
            </div>
          ) : (
            <NavGroup key={group.key} group={group} pathname={pathname} badges={badges} onNavigate={onNavigate} />
          ),
        )}
      </nav>

      {/* 사용자 줄 56px(고정). 누르면 [홈페이지 보기] [로그아웃] */}
      <div className="flex h-14 shrink-0 items-center border-t border-white/10 px-3">
        <UserMenu user={user} />
      </div>
    </div>
  )
}

/** 데스크톱 고정 사이드바(1024px 이상). 인쇄 때 숨김 */
export function AdminSidebar({ user, badges = null }: AdminShellProps) {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-dvh w-64 lg:block print:hidden">
      <NavContent user={user} badges={badges} />
    </aside>
  )
}

/** 1024px 미만 상단 바: [메뉴 열기] · 현재 화면 이름 · 오늘 할 일 배지(누르면 홈) + 왼쪽 서랍 */
export function AdminMobileBar({ user, badges = null }: AdminShellProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname() || "/admin"
  const screenName = adminScreenName(pathname)
  const todo = badges?.homeTotal ?? 0
  return (
    // Sheet(Root)는 DOM을 그리지 않는다. [메뉴 열기]를 SheetTrigger로 두어야 서랍이 닫힐 때
    // (Esc·[메뉴 닫기]·메뉴 이동) Radix가 포커스를 [메뉴 열기]로 되돌린다.
    <Sheet open={open} onOpenChange={setOpen}>
      <div
        className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-white/10 bg-dark px-2 lg:hidden print:hidden"
        data-surface="dark"
        data-sticky-top=""
      >
        <SheetTrigger asChild>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-white/85 hover:bg-white/10"
            aria-label="메뉴 열기"
          >
            <Menu aria-hidden className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <p className="min-w-0 flex-1 truncate text-base font-semibold text-white">
          {screenName}
        </p>
        {todo > 0 && (
          <Link
            href="/admin"
            className="flex h-11 shrink-0 items-center gap-2 rounded-md px-2 text-sm font-medium text-white/85 hover:bg-white/10"
            aria-label={`오늘 할 일 ${todo}건 — 홈으로`}
          >
            {/* 메신저 화면의 "할 일" 버튼과 헷갈리지 않게 "오늘 할 일"로 쓴다 */}
            <span aria-hidden>오늘 할 일</span>
            <CountBadge count={todo} srLabel="" className="bg-white/15 text-white" />
          </Link>
        )}
      </div>
      {/* 시트는 body 바로 아래에 그려지므로 .app-shell을 다시 달아 어두운 바탕 포커스(금색)를 받는다.
          shadcn 기본 닫기 버튼(영문 이름)은 숨기고 한국어 [메뉴 닫기]를 로고 줄에 둔다 */}
      <SheetContent side="left" className="app-shell w-72 max-w-[85vw] gap-0 border-0 p-0 [&>button:last-child]:hidden">
        <SheetTitle className="sr-only">관리자 메뉴</SheetTitle>
        <SheetDescription className="sr-only">이동할 화면을 고를 수 있어요</SheetDescription>
        <NavContent
          user={user}
          badges={badges}
          onNavigate={() => setOpen(false)}
          closeButton={
            <SheetClose
              className="flex h-11 w-11 items-center justify-center rounded-md text-white/85 hover:bg-white/10"
              aria-label="메뉴 닫기"
            >
              <X aria-hidden className="h-5 w-5" />
            </SheetClose>
          }
        />
      </SheetContent>
    </Sheet>
  )
}
