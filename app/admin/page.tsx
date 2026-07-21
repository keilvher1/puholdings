import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import {
  Newspaper,
  Briefcase,
  MessageSquare,
  DoorOpen,
  Receipt,
  ClipboardList,
  Building2,
  Layout,
  ArrowRight,
  Plus,
} from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { AdminCard } from "@/components/admin/admin-ui"
import { AdminNotesCard } from "@/components/admin/admin-notes"

async function getDashboardData() {
  const sql = getDb()
  const empty = {
    news: 0, portfolio: 0, inquiries: 0, unreadInquiries: 0,
    rooms: null as null | { total: number; occupied: number; vacant: number; rate: number },
    draftBills: 0, openPrograms: 0,
    recentInquiries: [] as { id: number; name: string; company: string | null; message: string; created_at: string; is_read: boolean }[],
  }
  if (!sql) return empty
  try {
    const [news, portfolio, inquiries, unread, rooms, bills, programs, recent] = await Promise.all([
      sql`SELECT COUNT(*)::int c FROM news`,
      sql`SELECT COUNT(*)::int c FROM portfolio_companies`,
      sql`SELECT COUNT(*)::int c FROM inquiries`,
      sql`SELECT COUNT(*)::int c FROM inquiries WHERE is_read = false`,
      sql`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE c.id IS NOT NULL)::int AS occupied,
               COUNT(*) FILTER (WHERE c.id IS NULL AND r.status = 'available')::int AS vacant
        FROM rooms r
        LEFT JOIN contracts c ON c.room_id = r.id AND c.status = 'active'
        WHERE r.is_active = TRUE
      `,
      sql`SELECT COUNT(*)::int c FROM bills WHERE status = 'draft'`,
      sql`SELECT COUNT(*)::int c FROM programs WHERE status = 'open'`,
      sql`SELECT id, name, company, message, created_at, is_read FROM inquiries ORDER BY created_at DESC LIMIT 3`,
    ])
    const total = Number(rooms[0]?.total) || 0
    const occupied = Number(rooms[0]?.occupied) || 0
    return {
      news: Number(news[0]?.c) || 0,
      portfolio: Number(portfolio[0]?.c) || 0,
      inquiries: Number(inquiries[0]?.c) || 0,
      unreadInquiries: Number(unread[0]?.c) || 0,
      rooms: total > 0 ? { total, occupied, vacant: Number(rooms[0]?.vacant) || 0, rate: Math.round((occupied / total) * 100) } : null,
      draftBills: Number(bills[0]?.c) || 0,
      openPrograms: Number(programs[0]?.c) || 0,
      recentInquiries: recent as typeof empty.recentInquiries,
    }
  } catch {
    return empty
  }
}

