import { TableSkeleton } from "@/components/saas"

// 관리자 범용 로딩 골격(계획서 4.1.5). 자식 경로(/admin/news 등)에도 뜨므로 특정 화면 모양을 흉내 내지 않는다:
// 헤더 한 줄 + 표 골격. 화면별 골격은 그 화면 폴더의 loading.tsx에 둔다.
export default function AdminLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8" aria-busy="true">
      <div className="mb-6 grid gap-2" aria-hidden>
        <span className="block h-7 w-40 rounded-sm bg-warm-beige" />
        <span className="block h-4 w-64 max-w-full rounded-sm bg-warm-beige" />
      </div>
      <TableSkeleton rows={6} columns={4} label="화면을 불러오는 중…" />
    </div>
  )
}
