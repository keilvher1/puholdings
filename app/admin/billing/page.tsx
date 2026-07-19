import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { BillingNav } from "@/components/admin/billing-nav"
import { BillingReadings } from "@/components/admin/billing-readings"

export default async function AdminBillingPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">관리비</h1>
        <p className="mt-1 text-sm text-text-secondary">
          검침값을 입력하고 월별 청구서를 생성합니다
        </p>
      </div>
      <BillingNav />
      <BillingReadings />
    </div>
  )
}
