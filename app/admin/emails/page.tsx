import { redirect } from "next/navigation"
import Link from "next/link"
import { getSession } from "@/lib/auth"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { EmailsManager } from "@/components/admin/emails-manager"
import { Button } from "@/components/ui/button"
import { FileText } from "lucide-react"

export default async function AdminEmailsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader
        title="메일 발송"
        description="발송 이력을 확인하고 입주기업에 메일을 보냅니다"
        actions={
          <Button variant="outline" asChild>
            <Link href="/admin/emails/templates">
              <FileText className="h-4 w-4" />
              템플릿 관리
            </Link>
          </Button>
        }
      />
      <EmailsManager />
    </div>
  )
}
