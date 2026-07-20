import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { RoomsBoard } from "@/components/admin/rooms-board"

export default async function AdminRoomsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")
  return (
    <div className="p-8">
      <AdminPageHeader title="호실 현황" description="입주·공실·퇴실 예정을 한눈에 보고 관리합니다" />
      <RoomsBoard />
    </div>
  )
}
