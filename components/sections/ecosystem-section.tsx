"use client"

import { BlurFade } from "@/components/magicui/blur-fade"

const MATRIX_DATA = [
  {
    stage: "예비창업",
    publicRole: [
      "포항시 대학 창업 경진대회 개최",
      "전략산업 분야 기업 배치 프로그램 운영",
      "창업 관련 행사 개최",
    ],
    privateRole: [],
  },
  {
    stage: "창업초기",
    publicRole: [
      "전략산업 분야 발굴",
      "씨앗투자 (~1억원) 육성",
      "포스코 IMP (Idea Market Place) 개최",
    ],
    privateRole: [],
  },
  {
    stage: "창업중기",
    publicRole: [
      "기술사업화를 위한 초기투자 (2~10억원)",
      "TIPS 등 정부지원 프로그램 연계",
    ],
    privateRole: [
      "포스텍 중심 집중투자",
      "포스코 유관 집중투자",
      "대규모 시설투자를 위한 후속투자 (~30억원)",
    ],
  },
]

const VALUE_CHAIN = [
  {
    step: "발굴",
    items: ["주력산업 분야 배치 프로그램", "주력산업 분야 경진대회", "주력산업 분야 전략적 씨앗투자", "주력산업 분야 스타트업 유치"],
  },
  {
    step: "육성",
    items: ["공공 기술이전", "사업화 지원 프로그램", "투자기업 육성 후 외부연계"],
  },
  {
    step: "기업지원",
    items: ["지자체·기관 연계 통한 성장지원", "후속투자 및 성장지원"],
  },
  {
    step: "성장",
    items: ["초기투자 연계", "VC 투자 유치 지원"],
  },
  {
    step: "회수",
    items: ["IPO 지원", "M&A 연계"],
  },
]

export function EcosystemSection() {
  return (
    <section className="relative bg-dark py-28 lg:py-40">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* Header */}
        <BlurFade delay={0.1}>
          <div className="mb-6 flex items-center gap-4">
            <div className="editorial-rule" />
            <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
              ECOSYSTEM
            </span>
          </div>
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-primary-foreground lg:text-4xl">
            포항창업투자 생태계
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-[1.9] text-text-tertiary [word-break:keep-all]">
            공공·민간, 창업단계로 나누어 체계적인 투자 생태계를 구축하고 있습니다.
          </p>
        </BlurFade>

        {/* Matrix */}
        <BlurFade delay={0.2}>
          <div className="mt-16 overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Header */}
              <div className="grid grid-cols-[140px_1fr_1fr] border-b border-warm-tan/20">
                <div className="px-4 py-4 bg-dark-muted">
                  <p className="text-sm font-medium text-primary-foreground text-center whitespace-nowrap">창업단계</p>
                </div>
                <div className="px-4 py-4 bg-dark-muted border-l border-warm-tan/20">
                  <p className="text-sm font-medium text-primary-foreground text-center whitespace-nowrap">공공의 영역</p>
                  <p className="text-[10px] text-text-tertiary text-center mt-1">(지역전략발전)</p>
                </div>
                <div className="px-4 py-4 bg-dark-muted border-l border-warm-tan/20">
                  <p className="text-sm font-medium text-primary-foreground text-center whitespace-nowrap">민간의 영역</p>
                  <p className="text-[10px] text-text-tertiary text-center mt-1">(이익증대)</p>
                </div>
              </div>

              {/* Rows */}
              {MATRIX_DATA.map((row, index) => (
                <div
                  key={row.stage}
                  className={`grid grid-cols-[140px_1fr_1fr] ${index !== MATRIX_DATA.length - 1 ? 'border-b border-warm-tan/20' : ''}`}
                >
                  <div className="px-4 py-5 flex items-center justify-center border-r border-warm-tan/20">
                    <span className="text-sm font-medium text-gold whitespace-nowrap">{row.stage}</span>
                  </div>
                  <div className="px-4 py-5 border-r border-warm-tan/20">
                    {row.publicRole.length > 0 ? (
                      <ul className="space-y-1.5">
                        {row.publicRole.map((item, i) => (
                          <li key={i} className="text-xs text-text-tertiary leading-relaxed flex items-start gap-2">
                            <span className="text-gold mt-1">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-text-tertiary/50 text-center">-</p>
                    )}
                  </div>
                  <div className="px-4 py-5">
                    {row.privateRole.length > 0 ? (
                      <ul className="space-y-1.5">
                        {row.privateRole.map((item, i) => (
                          <li key={i} className="text-xs text-text-tertiary leading-relaxed flex items-start gap-2">
                            <span className="text-gold mt-1">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-text-tertiary/50 text-center">-</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </BlurFade>

        {/* Value Chain */}
        <BlurFade delay={0.3}>
          <div className="mt-20">
            <h3 className="text-xl font-bold text-primary-foreground mb-8">포항시 창업 Value Chain</h3>
            
            <div className="relative">
              {/* Arrow line */}
              <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-gold/60 via-gold to-gold/60 -translate-y-1/2 hidden lg:block" />
              
              <div className="grid gap-4 lg:grid-cols-5">
                {VALUE_CHAIN.map((phase, index) => (
                  <div key={phase.step} className="relative">
                    <div className="bg-dark-muted border border-warm-tan/20 p-5 h-full">
                      <div className="flex items-center gap-3 mb-4">
                        <span className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-xs font-bold text-gold">
                          {index + 1}
                        </span>
                        <h4 className="text-sm font-bold text-primary-foreground">{phase.step}</h4>
                      </div>
                      <ul className="space-y-2">
                        {phase.items.map((item, i) => (
                          <li key={i} className="text-[11px] text-text-tertiary leading-relaxed flex items-start gap-1.5">
                            <span className="text-gold/70 mt-0.5">-</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {/* Arrow indicator */}
                    {index < VALUE_CHAIN.length - 1 && (
                      <div className="hidden lg:flex absolute -right-2 top-1/2 -translate-y-1/2 z-10 w-4 h-4 bg-gold rounded-full items-center justify-center">
                        <svg className="w-2 h-2 text-dark" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3" fill="none" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </BlurFade>

        {/* Summary note */}
        <BlurFade delay={0.4}>
          <div className="mt-16 p-6 border border-gold/30 bg-gold/5">
            <p className="text-sm leading-[1.8] text-text-tertiary [word-break:keep-all]">
              <span className="text-gold font-medium">포항연합기술지주</span>는 공공의 영역(지역전략발전)에서 발굴/육성/씨앗투자를 담당하며, 
              민간의 영역(이익증대)과 협력하여 초기투자부터 IPO/M&A까지 포항시 창업 Value Chain을 완성합니다.
            </p>
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
