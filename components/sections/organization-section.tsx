"use client"

import { BlurFade } from "@/components/magicui/blur-fade"

const MANAGEMENT = [
  {
    name: "심규진",
    position: "부대표",
    role: "투자, 펀드 조성, 경영 관리",
    details: [
      "한동대학교 대학원 AI융합학과 교수 (창업 전공 담당)",
      "공공 펀드 650억 규모 조성 참여, Startup exits 2회",
      "전국 최대 규모 문화기획사 창업, 와디즈 인사 총괄",
    ],
  },
  {
    name: "안석현",
    position: "이사",
    role: "운영 총괄",
    details: [
      "VC 전문인력, 창업보육전문매니저",
      "포항공과대학교 기술지주(주) 액셀러레이팅팀 팀장",
      "2023년 중소벤처기업부 창업보육 장관상 수상",
    ],
  },
]

const STRATEGY = [
  {
    name: "이강원",
    position: "실장",
    role: "사업 기획 총괄",
    details: [
      "VC 전문인력, 창업보육매니저",
      "기술가치평가사, 기술창업지도사",
    ],
  },
]

const INVESTMENT_TEAM = [
  {
    name: "김병규",
    position: "팀장",
    role: "투자 / 외부사업",
    details: [
      "투자자산운용사, 재무위험관리사",
      "웰컴저축은행, 푸드팡(스타트업) CFO",
    ],
  },
  {
    name: "박진기",
    position: "주임",
    role: "투자 / 외부사업",
    details: [
      "창업보육전문매니저, 벤처투자분석사",
      "조슈아파트너스(AC), 아트와(스타트업) CEO STAFF/PO",
    ],
  },
]

const INCUBATION_TEAM = [
  {
    name: "김예준",
    position: "팀장",
    role: "창업 보육 / 교내 사업",
    details: [
      "창업보육전문매니저",
      "한동대학교 직원, 블라썸(스타트업) 대표",
    ],
  },
  {
    name: "허홍석",
    position: "주임",
    role: "창업 보육 / 교내 사업",
    details: [
      "창업보육전문매니저",
    ],
  },
]

