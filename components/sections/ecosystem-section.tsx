"use client"

import { BlurFade } from "@/components/magicui/blur-fade"

// 단계별 투자사 역할 데이터
const INVESTMENT_STAGES = [
  {
    stage: "예비창업",
    company: "㈜포항연합기술지주",
    companyEn: "Pohang Union Holdings Co., Ltd.",
    highlighted: true,
    items: [
      "포항시 대학 창업경진대회 개최, 전략산업 분야 기업 배치 프로그램 운영, 창업 관련 행사 개최 등",
      "전략산업 분야 발굴, 씨앗투자(~1억원) 육성 등",
    ],
  },
  {
    stage: "창업초기",
    company: "POSTECH HOLDINGS",
    companyEn: "포스텍기술지주㈜",
    highlighted: false,
    items: [
      "포스코 IMP(Idea Market Place) 개최 (전국단위)",
      "포스텍 중심 집중투자, 포스코 유관 집중투자",
      "기술사업화를 위한 초기투자(2~10억원), TIPS 등",
    ],
  },
  {
    stage: "창업중기",
    company: "POSCO 포스코기술투자",
    companyEn: "",
    highlighted: false,
    items: [
      "포스코 유관 집중 투자",
      "대규모 시설투자를 위한 후속투자(~30억원) 등",
    ],
  },
]

