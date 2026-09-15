"use client"

import { BlurFade } from "@/components/magicui/blur-fade"

// DB(content_items.org_member)가 비었거나 조회에 실패했을 때만 쓰는 기본값 — 관리자 화면의 현재 구성원과 맞춰 둔다.
const MANAGEMENT: Member[] = [
  {
    name: "이권영",
    position: "대표이사",
    role: "사업총괄",
    details: [
      "현) 한동대학교 기계공학 교수",
      "현) 한동대학교 산학협력단장",
      "前) 삼성엔지니어링, 한국원자력연구원 등",
    ],
  },
  {
    name: "심규진",
    position: "부대표",
    role: "투자, 펀드 조성, 경영 관리",
    details: [
      "현) 한동대학교 창의융합교육원 조교수 및 글로컬사업단 지역혁신추진실장",
      "전) 포스코인재창조원 책임컨설턴트, 와디즈 인사팀장 역임",
    ],
  },
]

const STRATEGY: Member[] = []

const INVESTMENT_TEAM: Member[] = [
  {
    name: "배중구",
    position: "실장",
    role: "투자 실무 총괄",
    details: [
      "현) 포항연합기술지주 실장·심사역",
      "- 스타트업 투자·육성 경력 10년, 6개사 투자 집행 참여",
    ],
  },
]

const INCUBATION_TEAM: Member[] = [
  {
    name: "오재준",
    position: "파트장",
    role: "실무 지원",
    details: [
      "현) 포항연합기술지주 파트장",
      "- 주요 역량: 대학·재정지원사업 행정, 프로그램 운영 지원, 국제행사 등",
    ],
  },
]

const VENTURE_PARTNERS: Member[] = []

const PARTNER_ORGANIZATIONS = [
  {
    name: "경북창조경제혁신센터",
    logo: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/%E1%84%80%E1%85%A7%E1%86%BC%E1%84%87%E1%85%AE%E1%86%A8%E1%84%8E%E1%85%A1%E1%86%BC%E1%84%8C%E1%85%A9%E1%84%80%E1%85%A7%E1%86%BC%E1%84%8C%E1%85%A6%E1%84%92%E1%85%A7%E1%86%A8%E1%84%89%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A6%E1%86%AB%E1%84%90%E1%85%A5-%E1%84%85%E1%85%A9%E1%84%80%E1%85%A9-removebg-preview-c5UlGcMZeVUCalaI4H7FdA9gyONTdB.png",
    description: "경북 지역의 혁신창업 어브로서 창업기업 발굴부터 육성, 성장까지 지원하고 있으며, 특히 다양한 엑셀러레이팅 프로그램을 운영 중으로 본 사업 참여기업 공동 발굴 및 후속 연계 지원 등이 가능함.",
  },
  {
    name: "(재)포항테크노파크",
    logo: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-6qEQAHXMCjqamXrFWMZQsB3cucVt8U.png",
    description: "지역의 유망기업을 발굴·육성하는 지역산업 거점기관으로 창업보육, 연구개발, 시험생산 등 기업지원 서비스와 지역 맞춤형 산업 발전 전략 및 정책을 수립하며 기술집약 기업의 창업과 성장을 지원하고 있음.",
  },
  {
    name: "경북콘텐츠기업지원센터",
    logo: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-wSZUHEhnkFolquwX83rMiWaBwBH2dA.png",
    description: "경상북도 콘텐츠기업지원센터는 지역 ICT 융복합 콘텐츠를 기반으로 지원 생태계 허브 구축을 통해 지역 경제 혁신 성장 및 콘텐츠 기업 진흥을 위한 원스톱 지원센터로, 참여기업 공동 발굴 및 후속 연계 지원 등이 가능함.",
  },
  {
    name: "KOSME 청년창업사관학교",
    logo: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-Vs2uo5OdOCBWUzd6dcjmrteiRAVTJ7.png",
    description: "경북청년창업사관학교는 유망 창업아이템 및 혁신기술을 보유한 우수 창업자를 발굴하여 성공적인 창업사업화 지원을 위한 프로그램 운영하고 있으며, 참여기업 공동 발굴 등 다방면에서 협력이 가능할 것으로 예상함.",
  },
  {
    name: "(주)대경지역대학공동기술지주",
    logo: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-XgwGBVPdempHBZXSbs30XEeOXrtH2U.png",
    description: "대구·경북 소재 11개 대학과 대구TP 및 경북TP가 공동 출자로 설립한 기술사업화 및 스타트업 투자전문기관으로, 본 사업의 참여기업에 대한 투자 및 TIPS 추천 등이 가능한 협력 투자사임.",
  },
  {
    name: "Y&ARCHER",
    logo: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-w2ArVNJW80Zrb0KGE5dDPNgIPzfMYu.png",
    description: "콘텐츠·콘텐츠융합·스포츠·스포츠융합 분야 등의 초기스타트업을 대상으로 하는 전문 액셀러레이터로 유망한 초기스타트업을 발굴 및 육성하고 발굴된 기업에 체계적인 밀착 지원과 글로벌 진출 및 연계를 지원하고자 있음.",
  },
]

