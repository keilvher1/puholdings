import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { ProgramsManager } from "@/components/admin/programs-manager"

export default async function AdminProgramsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">프로그램</h1>
        <p className="mt-1 text-sm text-text-secondary">
          지원사업·교육 프로그램 공고와 신청·제출을 관리합니다
        </p>
      </div>
      <ProgramsManager />
    </div>
  )
}
