"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, CheckCircle } from "lucide-react"
import { BlurFade } from "@/components/magicui/blur-fade"
import { cn } from "@/lib/utils"

interface Company {
  id: number
  name: string
  name_en: string | null
  category: string
  description: string | null
  investment_year: number | null
  slug?: string
  exited?: boolean
}

const CATEGORIES = ["전체", "AI/로봇", "AI/IT", "바이오/헬스케어", "에너지/환경"]

export function PortfolioSection({ companies }: { companies: Company[] }) {
  const [activeCategory, setActiveCategory] = useState("전체")

  const filtered =
    activeCategory === "전체"
      ? companies
      : companies.filter((c) => c.category === activeCategory)

  return (
    <section id="portfolio" className="relative bg-warm-ivory py-28 lg:py-40">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* Header */}
        <div className="mb-16 grid gap-8 lg:grid-cols-2 lg:gap-16">
          <BlurFade delay={0.1}>
            <div className="mb-6 flex items-center gap-4">
              <div className="editorial-rule" />
              <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
                PORTFOLIO
              </span>
            </div>
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground lg:text-5xl text-balance">
              <span className="block">{"투자"}</span>
              <span className="block bg-gradient-to-r from-gold to-gold-light bg-clip-text text-transparent">{"포트폴리오"}</span>
            </h2>
          </BlurFade>
          <BlurFade delay={0.2}>
            <div className="flex flex-col items-start gap-6 lg:items-end lg:pb-2">
              <p className="max-w-md text-[15px] leading-[1.9] text-text-secondary [word-break:keep-all] lg:text-right">
                창업보육 입주기업 및 벤처투자 포트폴리오 기업들과 함께 성장합니다.
              </p>
              <Link
                href="/portfolio"
                className="inline-flex items-center gap-2 text-sm font-medium text-gold transition-colors hover:text-gold-light"
              >
                전체 포트폴리오 보기
                <ArrowRight size={14} />
              </Link>
            </div>
          </BlurFade>
        </div>

        {/* Category filter */}
        <BlurFade delay={0.25}>
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

        {/* Grid */}
        <div className="grid gap-[1px] bg-warm-tan sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((company, i) => (
            <BlurFade key={company.id} delay={0.03 + i * 0.025}>
              <Link
                href={company.slug ? `/portfolio/${company.slug}` : "/portfolio"}
                className="group flex h-full flex-col justify-between bg-card p-8 transition-all duration-300 hover:bg-warm-beige lg:p-10"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium tracking-[0.2em] text-gold">
                      {company.category.toUpperCase().replace("/", " / ")}
                    </span>
                    {company.exited && (
                      <div className="flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5">
                        <CheckCircle size={10} className="text-gold" />
                        <span className="text-[9px] font-medium text-gold">EXIT</span>
                      </div>
                    )}
                  </div>

                  <h3 className="mt-4 text-base font-bold text-foreground transition-colors group-hover:text-gold lg:text-lg">
                    {company.name}
                  </h3>
                  {company.name_en && (
                    <p className="mt-1 text-[11px] font-light tracking-wide text-text-secondary">
                      {company.name_en}
                    </p>
                  )}
                  {company.description && (
                    <p className="mt-3 text-sm leading-relaxed text-text-secondary line-clamp-2">
                      {company.description}
                    </p>
                  )}
                </div>

                <div className="mt-8 flex items-center justify-between">
                  {company.investment_year && (
                    <span className="text-[10px] font-medium tabular-nums tracking-[0.15em] text-warm-tan">
                      {company.investment_year}년 투자
                    </span>
                  )}
                  <span className="text-[10px] text-gold opacity-0 transition-opacity group-hover:opacity-100">
                    자세히 보기
                  </span>
                </div>
              </Link>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  )
}
