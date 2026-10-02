// 호실 현황 골격(타일 모양, 움직임 없음). app/admin/rooms/loading.tsx(서버)와 보드 첫 로딩(클라이언트)이 같이 쓴다.
// 훅이 없으므로 "use client"를 붙이지 않는다.

function Bar({ className }: { className: string }) {
  return <span aria-hidden className={`block rounded-sm bg-warm-beige ${className}`} />
}

export function RoomsBoardSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">호실 현황을 불러오는 중…</span>
      <div className="flex flex-wrap gap-2" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <Bar key={i} className="h-9 w-24" />
        ))}
      </div>
      {[8, 8, 6].map((n, f) => (
        <div key={f} className="grid gap-2 border-t border-warm-tan pt-3 sm:grid-cols-[3.5rem_1fr]" aria-hidden>
          <Bar className="h-4 w-10 sm:mt-2" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="h-[92px] rounded-md border border-warm-tan bg-card p-3">
                <Bar className="h-4 w-12" />
                <Bar className="mt-2 h-3.5 w-3/4" />
                <Bar className="mt-2 h-3 w-1/3" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
