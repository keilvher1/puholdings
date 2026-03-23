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

const EXCELLENT_TECHNOLOGIES = [
  { id: 1, category: "IT", name: "정확도가향상된인공지능기반암판별장치", inventor: "안태진교수", trl: 4 },
  { id: 2, category: "BT", name: "바이오마커를활용한자폐범주성장애판별장치", inventor: "안태진교수", trl: 4 },
  { id: 3, category: "BT", name: "프로바이오틱스균주를이용한장내질환치료및예방조성물", inventor: "곽진환교수", trl: 4 },
  { id: 4, category: "IT", name: "치료효율및경제성이우수한미러링재활로봇", inventor: "김재효교수", trl: 4 },
  { id: 5, category: "IT", name: "인공신경망을이용한정확도높은유의파고측정시스템", inventor: "안경모교수", trl: 8 },
  { id: 6, category: "ET", name: "공간제약이없는블레이드리스풍력발전기", inventor: "이재영교수", trl: 4 },
  { id: 7, category: "IT", name: "간섭없이다중스타일구현이가능한텍스트→음성합성", inventor: "김인중교수", trl: 4 },
  { id: 8, category: "BT", name: "비알콜성지방간을감소시키는조성물(모링가올레이페라)", inventor: "도명술교수", trl: 4 },
  { id: 9, category: "IT", name: "CCTV 영상을이용한도로혼잡도분석방법및시스템", inventor: "이강교수", trl: 6 },
  { id: 10, category: "ET", name: "원자로비상상황시사용성이우수한히트파이프", inventor: "이재영교수", trl: 4 },
  { id: 11, category: "IT", name: "다감각피드백기반스마트재활운동장치", inventor: "김재효교수", trl: 4 },
  { id: 12, category: "IT", name: "뇌졸중환자의자율수지운동을위한공기팽창형재활운동장치", inventor: "김재효교수", trl: 6 },
  { id: 13, category: "IT", name: "속도가향상된음성합성시스템(딥러닝경량화TTS)", inventor: "김인중교수", trl: 4 },
  { id: 14, category: "IT", name: "자율주행차량용고정밀라이다센서장착오차검사장치", inventor: "김영근교수", trl: 4 },
  { id: 15, category: "IT", name: "저비용및고효율해안침식복구시스템", inventor: "안경모교수", trl: 4 },
  { id: 16, category: "IT", name: "동시적위치추정및지도작성(SLAM) 시스템", inventor: "황성수교수", trl: 4 },
  { id: 17, category: "BT", name: "수산양식생존율향상이가능한면역증진기능성사료첨가제", inventor: "송성규교수", trl: 4 },
  { id: 18, category: "IT", name: "뇌전도(EEG) 데이터기반의정확한뇌상태분류기술", inventor: "안민규교수", trl: 4 },
  { id: 19, category: "ET", name: "소듐고속냉각로의인쇄기판형증기발생기용유체다이오드", inventor: "이재영교수", trl: 4 },
  { id: 20, category: "NT", name: "친수성이향상된이산화티타늄광촉매", inventor: "박영춘교수", trl: 4 },
]

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
        <div className="portfolio-grid sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((company, i) => (
            <BlurFade key={company.id} delay={0.03 + i * 0.025}>
              <Link
                href={company.slug ? `/portfolio/${company.slug}` : "/portfolio"}
                className="group flex flex-col justify-between bg-card p-8 transition-all duration-300 hover:bg-warm-beige lg:p-10"
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
                  {/* 설명: 항상 2줄 높이 고정 */}
                  <div className="mt-3" style={{ minHeight: '2.8rem' }}>
                    {company.description && (
                      <p className="text-sm leading-relaxed text-text-secondary line-clamp-2">
                        {company.description}
                      </p>
                    )}
                  </div>
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

        {/* Excellent Technologies Section */}
        <BlurFade delay={0.4}>
          <div className="mt-20 pt-16 border-t border-warm-tan">
            <div className="mb-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="editorial-rule" />
                <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
                  TECHNOLOGY
                </span>
              </div>
              <h3 className="text-2xl font-bold text-foreground lg:text-3xl">우수기술</h3>
            </div>
            
            <div className="border border-warm-tan overflow-hidden overflow-x-auto">
              {/* Table Header */}
              <div className="grid grid-cols-[60px_60px_1fr_120px_60px] min-w-[700px] bg-warm-beige border-b border-warm-tan">
                <div className="px-3 py-3 border-r border-warm-tan">
                  <p className="text-sm font-medium text-foreground text-center whitespace-nowrap">구분</p>
                </div>
                <div className="px-3 py-3 border-r border-warm-tan">
                  <p className="text-sm font-medium text-foreground text-center whitespace-nowrap">분류</p>
                </div>
                <div className="px-4 py-3 border-r border-warm-tan">
                  <p className="text-sm font-medium text-foreground text-center whitespace-nowrap">기술명</p>
                </div>
                <div className="px-3 py-3 border-r border-warm-tan">
                  <p className="text-sm font-medium text-foreground text-center whitespace-nowrap">발명자</p>
                </div>
                <div className="px-3 py-3">
                  <p className="text-sm font-medium text-foreground text-center whitespace-nowrap">TRL</p>
                </div>
              </div>
              
              {/* Table Rows */}
              {EXCELLENT_TECHNOLOGIES.map((tech, index) => (
                <div 
                  key={tech.id} 
                  className={`grid grid-cols-[60px_60px_1fr_120px_60px] min-w-[700px] bg-card ${index !== EXCELLENT_TECHNOLOGIES.length - 1 ? 'border-b border-warm-tan' : ''}`}
                >
                  <div className="px-3 py-3 border-r border-warm-tan flex items-center justify-center">
                    <p className="text-sm text-text-secondary whitespace-nowrap">{tech.id}</p>
                  </div>
                  <div className="px-3 py-3 border-r border-warm-tan flex items-center justify-center">
                    <p className="text-sm text-text-secondary whitespace-nowrap">{tech.category}</p>
                  </div>
                  <div className="px-4 py-3 border-r border-warm-tan flex items-center">
                    <p className="text-sm text-text-secondary whitespace-nowrap">{tech.name}</p>
                  </div>
                  <div className="px-3 py-3 border-r border-warm-tan flex items-center justify-center">
                    <p className="text-sm text-text-secondary whitespace-nowrap">{tech.inventor}</p>
                  </div>
                  <div className="px-3 py-3 flex items-center justify-center">
                    <p className="text-sm text-text-secondary whitespace-nowrap">{tech.trl}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
