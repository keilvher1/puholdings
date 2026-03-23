"use client"

import { BlurFade } from "@/components/magicui/blur-fade"
import Image from "next/image"

// 타임라인 단계 데이터
const TIMELINE_STAGES = [
  { label: "발굴", highlighted: true },
  { label: "육성", highlighted: true },
  { label: "씨앗투자", highlighted: true },
  { label: "사업화 지원", highlighted: false },
  { label: "초기, VC투자", highlighted: false },
  { label: "회수(IPO, M&A)", highlighted: false },
]

// Value Chain 카드 데이터
const VALUE_CHAIN_CARDS = [
  {
    icon: "발굴\n육성",
    label: "발굴/육성/씨앗투자\n(주력 산업분야)",
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
    icon: "기업\n지원",
    subIcon: "사업화\n지원기관",
    label: "",
    highlighted: false,
    items: [
      "공공기술 이전",
      "사업화 지원 프로그램",
      "지자체·기관 연계 통한 성장지원",
    ],
  },
  {
    icon: "성장\n회수",
    label: "초기투자→\nIPO, M&A",
    highlighted: false,
    items: [
      "후속투자 및 성장 지원",
    ],
  },
]

// 하단 기관 로고 데이터
const VALUE_CHAIN_PARTNERS = [
  { 
    name: "㈜포항연합기술지주", 
    src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-5SMkRAzZQ5MANmKw9kknm38UuBSgc1.png",
    isPublic: true 
  },
  { 
    name: "(재)포항테크노파크", 
    src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/%E1%84%91%E1%85%A9%E1%84%92%E1%85%A1%E1%86%BC%E1%84%90%E1%85%A6%E1%84%8F%E1%85%B3%E1%84%82%E1%85%A9%E1%84%91%E1%85%A1%E1%84%8F%E1%85%B3_%E1%84%85%E1%85%A9%E1%84%80%E1%85%A9-KYY9EfhPyxhtWAW9eEvhxglAhkC65T.png",
    isPublic: true 
  },
  { 
    name: "POSTECH 기술지주㈜", 
    src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image%203%20%281%29-vj8TaaRHbljXhF1leCxLPGIgV5CVNY.png",
    isPublic: false 
  },
  { 
    name: "POSCO 포스코기술투자", 
    src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-fQmiNl8hX6fRS5gtsYenUwm9kVMJMB.png",
    isPublic: false 
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
        </BlurFade>

        {/* 포항 창업 단계별 주요 투자사 역할 */}
        <BlurFade delay={0.2}>
          <div className="mt-16">
            <h3 className="text-lg font-bold text-primary-foreground mb-8">
              포항 창업 단계별 주요 투자사 역할
            </h3>

            {/* 상단 타임라인 화살표 */}
            <div className="relative mb-12">
              {/* 화살표 바 */}
              <div className="relative h-12 flex items-center">
                {/* 그라데이션 화살표 배경 */}
                <div className="absolute inset-y-0 left-0 right-8 bg-gradient-to-r from-warm-tan/40 to-warm-tan/20 rounded-l-full" />
                {/* 화살표 끝 */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[24px] border-t-transparent border-b-[24px] border-b-transparent border-l-[32px] border-l-warm-tan/20" />
                
                {/* 타임라인 마커들 */}
                <div className="relative z-10 flex w-full justify-between px-8">
                  {TIMELINE_STAGES.map((stage, index) => (
                    <div key={stage.label} className="flex flex-col items-center">
                      {/* 원형 마커 */}
                      <div className={`w-6 h-6 rounded-full border-2 ${stage.highlighted ? 'border-gold bg-dark' : 'border-warm-tan/50 bg-dark'}`} />
                      {/* 라벨 */}
                      <span className={`mt-2 text-xs whitespace-nowrap ${stage.highlighted ? 'text-gold font-medium' : 'text-text-tertiary'}`}>
                        {stage.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* 처음 3단계 강조 점선 테두리 */}
              <div className="absolute top-0 left-4 w-[40%] h-12 border-2 border-dashed border-gold/50 rounded-lg -translate-y-1" />
            </div>

            {/* 중앙 블록 다이어그램 */}
            <div className="grid gap-4 md:grid-cols-3 mb-12">
              {VALUE_CHAIN_CARDS.map((card, cardIndex) => (
                <div key={cardIndex} className="relative">
                  {/* 카드 */}
                  <div className={`p-6 h-full ${card.highlighted ? 'bg-gold/10 border-2 border-gold/40' : 'bg-dark-muted border border-warm-tan/20'}`}>
                    {/* 육각형 아이콘 영역 */}
                    <div className="flex items-start gap-4 mb-4">
                      {/* 육각형 */}
                      <div 
                        className={`w-16 h-16 flex-shrink-0 flex items-center justify-center ${card.highlighted ? 'bg-gold/30' : 'bg-warm-tan/20'}`}
                        style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
                      >
                        <span className={`text-[10px] font-bold text-center leading-tight whitespace-pre-line ${card.highlighted ? 'text-gold' : 'text-primary-foreground'}`}>
                          {card.icon}
                        </span>
                      </div>
                      
                      {/* 추가 육각형 (기업지원 카드) */}
                      {card.subIcon && (
                        <div 
                          className="w-16 h-16 flex-shrink-0 flex items-center justify-center bg-warm-tan/10"
                          style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
                        >
                          <span className="text-[10px] font-bold text-center leading-tight whitespace-pre-line text-primary-foreground">
                            {card.subIcon}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* 라벨 */}
                    {card.label && (
                      <p className={`text-sm font-semibold mb-4 whitespace-pre-line ${card.highlighted ? 'text-gold' : 'text-primary-foreground'}`}>
                        {card.label}
                      </p>
                    )}
                    
                    {/* 체크마크 리스트 */}
                    <ul className="space-y-2">
                      {card.items.map((item, i) => (
                        <li key={i} className="text-xs text-text-tertiary leading-relaxed flex items-start gap-2">
                          <span className="text-gold mt-0.5">✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  {/* 연결 화살표 (마지막 카드 제외) */}
                  {cardIndex < VALUE_CHAIN_CARDS.length - 1 && (
                    <div className="hidden md:block absolute top-1/2 -right-2 -translate-y-1/2 z-10">
                      <svg className="w-4 h-4 text-gold/50" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </BlurFade>

        {/* 하단 "포항시 창업 Value Chain 완성" 배너 */}
        <BlurFade delay={0.3}>
          <div className="mt-16">
            {/* 포항시 타이틀 */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-light tracking-wider text-primary-foreground" style={{ fontFamily: 'serif' }}>pohang</span>
                <span className="text-sm text-text-tertiary">포항시</span>
              </div>
              <h4 className="text-xl font-bold text-gold">포항시 창업 Value Chain완성</h4>
            </div>
            
            {/* 4개 기관 로고 */}
            <div className="flex items-center justify-center gap-8 mb-6 py-4">
              {VALUE_CHAIN_PARTNERS.map((partner, index) => (
                <div key={partner.name} className="relative h-12 w-40">
                  <Image
                    src={partner.src}
                    alt={partner.name}
                    fill
                    className="object-contain"
                  />
                </div>
              ))}
            </div>
            
            {/* 그라디언트 화살표 바 */}
            <div className="relative h-16 flex overflow-hidden">
              {/* 공공의 영역 (빨간/골드) */}
              <div className="flex-1 bg-gradient-to-r from-gold/40 to-gold/20 flex items-center px-6 relative">
                <p className="text-sm font-medium text-gold whitespace-nowrap">공공의 영역(지역 전략 발전)</p>
                {/* 화살표 끝 */}
                <div className="absolute right-0 top-0 bottom-0 w-0 h-0 border-t-[32px] border-t-transparent border-b-[32px] border-b-transparent border-l-[24px] border-l-gold/20" />
              </div>
              
              {/* 민간의 영역 (회색) */}
              <div className="flex-1 bg-gradient-to-r from-warm-tan/30 to-warm-tan/10 flex items-center justify-end px-6 relative">
                {/* 화살표 시작 */}
                <div className="absolute left-0 top-0 bottom-0 w-0 h-0 border-t-[32px] border-t-warm-tan/30 border-b-[32px] border-b-warm-tan/30 border-l-[24px] border-l-transparent" />
                <p className="text-sm font-medium text-text-tertiary whitespace-nowrap">민간의 영역(이익증대)</p>
              </div>
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
