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

const VENTURE_PARTNERS = [
  {
    name: "이원중 (David)",
    position: "벤처파트너",
    role: "F&B 인큐베이팅 / 투자",
    details: [
      "UC San Diego 경제학과 졸업",
      "두더지프로젝트 대표 CEO (F&B 인큐베이팅 전문기업)",
      "창리단길 로컬스페이스 10개소 설립 운영",
      "AI 언어학습 '원아원', 웰니스 '달램' VC 투자",
      "LINC 3.0 산학연계 교육협력기관 (한동대 외 4개교)",
    ],
  },
]

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

const PARTNER_ORGANIZATIONS = [
  {
    name: "경북창조경제혁신센터",
    logo: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-u38ZbQsP95bwhyJFc2JffYWy2xPHky.png",
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

                {/* Middle boxes - 부대표, 이사, 전략기획실 */}
                <div className="flex items-center gap-0 shrink-0">
                  <div className="bg-dark-muted border border-warm-tan/20 w-28 h-28 flex items-center justify-center">
                    <p className="text-base text-primary-foreground text-center">부대표</p>
                  </div>
                  <div className="w-5 h-px bg-warm-tan/30" />
                  <div className="bg-dark-muted border border-warm-tan/20 w-28 h-28 flex items-center justify-center">
                    <p className="text-base text-primary-foreground text-center">이사</p>
                  </div>
                  <div className="w-5 h-px bg-warm-tan/30" />
                  <div className="bg-dark-muted border border-warm-tan/20 w-28 h-28 flex items-center justify-center">
                    <p className="text-base text-primary-foreground text-center">전략기획실</p>
                  </div>
                </div>

                {/* Connector line */}
                <div className="w-10 h-px bg-warm-tan/30 shrink-0" />

                {/* Teams - Vertical stack on right */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-5">
                    <div className="bg-dark-muted border border-warm-tan/20 w-[96px] h-[64px] flex items-center justify-center shrink-0">
                      <p className="text-sm text-primary-foreground text-center leading-tight">투자<br/>사업팀</p>
                    </div>
                    <ul className="text-xs text-text-tertiary leading-relaxed">
                      <li>외부 신규사업 유치 및 운영</li>
                      <li>기업 발굴 및 투자, 투자조합 결성 등</li>
                    </ul>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="bg-dark-muted border border-warm-tan/20 w-[96px] h-[64px] flex items-center justify-center shrink-0">
                      <p className="text-sm text-primary-foreground text-center leading-tight">창업<br/>보육팀</p>
                    </div>
                    <ul className="text-xs text-text-tertiary leading-relaxed">
                      <li>창업보육센터 운영 및 관련 사업 유치</li>
                      <li>교내 사업 운영</li>
                    </ul>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="bg-dark-muted border border-warm-tan/20 w-[96px] h-[64px] flex items-center justify-center shrink-0">
                      <p className="text-sm text-primary-foreground text-center leading-tight">경영<br/>관리팀</p>
                    </div>
                    <ul className="text-xs text-text-tertiary leading-relaxed">
                      <li>대외 협력 및 사업 관리</li>
                      <li>기타 경영지원 업무</li>
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
                  <p className="text-sm font-medium text-primary-foreground text-center">지역 창업유관기관</p>
                </div>
                <div className="px-6 py-4">
                  <p className="text-sm font-medium text-primary-foreground text-center">주요 내용</p>
                </div>
              </div>
              
              {/* Table Rows */}
              {PARTNER_ORGANIZATIONS.map((org, index) => (
                <div 
                  key={org.name} 
                  className={`grid grid-cols-[240px_1fr] ${index !== PARTNER_ORGANIZATIONS.length - 1 ? 'border-b border-warm-tan/20' : ''}`}
                >
                  <div className="px-6 py-5 border-r border-warm-tan/20 flex items-center justify-center bg-white/[0.02]">
                    <img 
                      src={org.logo} 
                      alt={org.name}
                      className="max-w-[180px] max-h-[60px] object-contain"
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

        {/* Excellent Technologies Section */}
        <BlurFade delay={0.4}>
          <div className="mb-20">
            <h3 className="text-xl font-bold text-primary-foreground mb-8">우수기술</h3>
            
            <div className="border border-warm-tan/20 overflow-hidden overflow-x-auto">
              {/* Table Header */}
              <div className="grid grid-cols-[60px_60px_1fr_120px_60px] min-w-[700px] bg-dark-muted border-b border-warm-tan/20">
                <div className="px-3 py-3 border-r border-warm-tan/20">
                  <p className="text-sm font-medium text-primary-foreground text-center">구분</p>
                </div>
                <div className="px-3 py-3 border-r border-warm-tan/20">
                  <p className="text-sm font-medium text-primary-foreground text-center">분류</p>
                </div>
                <div className="px-4 py-3 border-r border-warm-tan/20">
                  <p className="text-sm font-medium text-primary-foreground text-center">기술명</p>
                </div>
                <div className="px-3 py-3 border-r border-warm-tan/20">
                  <p className="text-sm font-medium text-primary-foreground text-center">발명자</p>
                </div>
                <div className="px-3 py-3">
                  <p className="text-sm font-medium text-primary-foreground text-center">TRL</p>
                </div>
              </div>
              
              {/* Table Rows */}
              {EXCELLENT_TECHNOLOGIES.map((tech, index) => (
                <div 
                  key={tech.id} 
                  className={`grid grid-cols-[60px_60px_1fr_120px_60px] min-w-[700px] ${index !== EXCELLENT_TECHNOLOGIES.length - 1 ? 'border-b border-warm-tan/20' : ''}`}
                >
                  <div className="px-3 py-3 border-r border-warm-tan/20 flex items-center justify-center">
                    <p className="text-sm text-text-tertiary">{tech.id}</p>
                  </div>
                  <div className="px-3 py-3 border-r border-warm-tan/20 flex items-center justify-center">
                    <p className="text-sm text-text-tertiary">{tech.category}</p>
                  </div>
                  <div className="px-4 py-3 border-r border-warm-tan/20 flex items-center">
                    <p className="text-sm text-text-tertiary">{tech.name}</p>
                  </div>
                  <div className="px-3 py-3 border-r border-warm-tan/20 flex items-center justify-center">
                    <p className="text-sm text-text-tertiary">{tech.inventor}</p>
                  </div>
                  <div className="px-3 py-3 flex items-center justify-center">
                    <p className="text-sm text-text-tertiary">{tech.trl}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </BlurFade>

        {/* Personnel Section */}
        <BlurFade delay={0.5}>
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
            
            {/* Venture Partners */}
            <div className="mt-10">
              <TeamSection title="벤처파트너" members={VENTURE_PARTNERS} startIndex={7} />
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
