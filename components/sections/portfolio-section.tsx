"use client"

import { useState } from "react"
import { BlurFade } from "@/components/magicui/blur-fade"
import { ArrowUpRight } from "lucide-react"
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
              <span className="block text-gold">{"포트폴리오"}</span>
            </h2>
          </BlurFade>
          <BlurFade delay={0.2}>
            <div className="flex items-end lg:justify-end lg:pb-2">
              <p className="max-w-md text-base leading-[1.9] text-text-secondary">
                {"포항연합기술지주가 투자하고 육성하는 혁신 기업들을 소개합니다."}
              </p>
            </div>
          </BlurFade>
        </div>

        {/* Filter - minimal inline style */}
        <BlurFade delay={0.25}>
          <div className="mb-12 flex flex-wrap items-center gap-2 border-b border-warm-tan pb-6">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "px-4 py-2 text-xs font-medium tracking-wide transition-all duration-300",
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

        {/* Grid - mixed sizing for editorial feel */}
        <div className="grid gap-px bg-warm-tan sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((company, i) => (
            <BlurFade key={company.id} delay={0.04 + i * 0.03}>
              <div className="group relative flex flex-col justify-between bg-card p-8 transition-all duration-300 hover:bg-warm-beige lg:p-10 h-full">
                {/* Category */}
                <div>
                  <span className="text-[10px] font-medium tracking-[0.2em] text-gold">
                    {company.category.toUpperCase().replace("/", " / ")}
                  </span>

                  <h3 className="mt-4 text-lg font-bold text-foreground">
                    {company.name}
                  </h3>
                  {company.name_en && (
                    <p className="mt-1 text-xs font-light tracking-wide text-text-secondary">
                      {company.name_en}
                    </p>
                  )}
                  {company.description && (
                    <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                      {company.description}
                    </p>
                  )}
                </div>

                <div className="mt-8 flex items-center justify-between">
                  {company.investment_year && (
                    <span className="text-[10px] font-medium tracking-wider text-text-secondary">
                      {company.investment_year}
                    </span>
                  )}
                  <ArrowUpRight
                    size={16}
                    className="text-warm-tan transition-all duration-300 group-hover:text-gold group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
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
