import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { ProgramsManager } from "@/components/admin/programs-manager"

export default async function AdminProgramsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader
        title="프로그램"
        description="지원사업·교육 프로그램 공고와 신청·제출을 관리합니다"
      />
      <ProgramsManager />
    </div>
  )
}
