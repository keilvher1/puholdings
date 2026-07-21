import { redirect, notFound } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb, type Popup } from "@/lib/db"
import { PopupForm } from "@/components/admin/popup-form"

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">팝업 수정</h1>
        <p className="mt-1 text-sm text-text-secondary">기존 팝업을 수정합니다</p>
      </div>
      <PopupForm initialData={popup} />
    </div>
  )
}
