import { PageHeader, TableSkeleton } from "@/components/saas"
import { BillingNav } from "@/components/admin/billing-nav"
import { adminEyebrow } from "@/lib/help/shell"

// 청구서 화면을 처음 열 때의 골격(움직임 없음). 머리·하위 탭은 실제 화면과 같은 부품으로 그려 화면이 튀지 않게 한다
// (도움말·추가 청구 버튼과 탭 건수만 빠진다).
export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8" aria-busy="true">
      <PageHeader
        title="청구서"
        eyebrow={adminEyebrow("billing")}
        breadcrumbs={[{ label: "관리비 정산", href: "/admin/billing" }, { label: "청구서" }]}
        description="받을 돈을 확인하고, 입금되면 납부 처리해요"
        className="mb-4"
      />
      <BillingNav />
      <div className="mt-4">
        <TableSkeleton rows={8} columns={6} label="청구서를 불러오는 중…" />
      </div>
    </div>
  )
}