export default async function AdminDashboardPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const d = await getDashboardData()
  const today = new Date(Date.now() + 9 * 3600 * 1000)
  const dateLabel = `${today.getUTCMonth() + 1}월 ${today.getUTCDate()}일`

  const kpis = [
    { label: "최신 소식", value: d.news, unit: "건", icon: Newspaper, href: "/admin/news" },
    { label: "포트폴리오 기업", value: d.portfolio, unit: "개", icon: Briefcase, href: "/admin/portfolio" },
    { label: "접수 문의", value: d.inquiries, unit: "건", icon: MessageSquare, href: "/admin/inquiries", badge: d.unreadInquiries },
    { label: "모집 중 프로그램", value: d.openPrograms, unit: "개", icon: ClipboardList, href: "/admin/programs" },
  ]

  const quickActions = [
    { label: "소식 작성", href: "/admin/news/new", icon: Plus },
    { label: "사이트 콘텐츠 편집", href: "/admin/site", icon: Layout },
    { label: "입주기업 관리", href: "/admin/tenants", icon: Building2 },
    { label: "월 마감 시작", href: "/admin/billing", icon: Receipt },
  ]

  return (
    <div className="p-5 md:p-8">
      {/* Greeting */}
      <div className="mb-7">
        <p className="text-xs font-medium tracking-wide text-gold">{dateLabel}</p>
        <h1 className="mt-1 text-2xl font-bold text-dark">
          안녕하세요, {session.name || "관리자"}님
        </h1>
        <p className="mt-1 text-sm text-text-secondary">포항연합기술지주 관리 시스템입니다.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {kpis.map((k) => {
          const Icon = k.icon
          return (
            <Link
              key={k.label}
              href={k.href}
              className="group relative rounded-xl border border-warm-tan bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-dark">
                  <Icon className="h-4 w-4 text-gold" />
                </div>
                {k.badge !== undefined && k.badge > 0 && (
                  <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">미확인 {k.badge}</Badge>
                )}
              </div>
              <p className="mt-4 text-[26px] font-bold leading-none text-dark">
                {k.value}
                <span className="ml-0.5 text-sm font-medium text-text-tertiary">{k.unit}</span>
              </p>
              <p className="mt-1.5 text-xs text-text-secondary">{k.label}</p>
            </Link>
          )
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* 호실 현황 */}
        <AdminCard className="p-6 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-dark">
              <DoorOpen className="h-4 w-4 text-gold" />
              호실 현황
            </h2>
            <Link href="/admin/rooms" className="flex items-center gap-1 text-xs text-text-secondary transition-colors hover:text-dark">
              보드 보기 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {d.rooms ? (
            <>
              <div className="flex items-end justify-between">
                <p className="text-4xl font-bold text-dark">
                  {d.rooms.rate}<span className="text-lg font-medium text-text-tertiary">%</span>
                </p>
                <p className="text-sm text-text-secondary">
                  전체 <b className="text-dark">{d.rooms.total}</b> · 입주 <b className="text-dark">{d.rooms.occupied}</b> · 공실{" "}
                  <b className={d.rooms.vacant > 0 ? "text-orange-600" : "text-dark"}>{d.rooms.vacant}</b>
                </p>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-warm-beige">
                <div className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light" style={{ width: `${d.rooms.rate}%` }} />
              </div>
              {d.draftBills > 0 && (
                <p className="mt-4 rounded-lg bg-gold/10 px-3 py-2 text-xs text-dark">
                  작성 중인 청구서가 <b>{d.draftBills}건</b> 있습니다 —{" "}
                  <Link href="/admin/billing/bills" className="font-semibold text-gold underline underline-offset-2">청구서 확인</Link>
                </p>
              )}
            </>
          ) : (
            <p className="py-6 text-center text-sm text-text-secondary">
              호실 데이터가 없습니다. <Link href="/admin/billing/settings" className="text-gold underline">설정에서 등록</Link>하세요.
            </p>
          )}
        </AdminCard>

        {/* 최근 문의 */}
        <AdminCard className="p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-dark">
              <MessageSquare className="h-4 w-4 text-gold" />
              최근 문의
            </h2>
            <Link href="/admin/inquiries" className="flex items-center gap-1 text-xs text-text-secondary transition-colors hover:text-dark">
              전체 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {d.recentInquiries.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-secondary">접수된 문의가 없습니다</p>
          ) : (
            <ul className="space-y-3">
              {d.recentInquiries.map((q) => (
                <li key={q.id} className="border-b border-warm-tan/60 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-dark">{q.name}</span>
                    {q.company && <span className="text-[11px] text-text-tertiary">{q.company}</span>}
                    {!q.is_read && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">{q.message}</p>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>

      {/* 메모 · 확인 사항 */}
      <AdminNotesCard />

      {/* 빠른 작업 */}
      <AdminCard className="mt-4 p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-dark">빠른 작업</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {quickActions.map((a) => {
            const Icon = a.icon
            return (
              <Link
                key={a.href}
                href={a.href}
                className="group flex items-center gap-3 rounded-lg border border-warm-tan px-4 py-3 text-sm font-medium text-dark transition-colors hover:border-gold/60 hover:bg-gold/5"
              >
                <Icon className="h-4 w-4 text-text-tertiary transition-colors group-hover:text-gold" />
                {a.label}
              </Link>
            )
          })}
        </div>
      </AdminCard>
    </div>
  )
}
