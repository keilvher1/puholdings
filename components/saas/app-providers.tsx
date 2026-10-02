"use client"

// 관리자·포털 레이아웃이 한 번 감싸는 공통 Provider: TooltipProvider + ConfirmProvider + 토스트(Toaster).
// 세션이 있는 분기와 없는 분기(로그인 화면) 모두에 장착되어, 어느 클라이언트 컴포넌트에서든 useConfirm()·toastSuccess()를 쓸 수 있다.
//
// 사용 예(app/admin/layout.tsx, app/portal/layout.tsx — 이미 장착됨):
//   <AppProviders variant="admin">{children}</AppProviders>
//
// 토스트: 하단 중앙, 밝은 테마 고정(next-themes 없이), 4초, 최대 3개, 글자 15px, [닫기] 버튼.
//   띄움 거리 — 관리자 80px(하단 고정 바·BulkActionBar의 주 버튼을 가리지 않게),
//               포털 휴대폰 = 하단 탭 56px + safe-area + 8px(데스크톱 72px).
// 메신저 화면(/admin/messenger·/portal/messenger)은 메신저 부품이 자기 sonner Toaster를 따로 붙이므로 여기서는 그리지 않는다
// (sonner 1.x는 Toaster마다 같은 토스트를 그려, 둘이 있으면 토스트가 두 번 보인다). toastSuccess()는 그 Toaster로 그대로 나간다.

import { useEffect, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import { Toaster } from "sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ConfirmProvider } from "./confirm"
import { markToasterMounted } from "./toast"

const OFFSET = {
  admin: { desktop: { bottom: 80 }, mobile: { bottom: 80, left: 16, right: 16 } },
  portal: {
    desktop: { bottom: 72 },
    mobile: { bottom: "calc(56px + env(safe-area-inset-bottom) + 8px)", left: 16, right: 16 },
  },
} as const

/** 자기 Toaster를 가진 화면(메신저). 여기서 Toaster를 또 그리면 토스트가 두 번 보인다 */
function hasOwnToaster(pathname: string): boolean {
  return /^\/(admin|portal)\/messenger(\/|$)/.test(pathname)
}

export function AppProviders({ variant, children }: { variant: "admin" | "portal"; children: ReactNode }) {
  const ownToaster = hasOwnToaster(usePathname() ?? "")
  useEffect(() => {
    markToasterMounted(true)
    return () => markToasterMounted(false)
  }, [])
  return (
    <TooltipProvider delayDuration={300}>
      <ConfirmProvider>
        {children}
        {!ownToaster && (
          <Toaster
            position="bottom-center"
            theme="light"
            duration={4000}
            visibleToasts={3}
            closeButton={false}
            containerAriaLabel="알림"
            offset={OFFSET[variant].desktop}
            mobileOffset={OFFSET[variant].mobile}
            toastOptions={{
              classNames: {
                toast: "!rounded-md !border !border-warm-tan !bg-card !text-dark !text-[15px] !gap-2",
                title: "!text-[15px] !font-medium",
                description: "!text-sm !text-text-secondary",
                actionButton: "!h-8 !rounded-md !bg-primary !px-3 !text-sm !text-primary-foreground",
                cancelButton: "!h-8 !rounded-md !border !border-warm-tan !bg-card !px-3 !text-sm !text-dark",
                success: "[&_[data-icon]]:!text-green-800",
              },
            }}
          />
        )}
      </ConfirmProvider>
    </TooltipProvider>
  )
}
