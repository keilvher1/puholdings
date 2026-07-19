import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { TenantsManager } from "@/components/admin/tenants-manager"

export default async function AdminTenantsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">입주기업 관리</h1>
        <p className="mt-1 text-sm text-text-secondary">
          창업보육센터 입주기업 정보와 포털 계정을 관리합니다
        </p>
      </div>

      <TenantsManager />
    </div>
  )
}
