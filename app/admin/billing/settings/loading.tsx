import { PageHeader, TableSkeleton } from "@/components/saas"
import { BillingNav } from "@/components/admin/billing-nav"

// 기준 정보 로딩 — 헤더·탭을 먼저 그리고 본문은 움직임 없는 골격(계획서 4.1.5).
export default function BillingSettingsLoading() {
  return (
    <div className="px-4 py-5 sm:p-6 lg:p-8">
      <PageHeader
        title="기준 정보"
        breadcrumbs={[{ label: "관리비 정산", href: "/admin/billing" }, { label: "기준 정보" }]}
        description="단가·계약·호실처럼 매달 관리비 계산에 쓰는 기준 값을 보고 고쳐요"
        className="mb-4"
      />
      <BillingNav />
      <div aria-hidden className="mb-5 h-11 w-full max-w-md rounded-md bg-warm-beige" />
      <TableSkeleton rows={6} columns={3} label="기준 정보를 불러오는 중…" />
    </div>
  )
}
