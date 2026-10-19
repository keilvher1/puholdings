import { TableSkeleton } from "@/components/saas"

// 증빙 처리 화면을 여는 동안(서버에서 프로젝트·대기함을 읽는 동안) 보이는 골격. 움직이는 효과 없음.
export default function ExpensesLoading() {
  return (
    <div className="p-5 md:p-8">
      <div className="mb-6 space-y-2" aria-hidden>
        {/* 영문 머리말·이동 경로 줄 자리(PageHeader eyebrow) */}
        <span className="mt-1 mb-3.5 block h-3 w-48 rounded-sm bg-warm-beige/70" />
        <span className="block h-7 w-40 rounded-sm bg-warm-beige" />
        <span className="block h-4 w-72 max-w-full rounded-sm bg-warm-beige/70" />
      </div>
      <TableSkeleton rows={6} columns={5} label="증빙 처리 화면을 불러오는 중…" />
    </div>
  )
}
