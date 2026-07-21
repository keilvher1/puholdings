import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { SiteContentManager } from "@/components/admin/site-content-manager"

export default async function AdminSitePage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader
        title="사이트 콘텐츠"
        description="홈페이지에 노출되는 조직·연혁·운영도·연락처 등을 편집합니다"
      />
      <SiteContentManager />
    </div>
  )
}
