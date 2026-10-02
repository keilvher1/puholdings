"use client"

// 관리자 화면 오류 경계(계획서 4.1.5). 사이드바(레이아웃)는 그대로 살아 있고 본문만 이 화면으로 바뀐다.

import { startTransition, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/saas"

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()
  // 서버 컴포넌트 오류는 reset만으로 다시 불러오지 않을 수 있어 서버 데이터를 새로 받은 뒤 경계를 푼다
  const retry = () =>
    startTransition(() => {
      router.refresh()
      reset()
    })
  useEffect(() => {
    console.error("[admin] 화면 오류:", error)
  }, [error])
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <EmptyState
        kind="error"
        bordered
        title="이 화면을 불러오지 못했어요"
        description="잠시 뒤 다시 시도해 주세요. 계속 같은 화면이 보이면 홈에서 다른 메뉴로 이동해 주세요."
        onRetry={retry}
        action={
          <Button asChild variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark">
            <Link href="/admin">홈으로</Link>
          </Button>
        }
      />
    </div>
  )
}
