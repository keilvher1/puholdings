import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb, FALLBACK_NEWS } from "@/lib/db"
import Link from "next/link"
import { Plus, Pencil, Eye, EyeOff } from "lucide-react"
import { DeleteButton } from "@/components/admin/delete-button"

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
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark">최신 소식</h1>
          <p className="mt-1 text-sm text-text-secondary">뉴스 및 공지사항을 관리합니다</p>
        </div>
        <Link
          href="/admin/news/new"
          className="flex items-center gap-2 rounded-md bg-dark px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-dark-muted transition-colors"
        >
          <Plus className="h-4 w-4" />
          새 소식 작성
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-warm-tan bg-card">
        <table className="w-full">
          <thead className="border-b border-warm-tan bg-warm-beige">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">제목</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">카테고리</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">발행일</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">상태</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-text-secondary">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-tan">
            {(news as any[]).map((item) => (
              <tr key={item.id} className="hover:bg-warm-ivory transition-colors">
                <td className="px-4 py-4">
                  <p className="font-medium text-dark line-clamp-1">{item.title}</p>
                  <p className="mt-0.5 text-xs text-text-secondary line-clamp-1">{item.summary}</p>
                </td>
                <td className="px-4 py-4">
                  <span className="inline-flex rounded-full bg-warm-beige px-2.5 py-1 text-xs font-medium text-dark">
                    {item.category}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm text-text-secondary">
                  {new Date(item.published_at).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-4 py-4">
                  {item.is_visible !== false ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <Eye className="h-3 w-3" /> 공개
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                      <EyeOff className="h-3 w-3" /> 비공개
                    </span>
                  )}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/news/${item.id}`}
                      className="rounded p-1.5 text-text-secondary hover:bg-warm-beige hover:text-dark transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <DeleteButton id={item.id} type="news" />
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
