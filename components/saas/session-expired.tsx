"use client"

// 무효 세션 안내 — "로그인이 끝났어요. 다시 로그인해 주세요 [로그인 화면으로]".
// 버튼은 먼저 로그아웃 API(POST)로 쿠키를 지운 뒤 로그인 화면(?next=지금 경로)으로 간다.
// 쿠키를 먼저 지우지 않으면 서명이 유효한 토큰(퇴실·삭제 기업)을 미들웨어가 로그인 화면에서 다시 홈으로 돌려보내 되돌림 고리에 빠진다.
//
// 사용 예(app/portal/layout.tsx — 이미 장착됨):
//   <SessionExpiredNotice logoutUrl="/api/portal/logout" loginPath="/portal/login" area="/portal/" />

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { safeNext } from "@/lib/safe-next"

export function SessionExpiredNotice({
  logoutUrl,
  loginPath,
  area,
  title = "로그인이 끝났어요",
  description = "다시 로그인해 주세요.",
}: {
  logoutUrl: string
  loginPath: string
  /** next로 돌아올 수 있는 영역("/portal/" 또는 "/admin/") */
  area: "/portal/" | "/admin/"
  title?: string
  description?: string
}) {
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      await fetch(logoutUrl, { method: "POST", credentials: "include" })
    } catch {
      // 쿠키를 못 지워도 로그인 화면으로는 보낸다(미들웨어가 막으면 다시 이 화면이 보인다)
    }
    const here = `${window.location.pathname}${window.location.search}`
    const next = safeNext(here, area)
    window.location.href = next ? `${loginPath}?next=${encodeURIComponent(next)}` : loginPath
  }
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-dark">{title}</h1>
      <p className="mt-2 text-base text-text-secondary">{description}</p>
      <Button type="button" className="mt-6 h-11 px-6 text-base" onClick={go} disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        로그인 화면으로
      </Button>
    </div>
  )
}
