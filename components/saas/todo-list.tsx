// 할 일 목록(TodoList)과 요약 숫자(StatCard) — 관리자 홈·포털 홈. 서버·클라이언트 공용(훅 없음).
//   TodoList: 한 줄 = 영역 글자 태그 + 문장(건수·금액·기한) + 오른쪽 이동 링크. 행 전체가 링크(높이 48px 이상).
//             0건 줄은 부르는 쪽이 빼고 넘긴다(lib/admin-todo의 visibleTodoLines). 모두 없으면 "오늘 처리할 일이 없어요".
//             state="error"면 0건이 아니라 "할 일 건수를 불러오지 못했어요" + [다시 시도]를 보인다.
//   StatCard: href가 있으면 테두리 + 오른쪽 꺾쇠로 "누를 수 있음"을 보이고, 없으면 테두리 없는 숫자. 아이콘 타일을 쓰지 않는다.
//
// 사용 예:
//   <TodoList state="ready" items={[
//     { key: "draft", area: "관리비", title: "10월분 청구서 22건 · 작성 중 · 발행 전 · 10,637,510원", href: billingCloseHref("2026-09", 4), actionLabel: "발행하러 가기" },
//     { key: "inbox", area: "증빙", title: "데스크톱 앱에서 온 증빙 6건이 확인을 기다려요", href: expensesHref({ inbox: true }), actionLabel: "확인하기" },
//   ]} />
//   <StatCard label="입주율" value="83" unit="%" hint="30실 중 25실" href={roomsHref()} />

import type { ReactNode } from "react"
import Link from "next/link"
import { ChevronRight, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { EmptyState } from "./empty-state"

export interface TodoItem {
  key: string
  /** 영역 글자 태그(관리비·증빙·호실·프로그램·문의·메일) */
  area: string
  /** 문장(건수·금액·기한) */
  title: ReactNode
  /** 보조 한 줄 */
  detail?: ReactNode
  href: string
  /** 오른쪽 이동 글자("발행하러 가기") */
  actionLabel: string
  /** warning: 앞에 경고 아이콘(정정 중 등). 숫자를 빨갛게 칠하지 않는다 */
  tone?: "default" | "warning"
}

export function TodoList({
  items,
  state,
  onRetry,
  retryHref,
  emptyText = "오늘 처리할 일이 없어요",
  emptyDetail,
  errorText = "할 일 건수를 불러오지 못했어요",
  className,
}: {
  items: TodoItem[]
  state: "loading" | "error" | "ready"
  onRetry?: () => void
  retryHref?: string
  emptyText?: string
  emptyDetail?: ReactNode
  errorText?: string
  className?: string
}) {
  if (state === "loading") {
    return (
      <div role="status" className={cn("divide-y divide-warm-tan/70 rounded-md border border-warm-tan bg-card", className)}>
        <span className="sr-only">할 일을 불러오는 중…</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-12 items-center gap-3 px-4 py-3">
            <span aria-hidden className="block h-5 w-12 rounded-sm bg-warm-beige" />
            <span aria-hidden className={cn("block h-3.5 rounded-sm bg-warm-beige", i === 1 ? "w-1/2" : "w-2/3")} />
          </div>
        ))}
      </div>
    )
  }
  if (state === "error") {
    return (
      <EmptyState kind="error" compact bordered title={errorText} onRetry={onRetry} retryHref={retryHref} className={className} />
    )
  }
  if (items.length === 0) {
    return <EmptyState kind="first-use" compact bordered title={emptyText} description={emptyDetail} className={className} />
  }
  return (
    <ul className={cn("divide-y divide-warm-tan/70 overflow-hidden rounded-md border border-warm-tan bg-card", className)}>
      {items.map((it) => (
        <li key={it.key}>
          <Link
            href={it.href}
            className="group flex min-h-12 items-center gap-3 px-4 py-3 hover:bg-warm-ivory"
          >
            <span className="inline-flex h-6 w-16 shrink-0 items-center justify-center rounded-sm bg-warm-beige px-1 text-xs font-medium text-[#3f3f4e]">
              {it.area}
            </span>
            <span className="min-w-0 flex-1 text-base leading-snug text-dark [word-break:keep-all]">
              {it.tone === "warning" && <TriangleAlert className="mr-1 inline size-4 align-[-2px] text-amber-800" aria-label="확인 필요" />}
              {it.title}
              {it.detail && <span className="mt-0.5 block text-sm text-[#3f3f4e]">{it.detail}</span>}
            </span>
            <span className="hidden shrink-0 items-center gap-0.5 text-[15px] font-medium text-link underline-offset-2 group-hover:underline sm:inline-flex">
              {it.actionLabel}
              <ChevronRight className="size-4" aria-hidden />
            </span>
            <ChevronRight className="size-4 shrink-0 text-[#3f3f4e] sm:hidden" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function StatCard({
  label,
  value,
  unit,
  href,
  hint,
  className,
}: {
  label: ReactNode
  value: ReactNode
  unit?: string
  href?: string
  hint?: ReactNode
  className?: string
}) {
  const body = (
    <>
      <span className="block text-sm font-medium text-[#3f3f4e]">{label}</span>
      <span className="mt-0.5 flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums text-dark">{value}</span>
        {unit && <span className="text-base text-[#3f3f4e]">{unit}</span>}
      </span>
      {hint && <span className="mt-0.5 block text-sm text-[#3f3f4e] [word-break:keep-all]">{hint}</span>}
    </>
  )
  if (href) {
    return (
      <Link
        href={href}
        className={cn("flex min-h-12 items-center justify-between gap-3 rounded-md border border-warm-tan bg-card px-4 py-3 hover:border-dark", className)}
      >
        <span className="min-w-0">{body}</span>
        <ChevronRight className="size-4 shrink-0 text-[#3f3f4e]" aria-hidden />
      </Link>
    )
  }
  return <div className={cn("px-1 py-2", className)}>{body}</div>
}
