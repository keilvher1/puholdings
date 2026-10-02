import { CardSkeleton, TableSkeleton } from "@/components/saas"

// 관리비 정산 공용 골격(월 마감·청구서·기준 정보에 함께 뜬다 — 하위 경로에 자기 loading이 없으면 이것). 움직임 없는 회색 칸.
export default function BillingLoading() {
  return (
    <div className="px-4 py-5 sm:p-6 lg:p-8">
      <div className="mb-4 h-8 w-40 rounded-md bg-warm-beige" aria-hidden />
      <div className="mb-6 h-9 w-72 max-w-full rounded-md bg-warm-beige" aria-hidden />
      <CardSkeleton lines={3} label="관리비 정산을 불러오는 중…" className="mb-4" />
      <TableSkeleton rows={5} columns={4} label="목록을 불러오는 중…" />
    </div>
  )
}
