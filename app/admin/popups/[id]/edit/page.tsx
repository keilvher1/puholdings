import { redirect, notFound } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb, type Popup } from "@/lib/db"
import { PopupForm } from "@/components/admin/popup-form"
import { PageHeader } from "@/components/saas"
import { adminEyebrow } from "@/lib/help/shell"

async function getPopup(id: string): Promise<Popup | null> {
  const sql = getDb()
  if (!sql) return null
  try {
    const rows = await sql`SELECT * FROM popups WHERE id = ${parseInt(id)}`
    return (rows[0] as Popup) || null
  } catch {
    return null
  }
}

export default async function EditPopupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const { id } = await params
  const popup = await getPopup(id)
  if (!popup) notFound()

  return (
    <div className="p-5 md:p-8">
      <PageHeader
        title="팝업 수정"
        eyebrow={adminEyebrow("popups")}
        breadcrumbs={[{ label: "팝업", href: "/admin/popups" }, { label: "팝업 수정" }]}
        description="기존 팝업을 수정합니다"
      />
      <PopupForm initialData={popup} />
    </div>
  )
}
