"use client"

// 입주기업 포털 상단 바 — WP0b(계획서 3.3·4.5.1).
// - 640px 이상: 로고·기업명 · 메뉴 5개(홈·청구서·프로그램·메신저·계정, 활성 aria-current) · 문의 전화 · 사용자명 · 로그아웃
//   (640~767px은 폭이 모자라 전화·로그아웃을 아이콘 버튼으로, 768px부터 "문의"·"로그아웃" 글자, 1024px부터 전화번호·사용자명까지)
//   누름 영역은 모두 44px(계획서 2.4 포털 44px)
// - 640px 미만: 기업명 + 전화 아이콘 버튼(44×44)만. 메뉴는 하단 탭(components/portal/bottom-tabs.tsx), 로그아웃은 "계정" 화면 맨 아래
// - 임시 비밀번호 상태(restricted): 메뉴·전화를 숨기고 로고·로그아웃만(눌러도 되돌아오는 메뉴를 없앤다)
//
// 사용 예(레이아웃): <PortalNav tenantName="(주)솔바람테크" userName="김담당" restricted={false} contact={{ phone: "054-279-8710" }} />

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut, Phone } from "lucide-react"
import { cn } from "@/lib/utils"
import { PORTAL_NAV, isActiveHref, telHref } from "@/lib/help/shell"

export interface PortalNavProps {
  tenantName: string
  userName: string | null
  /** 임시 비밀번호 상태(must_change_password) — 메뉴를 숨긴다 */
  restricted?: boolean
  /** 문의 전화(사이트 콘텐츠 contact.phone, 기본값은 공개 푸터와 같은 값) */
  contact?: { phone?: string | null } | null
}

export function PortalNav({ tenantName, userName, restricted = false, contact }: PortalNavProps) {
  const pathname = usePathname() || "/portal"
  const phone = contact?.phone?.trim() || null

  const handleLogout = async () => {
    try {
      await fetch("/api/portal/logout", { method: "POST" })
    } finally {
      window.location.href = "/portal/login"
    }
  }

  const brand = (
    <>
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-dark text-sm font-bold text-primary-foreground"
      >
        PU
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[15px] font-semibold text-dark">{tenantName || "입주기업 포털"}</span>
        <span className="block truncate text-xs text-text-secondary">입주기업 포털</span>
      </span>
    </>
  )

  return (
    <header data-sticky-top="" className="sticky top-0 z-40 border-b border-warm-tan bg-card print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4 sm:h-16">
        {restricted ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">{brand}</div>
        ) : (
          <Link
            href="/portal"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md sm:max-w-[11rem] sm:flex-none md:max-w-[12rem] lg:max-w-[15rem]"
            aria-label={`${tenantName || "입주기업 포털"} 포털 홈`}
          >
            {brand}
          </Link>
        )}

        {!restricted && (
          <nav aria-label="포털 메뉴" className="hidden min-w-0 items-center gap-0.5 sm:flex">
            {PORTAL_NAV.map((item) => {
              const active = isActiveHref(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center whitespace-nowrap rounded-md px-2.5 text-[15px] font-medium transition-colors md:px-3",
                    active ? "bg-dark text-primary-foreground" : "text-text-secondary hover:bg-warm-beige hover:text-dark",
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {!restricted && phone && (
            <>
              {/* 768px 이상: "문의" 글자 링크(1024px부터 전화번호도 보인다). 이름은 폭과 상관없이 "문의 054-279-8710" */}
              <a
                href={telHref(phone)}
                aria-label={`문의 ${phone}`}
                title={`창업보육센터에 전화 ${phone}`}
                className="hidden h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm text-text-secondary hover:bg-warm-beige hover:text-dark md:flex"
              >
                <Phone aria-hidden className="h-4 w-4" />
                문의 <span className="hidden font-medium tabular-nums text-dark lg:inline">{phone}</span>
              </a>
              {/* 768px 미만: 전화 아이콘 버튼 44×44 */}
              <a
                href={telHref(phone)}
                className="flex h-11 w-11 items-center justify-center rounded-md text-dark hover:bg-warm-beige md:hidden"
                aria-label={`창업보육센터에 전화 ${phone}`}
                title={`창업보육센터에 전화 ${phone}`}
              >
                <Phone aria-hidden className="h-5 w-5" />
              </a>
            </>
          )}
          {userName && <span className="hidden whitespace-nowrap px-1 text-sm text-text-secondary lg:inline">{userName} 님</span>}
          {/* 로그아웃: 휴대폰에서는 "계정" 화면 맨 아래(하단 탭 → 계정). 임시 비밀번호 상태는 탭이 없으므로 여기 늘 보인다 */}
          <button
            type="button"
            onClick={handleLogout}
            className={cn(
              "h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap rounded-md px-2.5 text-sm text-text-secondary transition-colors hover:bg-warm-beige hover:text-dark",
              restricted ? "flex" : "hidden sm:flex",
            )}
            aria-label="로그아웃"
            title="로그아웃"
          >
            <LogOut aria-hidden className="h-4 w-4" />
            <span className={restricted ? undefined : "hidden md:inline"}>로그아웃</span>
          </button>
        </div>
      </div>
    </header>
  )
}
