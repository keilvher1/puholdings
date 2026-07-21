import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb, type Popup } from "@/lib/db"
import Link from "next/link"
import { Plus, Pencil } from "lucide-react"
import { PopupActiveToggle, PopupDeleteButton } from "@/components/admin/popup-actions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AdminPageHeader, AdminCard } from "@/components/admin/admin-ui"

export const dynamic = "force-dynamic"

async function getPopups(): Promise<Popup[]> {
  const sql = getDb()
  if (!sql) return []
  try {
    const rows = await sql`SELECT * FROM popups ORDER BY priority DESC, created_at DESC`
    return rows as Popup[]
  } catch {
    return []
  }
}

function formatRange(start: string, end: string) {
  const fmt = (s: string) =>
    new Date(s).toLocaleString("ko-KR", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  return `${fmt(start)} ~ ${fmt(end)}`
}

function StatusBadge({ popup }: { popup: Popup }) {
  const now = Date.now()
  const start = new Date(popup.start_at).getTime()
  const end = new Date(popup.end_at).getTime()

  if (now < start) return <Badge variant="outline">예정</Badge>
  if (now > end) return <Badge variant="secondary">만료</Badge>
  return <Badge>활성</Badge>
}

export default async function AdminPopupsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const popups = await getPopups()

  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader
        title="팝업"
        description="사이트 메인에 노출되는 팝업을 관리합니다"
        actions={
          <Button asChild>
            <Link href="/admin/popups/new">
              <Plus className="h-4 w-4" />
              새 팝업 추가
            </Link>
          </Button>
        }
      />

      <AdminCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead>기간</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>우선순위</TableHead>
              <TableHead>출처</TableHead>
              <TableHead>활성</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {popups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-text-secondary">
                  등록된 팝업이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              popups.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-xs">
                    <p className="truncate font-medium text-dark">{item.title}</p>
                    {item.content && <p className="mt-0.5 truncate text-xs text-text-secondary">{item.content}</p>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-text-secondary">
                    {formatRange(item.start_at, item.end_at)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge popup={item} />
                  </TableCell>
                  <TableCell className="text-sm text-dark">{item.priority}</TableCell>
                  <TableCell>
                    {item.related_news_id ? (
                      <Badge variant="secondary">공지 #{item.related_news_id}</Badge>
                    ) : (
                      <span className="text-xs text-text-tertiary">독립</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <PopupActiveToggle id={item.id} isActive={item.is_active} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-text-secondary hover:text-dark">
                        <Link href={`/admin/popups/${item.id}/edit`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <PopupDeleteButton id={item.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </AdminCard>
    </div>
  )
}
