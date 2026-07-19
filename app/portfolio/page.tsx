import { getDb, FALLBACK_PORTFOLIO } from "@/lib/db"
import { PortfolioDetailPage } from "@/components/portfolio-detail-page"
import { getSiteContent } from "@/lib/site-content"
import type { ContactInfo } from "@/components/sections/footer"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "투자 포트폴리오 | (주)포항연합기술지주",
  description: "포항연합기술지주의 벤처투자 포트폴리오 기업들을 소개합니다.",
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

export default async function PortfolioPage() {
  const [portfolio, contact] = await Promise.all([
    getPortfolio(),
    getSiteContent<ContactInfo>("contact"),
  ])
  return <PortfolioDetailPage companies={portfolio as any[]} contact={contact ?? undefined} />
}
