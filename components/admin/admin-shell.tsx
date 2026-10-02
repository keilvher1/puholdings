"use client"

// 관리자 셸 틀(클라이언트 한 덩어리): AppProviders + 본문 바로가기 + 사이드바 + 모바일 바 + <main>.
// app/admin/layout.tsx가 세션·배지를 읽은 뒤 이것 하나만 그린다(user가 null이면 로그인·최초 설정 화면 — 메뉴 없음).
//
// 왜 한 덩어리인가(X1 통합, 간헐 하이드레이션 경고 "attributes didn't match" — Radix aria-controls·id, label htmlFor):
//   서버 컴포넌트가 형제 배열 안에 클라이언트 컴포넌트를 두면, 그 JS 조각이 하이드레이션 시작 때 아직 없을 수 있다
//   (개발 서버 부하, 느린 휴대폰 회선). 그러면 RSC는 그 자리를 지연(lazy) 요소로 두고, React(Next 16.1 내장 19.3 canary)가
//   그 배열의 부모(div·Fragment)를 멈췄다 다시 그리면서 부모의 트리 분기 표시(Forked)를 지워, 부모 아래 모든 useId가 서버와
//   달라진다. 셸의 클라이언트 부품을 이 파일 하나로 묶으면 지연 요소가 레이아웃의 "형제 없는 자리" 한 곳에만 생겨
//   (layout.tsx의 display: contents 감싸개 안) 다시 그려도 id가 바뀌지 않는다.
//   → 레이아웃에 클라이언트 컴포넌트를 더할 때는 layout.tsx가 아니라 이 파일에 넣는다.
//
// 사용 예(app/admin/layout.tsx, 서버):
//   <div className="app-shell …"><div className="contents"><AdminShellFrame user={session} badges={badges}>{children}</AdminShellFrame></div></div>

import type { ReactNode } from "react"
import type { AdminUser } from "@/lib/auth"
import type { SidebarBadges } from "@/lib/admin-todo"
import { AppProviders } from "@/components/saas/app-providers"
import { cn } from "@/lib/utils"
import { AdminMobileBar, AdminSidebar } from "./sidebar"

function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-base focus:font-semibold focus:text-dark focus:outline-2 focus:outline-dark"
    >
      본문 바로가기
    </a>
  )
}

export function AdminShellFrame({
  user,
  badges = null,
  children,
}: {
  /** 세션 사용자. null이면 메뉴 없이 본문만(로그인·최초 설정) */
  user: AdminUser | null
  /** 메뉴 건수 배지(조회 실패면 null — 배지만 숨김) */
  badges?: SidebarBadges | null
  children: ReactNode
}) {
  return (
    <AppProviders variant="admin">
      <SkipLink />
      {user && <AdminSidebar user={user} badges={badges} />}
      {user && <AdminMobileBar user={user} badges={badges} />}
      <main id="main" tabIndex={-1} className={cn("outline-none", user && "lg:ml-64 print:ml-0")}>
        {children}
      </main>
    </AppProviders>
  )
}
