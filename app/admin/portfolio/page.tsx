import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb, FALLBACK_PORTFOLIO } from "@/lib/db"
import Link from "next/link"
import { Plus, Pencil } from "lucide-react"
import { DeleteButton } from "@/components/admin/delete-button"

async function getPortfolio() {
  const sql = getDb()
  if (!sql) return FALLBACK_PORTFOLIO
  try {
    const rows = await sql`SELECT * FROM portfolio_companies ORDER BY sort_order ASC`
    return rows.length > 0 ? rows : FALLBACK_PORTFOLIO
  } catch {
    return FALLBACK_PORTFOLIO
  }
}

export default async function AdminPortfolioPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const portfolio = await getPortfolio()

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark">포트폴리오</h1>
          <p className="mt-1 text-sm text-text-secondary">투자 기업 목록을 관리합니다</p>
        </div>
        <Link
          href="/admin/portfolio/new"
          className="flex items-center gap-2 rounded-md bg-dark px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-dark-muted transition-colors"
        >
          <Plus className="h-4 w-4" />
          기업 추가
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-warm-tan bg-card">
        <table className="w-full">
          <thead className="border-b border-warm-tan bg-warm-beige">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">기업명</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">카테고리</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">투자연도</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">상태</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-text-secondary">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-tan">
            {(portfolio as any[]).map((item) => (
              <tr key={item.id} className="hover:bg-warm-ivory transition-colors">
                <td className="px-4 py-4">
                  <p className="font-medium text-dark">{item.name}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">{item.name_en}</p>
                </td>
                <td className="px-4 py-4">
                  <span className="inline-flex rounded-full bg-warm-beige px-2.5 py-1 text-xs font-medium text-dark">
                    {item.category}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm text-text-secondary">
                  {item.investment_year}
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                    item.status === "active" 
                      ? "bg-emerald-100 text-emerald-700" 
                      : "bg-gray-100 text-gray-600"
                  }`}>
                    {item.status === "active" ? "활성" : "비활성"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/portfolio/${item.id}`}
                      className="rounded p-1.5 text-text-secondary hover:bg-warm-beige hover:text-dark transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <DeleteButton id={item.id} type="portfolio" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
