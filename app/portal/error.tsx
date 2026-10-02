"use client"

// 포털 오류 경계(WP8, 계획서 4.1.5). 상단 바·하단 탭(레이아웃)은 그대로 두고 본문 자리에만 안내한다.
import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/saas"

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Portal page error:", error)
  }, [error])
  return (
    <EmptyState
      kind="error"
      bordered
      title="이 화면을 불러오지 못했어요"
      description="잠시 뒤 다시 시도해 주세요. 계속 안 되면 창업보육센터로 연락해 주세요."
      onRetry={reset}
      action={
        <Button asChild variant="outline" className="h-11 text-base hover:bg-warm-beige hover:text-dark">
          <Link href="/portal">홈으로</Link>
        </Button>
      }
    />
  )
}
