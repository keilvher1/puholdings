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
  { name: "포항시" },
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

        {/* Main Layout */}
        <BlurFade delay={0.3}>
          {/* Outer flex: [left+center+지자체 column] | [portfolio column] */}
          <div className="mt-16 flex gap-6 items-stretch">

            {/* Left side: stacked (top boxes + 지자체) */}
            <div className="flex-1 flex flex-col gap-6">

              {/* Top row: 내부 역량 + 네트워크 */}
              <div className="flex gap-6 flex-1">

                {/* Left: 내부 역량 기반 자체 지원 */}
                <div className="flex-1 border border-warm-tan bg-card p-6 lg:p-8 flex flex-col">
                  <div className="flex justify-center mb-6">
                    <div className="border border-dashed border-warm-tan px-5 py-2">
                      <p className="text-sm text-center">
                        내부 역량 기반<br />
                        <span className="font-semibold text-foreground">자체 지원</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-4 mb-8">
                    <div className="relative h-10 w-32">
                      <Image
                        src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-Gr0HGRS2EgHMVp6hUlFloPH4NbnZqE.png"
                        alt="한동대학교"
                        fill
                        className="object-contain"
                      />
                    </div>
                    <div className="relative h-10 w-32">
                      <Image
                        src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-5SMkRAzZQ5MANmKw9kknm38UuBSgc1.png"
                        alt="(주)포항연합기술지주"
                        fill
                        className="object-contain"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 flex-1">
                    <div className="flex flex-col gap-3">
                      {HANDONG_ACTIVITIES.map((item) => (
                        <div key={item} className="flex-1 border border-blue-500/40 bg-white rounded-full flex items-center justify-center px-3 py-2 min-h-[40px]">
                          <span className="text-xs text-foreground text-center leading-tight">{item}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col gap-3">
                      {PUHOLDINGS_ACTIVITIES.map((item) => (
                        <div key={item} className="flex-1 border border-red-500/40 bg-white rounded-full flex items-center justify-center px-3 py-2 min-h-[40px]">
                          <span className="text-xs text-foreground text-center leading-tight">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Center: 네트워크 기반 외부 연계 */}
                <div className="w-56 border border-warm-tan bg-card p-6 lg:p-8 flex flex-col">
                  <div className="flex justify-center mb-6">
                    <div className="border border-dashed border-warm-tan px-5 py-2">
                      <p className="text-sm text-center">
                        네트워크 기반<br />
                        <span className="font-semibold text-foreground">외부 연계</span>
                      </p>
                    </div>
                  </div>
                  <p className="text-base font-bold text-foreground mb-6 text-center whitespace-nowrap">
                    동문, 대기업, 해외 대학 등
                  </p>
                  <div className="flex flex-col gap-3 flex-1">
                    {EXTERNAL_NETWORK.map((item) => (
                      <div key={item} className="flex-1 border border-gold/40 bg-white rounded-full flex items-center justify-center px-4 py-2 min-h-[40px]">
                        <span className="text-xs text-foreground text-center leading-tight whitespace-nowrap">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom: 지자체 협력 박스 */}
              <div className="relative mt-4">
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10 bg-warm-ivory px-4">
                  <span className="text-sm font-medium text-foreground whitespace-nowrap">지자체 협력</span>
                </div>
                <div className="border border-warm-tan bg-card px-10 py-5 flex items-center justify-around gap-6">
                  {LOCAL_GOVERNMENTS.map((gov, i) => (
                    <span key={gov.name} className="flex items-center gap-4">
                      <span className="text-sm font-medium text-foreground whitespace-nowrap">{gov.name}</span>
                      {i < LOCAL_GOVERNMENTS.length - 1 && (
                        <span className="text-warm-tan">|</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Portfolio Companies — stretches full height including 지자체 row */}
            <div className="w-40 border border-warm-tan bg-card p-6 flex flex-col justify-center gap-6">
              {PORTFOLIO_COMPANIES.map((company) => (
                <div key={company.name} className="text-center">
                  <p className="text-sm font-bold text-foreground">{company.name}</p>
                  {company.subtitle && (
                    <p className="text-[9px] text-text-secondary mt-0.5 leading-tight">{company.subtitle}</p>
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
