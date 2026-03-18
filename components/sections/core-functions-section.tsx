"use client"

import { BlurFade } from "@/components/magicui/blur-fade"
import Image from "next/image"

const HANDONG_ACTIVITIES = [
  "창업 교육",
  "창업 동아리",
  "특허 관리 및 기술이전",
  "창업경진대회",
]

const PUHOLDINGS_ACTIVITIES = [
  "창업보육센터 운영",
  "벤처투자",
  "액셀러레이팅 프로그램 운영",
  "TIPS/LIPS 추천",
]

const EXTERNAL_NETWORK = [
  "오픈 이노베이션",
  "VC, PE, IB 투자",
  "판로 개척",
  "해외 진출",
]

const PORTFOLIO_COMPANIES = [
  { name: "HEM파마", subtitle: "Human Effective Microbes Pharma Inc." },
  { name: "Impactive AI", subtitle: "" },
  { name: "MIDBAR", subtitle: "" },
  { name: "deep visions", subtitle: "" },
]

const LOCAL_GOVERNMENTS = [
  { name: "경상북도" },
  { name: "pohang", subtitle: "포항시" },
  { name: "영덕군" },
  { name: "안동시" },
]

export function CoreFunctionsSection() {
  return (
    <section className="relative bg-warm-ivory py-28 lg:py-40 border-t border-warm-tan">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* Header */}
        <BlurFade delay={0.1}>
          <div className="mb-6 flex items-center gap-4">
            <div className="editorial-rule" />
            <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
              DEPARTMENT OVERVIEW
            </span>
          </div>
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground lg:text-4xl">
            핵심 기능 및 역할
          </h2>
        </BlurFade>

        {/* Description */}
        <BlurFade delay={0.2}>
          <div className="mt-8 max-w-4xl space-y-4">
            <p className="text-base leading-[1.9] text-text-secondary [word-break:keep-all]">
              대학 기술지주회사이자 지역 액셀러레이터로서 대학 창업 활성화 및 대학 공동 사업 확대(글로컬, RISE 연계)를 통한 지산학연 창업 생태계 구축 추진
            </p>
            <p className="text-base leading-[1.9] text-text-secondary [word-break:keep-all]">
              창업보육센터 운영, 벤처투자 및 창업지원 사업 등을 통해 우수 (예비)창업자 발굴, 육성, 투자 등의 업무 진행
            </p>
          </div>
        </BlurFade>

        {/* 3 Column Layout */}
        <BlurFade delay={0.3}>
          <div className="mt-16 grid gap-6 lg:grid-cols-[1.2fr_0.8fr_0.6fr]">
            {/* Left Column: 내부 역량 기반 자체 지원 */}
            <div className="border border-warm-tan bg-card p-6 lg:p-8">
              {/* Label */}
              <div className="mb-6 border border-dashed border-warm-tan px-4 py-2 inline-block">
                <p className="text-sm text-text-secondary text-center">
                  내부 역량 기반<br />
                  <span className="font-medium text-foreground">자체 지원</span>
                </p>
              </div>

              {/* Two Logos */}
              <div className="flex items-center justify-center gap-6 mb-8">
                <div className="relative h-12 w-36">
                  <Image 
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-Gr0HGRS2EgHMVp6hUlFloPH4NbnZqE.png"
                    alt="한동대학교"
                    fill
                    className="object-contain"
                  />
                </div>
                <div className="relative h-12 w-36">
                  <Image 
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-5SMkRAzZQ5MANmKw9kknm38UuBSgc1.png"
                    alt="(주)포항연합기술지주"
                    fill
                    className="object-contain"
                  />
                </div>
              </div>

              {/* Two Column Grid for Activities */}
              <div className="grid grid-cols-2 gap-3">
                {/* Left: Handong Activities */}
                <div className="space-y-2">
                  {HANDONG_ACTIVITIES.map((item) => (
                    <div key={item} className="border border-blue-500/40 bg-white rounded-full px-4 py-2 text-center">
                      <span className="text-xs text-foreground whitespace-nowrap">{item}</span>
                    </div>
                  ))}
                </div>
                {/* Right: PU Holdings Activities */}
                <div className="space-y-2">
                  {PUHOLDINGS_ACTIVITIES.map((item) => (
                    <div key={item} className="border border-red-500/40 bg-white rounded-full px-4 py-2 text-center">
                      <span className="text-xs text-foreground whitespace-nowrap">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Center Column: 네트워크 기반 외부 연계 */}
            <div className="border border-warm-tan bg-card p-6 lg:p-8">
              {/* Label */}
              <div className="mb-6 border border-dashed border-warm-tan px-4 py-2 inline-block">
                <p className="text-sm text-text-secondary text-center">
                  네트워크 기반<br />
                  <span className="font-medium text-foreground">외부 연계</span>
                </p>
              </div>

              {/* Subtitle */}
              <p className="text-xs text-text-secondary mb-6 text-center">동문, 대기업, 해외 대학 등</p>

              {/* Vertical List */}
              <div className="space-y-2">
                {EXTERNAL_NETWORK.map((item) => (
                  <div key={item} className="border border-gold/40 bg-white rounded-full px-4 py-2 text-center">
                    <span className="text-xs text-foreground whitespace-nowrap">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Portfolio Companies */}
            <div className="p-6 lg:p-8 flex flex-col justify-center">
              <div className="space-y-6">
                {PORTFOLIO_COMPANIES.map((company) => (
                  <div key={company.name} className="text-center">
                    <p className="text-base font-bold text-foreground">{company.name}</p>
                    {company.subtitle && (
                      <p className="text-[10px] text-text-secondary mt-0.5">{company.subtitle}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </BlurFade>

        {/* Local Government Cooperation */}
        <BlurFade delay={0.4}>
          <div className="mt-16 pt-12 border-t border-warm-tan">
            <h3 className="text-lg font-bold text-foreground mb-8 text-center">지자체 협력</h3>
            <div className="flex flex-wrap justify-center items-center gap-8 lg:gap-16">
              {LOCAL_GOVERNMENTS.map((gov) => (
                <div key={gov.name} className="flex flex-col items-center gap-1 text-text-secondary">
                  <span className="text-sm font-medium">{gov.name}</span>
                  {gov.subtitle && (
                    <span className="text-xs text-text-secondary">{gov.subtitle}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
