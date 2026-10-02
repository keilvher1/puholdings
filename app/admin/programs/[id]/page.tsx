import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { isMailEnabled } from "@/lib/runtime-flags"
import { ProgramDetail } from "@/components/admin/program-detail"

export const metadata = { title: "프로그램" }

export default async function AdminProgramDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string | string[] }>
}) {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const { id } = await params
  const { tab } = await searchParams
  // ?tab=submissions 이면 제출물 탭을 먼저 연다(홈 "검토할 제출물" 줄). 그 밖의 값은 기본(신청 현황)
  const initialTab = tab === "submissions" ? "submissions" : "applications"

  return (
    <div className="p-5 md:p-8">
      <ProgramDetail programId={Number(id)} mailEnabled={isMailEnabled()} initialTab={initialTab} />
    </div>
  )
}
