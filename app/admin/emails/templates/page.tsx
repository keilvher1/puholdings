import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { EmailTemplatesManager } from "@/components/admin/email-templates-manager"

export default async function AdminEmailTemplatesPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader
        title="메일 템플릿"
        description="자동 발송 메일의 제목과 본문을 관리합니다"
      />
      <EmailTemplatesManager />
    </div>
  )
}
