import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Building2, User, Calendar, Award, CheckCircle, Briefcase, Target } from "lucide-react"
import { getDb, FALLBACK_PORTFOLIO } from "@/lib/db"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Particles } from "@/components/magicui/particles"
import { Navbar } from "@/components/sections/navbar"
import { SiteFooter } from "@/components/site-footer"

export const dynamic = "force-dynamic"

interface Company {
  id: number
  name: string
  name_en: string | null
  category: string
  description: string | null
  investment_year: number | null
  ceo?: string
  founded?: string | null
  achievements?: string
  website?: string | null
  exited?: boolean
  slug: string
}

async function getCompanyBySlug(slug: string): Promise<Company | null> {
  try {
    const sql = getDb()
    if (!sql) {
      return FALLBACK_PORTFOLIO.find((c) => c.slug === slug) || null
    }
    const rows = await sql`SELECT * FROM portfolio_companies WHERE slug = ${slug} LIMIT 1`
    return rows.length > 0 ? (rows[0] as Company) : FALLBACK_PORTFOLIO.find((c) => c.slug === slug) || null
  } catch {
    return FALLBACK_PORTFOLIO.find((c) => c.slug === slug) || null
  }
}

async function getOtherCompanies(currentSlug: string): Promise<Company[]> {
  try {
    const sql = getDb()
    if (!sql) {
      return FALLBACK_PORTFOLIO.filter((c) => c.slug !== currentSlug).slice(0, 3)
    }
    const rows = await sql`SELECT * FROM portfolio_companies WHERE slug != ${currentSlug} AND status = 'active' ORDER BY sort_order ASC LIMIT 3`
    return rows.length > 0 ? (rows as Company[]) : FALLBACK_PORTFOLIO.filter((c) => c.slug !== currentSlug).slice(0, 3)
  } catch {
    return FALLBACK_PORTFOLIO.filter((c) => c.slug !== currentSlug).slice(0, 3)
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const company = await getCompanyBySlug(slug)
  
  if (!company) {
    return {
      title: "기업을 찾을 수 없습니다 | (주)포항연합기술지주",
    }
  }

  return {
    title: `${company.name} | 투자 포트폴리오 | (주)포항연합기술지주`,
    description: company.description || `${company.name}에 대한 투자 정보입니다.`,
  }
}

export default async function PortfolioDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const company = await getCompanyBySlug(slug)

  if (!company) {
    notFound()
  }

  const otherCompanies = await getOtherCompanies(slug)

  return (
    <main className="min-h-screen bg-warm-ivory">
      <Navbar />
      
      {/* Hero Header */}
      <section className="relative overflow-hidden bg-dark pt-24 pb-20 lg:pt-32 lg:pb-28">
        <Particles
          className="absolute inset-0"
          quantity={30}
          color="#c9a84c"
          size={0.6}
          speed={0.08}
        />
        <div className="relative z-10 mx-auto max-w-7xl px-8 lg:px-12">
          <BlurFade delay={0.1}>
            <nav className="mb-8 flex items-center gap-2 text-sm text-text-tertiary">
              <Link href="/" className="transition-colors hover:text-gold">
                홈
              </Link>
              <span>/</span>
              <Link href="/portfolio" className="transition-colors hover:text-gold">
                포트폴리오
              </Link>
              <span>/</span>
              <span className="text-gold">{company.name}</span>
            </nav>
          </BlurFade>

          <BlurFade delay={0.2}>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-medium tracking-[0.2em] text-gold">
                {company.category.toUpperCase().replace("/", " / ")}
              </span>
              {company.exited && (
                <div className="flex items-center gap-1.5 rounded-full bg-gold/20 px-3 py-1">
                  <CheckCircle size={12} className="text-gold" />
                  <span className="text-[10px] font-semibold text-gold">EXIT 완료</span>
                </div>
              )}
            </div>
          </BlurFade>

          <BlurFade delay={0.3}>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-primary-foreground lg:text-5xl xl:text-6xl">
              {company.name}
            </h1>
            {company.name_en && (
              <p className="mt-2 text-lg text-text-tertiary lg:text-xl">
                {company.name_en}
              </p>
            )}
          </BlurFade>

          <BlurFade delay={0.4}>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-text-tertiary [word-break:keep-all] lg:text-lg">
              {company.description}
            </p>
          </BlurFade>

          {company.website && (
            <BlurFade delay={0.5}>
              <a
                href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex items-center gap-2 border border-gold/50 bg-gold/10 px-6 py-3 text-sm font-medium text-gold transition-all hover:bg-gold/20"
              >
                <ExternalLink size={16} />
                웹사이트 방문하기
              </a>
            </BlurFade>
          )}
        </div>
      </section>

      {/* Company Details */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-8 lg:px-12">
          <div className="grid gap-8 lg:grid-cols-3 lg:gap-12">
            {/* Main Info */}
            <div className="lg:col-span-2">
              <BlurFade delay={0.1}>
                <div className="border border-warm-tan bg-card p-8 lg:p-10">
                  <h2 className="mb-8 flex items-center gap-3 text-xl font-bold text-foreground">
                    <Target size={20} className="text-gold" />
                    기업 개요
                  </h2>

                  <div className="space-y-6">
                    <div className="flex items-start gap-4 border-b border-warm-tan pb-6">
                      <Building2 size={20} className="mt-0.5 shrink-0 text-gold/70" />
                      <div>
                        <p className="text-[11px] font-medium tracking-wider text-text-secondary">주요사업</p>
                        <p className="mt-2 text-base leading-relaxed text-foreground [word-break:keep-all]">
                          {company.description}
                        </p>
                      </div>
                    </div>

                    {company.achievements && (
                      <div className="flex items-start gap-4 border-b border-warm-tan pb-6">
                        <Award size={20} className="mt-0.5 shrink-0 text-gold/70" />
                        <div>
                          <p className="text-[11px] font-medium tracking-wider text-text-secondary">주요성과</p>
                          <p className="mt-2 text-base leading-relaxed text-foreground [word-break:keep-all]">
                            {company.achievements}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-6 sm:grid-cols-2">
                      {company.ceo && (
                        <div className="flex items-start gap-4">
                          <User size={20} className="mt-0.5 shrink-0 text-gold/70" />
                          <div>
                            <p className="text-[11px] font-medium tracking-wider text-text-secondary">대표자</p>
                            <p className="mt-1 text-base font-medium text-foreground">{company.ceo}</p>
                          </div>
                        </div>
                      )}

                      {company.founded && (
                        <div className="flex items-start gap-4">
                          <Calendar size={20} className="mt-0.5 shrink-0 text-gold/70" />
                          <div>
                            <p className="text-[11px] font-medium tracking-wider text-text-secondary">설립일</p>
                            <p className="mt-1 text-base font-medium text-foreground">{company.founded}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </BlurFade>
            </div>

            {/* Side Info */}
            <div className="space-y-6">
              <BlurFade delay={0.2}>
                <div className="border border-warm-tan bg-card p-8">
                  <h3 className="mb-6 flex items-center gap-3 text-lg font-bold text-foreground">
                    <Briefcase size={18} className="text-gold" />
                    투자 정보
                  </h3>

                  <div className="space-y-4">
                    <div className="border-b border-warm-tan pb-4">
                      <p className="text-[10px] font-medium tracking-wider text-text-secondary">투자 연도</p>
                      <p className="mt-1 text-2xl font-bold text-gold">
                        {company.investment_year}년
                      </p>
                    </div>

                    <div className="border-b border-warm-tan pb-4">
                      <p className="text-[10px] font-medium tracking-wider text-text-secondary">투자 분야</p>
                      <p className="mt-1 text-base font-medium text-foreground">
                        {company.category}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-medium tracking-wider text-text-secondary">투자 상태</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            company.exited ? "bg-gold" : "bg-green-500"
                          }`}
                        />
                        <p className="text-base font-medium text-foreground">
                          {company.exited ? "EXIT 완료 (회수완료)" : "보유 중"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </BlurFade>

              {company.website && (
                <BlurFade delay={0.3}>
                  <div className="border border-warm-tan bg-card p-8">
                    <h3 className="mb-4 text-lg font-bold text-foreground">홈페이지</h3>
                    <a
                      href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-gold transition-colors hover:underline"
                    >
                      <ExternalLink size={14} />
                      {company.website}
                    </a>
                  </div>
                </BlurFade>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Other Companies */}
      {otherCompanies.length > 0 && (
        <section className="border-t border-warm-tan bg-warm-beige py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-8 lg:px-12">
            <BlurFade delay={0.1}>
              <div className="mb-12 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">다른 포트폴리오</h2>
                  <p className="mt-2 text-sm text-text-secondary">
                    함께 성장하는 혁신 기업들을 만나보세요
                  </p>
                </div>
                <Link
                  href="/portfolio"
                  className="hidden items-center gap-2 text-sm font-medium text-gold transition-colors hover:text-gold-light sm:inline-flex"
                >
                  전체 보기
                  <ArrowLeft size={14} className="rotate-180" />
                </Link>
              </div>
            </BlurFade>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {otherCompanies.map((c, i) => (
                <BlurFade key={c.id} delay={0.1 + i * 0.05}>
                  <Link href={`/portfolio/${c.slug}`} className="group block">
                    <div className="relative h-full border border-warm-tan bg-card p-8 transition-all duration-300 hover:border-gold/50 hover:shadow-lg">
                      {c.exited && (
                        <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-gold/10 px-2 py-1">
                          <CheckCircle size={10} className="text-gold" />
                          <span className="text-[9px] font-medium text-gold">EXIT</span>
                        </div>
                      )}

                      <span className="text-[10px] font-medium tracking-[0.2em] text-gold">
                        {c.category.toUpperCase().replace("/", " / ")}
                      </span>

                      <h3 className="mt-4 text-lg font-bold text-foreground transition-colors group-hover:text-gold">
                        {c.name}
                      </h3>
                      {c.name_en && (
                        <p className="mt-1 text-[11px] font-light tracking-wide text-text-secondary">
                          {c.name_en}
                        </p>
                      )}

                      <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-text-secondary">
                        {c.description}
                      </p>

                      <div className="mt-6 flex items-center justify-between border-t border-warm-tan pt-4">
                        <span className="text-[10px] font-medium tabular-nums text-text-secondary">
                          {c.investment_year}년 투자
                        </span>
                        <span className="text-[10px] text-gold opacity-0 transition-opacity group-hover:opacity-100">
                          자세히 보기
                        </span>
                      </div>
                    </div>
                  </Link>
                </BlurFade>
              ))}
            </div>

            <Link
              href="/portfolio"
              className="mt-8 inline-flex w-full items-center justify-center gap-2 text-sm font-medium text-gold transition-colors hover:text-gold-light sm:hidden"
            >
              전체 포트폴리오 보기
              <ArrowLeft size={14} className="rotate-180" />
            </Link>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="border-t border-warm-tan bg-warm-ivory py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-8 text-center lg:px-12">
          <BlurFade delay={0.1}>
            <h3 className="text-2xl font-bold text-foreground">투자 문의</h3>
            <p className="mt-4 text-sm text-text-secondary [word-break:keep-all]">
              포항연합기술지주와 함께 성장하고 싶은 기업의 연락을 기다립니다.
            </p>
            <Link
              href="/#contact"
              className="mt-8 inline-block bg-foreground px-8 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-dark-muted"
            >
              문의하기
            </Link>
          </BlurFade>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
