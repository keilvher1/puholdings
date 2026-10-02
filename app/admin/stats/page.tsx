import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb, FALLBACK_STATS } from "@/lib/db"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { StatsForm } from "@/components/admin/stats-form"

async function getStats() {
  const sql = getDb()
  if (!sql) return FALLBACK_STATS
  try {
    const rows = await sql`SELECT * FROM statistics ORDER BY sort_order ASC`
    return rows.length > 0 ? rows : FALLBACK_STATS
  } catch {
    return FALLBACK_STATS
  }
}

export default async function AdminStatsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const stats = await getStats()

  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader
        title="통계 관리"
        description="홈페이지 첫 화면에 보이는 핵심 지표를 관리해요"
      />
      <StatsForm initialData={stats as any[]} />
    </div>
  )
}
