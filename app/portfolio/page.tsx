import { FALLBACK_PORTFOLIO } from "@/lib/db"
import { PortfolioDetailPage } from "@/components/portfolio-detail-page"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "투자 포트폴리오 | (주)포항연합기술지주",
  description: "포항연합기술지주의 벤처투자 포트폴리오 기업들을 소개합니다.",
}

export default function PortfolioPage() {
  return <PortfolioDetailPage companies={FALLBACK_PORTFOLIO} />
}
