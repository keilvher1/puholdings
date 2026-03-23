"use client"

import { BlurFade } from "@/components/magicui/blur-fade"
import { Building2, Lightbulb, Rocket, Users, TrendingUp, Network } from "lucide-react"
import Image from "next/image"

// 기존 생태계 아이콘 데이터
const ECOSYSTEM_ITEMS = [
  {
    icon: Lightbulb,
    title: "발굴",
    description: "혁신적인 아이디어와 기술을 가진 스타트업 발굴",
  },
  {
    icon: Users,
    title: "육성",
    description: "체계적인 액셀러레이팅 프로그램을 통한 성장 지원",
  },
  {
    icon: TrendingUp,
    title: "투자",
    description: "시드 투자부터 후속 투자까지 단계별 자금 지원",
  },
  {
    icon: Network,
    title: "네트워크",
    description: "대기업, 투자사, 해외 파트너와의 연결",
  },
  {
    icon: Building2,
    title: "인프라",
    description: "창업보육센터 및 공유 오피스 공간 제공",
  },
  {
    icon: Rocket,
    title: "성장",
    description: "IPO, M&A 등 성공적인 Exit 지원",
  },
]

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
    label: "사업화 지원\n(기업 지원기관)",
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

// 액셀러레이팅 사업 운영 현황 데이터
const ACCELERATING_PROGRAMS = [
  { id: 1, name: "기업밀착 보육 및 사업화 지원 프로그램", client: "한동대학교(RISE)", content: "지역 창업기업 발굴 및 사업화 지원", period: "'25.12. ~ '26.02." },
  { id: 2, name: "AI 연계 임팩트 비즈니스(그린, 소셜벤처) 발굴·유치 프로그램", client: "한동대학교(글로컬)", content: "지역 창업기업 발굴 및 사업화 지원", period: "'25.10. ~ '25.12." },
  { id: 3, name: "청년크리에이터 양성 문제해결 성장 지원 프로그램", client: "경북문화재단", content: "지역 로컬크리에이터 발굴 및 육성", period: "'25.07. ~ '25.11." },
  { id: 4, name: "2025 특화역량 창업보육센터 지원사업", client: "중소벤처기업부", content: "지역 창업기업 발굴 및 사업화 지원", period: "'25.04. ~ '25.12." },
  { id: 5, name: "지역기업 글로벌 진출 지원사업", client: "한동대학교(글로컬)", content: "지역 창업기업 글로벌 진출 지원", period: "'25.02. ~ '25.04." },
  { id: 6, name: "창업 및 스타트업 이전 활성화 지원사업", client: "영덕군", content: "지역 예비창업자 발굴 및 육성", period: "'24.07. ~ '26.02." },
  { id: 7, name: "2024 아이디어 사업화 지원사업", client: "문화체육관광부", content: "지역 예비창업자 발굴 및 육성", period: "'24.04. ~ '24.11." },
  { id: 8, name: "2024 콘텐츠기업 투자유치 지원사업", client: "경북문화재단", content: "지역 콘텐츠기업 투자 역량 강화", period: "'24.04. ~ '24.09." },
  { id: 9, name: "2024 창업보육센터 보육역량강화사업", client: "중소벤처기업부", content: "창업보육센터 역량 강화", period: "'24.04. ~ '24.12." },
  { id: 10, name: "2024 창업보육센터 운영지원사업", client: "포항시", content: "지역 창업기업 사업화 지원", period: "'24.01. ~ '24.12." },
  { id: 11, name: "2023 지역기술 창업육성 지원사업", client: "중소벤처기업부", content: "지역 창업기업 발굴 및 사업화 지원", period: "'23.04. ~ '23.12." },
  { id: 12, name: "2023 창업보육센터 운영지원사업", client: "포항시", content: "지역 창업기업 사업화 지원", period: "'23.01. ~ '23.12." },
]

