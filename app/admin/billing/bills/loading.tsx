import { TableSkeleton } from "@/components/saas"

// 청구서 화면을 처음 열 때의 골격(움직임 없음). 머리·하위 탭 자리를 같은 높이로 잡아 화면이 튀지 않게 한다.
export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8" aria-busy="true">
      <div className="mb-4">
        <p className="text-sm text-text-secondary">관리비 정산</p>
        <h1 className="mt-1.5 text-2xl font-bold text-dark">청구서</h1>
      </div>
      <div className="mb-4 h-11 border-b border-warm-tan" />
      <TableSkeleton rows={8} columns={6} label="청구서를 불러오는 중…" />
    </div>
  )
}
