import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { ProgramDetail } from "@/components/admin/program-detail"

export default async function AdminProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const { id } = await params

  return (
    <div className="p-5 md:p-8">
      <ProgramDetail programId={Number(id)} />
    </div>
  )
}
