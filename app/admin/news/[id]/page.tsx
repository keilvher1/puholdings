import { redirect, notFound } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { NewsForm } from "@/components/admin/news-form"

async function getNewsItem(id: string) {
  if (id === "new") return null

  const sql = getDb()
  if (!sql) return null

  try {
    const rows = await sql`SELECT * FROM news WHERE id = ${parseInt(id)}`
    const news = rows[0]
    if (!news) return null
    // Attach the linked popup (if any) so the form can prefill popup settings.
    const popups = await sql`SELECT * FROM popups WHERE related_news_id = ${parseInt(id)} LIMIT 1`
    return { ...news, popup: popups[0] || null } as any
  } catch {
    return null
  }
}

export default async function AdminNewsEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const { id } = await params
  const news = await getNewsItem(id)

  if (id !== "new" && !news) {
    notFound()
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">
          {id === "new" ? "새 소식 작성" : "소식 수정"}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {id === "new" ? "새로운 뉴스 또는 공지사항을 작성합니다" : "기존 게시물을 수정합니다"}
        </p>
      </div>

      <NewsForm initialData={news} />
    </div>
  )
}
