import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { BillingNav } from "@/components/admin/billing-nav"
import { BillingSettings } from "@/components/admin/billing-settings"

export default async function AdminBillingSettingsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")
  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader title="관리비 정산" description="호실·계약을 관리합니다 (청구서 생성 전 필요)" />
      <BillingNav />
      <BillingSettings />
    </div>
  )
}