function PersonCard({ person, index }: { person: Member; index: number }) {
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

function TeamSection({ title, members, startIndex }: { title: string; members: Member[]; startIndex: number }) {
  // 구성원이 없는 팀은 제목만 덩그러니 남지 않도록 통째로 숨긴다.
  if (members.length === 0) return null
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

type Member = { name: string; position: string; role: string; details: string[] }
type PartnerOrg = { name: string; logo: string; description: string }
export type OrgTeams = {
  management: Member[]
  strategy: Member[]
  investment: Member[]
  incubation: Member[]
  venture: Member[]
}

export function OrganizationSection({
  teams,
  partnerOrgs,
}: {
  teams?: OrgTeams
  partnerOrgs?: PartnerOrg[]
}) {
  const t: OrgTeams = teams ?? {
    management: MANAGEMENT,
    strategy: STRATEGY,
    investment: INVESTMENT_TEAM,
    incubation: INCUBATION_TEAM,
    venture: VENTURE_PARTNERS,
  }
  const orgs = partnerOrgs && partnerOrgs.length > 0 ? partnerOrgs : PARTNER_ORGANIZATIONS
  return (
    <section id="organization" className="relative bg-dark py-28 lg:py-40">
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

        {/* Org Chart Diagram - Horizontal Layout */}
        <BlurFade delay={0.2}>
          <div className="mb-20 overflow-x-auto">
            <div className="min-w-[1000px] pb-4 flex justify-center">
              <div className="flex items-center gap-0">
                {/* CEO - Circle */}
                <div className="shrink-0 w-44 h-44 rounded-full bg-dark-muted border border-warm-tan/20 flex flex-col items-center justify-center text-center p-5">
                  <p className="text-xs tracking-wider text-gold mb-1">대표이사</p>
                  <p className="text-base font-bold text-primary-foreground leading-tight whitespace-nowrap">한동대 이권영 교수</p>
                  <p className="text-[10px] text-text-tertiary mt-1.5 leading-tight">한동대학교 산학처장<br/>및 산학협력단장</p>
                </div>

                {/* Connector line */}
                <div className="w-10 h-px bg-warm-tan/30 shrink-0" />

                {/* Middle boxes - 부대표, 실장, 파트장 */}
                <div className="flex items-center gap-0 shrink-0">
                  <div className="bg-dark-muted border border-warm-tan/20 w-28 h-28 flex items-center justify-center">
                    <p className="text-base text-primary-foreground text-center">부대표</p>
                  </div>
                  <div className="w-5 h-px bg-warm-tan/30" />
                  <div className="bg-dark-muted border border-warm-tan/20 w-28 h-28 flex items-center justify-center">
                    <p className="text-base text-primary-foreground text-center">실장</p>
                  </div>
                  <div className="w-5 h-px bg-warm-tan/30" />
                  <div className="bg-dark-muted border border-warm-tan/20 w-28 h-28 flex items-center justify-center">
                    <p className="text-base text-primary-foreground text-center">파트장</p>
                  </div>
                </div>

                {/* Connector line */}
                <div className="w-10 h-px bg-warm-tan/30 shrink-0" />

                {/* Teams - Vertical stack on right */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-5">
                    <div className="bg-dark-muted border border-warm-tan/20 w-[96px] h-[64px] flex items-center justify-center shrink-0">
                      <p className="text-sm text-primary-foreground text-center leading-tight whitespace-nowrap">투자사업팀</p>
                    </div>
                    <ul className="text-xs text-text-tertiary leading-relaxed whitespace-nowrap">
                      <li>외부 신규사업 유치 및 운영</li>
                      <li>기업 발굴 및 투자, 투자조합 결성 등</li>
                    </ul>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="bg-dark-muted border border-warm-tan/20 w-[96px] h-[64px] flex items-center justify-center shrink-0">
                      <p className="text-sm text-primary-foreground text-center leading-tight whitespace-nowrap">창업보육팀</p>
                    </div>
                    <ul className="text-xs text-text-tertiary leading-relaxed whitespace-nowrap">
                      <li>창업보육센터 운영 및 관련 사업 유치</li>
                      <li>교내 사업 운영</li>
                    </ul>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </BlurFade>

        {/* Partner Organizations Section */}
        <BlurFade delay={0.3}>
          <div className="mb-20">
            <h3 className="text-xl font-bold text-primary-foreground mb-8">지자체 협력 업체 (유관기관)</h3>
            
            <div className="border border-warm-tan/20 overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[240px_1fr] bg-dark-muted border-b border-warm-tan/20">
                <div className="px-6 py-4 border-r border-warm-tan/20">
                  <p className="text-sm font-medium text-primary-foreground text-center whitespace-nowrap">지역 창업유관기관</p>
                </div>
                <div className="px-6 py-4">
                  <p className="text-sm font-medium text-primary-foreground text-center">주요 내용</p>
                </div>
              </div>
              
              {/* Table Rows */}
              {orgs.map((org, index) => (
                <div
                  key={org.name}
                  className={`grid grid-cols-[240px_1fr] ${index !== orgs.length - 1 ? 'border-b border-warm-tan/20' : ''}`}
                >
                  <div className="flex items-center justify-center border-r border-warm-tan/20 bg-white px-6 py-5">
                    <img
                      src={org.logo}
                      alt={org.name}
                      className="max-h-[60px] max-w-[180px] object-contain"
                    />
                  </div>
                  <div className="px-6 py-5 flex items-center">
                    <p className="text-sm text-text-tertiary leading-relaxed">{org.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </BlurFade>

        {/* Personnel Section */}
        <BlurFade delay={0.4}>
          <div className="border-t border-warm-tan/20 pt-14">
            <h3 className="text-xl font-bold text-primary-foreground mb-10">구성원</h3>
            
            <div className="grid lg:grid-cols-2 gap-x-12 gap-y-10">
              {/* Left Column */}
              <div className="space-y-10">
                <TeamSection title="경영진" members={t.management} startIndex={0} />
                <TeamSection title="전략기획실" members={t.strategy} startIndex={2} />
              </div>

              {/* Right Column */}
              <div className="space-y-10">
                <TeamSection title="투자사업팀" members={t.investment} startIndex={3} />
                <TeamSection title="창업보육팀" members={t.incubation} startIndex={5} />
              </div>
            </div>

            {/* Venture Partners */}
            {t.venture.length > 0 && (
              <div className="mt-10">
                <TeamSection title="벤처파트너" members={t.venture} startIndex={7} />
              </div>
            )}
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
