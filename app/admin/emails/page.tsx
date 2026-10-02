import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { isMailEnabled } from "@/lib/runtime-flags"
import { EmailsManager } from "@/components/admin/emails-manager"

// 메일 기록·새 메일(계획서 4.1.6). 메일 발송이 켜져 있는지는 서버에서 읽어 넘긴다(값은 보내지 않는다).
export const metadata = { title: "메일" }

export default async function AdminEmailsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <EmailsManager mailEnabled={isMailEnabled()} />
    </div>
  )
}
