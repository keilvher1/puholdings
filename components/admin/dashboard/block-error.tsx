"use client"

// 홈 블록 하나를 불러오지 못했을 때의 오류 상태(다른 블록은 정상 표시) — [다시 시도]는 서버 화면을 다시 읽는다.
// 실패를 0건으로 보이지 않게 하려고 둔다(계획서 4.1.3 상태별 화면).
//
// 사용 예(서버 컴포넌트): {todoError ? <BlockError title="할 일 건수를 불러오지 못했어요" /> : <TodoList … />}

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { EmptyState } from "@/components/saas"

export function BlockError({ title, description }: { title: string; description?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <EmptyState
      kind="error"
      compact
      bordered
      title={title}
      description={pending ? "다시 불러오는 중…" : (description ?? "잠시 뒤 다시 시도해 주세요.")}
      onRetry={() => start(() => router.refresh())}
    />
  )
}
