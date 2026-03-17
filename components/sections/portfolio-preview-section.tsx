"use client"

import Link from "next/link"
import { ArrowRight, CheckCircle } from "lucide-react"
import { BlurFade } from "@/components/magicui/blur-fade"

interface Company {
  id: number
  name: string
  name_en?: string
  category: string
  description?: string
  investment_year?: number
  slug?: string
  exited?: boolean
}

export function PortfolioPreviewSection({ companies }: { companies: Company[] }) {
  // Show only first 4 companies for preview
  const previewCompanies = companies.slice(0, 4)

  return (
    <section id="portfolio" className="relative bg-warm-ivory py-28 lg:py-40">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* Header */}
        <div className="mb-16 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <BlurFade delay={0.1}>
            <div className="mb-6 flex items-center gap-4">
              <div className="editorial-rule" />
              <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
                PORTFOLIO
              </span>
            </div>
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground lg:text-5xl">
              <span className="block">함께 성장하는</span>
              <span className="block">혁신 기업들</span>
            </h2>
          </BlurFade>
          <BlurFade delay={0.2}>
            <Link 
              href="/portfolio"
              className="group inline-flex items-center gap-3 text-sm font-medium text-gold transition-colors hover:text-gold-dark"
            >
              <span>전체 포트폴리오 보기</span>
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </BlurFade>
        </div>

        {/* Grid - 2x2 on desktop */}
        <div className="grid gap-[1px] bg-warm-tan sm:grid-cols-2">
          {previewCompanies.map((company, i) => (
            <BlurFade key={company.id} delay={0.1 + i * 0.05}>
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

                  <h3 className="mt-4 text-lg font-bold text-foreground transition-colors group-hover:text-gold lg:text-xl">
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

        {/* CTA Button */}
        <BlurFade delay={0.4}>
          <div className="mt-12 flex justify-center">
            <Link
              href="/portfolio"
              className="group relative overflow-hidden border border-gold/60 px-10 py-4 text-[11px] font-semibold tracking-[0.2em] text-gold transition-all duration-500 hover:border-gold hover:text-warm-ivory"
            >
              <span className="absolute inset-0 -translate-x-full bg-gold transition-transform duration-500 group-hover:translate-x-0" />
              <span className="relative">VIEW ALL PORTFOLIO</span>
            </Link>
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
