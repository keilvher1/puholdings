import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { BillingNav } from "@/components/admin/billing-nav"
import { MonthCloseWizard } from "@/components/admin/month-close-wizard"

export default async function AdminBillingPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")
  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader title="관리비 정산" description="검침 → 전기료 배분 → 청구서 생성 → 발행 순으로 월 마감을 진행합니다" />
      <BillingNav />
      <MonthCloseWizard />
    </div>
  )
}
