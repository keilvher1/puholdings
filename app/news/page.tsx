import { Navbar } from "@/components/sections/navbar"
import { NewsSection } from "@/components/sections/news-section"
import { SiteFooter } from "@/components/site-footer"
import { getDb, FALLBACK_NEWS } from "@/lib/db"

export const metadata = {
  title: "뉴스 | 포항연합기술지주",
  description: "포항연합기술지주의 최신 소식과 공지사항을 확인하세요.",
}

async function getNews() {
  try {
    const sql = getDb()
    if (!sql) return FALLBACK_NEWS
    const rows = await sql`SELECT * FROM news WHERE is_visible = true ORDER BY published_at DESC`
    return rows.length > 0 ? rows : FALLBACK_NEWS
  } catch {
    return FALLBACK_NEWS
  }
}

export default async function NewsPage() {
  const news = await getNews()

  return (
    <main className="overflow-x-hidden">
      <Navbar />
      {/* Page Header */}
      <section className="bg-dark pt-32 pb-16 lg:pt-40 lg:pb-20">
        <div className="mx-auto max-w-7xl px-8 lg:px-12">
          <div className="mb-6 flex items-center gap-4">
            <div className="editorial-rule bg-gold" />
            <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
              NEWS
            </span>
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-primary-foreground lg:text-6xl">
            뉴스
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-tertiary">
            포항연합기술지주의 최신 소식과 공지사항을 확인하세요.
          </p>
        </div>
      </section>
      <NewsSection news={news as any[]} />
      <SiteFooter />
    </main>
  )
}
