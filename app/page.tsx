import { getDb, FALLBACK_STATS, FALLBACK_PORTFOLIO, FALLBACK_NEWS } from "@/lib/db"
import { ClientPage } from "@/components/client-page"
import { getSiteContent } from "@/lib/site-content"
import type { ContactInfo } from "@/components/sections/footer"

export const dynamic = "force-dynamic"

async function getStats() {
  try {
    const sql = getDb()
    if (!sql) return FALLBACK_STATS
    const rows = await sql`SELECT * FROM statistics ORDER BY sort_order ASC`
    return rows.length > 0 ? rows : FALLBACK_STATS
  } catch {
    return FALLBACK_STATS
  }
}

async function getPortfolio() {
  try {
    const sql = getDb()
    if (!sql) return FALLBACK_PORTFOLIO
    const rows = await sql`SELECT * FROM portfolio_companies WHERE status = 'active' ORDER BY sort_order ASC`
    return rows.length > 0 ? rows : FALLBACK_PORTFOLIO
  } catch {
    return FALLBACK_PORTFOLIO
  }
}

async function getNews() {
  try {
    const sql = getDb()
    if (!sql) return FALLBACK_NEWS
    const rows = await sql`SELECT * FROM news WHERE is_visible = true ORDER BY published_at DESC LIMIT 6`
    return rows.length > 0 ? rows : FALLBACK_NEWS
  } catch {
    return FALLBACK_NEWS
  }
}

export default async function Home() {
  const [stats, portfolio, news, contact] = await Promise.all([
    getStats(),
    getPortfolio(),
    getNews(),
    getSiteContent<ContactInfo>("contact"),
  ])

  return (
    <ClientPage
      stats={stats as any[]}
      portfolio={portfolio as any[]}
      news={news as any[]}
      contact={contact ?? undefined}
    />
  )
}
