import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { BillingNav } from "@/components/admin/billing-nav"
import { BillsList } from "@/components/admin/bills-list"

export default async function AdminBillingBillsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")
  return (
    <div className="p-8">
      <AdminPageHeader title="관리비 정산" description="청구서를 확인하고 발행·납부 처리합니다" />
      <BillingNav />
      <BillsList />
    </div>
  )
}
