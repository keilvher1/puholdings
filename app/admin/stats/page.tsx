import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb, FALLBACK_STATS } from "@/lib/db"
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
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">통계 관리</h1>
        <p className="mt-1 text-sm text-text-secondary">메인 페이지에 표시되는 핵심 지표를 관리합니다</p>
      </div>

      <StatsForm initialData={stats as any[]} />
    </div>
  )
}
