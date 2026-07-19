import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { BillingNav } from "@/components/admin/billing-nav"
import { BillingBills } from "@/components/admin/billing-bills"

export default async function AdminBillingBillsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">관리비</h1>
        <p className="mt-1 text-sm text-text-secondary">
          월별 청구서를 확인하고 발행·납부 처리합니다
        </p>
      </div>
      <BillingNav />
      <BillingBills />
    </div>
  )
}
