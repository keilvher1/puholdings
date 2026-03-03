"use client"

import { useState } from "react"
import { BlurFade } from "@/components/magicui/blur-fade"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

interface Company {
  id: number
  name: string
  name_en: string | null
  category: string
  description: string | null
  investment_year: number | null
}

const CATEGORIES = ["전체", "바이오/헬스케어", "AI/IT", "소재/화학", "에너지/환경"]

export function PortfolioSection({ companies }: { companies: Company[] }) {
  const [activeCategory, setActiveCategory] = useState("전체")

  const filtered =
    activeCategory === "전체"
      ? companies
      : companies.filter((c) => c.category === activeCategory)

  return (
    <section id="portfolio" className="relative overflow-hidden bg-navy-deep py-24 md:py-32">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(0,188,212,0.06)_0%,_transparent_60%)]" />

      <div className="relative mx-auto max-w-7xl px-6">
        <BlurFade delay={0.1}>
          <div className="mb-4 text-center">
            <span className="text-xs font-semibold tracking-widest text-cyan-accent">
              PORTFOLIO
            </span>
          </div>
          <h2 className="mb-4 text-center text-3xl font-bold text-primary-foreground md:text-4xl text-balance">
            투자 포트폴리오
          </h2>
          <p className="mx-auto mb-12 max-w-xl text-center leading-relaxed text-slate-400">
            포항연합기술지주가 투자하고 육성하는 혁신 기업들을 소개합니다.
          </p>
        </BlurFade>

        {/* Filter tabs */}
        <BlurFade delay={0.2}>
          <div className="mb-12 flex flex-wrap justify-center gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "rounded-full px-5 py-2 text-sm font-medium transition-all duration-300",
                  activeCategory === cat
                    ? "bg-blue-accent text-primary-foreground shadow-lg shadow-blue-accent/25"
                    : "border border-navy-light bg-navy-light/50 text-slate-400 hover:border-blue-accent/30 hover:text-primary-foreground"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </BlurFade>

        {/* Portfolio grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((company, i) => (
            <BlurFade key={company.id} delay={0.05 + i * 0.04}>
              <div className="group relative overflow-hidden rounded-xl border border-navy-light/60 bg-navy/80 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-blue-accent/40 hover:shadow-xl hover:shadow-blue-accent/5">
                {/* Category badge */}
                <div className="mb-4 inline-flex items-center rounded-full bg-blue-accent/10 px-3 py-1">
                  <span className="text-[10px] font-semibold text-blue-accent">
                    {company.category}
                  </span>
                </div>

                <h3 className="mb-1 text-base font-bold text-primary-foreground">
                  {company.name}
                </h3>
                {company.name_en && (
                  <p className="mb-3 text-xs text-slate-400">{company.name_en}</p>
                )}
                {company.description && (
                  <p className="mb-4 text-sm leading-relaxed text-slate-400">
                    {company.description}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  {company.investment_year && (
                    <span className="text-xs text-slate-600">
                      {company.investment_year}{"년 투자"}
                    </span>
                  )}
                  <ExternalLink
                    size={14}
                    className="text-slate-600 transition-colors group-hover:text-blue-accent"
                  />
                </div>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  )
}
