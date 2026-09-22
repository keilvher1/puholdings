import type { MetadataRoute } from "next"
import { getDb, FALLBACK_PORTFOLIO } from "@/lib/db"

const SITE_URL = process.env.APP_URL || "https://www.puholdings.co.kr"

const STATIC_ROUTES: {
  path: string
  priority: number
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]
}[] = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/about", priority: 0.8, changeFrequency: "monthly" },
  { path: "/organization", priority: 0.7, changeFrequency: "monthly" },
  { path: "/portfolio", priority: 0.8, changeFrequency: "weekly" },
  { path: "/news", priority: 0.7, changeFrequency: "weekly" },
  { path: "/contact", priority: 0.6, changeFrequency: "monthly" },
]

// 포트폴리오 상세 slug 목록.
// app/portfolio/[slug]/page.tsx의 getCompanyBySlug와 같은 우선순위를 따라야
// sitemap에 실린 URL이 전부 실제로 200을 준다:
//   DB에 slug가 있으면 DB, 없거나 조회가 실패하면 FALLBACK_PORTFOLIO.
// (현재 운영 DB의 portfolio_companies에는 slug 컬럼이 없어 폴백 경로로 동작한다.)
async function portfolioSlugs(): Promise<string[]> {
  const fallback = FALLBACK_PORTFOLIO.map((c) => c.slug).filter(Boolean)
  const sql = getDb()
  if (!sql) return fallback
  try {
    const rows = await sql`SELECT slug FROM portfolio_companies WHERE slug IS NOT NULL ORDER BY slug`
    const fromDb = (rows as { slug: string }[]).map((r) => r.slug).filter(Boolean)
    return fromDb.length > 0 ? fromDb : fallback
  } catch {
    // slug 컬럼이 없는 등 조회 실패 — 상세 페이지와 동일하게 폴백을 쓴다.
    return fallback
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))

  for (const slug of await portfolioSlugs()) {
    entries.push({
      url: `${SITE_URL}/portfolio/${slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    })
  }
  return entries
}
