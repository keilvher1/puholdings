// 포털 청구서 로딩 골격(WP8, 계획서 4.5.4) — 제목 + 보기 탭 자리 + 행 모양 3줄. 움직임 없음.
export default function PortalBillsLoading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">청구서를 불러오는 중…</span>
      <div aria-hidden className="mb-6 h-7 w-32 rounded-sm bg-warm-beige" />
      <div aria-hidden className="mb-4 flex gap-1">
        <span className="h-9 w-20 rounded-md bg-warm-beige" />
        <span className="h-9 w-20 rounded-md bg-warm-beige" />
      </div>
      <ul aria-hidden className="overflow-hidden rounded-md border border-warm-tan bg-card">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex min-h-16 items-center justify-between gap-4 border-b border-warm-tan px-4 py-3 last:border-b-0">
            <span className="flex-1 space-y-2">
              <span className="block h-4 w-32 rounded-sm bg-warm-beige" />
              <span className="block h-3.5 w-44 rounded-sm bg-warm-beige" />
            </span>
            <span className="h-4 w-20 rounded-sm bg-warm-beige" />
          </li>
        ))}
      </ul>
    </div>
  )
}
