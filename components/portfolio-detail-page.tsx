"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, ExternalLink, Building2, User, Calendar, Award, CheckCircle } from "lucide-react"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Particles } from "@/components/magicui/particles"
import { cn } from "@/lib/utils"

interface Company {
  id: number
  name: string
  name_en: string | null
  category: string
  description: string | null
  investment_year: number | null
  ceo?: string
  founded?: string
  achievements?: string
  website?: string | null
  exited?: boolean
}

const CATEGORIES = ["전체", "AI/로봇", "AI/IT", "바이오/헬스케어", "에너지/환경"]

export function PortfolioDetailPage({ companies }: { companies: Company[] }) {
  const [activeCategory, setActiveCategory] = useState("전체")
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)

  const filtered =
    activeCategory === "전체"
      ? companies
      : companies.filter((c) => c.category === activeCategory)

  const activeCount = companies.filter((c) => !c.exited).length
  const exitedCount = companies.filter((c) => c.exited).length

  return (
    <main className="min-h-screen bg-warm-ivory">
      {/* Hero Header */}
      <section className="relative overflow-hidden bg-dark py-32 lg:py-40">
        <Particles
          className="absolute inset-0"
          quantity={30}
          color="#c9a84c"
          size={0.6}
          speed={0.08}
        />
        <div className="relative z-10 mx-auto max-w-7xl px-8 lg:px-12">
          <BlurFade delay={0.1}>
            <Link
              href="/"
              className="mb-8 inline-flex items-center gap-2 text-sm text-text-tertiary transition-colors hover:text-gold"
            >
              <ArrowLeft size={16} />
              메인으로 돌아가기
            </Link>
          </BlurFade>

          <BlurFade delay={0.2}>
            <div className="mb-6 flex items-center gap-4">
              <div className="editorial-rule" />
              <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
                INVESTMENT PORTFOLIO
              </span>
            </div>
          </BlurFade>

          <BlurFade delay={0.3}>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-primary-foreground lg:text-6xl">
              <span className="block">투자 포트폴리오</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-text-tertiary [word-break:keep-all]">
              포항연합기술지주가 투자한 혁신 기업들입니다. 창업보육과 벤처투자를 통해 함께 성장하고 있습니다.
            </p>
          </BlurFade>

          {/* Stats */}
          <BlurFade delay={0.4}>
            <div className="mt-12 flex flex-wrap gap-12">
              <div>
                <p className="text-3xl font-bold text-gold">{companies.length}</p>
                <p className="mt-1 text-xs tracking-wider text-text-tertiary">총 투자기업</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-primary-foreground">{activeCount}</p>
                <p className="mt-1 text-xs tracking-wider text-text-tertiary">보유 중</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-primary-foreground">{exitedCount}</p>
                <p className="mt-1 text-xs tracking-wider text-text-tertiary">EXIT 완료</p>
              </div>
            </div>
          </BlurFade>
        </div>
      </section>

      {/* Content */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-8 lg:px-12">
          {/* Category filter */}
          <BlurFade delay={0.1}>
            <div className="mb-12 flex flex-wrap items-center gap-3 border-b border-warm-tan pb-6">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "px-5 py-2 text-[11px] font-medium tracking-[0.08em] transition-all duration-300",
                    activeCategory === cat
                      ? "bg-foreground text-primary-foreground"
                      : "text-text-secondary hover:text-foreground"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </BlurFade>

          {/* Portfolio Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((company, i) => (
              <BlurFade key={company.id} delay={0.05 + i * 0.03}>
                <button
                  onClick={() => setSelectedCompany(company)}
                  className="group w-full text-left"
                >
                  <div className="relative flex h-full flex-col border border-warm-tan bg-card p-8 transition-all duration-300 hover:border-gold/50 hover:shadow-lg">
                    {company.exited && (
                      <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-gold/10 px-2 py-1">
                        <CheckCircle size={10} className="text-gold" />
                        <span className="text-[9px] font-medium text-gold">EXIT</span>
                      </div>
                    )}
                    
                    <span className="text-[10px] font-medium tracking-[0.2em] text-gold">
                      {company.category.toUpperCase().replace("/", " / ")}
                    </span>

                    <h3 className="mt-4 text-lg font-bold text-foreground group-hover:text-gold transition-colors">
                      {company.name}
                    </h3>
                    {company.name_en && (
                      <p className="mt-1 text-[11px] font-light tracking-wide text-text-secondary">
                        {company.name_en}
                      </p>
                    )}

                    {company.description && (
                      <p className="mt-4 flex-1 text-sm leading-relaxed text-text-secondary [word-break:keep-all]">
                        {company.description}
                      </p>
                    )}

                    <div className="mt-6 flex items-center justify-between border-t border-warm-tan pt-4">
                      {company.investment_year && (
                        <span className="text-[10px] font-medium tabular-nums text-text-secondary">
                          {company.investment_year}년 투자
                        </span>
                      )}
                      <span className="text-[10px] text-gold opacity-0 transition-opacity group-hover:opacity-100">
                        자세히 보기 →
                      </span>
                    </div>
                  </div>
                </button>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      {/* Modal */}
      {selectedCompany && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-dark/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedCompany(null)}
        >
          <BlurFade delay={0}>
            <div 
              className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto bg-card p-8 lg:p-12"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedCompany(null)}
                className="absolute right-4 top-4 text-text-secondary hover:text-foreground transition-colors"
              >
                ✕
              </button>

              {selectedCompany.exited && (
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gold/10 px-3 py-1">
                  <CheckCircle size={12} className="text-gold" />
                  <span className="text-xs font-medium text-gold">EXIT 완료</span>
                </div>
              )}

              <span className="text-[10px] font-medium tracking-[0.2em] text-gold">
                {selectedCompany.category.toUpperCase().replace("/", " / ")}
              </span>

              <h2 className="mt-3 text-2xl font-bold text-foreground lg:text-3xl">
                {selectedCompany.name}
              </h2>
              {selectedCompany.name_en && (
                <p className="mt-1 text-sm text-text-secondary">
                  {selectedCompany.name_en}
                </p>
              )}

              <div className="mt-8 space-y-4">
                {selectedCompany.ceo && (
                  <div className="flex items-start gap-3">
                    <User size={16} className="mt-0.5 shrink-0 text-gold/70" />
                    <div>
                      <p className="text-[10px] font-medium tracking-wider text-text-secondary">대표자</p>
                      <p className="mt-0.5 text-sm text-foreground">{selectedCompany.ceo}</p>
                    </div>
                  </div>
                )}

                {selectedCompany.founded && (
                  <div className="flex items-start gap-3">
                    <Calendar size={16} className="mt-0.5 shrink-0 text-gold/70" />
                    <div>
                      <p className="text-[10px] font-medium tracking-wider text-text-secondary">설립일</p>
                      <p className="mt-0.5 text-sm text-foreground">{selectedCompany.founded}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <Building2 size={16} className="mt-0.5 shrink-0 text-gold/70" />
                  <div>
                    <p className="text-[10px] font-medium tracking-wider text-text-secondary">주요사업</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-foreground [word-break:keep-all]">
                      {selectedCompany.description}
                    </p>
                  </div>
                </div>

                {selectedCompany.achievements && (
                  <div className="flex items-start gap-3">
                    <Award size={16} className="mt-0.5 shrink-0 text-gold/70" />
                    <div>
                      <p className="text-[10px] font-medium tracking-wider text-text-secondary">주요성과</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-foreground [word-break:keep-all]">
                        {selectedCompany.achievements}
                      </p>
                    </div>
                  </div>
                )}

                {selectedCompany.website && (
                  <div className="flex items-start gap-3">
                    <ExternalLink size={16} className="mt-0.5 shrink-0 text-gold/70" />
                    <div>
                      <p className="text-[10px] font-medium tracking-wider text-text-secondary">홈페이지</p>
                      <a 
                        href={`https://${selectedCompany.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-block text-sm text-gold hover:underline"
                      >
                        {selectedCompany.website}
                      </a>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-10 border-t border-warm-tan pt-6">
                <p className="text-[10px] font-medium tracking-wider text-text-secondary">투자 연도</p>
                <p className="mt-1 text-lg font-bold text-gold">
                  {selectedCompany.investment_year}년
                </p>
              </div>
            </div>
          </BlurFade>
        </div>
      )}

      {/* Footer CTA */}
      <section className="border-t border-warm-tan bg-warm-beige py-20">
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
    </main>
  )
}
