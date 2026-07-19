"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Building2, User, Calendar, Award, CheckCircle } from "lucide-react"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Particles } from "@/components/magicui/particles"
import { Navbar } from "@/components/sections/navbar"
import { Footer, type ContactInfo } from "@/components/sections/footer"
import { cn } from "@/lib/utils"

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
  slug?: string
}

const CATEGORIES = ["전체", "AI/로봇", "AI/IT", "바이오/헬스케어", "에너지/환경"]

const EXCELLENT_TECHNOLOGIES = [
  { id: 1,  category: "IT", name: "정확도가향상된인공지능기반암판별장치",                       inventor: "안태진교수", trl: 4 },
  { id: 2,  category: "BT", name: "바이오마커를활용한자폐범주성장애판별장치",                    inventor: "안태진교수", trl: 4 },
  { id: 3,  category: "BT", name: "프로바이오틱스균주를이용한장내질환치료및예방조성물",           inventor: "곽진환교수", trl: 4 },
  { id: 4,  category: "IT", name: "치료효율및경제성이우수한미러링재활로봇",                       inventor: "김재효교수", trl: 4 },
  { id: 5,  category: "IT", name: "인공신경망을이용한정확도높은유의파고측정시스템",               inventor: "안경모교수", trl: 8 },
  { id: 6,  category: "ET", name: "공간제약이없는블레이드리스풍력발전기",                         inventor: "이재영교수", trl: 4 },
  { id: 7,  category: "IT", name: "간섭없이다중스타일구현이가능한텍스트→음성합성",               inventor: "김인중교수", trl: 4 },
  { id: 8,  category: "BT", name: "비알콜성지방간을감소시키는조성물(모링가올레이페라)",           inventor: "도명술교수", trl: 4 },
  { id: 9,  category: "IT", name: "CCTV 영상을이용한도로혼잡도분석방법및시스템",                 inventor: "이강교수",   trl: 6 },
  { id: 10, category: "ET", name: "원자로비상상황시사용성이우수한히트파이프",                      inventor: "이재영교수", trl: 4 },
  { id: 11, category: "IT", name: "다감각피드백기반스마트재활운동장치",                           inventor: "김재효교수", trl: 4 },
  { id: 12, category: "IT", name: "뇌졸중환자의자율수지운동을위한공기팽창형재활운동장치",         inventor: "김재효교수", trl: 6 },
  { id: 13, category: "IT", name: "속도가향상된음성합성시스템(딥러닝경량화TTS)",                  inventor: "김인중교수", trl: 4 },
  { id: 14, category: "IT", name: "자율주행차량용고정밀라이다센서장착오차검사장치",                inventor: "김영근교수", trl: 4 },
  { id: 15, category: "IT", name: "저비용및고효율해안침식복구시스템",                             inventor: "안경모교수", trl: 4 },
  { id: 16, category: "IT", name: "동시적위치추정및지도작성(SLAM) 시스템",                        inventor: "황성수교수", trl: 4 },
  { id: 17, category: "BT", name: "수산양식생존율향상이가능한면역증진기능성사료첨가제",            inventor: "송성규교수", trl: 4 },
  { id: 18, category: "IT", name: "뇌전도(EEG) 데이터기반의정확한뇌상태분류기술",                 inventor: "안민규교수", trl: 4 },
  { id: 19, category: "ET", name: "소듐고속냉각로의인쇄기판형증기발생기용유체다이오드",            inventor: "이재영교수", trl: 4 },
  { id: 20, category: "NT", name: "친수성이향상된이산화티타늄광촉매",                             inventor: "박영춘교수", trl: 4 },
]

export function PortfolioDetailPage({ companies, contact }: { companies: Company[]; contact?: ContactInfo }) {
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
                {company.slug ? (
                  <Link
                    href={`/portfolio/${company.slug}`}
                    className="group block w-full text-left"
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
                          자세히 보기
                        </span>
                      </div>
                    </div>
                  </Link>
                ) : (
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
                          자세히 보기
                        </span>
                      </div>
                    </div>
                  </button>
                )}
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      {/* Modal (fallback for companies without slug) */}
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
                <span className="sr-only">닫기</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
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
                        href={selectedCompany.website.startsWith("http") ? selectedCompany.website : `https://${selectedCompany.website}`}
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

      {/* Excellent Technologies */}
      <section className="border-t border-warm-tan py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-8 lg:px-12">
          <BlurFade delay={0.1}>
            <div className="mb-6 flex items-center gap-4">
              <div className="editorial-rule" />
              <span className="text-[11px] font-medium tracking-[0.3em] text-gold">TECHNOLOGY</span>
            </div>
            <h2 className="text-2xl font-bold text-foreground lg:text-3xl">보유 기술</h2>
            <p className="mt-3 text-sm text-text-secondary">분류기준(SMK) 참조</p>
          </BlurFade>

          <BlurFade delay={0.2}>
            <div className="mt-10 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="bg-warm-beige border-b border-warm-tan">
                    <th className="border-r border-warm-tan px-4 py-3 text-center text-sm font-medium text-foreground whitespace-nowrap w-16">구분</th>
                    <th className="border-r border-warm-tan px-4 py-3 text-center text-sm font-medium text-foreground whitespace-nowrap w-16">분류</th>
                    <th className="border-r border-warm-tan px-4 py-3 text-center text-sm font-medium text-foreground">기술명</th>
                    <th className="border-r border-warm-tan px-4 py-3 text-center text-sm font-medium text-foreground whitespace-nowrap w-28">발명자</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-foreground whitespace-nowrap w-16">TRL</th>
                  </tr>
                </thead>
                <tbody>
                  {EXCELLENT_TECHNOLOGIES.map((tech, index) => (
                    <tr
                      key={tech.id}
                      className={`border-b border-warm-tan ${index % 2 === 0 ? "bg-card" : "bg-warm-beige/30"}`}
                    >
                      <td className="border-r border-warm-tan px-4 py-3 text-center text-sm text-text-secondary">{tech.id}</td>
                      <td className="border-r border-warm-tan px-4 py-3 text-center text-sm text-text-secondary whitespace-nowrap">{tech.category}</td>
                      <td className="border-r border-warm-tan px-4 py-3 text-sm text-text-secondary">{tech.name}</td>
                      <td className="border-r border-warm-tan px-4 py-3 text-center text-sm text-text-secondary whitespace-nowrap">{tech.inventor}</td>
                      <td className="px-4 py-3 text-center text-sm text-text-secondary">{tech.trl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </BlurFade>
        </div>
      </section>

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

      <Footer contact={contact} />
    </main>
  )
}
