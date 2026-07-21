import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { TenantsManager } from "@/components/admin/tenants-manager"

export default async function AdminTenantsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader
        title="입주기업 관리"
        description="창업보육센터 입주기업 정보와 포털 계정을 관리합니다"
      />
      <TenantsManager />
    </div>
  )
}
