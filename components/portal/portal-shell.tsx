"use client"

// 입주기업 포털 셸 틀(클라이언트 한 덩어리): AppProviders + 본문 바로가기 + 상단 바 + <main> + 하단 탭.
// app/portal/layout.tsx가 세션을 읽은 뒤 이것 하나만 그린다. nav가 null이면 로그인 화면 등(메뉴 없음),
// revoked면 무효 세션 안내(SessionExpiredNotice)를 본문 대신 그린다.
// 한 덩어리로 묶는 이유는 components/admin/admin-shell.tsx 머리 주석과 같다(간헐 useId 하이드레이션 불일치 방지).
// → 포털 레이아웃에 클라이언트 컴포넌트를 더할 때는 layout.tsx가 아니라 이 파일에 넣는다.

import type { ReactNode } from "react"
import { AppProviders } from "@/components/saas/app-providers"
import { SessionExpiredNotice } from "@/components/saas/session-expired"
import { BottomTabs } from "./bottom-tabs"
import { PortalNav, type PortalNavProps } from "./nav"

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

export function PortalShellFrame({
  nav,
  unpaidCount = 0,
  revoked = false,
  children,
}: {
  /** 세션이 있을 때 상단 바 props. null이면 메뉴 없이 본문만 */
  nav: PortalNavProps | null
  /** 하단 탭 "청구서" 배지(issued+overdue 건수) */
  unpaidCount?: number
  /** 서명은 유효하지만 세션이 거절된 토큰(퇴실·삭제) — 본문 대신 무효 세션 안내 */
  revoked?: boolean
  children: ReactNode
}) {
  if (!nav) {
    return (
      <AppProviders variant="portal">
        <SkipLink />
        <main id="main" tabIndex={-1} className="outline-none">
          {revoked ? <SessionExpiredNotice logoutUrl="/api/portal/logout" loginPath="/portal/login" area="/portal/" /> : children}
        </main>
      </AppProviders>
    )
  }
  return (
    <AppProviders variant="portal">
      <SkipLink />
      <PortalNav {...nav} />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-8 outline-none sm:pb-8">
        {children}
      </main>
      <BottomTabs restricted={nav.restricted ?? false} unpaidCount={unpaidCount} />
    </AppProviders>
  )
}