// 하단 기관 로고 데이터
const VALUE_CHAIN_PARTNERS = [
  { 
    name: "㈜포항연합기술지주", 
    src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-9Oe9fZGsMZf8zKbK5Ir5yJB6UySdZb.png",
    isPublic: true 
  },
  { 
    name: "(재)포항테크노파크", 
    src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/%E1%84%91%E1%85%A9%E1%84%92%E1%85%A1%E1%86%BC%E1%84%90%E1%85%A6%E1%84%8F%E1%85%B3%E1%84%82%E1%85%A9%E1%84%91%E1%85%A1%E1%84%8F%E1%85%B3_%E1%84%85%E1%85%A9%E1%84%80%E1%85%A9-KYY9EfhPyxhtWAW9eEvhxglAhkC65T.png",
    isPublic: true 
  },
  { 
    name: "POSTECH Holdings", 
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
          <p className="mt-4 max-w-2xl text-base text-text-tertiary leading-relaxed">
            포항연합기술지주는 지역 창업 생태계의 중심에서 스타트업의 성장을 위한 
            종합적인 지원 체계를 구축하고 있습니다.
          </p>
        </BlurFade>

        {/* 기존 생태계 아이콘 그리드 */}
        <BlurFade delay={0.2}>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ECOSYSTEM_ITEMS.map((item, index) => (
              <div
                key={item.title}
                className="group relative border border-warm-tan/20 bg-dark-muted p-8 transition-all duration-300 hover:border-gold/40 hover:bg-gold/5"
              >
                <item.icon className="h-10 w-10 text-gold mb-4" strokeWidth={1.5} />
                <h3 className="text-lg font-semibold text-primary-foreground mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-text-tertiary leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </BlurFade>

        {/* 구분선 */}
        <div className="my-20 border-t border-warm-tan/20" />

        {/* 주요 역할 - 2컬럼 레이아웃 */}
        <BlurFade delay={0.25}>
          <div className="mb-8">
            <h3 className="text-xl font-bold text-primary-foreground mb-10">주요 역할</h3>
            
            <div className="grid gap-12 lg:grid-cols-2">
              {/* 왼쪽: 포항 창업 단계별 주요 투자��� 역할 */}
              <div>
                <h4 className="text-base font-semibold text-primary-foreground mb-6 flex items-center gap-2">
                  <span className="w-4 h-4 border border-warm-tan/50" />
                  포항 창업 단계별 주요 투자사 역할
                </h4>
                
                <div className="space-y-0">
                  {/* 예비창업 */}
                  <div className="relative">
                    <div className="border-2 border-dashed border-gold/50 p-5">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="bg-gold/20 px-4 py-2">
                          <span className="text-sm font-bold text-gold">예비창업</span>
                        </div>
                        <div className="relative h-10 w-36">
                          <Image
                            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-9Oe9fZGsMZf8zKbK5Ir5yJB6UySdZb.png"
                            alt="포항연합기술지주"
                            fill
                            className="object-contain"
                          />
                        </div>
                      </div>
                      <ul className="text-xs text-text-tertiary space-y-1">
                        <li>- 포항시 대학 창업경진대회 개최, 전략산업 분야 기업 배치 프로그램 운영, 창업 관련 행사 개최 등</li>
                        <li>- 전략산업 분야 발굴, 씨앗투자(~1억원) 육성 등</li>
                      </ul>
                    </div>
                    {/* 화살표 */}
                    <div className="flex justify-center py-2">
                      <svg className="w-6 h-6 text-gold/50" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                      </svg>
                    </div>
                  </div>
                  
                  {/* 창업초기 */}
                  <div className="relative">
                    <div className="border border-warm-tan/30 p-5 bg-dark-muted">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="bg-warm-tan/20 px-4 py-2">
                          <span className="text-sm font-bold text-primary-foreground">창업초기</span>
                        </div>
                        <div className="relative h-10 w-36">
                          <Image
                            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image%203%20%281%29-vj8TaaRHbljXhF1leCxLPGIgV5CVNY.png"
                            alt="POSTECH Holdings"
                            fill
                            className="object-contain"
                          />
                        </div>
                      </div>
                      <ul className="text-xs text-text-tertiary space-y-1">
                        <li>- 포스코 IMP(Idea Market Place) 개최 (전국단위)</li>
                        <li>- 포스텍 중심 집중투자, 포스코 유관 집중투자</li>
                        <li>- 기술사업화를 위한 초기투자(2~10억원), TIPS 등</li>
                      </ul>
                    </div>
                    {/* 화살표 */}
                    <div className="flex justify-center py-2">
                      <svg className="w-6 h-6 text-warm-tan/50" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                      </svg>
                    </div>
                  </div>
                  
                  {/* 창업중기 */}
                  <div className="relative">
                    <div className="border border-warm-tan/30 p-5 bg-dark-muted">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="bg-warm-tan/20 px-4 py-2">
                          <span className="text-sm font-bold text-primary-foreground">창업중기</span>
                        </div>
                        <div className="relative h-10 w-36">
                          <Image
                            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-fQmiNl8hX6fRS5gtsYenUwm9kVMJMB.png"
                            alt="POSCO 포스코기술투자"
                            fill
                            className="object-contain"
                          />
                        </div>
                      </div>
                      <ul className="text-xs text-text-tertiary space-y-1">
                        <li>- 포스코 유관 집중 투자</li>
                        <li>- 대규모 시설투자를 위한 후속투자(~30억원) 등</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* 오른쪽: 포항 창업 투자 생태계 매트릭스 */}
              <div>
                <h4 className="text-base font-semibold text-primary-foreground mb-2 flex items-center gap-2">
                  <span className="w-4 h-4 border border-warm-tan/50" />
                  포항 창업 투자 생태계 매트릭스
                </h4>
                <p className="text-xs text-text-tertiary mb-8">- 공공·민간, 창업단계로 나누어 2X2 매트릭스로 구성</p>
                
                {/* 2x2 매트릭스 */}
                <div className="relative">
                  {/* Y축 상단 레이블 */}
                  <div className="text-[10px] text-text-tertiary mb-4 text-center">
                    공공의 영역 (주력 산업분야 연관성, 전략적 투자)
                  </div>
                  
                  {/* 매트릭스 본문 */}
                  <div className="flex">
                    {/* 좌표계 영역 */}
                    <div className="flex-1 relative border-l-2 border-b-2 border-warm-tan/30" style={{ height: '320px' }}>
                      
                      {/* 포항연합기술지주 - 좌상단 (공공 + 예비창업) */}
                      <div className="absolute top-6 left-6 w-36 h-36 rounded-full border-2 border-dashed border-gold/50 flex items-center justify-center bg-gold/5">
                        <div className="relative h-12 w-32">
                          <Image
                            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-9Oe9fZGsMZf8zKbK5Ir5yJB6UySdZb.png"
                            alt="포항연합기술지주"
                            fill
                            className="object-contain"
                          />
                        </div>
                      </div>
                      
                      {/* POSTECH Holdings - 중앙 하단 (민간 + 창업초기) */}
                      <div className="absolute bottom-12 left-1/2 -translate-x-1/4 w-32 h-32 rounded-full bg-gradient-to-br from-[#8B1E3F]/30 to-[#8B1E3F]/10 flex items-center justify-center">
                        <div className="relative h-10 w-28">
                          <Image
                            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image%203%20%281%29-vj8TaaRHbljXhF1leCxLPGIgV5CVNY.png"
                            alt="POSTECH Holdings"
                            fill
                            className="object-contain"
                          />
                        </div>
                      </div>
                      
                      {/* POSCO 포스코기술투자 - 우하단 (민간 + 창업중기) */}
                      <div className="absolute bottom-4 right-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#00529C]/30 to-[#00529C]/10 flex items-center justify-center">
                        <div className="relative h-10 w-28">
                          <Image
                            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-fQmiNl8hX6fRS5gtsYenUwm9kVMJMB.png"
                            alt="POSCO 포스코기술투자"
                            fill
                            className="object-contain"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* X축 레이블 */}
                  <div className="flex justify-around mt-3 ml-4 text-[11px] text-text-tertiary">
                    <span className="text-center">예비창업</span>
                    <span className="text-center">창업초기</span>
                    <span className="text-center">창업중기</span>
                  </div>
                  
                  {/* Y축 하단 레이블 */}
                  <div className="text-[10px] text-text-tertiary mt-6 text-center">
                    민간의 영역 (이윤 극대화)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </BlurFade>

        {/* 구분선 */}
        <div className="my-16 border-t border-warm-tan/20" />

        {/* 포항 창업 단계별 주요 투자사 역할 */}
        <BlurFade delay={0.3}>
          <div>
            <h3 className="text-lg font-bold text-primary-foreground mb-8">
              포항 창업 단계별 주요 투자사 역할
            </h3>

            {/* 상단 타임라인 화살표 */}
            <div className="relative mb-16">
              {/* 화살표 전체 컨테이너 */}
              <div className="relative flex items-center h-20">
                {/* 화살표 몸통 (그라데이션 배경) */}
                <div className="absolute inset-y-0 left-0 right-6 bg-gradient-to-r from-warm-tan/50 via-warm-tan/30 to-warm-tan/20" />
                {/* 화살표 끝 삼각형 */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[40px] border-t-transparent border-b-[40px] border-b-transparent border-l-[24px] border-l-warm-tan/20" />
                
                {/* 처음 3단계 강조 점선 테두리 (화살표 내부) */}
                <div className="absolute top-2 bottom-2 left-2 w-[42%] border-2 border-dashed border-gold/60 rounded-lg z-10" />
                
                {/* 타임라인 마커들 (화살표 내부) */}
                <div className="relative z-20 flex w-full items-center justify-between px-6">
                  {TIMELINE_STAGES.map((stage) => (
                    <div key={stage.label} className="flex flex-col items-center">
                      {/* 원형 마커 */}
                      <div className={`w-5 h-5 rounded-full border-2 ${stage.highlighted ? 'border-gold bg-dark' : 'border-warm-tan/60 bg-dark'}`} />
                      {/* 라벨 */}
                      <span className={`mt-1 text-[11px] whitespace-nowrap ${stage.highlighted ? 'text-gold font-semibold' : 'text-text-tertiary'}`}>
                        {stage.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
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
        <BlurFade delay={0.4}>
          <div className="mt-16">
            {/* 포항시 타이틀 */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="relative h-10 w-32 flex-shrink-0">
                <Image
                  src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/pohang-logo-9Wq3ZKpX2nVwYmT5rLkJdFhGcEuBsA.png"
                  alt="포항시"
                  fill
                  className="object-contain"
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement
                    target.style.display = 'none'
                    const span = document.createElement('span')
                    span.className = 'text-2xl font-light tracking-wider text-primary-foreground'
                    span.style.fontFamily = 'serif'
                    span.textContent = 'pohang'
                    target.parentElement?.appendChild(span)
                  }}
                />
              </div>
              <h4 className="text-xl font-bold text-gold">포항시 창업 Value Chain완성</h4>
            </div>
            
            {/* 4개 기관 로고 */}
            <div className="flex items-center justify-center gap-8 mb-6 py-4">
              {VALUE_CHAIN_PARTNERS.map((partner) => (
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
              {/* 공공의 영역 (골드) */}
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

        {/* 구분선 */}
        <div className="my-20 border-t border-warm-tan/20" />

        {/* 액셀러레이팅 사업 운영 현황 */}
        <BlurFade delay={0.5}>
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-gold">◆</span>
              <h3 className="text-xl font-bold text-gold">액셀러레이팅 사업 운영 현황</h3>
            </div>
            
            <div className="mb-8 text-sm text-text-tertiary space-y-1">
              <p>• 한동대학교 글로컬, RISE, 창업보육센터 지원사업을 중심으로 포항 지역 창업기업 발굴 및 육성</p>
              <p>• 그 외 정부부처 및 지자체, 창업 유관기관 등으로부터 다양한 창업지원사업 수주를 통해 경북 지역 창업기업 발굴 및 육성</p>
            </div>

            {/* 테이블 */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#4A6FA5] text-white">
                    <th className="px-4 py-3 text-center text-xs font-semibold border border-[#3A5A8A] w-16">순번</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold border border-[#3A5A8A]">사업명</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold border border-[#3A5A8A] w-32">발주처</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold border border-[#3A5A8A]">사업 내용</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold border border-[#3A5A8A] w-32">사업 기간</th>
                  </tr>
                </thead>
                <tbody>
                  {ACCELERATING_PROGRAMS.map((program, index) => (
                    <tr 
                      key={program.id} 
                      className={`${index % 2 === 0 ? 'bg-dark-muted' : 'bg-dark'} hover:bg-gold/5 transition-colors`}
                    >
                      <td className="px-4 py-3 text-center text-xs text-text-tertiary border border-warm-tan/20">{program.id}</td>
                      <td className="px-4 py-3 text-xs text-primary-foreground border border-warm-tan/20">{program.name}</td>
                      <td className="px-4 py-3 text-center text-xs text-text-tertiary border border-warm-tan/20">{program.client}</td>
                      <td className="px-4 py-3 text-xs text-text-tertiary border border-warm-tan/20">{program.content}</td>
                      <td className="px-4 py-3 text-center text-xs text-text-tertiary border border-warm-tan/20">{program.period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
