import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { PopupForm } from "@/components/admin/popup-form"

export default async function NewPopupPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">새 팝업 추가</h1>
        <p className="mt-1 text-sm text-text-secondary">사이트 메인에 노출할 팝업을 만듭니다</p>
      </div>
      <PopupForm />
    </div>
  )
}
