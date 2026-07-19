import { redirect } from "next/navigation"
import Link from "next/link"
import { getSession } from "@/lib/auth"
import { EmailsManager } from "@/components/admin/emails-manager"
import { Button } from "@/components/ui/button"
import { FileText } from "lucide-react"

export default async function AdminEmailsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark">메일 발송</h1>
          <p className="mt-1 text-sm text-text-secondary">
            발송 이력을 확인하고 입주기업에 메일을 보냅니다
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/emails/templates">
            <FileText className="h-4 w-4" />
            템플릿 관리
          </Link>
        </Button>
      </div>

      <EmailsManager />
    </div>
  )
}
