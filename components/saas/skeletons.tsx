// 표·카드 모양 골격(로딩 자리). 움직이는 효과 없이 옅은 베이지 막대만 그린다. 서버·클라이언트 공용(loading.tsx에서도 쓴다).
// 클라이언트 조회는 useDelayedFlag로 300ms가 지나야 골격을 보인다. 다시 불러올 때는 골격 대신 기존 행을 흐리게(opacity-60) 유지한다.
//
// 사용 예:
//   <TableSkeleton rows={6} columns={5} label="청구서를 불러오는 중…" />
//   <CardSkeleton lines={3} />
//   const show = useDelayedFlag(loading)

import { cn } from "@/lib/utils"

export { useDelayedFlag } from "./use-delayed-flag"

function Bar({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block h-3.5 rounded-sm bg-warm-beige", className)} />
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  label = "불러오는 중…",
  className,
}: {
  rows?: number
  columns?: number
  label?: string
  className?: string
}) {
  const widths = ["w-3/4", "w-1/2", "w-2/3", "w-1/3", "w-5/6"]
  return (
    <div role="status" aria-live="polite" className={cn("overflow-hidden rounded-md border border-warm-tan bg-card", className)}>
      <span className="sr-only">{label}</span>
      <div className="grid gap-4 border-b border-warm-tan bg-warm-beige/60 px-4 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }, (_, c) => (
          <Bar key={c} className="w-1/2 bg-warm-tan/70" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="grid min-h-11 items-center gap-4 border-b border-warm-tan/60 px-4 py-3 last:border-b-0"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }, (_, c) => (
            <Bar key={c} className={widths[(r + c) % widths.length]} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton({ lines = 3, label = "불러오는 중…", className }: { lines?: number; label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-3 rounded-md border border-warm-tan bg-card px-4 py-4", className)}>
      <span className="sr-only">{label}</span>
      <Bar className="h-4 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Bar key={i} className={i % 2 === 0 ? "w-5/6" : "w-2/3"} />
      ))}
    </div>
  )
}
