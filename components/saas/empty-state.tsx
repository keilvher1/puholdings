// 빈 상태 3종(components/ui/empty 기반) — 처음 사용·조건에 맞는 것 없음·불러오기 실패. 서버·클라이언트 공용.
//   first-use: "아직 ○○이 없어요" + 설명 1줄 + 주 버튼 1개(action)
//   no-results: "조건에 맞는 ○○이 없어요" + [조건 지우기](onClear 또는 clearHref). 만들기 버튼은 두지 않는다
//   error: "○○을 불러오지 못했어요" + 원인 1줄 + [다시 시도](onRetry 또는 retryHref). 실패를 0건으로 보이지 않게 한다
// compact: 표 안(행 자리)에 넣는 작은 변형.
//
// 사용 예:
//   <EmptyState kind="first-use" title="아직 등록한 기업이 없어요" description="입주 처리를 하면 여기에 보여요" action={<Button>기업 등록</Button>} />
//   <EmptyState kind="no-results" title="조건에 맞는 청구서가 없어요" onClear={() => setFilters({})} />
//   <EmptyState kind="error" title="청구서를 불러오지 못했어요" description={error} onRetry={reload} />

import type { ReactNode } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { cn } from "@/lib/utils"

export type EmptyKind = "first-use" | "no-results" | "error"

export function EmptyState({
  kind = "first-use",
  title,
  description,
  action,
  onClear,
  clearHref,
  clearLabel = "조건 지우기",
  onRetry,
  retryHref,
  retryLabel = "다시 시도",
  compact = false,
  bordered = false,
  className,
}: {
  kind?: EmptyKind
  title: ReactNode
  description?: ReactNode
  /** first-use의 주 버튼(만들기). 다른 kind에서는 보조 동작 하나만 */
  action?: ReactNode
  onClear?: () => void
  clearHref?: string
  clearLabel?: string
  onRetry?: () => void
  retryHref?: string
  retryLabel?: string
  compact?: boolean
  bordered?: boolean
  className?: string
}) {
  const outline = "hover:bg-warm-beige hover:text-dark"
  let button: ReactNode = null
  if (kind === "no-results" && (onClear || clearHref)) {
    button = clearHref ? (
      <Button asChild variant="outline" size="sm" className={outline}>
        <Link href={clearHref}>{clearLabel}</Link>
      </Button>
    ) : (
      <Button type="button" variant="outline" size="sm" className={outline} onClick={onClear}>
        {clearLabel}
      </Button>
    )
  } else if (kind === "error" && (onRetry || retryHref)) {
    button = retryHref ? (
      <Button asChild variant="outline" size="sm" className={outline}>
        <Link href={retryHref}>{retryLabel}</Link>
      </Button>
    ) : (
      <Button type="button" variant="outline" size="sm" className={outline} onClick={onRetry}>
        {retryLabel}
      </Button>
    )
  }
  return (
    <Empty
      role={kind === "error" ? "alert" : undefined}
      className={cn(
        "gap-3 rounded-md",
        compact ? "p-4 md:p-6" : "p-6 md:p-10",
        bordered ? "border border-solid border-warm-tan bg-card" : "border-0",
        className,
      )}
    >
      <EmptyHeader className="max-w-lg gap-1">
        <EmptyTitle className={cn("font-semibold tracking-normal text-dark [word-break:keep-all]", compact ? "text-base" : "text-lg")}>
          {title}
        </EmptyTitle>
        {description && (
          <EmptyDescription className="text-base leading-relaxed text-text-secondary [word-break:keep-all]">{description}</EmptyDescription>
        )}
      </EmptyHeader>
      {(action || button) && (
        <EmptyContent className="max-w-lg flex-row flex-wrap justify-center gap-2">
          {action}
          {button}
        </EmptyContent>
      )}
    </Empty>
  )
}
