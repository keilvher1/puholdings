"use client"

// 포털 계정 화면의 클라이언트 조각(WP8, 계획서 4.5.8) — 로그아웃 버튼.
// 휴대폰에서는 하단 탭에 로그아웃이 없으므로 계정 화면 맨 아래가 로그아웃의 유일한 자리다.

import { useState } from "react"
import { LogOut } from "lucide-react"
import { BusyButton } from "@/components/saas"

export function PortalLogoutButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false)
  const logout = async () => {
    setBusy(true)
    try {
      await fetch("/api/portal/logout", { method: "POST", credentials: "include" })
    } catch {
      // 쿠키 삭제 요청이 실패해도 로그인 화면으로 보낸다(미들웨어가 다시 판단한다)
    }
    window.location.href = "/portal/login"
  }
  return (
    <BusyButton type="button" variant="outline" busy={busy} busyLabel="로그아웃하는 중…" onClick={logout} className={className}>
      <LogOut aria-hidden />
      로그아웃
    </BusyButton>
  )
}
