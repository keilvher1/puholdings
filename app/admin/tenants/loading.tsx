import { TableSkeleton } from "@/components/saas"

// 입주기업 화면 첫 로딩 골격(움직임 없음). 머리글 자리 + 검색·탭 자리 + 표.
export default function TenantsLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-4 h-8 w-32 rounded-md bg-warm-beige" aria-hidden />
      <div className="mb-6 h-5 w-72 max-w-full rounded-md bg-warm-beige/70" aria-hidden />
      <div className="mb-4 h-9 w-full max-w-xl rounded-md bg-warm-beige/70" aria-hidden />
      <TableSkeleton rows={8} columns={5} label="입주기업을 불러오는 중…" />
    </div>
  )
}
