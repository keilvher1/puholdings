import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb, FALLBACK_PORTFOLIO } from "@/lib/db"
import Link from "next/link"
import { Plus, Pencil } from "lucide-react"
import { DeleteButton } from "@/components/admin/delete-button"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AdminPageHeader, AdminCard } from "@/components/admin/admin-ui"

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
    <div className="p-5 md:p-8">
      <AdminPageHeader
        title="포트폴리오"
        description="투자 기업 목록을 관리합니다"
        actions={
          <Button asChild>
            <Link href="/admin/portfolio/new">
              <Plus className="h-4 w-4" />
              기업 추가
            </Link>
          </Button>
        }
      />

      <AdminCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>기업명</TableHead>
              <TableHead>카테고리</TableHead>
              <TableHead>투자연도</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(portfolio as any[]).map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <p className="font-medium text-dark">{item.name}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">{item.name_en}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{item.category}</Badge>
                </TableCell>
                <TableCell className="text-sm text-text-secondary">{item.investment_year}</TableCell>
                <TableCell>
                  {item.status === "active" ? <Badge>활성</Badge> : <Badge variant="secondary">비활성</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-text-secondary hover:text-dark">
                      <Link href={`/admin/portfolio/${item.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <DeleteButton id={item.id} type="portfolio" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminCard>
    </div>
  )
}
