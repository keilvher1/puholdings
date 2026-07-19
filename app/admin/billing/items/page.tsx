import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { BillingNav } from "@/components/admin/billing-nav"
import { BillingItems } from "@/components/admin/billing-items"

export default async function AdminBillingItemsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">관리비</h1>
        <p className="mt-1 text-sm text-text-secondary">
          청구 항목(단가·정액)을 관리합니다
        </p>
      </div>
      <BillingNav />
      <BillingItems />
    </div>
  )
}
