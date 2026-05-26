import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb, type Popup } from "@/lib/db"
import Link from "next/link"
import { Plus, Pencil } from "lucide-react"
import { PopupActiveToggle, PopupDeleteButton } from "@/components/admin/popup-actions"

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

  let label: string
  let cls: string
  if (now < start) {
    label = "예정"
    cls = "bg-blue-100 text-blue-700"
  } else if (now > end) {
    label = "만료"
    cls = "bg-warm-beige text-text-secondary"
  } else {
    label = "활성"
    cls = "bg-emerald-100 text-emerald-700"
  }
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

export default async function AdminPopupsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const popups = await getPopups()

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark">팝업</h1>
          <p className="mt-1 text-sm text-text-secondary">사이트 메인에 노출되는 팝업을 관리합니다</p>
        </div>
        <Link
          href="/admin/popups/new"
          className="flex items-center gap-2 rounded-md bg-dark px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-dark-muted transition-colors"
        >
          <Plus className="h-4 w-4" />
          새 팝업 추가
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-warm-tan bg-card">
        <table className="w-full">
          <thead className="border-b border-warm-tan bg-warm-beige">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">제목</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">기간</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">상태</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">우선순위</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">출처</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">활성</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-text-secondary">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-tan">
            {popups.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-text-secondary">
                  등록된 팝업이 없습니다.
                </td>
              </tr>
            ) : (
              popups.map((item) => (
                <tr key={item.id} className="hover:bg-warm-ivory transition-colors">
                  <td className="px-4 py-4">
                    <p className="font-medium text-dark line-clamp-1">{item.title}</p>
                    {item.content && (
                      <p className="mt-0.5 text-xs text-text-secondary line-clamp-1">{item.content}</p>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm text-text-secondary whitespace-nowrap">
                    {formatRange(item.start_at, item.end_at)}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge popup={item} />
                  </td>
                  <td className="px-4 py-4 text-sm text-dark">{item.priority}</td>
                  <td className="px-4 py-4 text-sm text-text-secondary">
                    {item.related_news_id ? (
                      <span className="inline-flex rounded-full bg-warm-beige px-2.5 py-1 text-xs font-medium text-dark">
                        공지 #{item.related_news_id}
                      </span>
                    ) : (
                      <span className="text-xs text-text-tertiary">독립</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <PopupActiveToggle id={item.id} isActive={item.is_active} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/popups/${item.id}/edit`}
                        className="rounded p-1.5 text-text-secondary hover:bg-warm-beige hover:text-dark transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <PopupDeleteButton id={item.id} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
