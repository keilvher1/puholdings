import { TableSkeleton } from "@/components/saas"

// 증빙 내역 첫 로딩 골격(움직임 없음). 머리·탭 자리 + 표 골격.
export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8" aria-busy="true">
      <div className="mb-2 h-8 w-40 rounded-md bg-warm-beige" />
      <div className="mb-6 h-5 w-80 max-w-full rounded-md bg-warm-beige/70" />
      <div className="mb-4 h-10 w-full max-w-xl rounded-md bg-warm-beige/70" />
      <TableSkeleton rows={8} columns={6} label="증빙 내역을 불러오는 중…" />
    </div>
  )
}
