"use client"

// 입주기업 포털 휴대폰 하단 탭 5개(홈·청구서·프로그램·메신저·계정) — WP0b(계획서 3.3·4.5.1).
// - 640px 미만에서만 보인다. 높이 56px + env(safe-area-inset-bottom). 칸마다 폭 1/5 · 높이 56px(44px 이상).
// - 활성 탭: 진한 글자 + 위쪽 2px 선 + aria-current="page". 청구서 탭에 낼 관리비 건수(CountBadge).
// - 입력칸에 포커스가 있는 동안(휴대폰 키보드가 열림) 숨긴다. 숨김 상태는 <html data-portal-tabs="hidden">으로도 알려
//   고정 배치 화면(포털 메신저)이 아래 여백을 거둘 수 있게 한다.
// - 임시 비밀번호 상태(restricted)면 그리지 않는다. 인쇄 때 숨김.
//
// 사용 예(레이아웃): <BottomTabs restricted={false} unpaidCount={2} />

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ClipboardList, Home, MessagesSquare, Receipt, UserRound, type LucideIcon } from "lucide-react"
import { CountBadge } from "@/components/saas/status-badge"
import { cn } from "@/lib/utils"
import { PORTAL_NAV, isActiveHref, opensKeyboard, type PortalNavKey } from "@/lib/help/shell"

export interface BottomTabsProps {
  /** 임시 비밀번호 상태(must_change_password)면 true — 탭을 숨긴다 */
  restricted: boolean
  /** 낼 관리비(납부 대기 + 기한 지남) 건수 — 청구서 탭 배지 */
  unpaidCount: number
}

const ICONS: Record<PortalNavKey, LucideIcon> = {
  home: Home,
  bills: Receipt,
  programs: ClipboardList,
  messenger: MessagesSquare,
  account: UserRound,
}

/** 화면 키보드가 열렸다고 볼 visualViewport 높이 감소폭(px) */
const KEYBOARD_MIN_PX = 150

/**
 * 입력칸 포커스 동안 true(키보드가 열린 상태로 본다).
 * 안드로이드 뒤로 버튼처럼 포커스를 둔 채 키보드만 닫히는 경우를 위해 visualViewport 높이도 본다:
 * 포커스 뒤 키보드가 열렸다가(높이가 줄었다가) 다시 닫히면(높이가 돌아오면) 탭을 다시 보인다.
 * 같은 입력칸을 다시 눌러 키보드가 열리면(높이가 다시 줄면) 또 숨긴다.
 * visualViewport 높이가 바뀌지 않는 환경(데스크톱 좁은 창 등)에서는 포커스만으로 판단한다.
 */
function useTypingFocus(): boolean {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    let fullHeight = vv?.height ?? window.innerHeight // 키보드가 없을 때의 높이(관찰한 최댓값)
    let lastWidth = window.innerWidth
    let keyboardSeen = false // 이번 포커스 동안 키보드가 열린 적이 있는지

    const focusedInput = () => opensKeyboard(document.activeElement as HTMLElement | null)
    const update = () => setTyping(focusedInput())
    const onFocusIn = (e: FocusEvent) => {
      // 키보드가 열린 채 다른 입력칸으로 옮겨 가면 이미 열린 것으로 본다
      keyboardSeen = !!vv && vv.height < fullHeight - KEYBOARD_MIN_PX
      setTyping(opensKeyboard(e.target as HTMLElement | null))
    }
    // focusout 직후에는 activeElement가 body라서, 다음 포커스가 정해진 뒤 다시 본다
    const onFocusOut = () => window.setTimeout(update, 0)
    const onViewportResize = () => {
      if (!vv) return
      // 화면을 돌리면(폭이 바뀌면) 기준 높이를 새로 잡는다
      if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth
        fullHeight = vv.height
      }
      fullHeight = Math.max(fullHeight, vv.height)
      if (!focusedInput()) return
      const keyboardOpen = vv.height < fullHeight - KEYBOARD_MIN_PX
      if (keyboardOpen) {
        keyboardSeen = true
        setTyping(true)
      } else if (keyboardSeen) {
        setTyping(false)
      }
    }
    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("focusout", onFocusOut)
    vv?.addEventListener("resize", onViewportResize)
    update()
    return () => {
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("focusout", onFocusOut)
      vv?.removeEventListener("resize", onViewportResize)
    }
  }, [])
  return typing
}

export function BottomTabs({ restricted, unpaidCount }: BottomTabsProps) {
  const pathname = usePathname() || "/portal"
  const typing = useTypingFocus()
  const hidden = restricted || typing

  useEffect(() => {
    const root = document.documentElement
    if (hidden) root.dataset.portalTabs = "hidden"
    else delete root.dataset.portalTabs
    return () => {
      delete root.dataset.portalTabs
    }
  }, [hidden])

  if (restricted) return null

  return (
    <nav
      aria-label="포털 메뉴"
      data-portal-bottom-tabs=""
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-warm-tan bg-card pb-[env(safe-area-inset-bottom)] sm:hidden print:hidden",
        typing && "hidden",
      )}
    >
      <ul className="grid h-14 grid-cols-5">
        {PORTAL_NAV.map((item) => {
          const active = isActiveHref(pathname, item.href)
          const Icon = ICONS[item.key]
          const count = item.key === "bills" ? unpaidCount : 0
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                // 화면 읽기 순서: 탭 이름 먼저("청구서, 낼 관리비 2건"). 배지는 눈으로만 아이콘 위에 둔다
                aria-label={count > 0 ? `${item.label}, 낼 관리비 ${count}건` : undefined}
                className={cn(
                  "relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 text-xs",
                  active ? "font-semibold text-dark" : "font-medium text-text-secondary hover:text-dark",
                )}
              >
                {active && <span aria-hidden className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-dark" />}
                <span className="relative">
                  <Icon aria-hidden className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
                  {count > 0 && (
                    <CountBadge
                      count={count}
                      srLabel=""
                      className="absolute -right-3.5 -top-2 border border-warm-tan"
                    />
                  )}
                </span>
                <span className="max-w-full truncate px-0.5">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
