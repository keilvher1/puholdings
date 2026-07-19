import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { EmailTemplatesManager } from "@/components/admin/email-templates-manager"

export default async function AdminEmailTemplatesPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">메일 템플릿</h1>
        <p className="mt-1 text-sm text-text-secondary">
          자동 발송 메일의 제목과 본문을 관리합니다
        </p>
      </div>

      <EmailTemplatesManager />
    </div>
  )
}
