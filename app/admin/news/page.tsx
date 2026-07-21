import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb, FALLBACK_NEWS } from "@/lib/db"
import Link from "next/link"
import { Plus, Pencil, Eye, EyeOff } from "lucide-react"
import { DeleteButton } from "@/components/admin/delete-button"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AdminPageHeader, AdminCard } from "@/components/admin/admin-ui"

async function getNews() {
  const sql = getDb()
  if (!sql) return FALLBACK_NEWS
  try {
    const rows = await sql`SELECT * FROM news ORDER BY published_at DESC`
    return rows.length > 0 ? rows : FALLBACK_NEWS
  } catch {
    return FALLBACK_NEWS
  }
}

export default async function AdminNewsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const news = await getNews()

  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader
        title="최신 소식"
        description="뉴스 및 공지사항을 관리합니다"
        actions={
          <Button asChild>
            <Link href="/admin/news/new">
              <Plus className="h-4 w-4" />
              새 소식 작성
            </Link>
          </Button>
        }
      />

      <AdminCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead>카테고리</TableHead>
              <TableHead>발행일</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(news as any[]).map((item) => (
              <TableRow key={item.id}>
                <TableCell className="max-w-md">
                  <p className="truncate font-medium text-dark">{item.title}</p>
                  {item.summary && <p className="mt-0.5 truncate text-xs text-text-secondary">{item.summary}</p>}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{item.category}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-text-secondary">
                  {new Date(item.published_at).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell>
                  {item.is_visible !== false ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-dark">
                      <Eye className="h-3 w-3 text-gold" /> 공개
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
                      <EyeOff className="h-3 w-3" /> 비공개
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-text-secondary hover:text-dark">
                      <Link href={`/admin/news/${item.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <DeleteButton id={item.id} type="news" />
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