function PersonCard({ person, index }: { person: typeof MANAGEMENT[0]; index: number }) {
  return (
    <BlurFade delay={0.05 * index}>
      <div className="flex gap-5 py-5 border-b border-warm-tan/20 last:border-b-0">
        <div className="shrink-0">
          <div className="w-12 h-12 rounded-full bg-warm-tan/10 flex items-center justify-center text-text-tertiary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-base font-semibold text-primary-foreground">{person.name}</span>
            <span className="text-xs text-text-tertiary">{person.position}</span>
          </div>
          <p className="text-sm text-gold mb-2">{person.role}</p>
          <ul className="space-y-0.5">
            {person.details.map((detail, i) => (
              <li key={i} className="text-xs text-text-tertiary leading-relaxed">
                {detail}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </BlurFade>
  )
}

function TeamSection({ title, members, startIndex }: { title: string; members: typeof MANAGEMENT; startIndex: number }) {
  return (
    <div>
      <div className="mb-3">
        <span className="text-[11px] font-medium tracking-widest text-gold border-b border-gold/50 pb-1">
          {title}
        </span>
      </div>
      <div>
        {members.map((person, i) => (
          <PersonCard key={person.name} person={person} index={startIndex + i} />
        ))}
      </div>
    </div>
  )
}

export function OrganizationSection() {
  return (
    <section id="organization" className="relative bg-dark py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        {/* Section Header */}
        <BlurFade delay={0.1}>
          <div className="mb-16">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-8 h-[1px] bg-gold" />
              <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
                ORGANIZATION
              </span>
            </div>
            <h2 className="text-3xl font-bold text-primary-foreground lg:text-4xl">
              조직도
            </h2>
          </div>
        </BlurFade>

        {/* Org Chart Diagram */}
        <BlurFade delay={0.2}>
          <div className="mb-20 overflow-x-auto">
            <div className="min-w-[700px] pb-4">
              {/* CEO */}
              <div className="flex items-center justify-center mb-6">
                <div className="bg-dark-muted border border-warm-tan/20 rounded px-8 py-5 text-center">
                  <p className="text-[10px] tracking-wider text-gold mb-1">대표이사</p>
                  <p className="text-lg font-bold text-primary-foreground mb-0.5">한동대 이권영 교수</p>
                  <p className="text-[11px] text-text-tertiary">한동대학교 산학처장 및 산학협력단장</p>
                </div>
              </div>

              {/* Connector */}
              <div className="flex justify-center mb-6">
                <div className="w-px h-6 bg-warm-tan/30" />
              </div>

              {/* Middle Row */}
              <div className="flex items-center justify-center gap-3 mb-6">
                <div className="bg-dark-muted border border-warm-tan/20 px-5 py-3 text-center">
                  <p className="text-[10px] tracking-wider text-gold mb-0.5">부대표</p>
                  <p className="text-sm font-medium text-primary-foreground whitespace-nowrap">한동대 심규진 교수</p>
                </div>

                <div className="w-4 h-px bg-warm-tan/30" />
              <div className="bg-dark-muted border border-warm-tan/20 px-5 py-2.5 text-center">
                  <p className="text-sm text-primary-foreground">이사</p>
                </div>
                <div className="w-4 h-px bg-warm-tan/30" />
                <div className="bg-gold/10 border border-gold/40 px-5 py-2.5 text-center">
                  <p className="text-sm font-medium text-gold">전략기획실</p>
                </div>
              </div>

              {/* Connector */}
              <div className="flex justify-center mb-6">
                <div className="w-px h-6 bg-warm-tan/30" />
              </div>

              {/* Teams */}
              <div className="flex justify-center gap-4">
                <div className="flex-1 max-w-[220px] bg-dark-muted border border-warm-tan/20 p-4">
                  <p className="text-sm font-medium text-primary-foreground mb-2">투자사업팀</p>
                  <ul className="space-y-1 text-[11px] text-text-tertiary leading-relaxed">
                    <li>외부 신규사업 유치 및 운영</li>
                    <li>기업 발굴 및 투자, 투자조합 결성</li>
                  </ul>
                </div>
                <div className="flex-1 max-w-[220px] bg-dark-muted border border-warm-tan/20 p-4">
                  <p className="text-sm font-medium text-primary-foreground mb-2">창업보육팀</p>
                  <ul className="space-y-1 text-[11px] text-text-tertiary leading-relaxed">
                    <li>창업보육센터 운영 및 관련 사업 유치</li>
                    <li>교내 사업 운영</li>
                  </ul>
                </div>
                <div className="flex-1 max-w-[220px] bg-dark-muted border border-gold/30 p-4">
                  <p className="text-sm font-medium text-gold mb-2">경영관리팀</p>
                  <ul className="space-y-1 text-[11px] text-text-tertiary leading-relaxed">
                    <li>대외 협력 및 사업 관리</li>
                    <li>기타 경영지원 업무</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </BlurFade>

        {/* Personnel Section */}
        <BlurFade delay={0.3}>
          <div className="border-t border-warm-tan/20 pt-14">
            <h3 className="text-xl font-bold text-primary-foreground mb-10">구성원</h3>
            
            <div className="grid lg:grid-cols-2 gap-x-12 gap-y-10">
              {/* Left Column */}
              <div className="space-y-10">
                <TeamSection title="경영진" members={MANAGEMENT} startIndex={0} />
                <TeamSection title="전략기획실" members={STRATEGY} startIndex={2} />
              </div>
              
              {/* Right Column */}
              <div className="space-y-10">
                <TeamSection title="투자사업팀" members={INVESTMENT_TEAM} startIndex={3} />
                <TeamSection title="창업보육팀" members={INCUBATION_TEAM} startIndex={5} />
              </div>
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
