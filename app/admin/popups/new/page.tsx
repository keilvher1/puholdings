import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { PopupForm } from "@/components/admin/popup-form"
import { PageHeader } from "@/components/saas"
import { adminEyebrow } from "@/lib/help/shell"

export default async function NewPopupPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-5 md:p-8">
      <PageHeader
        title="새 팝업 추가"
        eyebrow={adminEyebrow("popups")}
        breadcrumbs={[{ label: "팝업", href: "/admin/popups" }, { label: "새 팝업 추가" }]}
        description="사이트 메인에 노출할 팝업을 만듭니다"
      />
      <PopupForm />
    </div>
  )
}
