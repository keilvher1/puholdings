import { getDb } from "@/lib/db"
import { ClientPage } from "@/components/client-page"

export const revalidate = 3600

async function getStats() {
  const sql = getDb()
  const rows = await sql`SELECT * FROM statistics ORDER BY sort_order ASC`
  return rows
}

async function getPortfolio() {
  const sql = getDb()
  const rows = await sql`SELECT * FROM portfolio_companies WHERE status = 'active' ORDER BY sort_order ASC`
  return rows
}

async function getNews() {
  const sql = getDb()
  const rows = await sql`SELECT * FROM news WHERE is_visible = true ORDER BY published_at DESC LIMIT 6`
  return rows
}

export default async function Home() {
  const [stats, portfolio, news] = await Promise.all([
    getStats(),
    getPortfolio(),
    getNews(),
  ])

  return (
    <ClientPage
      stats={stats as any[]}
      portfolio={portfolio as any[]}
      news={news as any[]}
    />
  )
}
