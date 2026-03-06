import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { Newspaper, Briefcase, BarChart3, MessageSquare } from "lucide-react"
import Link from "next/link"

async function getDashboardStats() {
  const sql = getDb()
  if (!sql) return { news: 0, portfolio: 0, stats: 0, inquiries: 0, unreadInquiries: 0 }

  try {
    const [newsCount, portfolioCount, statsCount, inquiriesCount, unreadCount] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM news`,
      sql`SELECT COUNT(*) as count FROM portfolio_companies`,
      sql`SELECT COUNT(*) as count FROM statistics`,
      sql`SELECT COUNT(*) as count FROM inquiries`,
      sql`SELECT COUNT(*) as count FROM inquiries WHERE is_read = false`,
    ])

    return {
      news: Number(newsCount[0]?.count) || 0,
      portfolio: Number(portfolioCount[0]?.count) || 0,
      stats: Number(statsCount[0]?.count) || 0,
      inquiries: Number(inquiriesCount[0]?.count) || 0,
      unreadInquiries: Number(unreadCount[0]?.count) || 0,
    }
  } catch {
    return { news: 0, portfolio: 0, stats: 0, inquiries: 0, unreadInquiries: 0 }
  }
}

export default async function AdminDashboardPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const stats = await getDashboardStats()

  const cards = [
    { label: "최신 소식", value: stats.news, icon: Newspaper, href: "/admin/news", color: "bg-blue-500" },
    { label: "포트폴리오", value: stats.portfolio, icon: Briefcase, href: "/admin/portfolio", color: "bg-emerald-500" },
    { label: "통계 항목", value: stats.stats, icon: BarChart3, href: "/admin/stats", color: "bg-amber-500" },
    { label: "문의", value: stats.inquiries, icon: MessageSquare, href: "/admin/inquiries", color: "bg-violet-500", badge: stats.unreadInquiries },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dark">대시보드</h1>
        <p className="mt-1 text-sm text-text-secondary">
          안녕하세요, {session.name || "관리자"}님. 포항연합기술지주 CMS입니다.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Link
              key={card.label}
              href={card.href}
              className="group relative overflow-hidden rounded-lg border border-warm-tan bg-card p-6 transition-all hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-text-secondary">{card.label}</p>
                  <p className="mt-2 text-3xl font-bold text-dark">{card.value}</p>
                </div>
                <div className={`rounded-lg ${card.color} p-2.5`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
              </div>
              {card.badge !== undefined && card.badge > 0 && (
                <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-medium text-white">
                  {card.badge}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      <div className="mt-8 rounded-lg border border-warm-tan bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-dark">빠른 링크</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/admin/news/new"
            className="rounded-md border border-warm-tan px-4 py-3 text-sm font-medium text-dark hover:bg-warm-beige transition-colors"
          >
            + 새 소식 작성
          </Link>
          <Link
            href="/admin/portfolio/new"
            className="rounded-md border border-warm-tan px-4 py-3 text-sm font-medium text-dark hover:bg-warm-beige transition-colors"
          >
            + 포트폴리오 추가
          </Link>
          <Link
            href="/"
            target="_blank"
            className="rounded-md border border-warm-tan px-4 py-3 text-sm font-medium text-dark hover:bg-warm-beige transition-colors"
          >
            사이트 보기
          </Link>
          <Link
            href="/admin/inquiries"
            className="rounded-md border border-warm-tan px-4 py-3 text-sm font-medium text-dark hover:bg-warm-beige transition-colors"
          >
            문의 확인 ({stats.unreadInquiries} 미읽음)
          </Link>
        </div>
      </div>
    </div>
  )
}