// Value Chain 카드 데이터
const VALUE_CHAIN_CARDS = [
  {
    icon: "발굴육성",
    label: "발굴/육성/씨앗투자 (주력 산업분야)",
    highlighted: true,
    items: [
      "주력 산업 분야 배치 프로그램",
      "주력 산업 분야 경진대회",
      "주력 산업 분야 전략적 씨앗투자",
      "주력 산업 분야 스타트업 유치",
      "투자기업 육성 후 외부 연계 등",
    ],
  },
  {
    icon: "기업지원",
    label: "사업화 지원기관",
    highlighted: false,
    items: [
      "공공기술 이전",
      "사업화 지원 프로그램",
      "지자체·기관 연계 통한 성장지원",
    ],
  },
  {
    icon: "성장회수",
    label: "초기투자→ IPO, M&A",
    highlighted: false,
    items: [
      "후속투자 및 성장 지원",
    ],
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

        {/* Two Column Layout: Stage Flow + Matrix */}
        <BlurFade delay={0.2}>
          <div className="mt-16 grid gap-12 lg:grid-cols-2">
            {/* Left: 단계별 투자사 역할 (Vertical Flow) */}
            <div>
              <h3 className="text-lg font-bold text-primary-foreground mb-6 whitespace-nowrap">포항 창업 단계별 주요 투자사 역할</h3>
              <div className="relative">
                {INVESTMENT_STAGES.map((stage, index) => (
                  <div key={stage.stage} className="relative">
                    {/* Stage Card */}
                    <div className={`p-5 border ${stage.highlighted ? 'border-gold/50 border-dashed bg-gold/5' : 'border-warm-tan/20 bg-dark-muted'}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <span className={`px-3 py-1 text-xs font-bold ${stage.highlighted ? 'bg-gold text-dark' : 'bg-warm-tan/20 text-primary-foreground'}`}>
                          {stage.stage}
                        </span>
                        <div>
                          <p className={`text-sm font-medium ${stage.highlighted ? 'text-gold' : 'text-primary-foreground'}`}>{stage.company}</p>
                          {stage.companyEn && (
                            <p className="text-[10px] text-text-tertiary">{stage.companyEn}</p>
                          )}
                        </div>
                      </div>
                      <ul className="space-y-1.5 pl-1">
                        {stage.items.map((item, i) => (
                          <li key={i} className="text-xs text-text-tertiary leading-relaxed flex items-start gap-2">
                            <span className="text-gold mt-0.5">-</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {/* Arrow between stages */}
                    {index < INVESTMENT_STAGES.length - 1 && (
                      <div className="flex justify-center py-2">
                        <svg className="w-5 h-5 text-gold/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: 2x2 Matrix Chart */}
            <div>
              <h3 className="text-lg font-bold text-primary-foreground mb-2 whitespace-nowrap">포항 창업 투자 생태계 매트릭스</h3>
              <p className="text-xs text-text-tertiary mb-6">- 공공·민간, 창업단계로 나누어 2X2 매트릭스로 구성</p>
              
              <div className="relative aspect-square max-w-md mx-auto">
                {/* Y-axis */}
                <div className="absolute left-0 top-0 bottom-0 w-px bg-warm-tan/30" style={{ left: '50%' }} />
                {/* X-axis */}
                <div className="absolute left-0 right-0 h-px bg-warm-tan/30" style={{ top: '50%' }} />
                
                {/* Y-axis labels */}
                <div className="absolute left-0 top-2 text-[10px] text-text-tertiary leading-tight w-[45%] text-center">
                  <span className="text-gold font-medium">공공의 영역</span><br />
                  <span>(주력 산업분야 연관성, 전략적 투자)</span>
                </div>
                <div className="absolute left-0 bottom-2 text-[10px] text-text-tertiary leading-tight w-[45%] text-center">
                  <span className="text-primary-foreground font-medium">민간의 영역</span><br />
                  <span>(이윤 극대화)</span>
                </div>
                
                {/* X-axis labels */}
                <div className="absolute bottom-0 left-[10%] text-[10px] text-text-tertiary whitespace-nowrap">예비창업</div>
                <div className="absolute bottom-0 left-[45%] text-[10px] text-text-tertiary whitespace-nowrap">창업초기</div>
                <div className="absolute bottom-0 right-[10%] text-[10px] text-text-tertiary whitespace-nowrap">창업중기</div>
                
                {/* Bubbles */}
                {/* 포항연합기술지주 - upper left, highlighted */}
                <div className="absolute top-[15%] left-[15%] w-28 h-28 rounded-full border-2 border-dashed border-gold bg-gold/10 flex items-center justify-center p-2">
                  <p className="text-[10px] text-gold font-medium text-center leading-tight">㈜포항연합기술지주</p>
                </div>
                
                {/* POSTECH HOLDINGS - center-bottom */}
                <div className="absolute top-[55%] left-[35%] w-24 h-24 rounded-full border border-warm-tan/30 bg-dark-muted flex items-center justify-center p-2">
                  <p className="text-[10px] text-primary-foreground font-medium text-center leading-tight">POSTECH<br />HOLDINGS</p>
                </div>
                
                {/* POSCO 포스코기술투자 - lower right */}
                <div className="absolute top-[60%] right-[10%] w-24 h-24 rounded-full border border-warm-tan/30 bg-dark-muted flex items-center justify-center p-2">
                  <p className="text-[10px] text-primary-foreground font-medium text-center leading-tight">POSCO<br />포스코기술투자</p>
                </div>
              </div>
            </div>
          </div>
        </BlurFade>

        {/* Value Chain Timeline */}
        <BlurFade delay={0.3}>
          <div className="mt-24">
            <h3 className="text-lg font-bold text-primary-foreground mb-8 whitespace-nowrap">포항 창업 단계별 주요 투자사 역할</h3>
            
            {/* Timeline Bar */}
            <div className="relative mb-8">
              <div className="h-2 bg-gradient-to-r from-gold/80 via-gold/50 to-warm-tan/30 rounded-full" />
              {/* Milestone markers */}
              <div className="absolute top-1/2 -translate-y-1/2 left-[5%] w-3 h-3 bg-gold rounded-full border-2 border-dark" />
              <div className="absolute top-1/2 -translate-y-1/2 left-[35%] w-3 h-3 bg-gold/60 rounded-full border-2 border-dark" />
              <div className="absolute top-1/2 -translate-y-1/2 left-[65%] w-3 h-3 bg-warm-tan/50 rounded-full border-2 border-dark" />
              <div className="absolute top-1/2 -translate-y-1/2 right-[5%] w-3 h-3 bg-warm-tan/30 rounded-full border-2 border-dark" />
              
              {/* Timeline labels */}
              <div className="flex justify-between mt-3 text-[10px] text-text-tertiary">
                <span className="border border-dashed border-gold/50 px-2 py-1 text-gold">발굴 → 육성 → 씨앗투자</span>
                <span>사업화 지원</span>
                <span>초기, VC투자</span>
                <span>회수(IPO, M&A)</span>
              </div>
            </div>
            
            {/* Value Chain Cards */}
            <div className="grid gap-6 md:grid-cols-3">
              {VALUE_CHAIN_CARDS.map((card) => (
                <div 
                  key={card.icon} 
                  className={`p-5 border ${card.highlighted ? 'border-gold/50 border-dashed bg-gold/5' : 'border-warm-tan/20 bg-dark-muted'}`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    {/* Hexagon Icon */}
                    <div className={`w-12 h-12 flex items-center justify-center ${card.highlighted ? 'bg-gold/20' : 'bg-warm-tan/10'}`} style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}>
                      <span className={`text-[10px] font-bold ${card.highlighted ? 'text-gold' : 'text-primary-foreground'} text-center leading-tight`}>
                        {card.icon.slice(0,2)}<br />{card.icon.slice(2)}
                      </span>
                    </div>
                    <p className={`text-sm font-medium ${card.highlighted ? 'text-gold' : 'text-primary-foreground'}`}>{card.label}</p>
                  </div>
                  <ul className="space-y-2">
                    {card.items.map((item, i) => (
                      <li key={i} className="text-xs text-text-tertiary leading-relaxed flex items-start gap-2">
                        <span className="text-gold mt-0.5">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </BlurFade>

        {/* Bottom Summary Bar: Value Chain Complete */}
        <BlurFade delay={0.4}>
          <div className="mt-16">
            {/* Title bar */}
            <div className="flex items-center justify-between bg-gold/10 border border-gold/30 px-6 py-4 mb-4">
              <h4 className="text-lg font-bold text-gold whitespace-nowrap">포항시 창업 Value Chain 완성</h4>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-tertiary">pohang</span>
                <span className="text-sm font-medium text-primary-foreground">포항시</span>
              </div>
            </div>
            
            {/* Gradient Arrow Bar */}
            <div className="relative h-20 bg-gradient-to-r from-gold/30 via-gold/20 to-warm-tan/10 overflow-hidden">
              {/* Arrow shape overlay */}
              <div className="absolute inset-0 flex items-center">
                <div className="flex-1 h-full bg-gradient-to-r from-gold/20 to-transparent" />
                <svg className="w-8 h-full text-gold/30" viewBox="0 0 24 80" fill="currentColor">
                  <polygon points="0,0 24,40 0,80" />
                </svg>
              </div>
              
              {/* Content */}
              <div className="relative z-10 h-full flex">
                {/* Public sector */}
                <div className="flex-1 flex flex-col justify-center px-4 border-r border-gold/20">
                  <p className="text-[10px] text-gold mb-2 whitespace-nowrap">공공의 영역 (지역 전략 발전)</p>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-primary-foreground font-medium whitespace-nowrap">㈜포항연합기술지주</span>
                    <span className="text-xs text-text-tertiary whitespace-nowrap">포항테크노파크</span>
                  </div>
                </div>
                {/* Private sector */}
                <div className="flex-1 flex flex-col justify-center px-4">
                  <p className="text-[10px] text-text-tertiary mb-2 whitespace-nowrap">민간의 영역 (이익증대)</p>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-primary-foreground whitespace-nowrap">POSTECH 기술지주㈜</span>
                    <span className="text-xs text-text-tertiary whitespace-nowrap">POSCO 포스코기술투자</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
