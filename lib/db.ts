import { neon } from "@neondatabase/serverless"

export function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) return null
  return neon(url)
}

// ---------- Fallback static data (used when DATABASE_URL is absent) ----------

export const FALLBACK_STATS = [
  { id: 1, label: "입주 기업", value: 26, suffix: "개사", sort_order: 1 },
  { id: 2, label: "누적 매출액", value: 141, suffix: "억원", sort_order: 2 },
  { id: 3, label: "고용 인원", value: 188, suffix: "명", sort_order: 3 },
  { id: 4, label: "투자 유치", value: 90, suffix: "억원", sort_order: 4 },
  { id: 5, label: "지식재산권/인증", value: 22, suffix: "건", sort_order: 5 },
]

export const FALLBACK_PORTFOLIO = [
  { 
    id: 1, 
    name: "아이언박스", 
    name_en: "IRONBOX", 
    category: "바이오/헬스케어", 
    description: "바이오헬스케어(당뇨 진단 기술), 메타버스 플랫폼 서비스 및 기술공급", 
    investment_year: 2019, 
    sort_order: 1, 
    status: "active",
    ceo: "오상택",
    founded: null,
    achievements: "벤처기업인증, 한국기업데이터 기술평가 우수기업 인증(T4) 획득",
    website: null,
    exited: false,
    slug: "ironbox"
  },
  { 
    id: 2, 
    name: "(주)에이치디에스바이오", 
    name_en: "HDS Bio", 
    category: "바이오/헬스케어", 
    description: "프로바이오틱스, 의약외품, 임상실험수탁사업(CRO), 미생물 스크리닝 약리평가(항생제, 내성유전자)", 
    investment_year: 2018, 
    sort_order: 2, 
    status: "active",
    ceo: "곽진환",
    founded: "2018.09.01",
    achievements: "벤처기업인증, U-TECH밸리 선정 등",
    website: null,
    exited: true,
    slug: "hds-bio"
  },
  { 
    id: 3, 
    name: "(주)이롭로보틱스", 
    name_en: "IROP Robotics", 
    category: "AI/로봇", 
    description: "인공지능 화재감시 초기진압 솔루션", 
    investment_year: 2020, 
    sort_order: 3, 
    status: "active",
    ceo: "이성진",
    founded: "2020.12.24",
    achievements: "벤처기업인증, 서울혁신챌린지 선정, 경북창조경제혁신센터 G-star Dreamer 기업 선정",
    website: "www.irop.co.kr",
    exited: true,
    slug: "irop-robotics"
  },
  { 
    id: 4, 
    name: "(주)오픈인", 
    name_en: "OpenIn", 
    category: "AI/로봇", 
    description: "산업 현장의 자동화를 위한 스마트 팩토리 솔루션", 
    investment_year: 2020, 
    sort_order: 4, 
    status: "active",
    ceo: "박정호",
    founded: "2020.11.25",
    achievements: "포스코(POSCO)와 협동 로봇 솔루션 공동 R&D 협약 체결",
    website: "www.openin.co.kr",
    exited: true,
    slug: "openin"
  },
  { 
    id: 5, 
    name: "에콤환경", 
    name_en: "ECOM Environment", 
    category: "에너지/환경", 
    description: "열회수환기장치, 공기조화장치", 
    investment_year: 2020, 
    sort_order: 5, 
    status: "active",
    ceo: "고대권",
    founded: "2020.11.27",
    achievements: "벤처기업인증, 혁신기업인증",
    website: null,
    exited: false,
    slug: "ecom"
  },
  { 
    id: 6, 
    name: "다솜엑스", 
    name_en: "Dasom X", 
    category: "AI/IT", 
    description: "기업 맞춤형 AI 챗봇 및 에이전틱 워크플로우(Agentic Workflow) 개발", 
    investment_year: 2024, 
    sort_order: 6, 
    status: "active",
    ceo: "최명진",
    founded: "2024.09.02",
    achievements: "기업부설연구소설립, 포항시 외국인 정착 지원 에이전트 '퐝이' 개발",
    website: null,
    exited: false,
    slug: "dasom-x"
  },
]

export const FALLBACK_NEWS = [
  { id: 1, title: "다솜엑스, AI Agentic workflow 플랫폼 신규 투자", summary: "포항연합기술지주가 AI Agentic workflow 기반 플랫폼을 개발하는 다솜엑스에 신규 투자를 진행했다.", category: "투자", published_at: "2025-11-01T00:00:00.000Z" },
  { id: 2, title: "창업보육센터 경영평가 93점 달성, 전국 상위 10%", summary: "2024년 중소벤처기업부 창업보육센터 경영평가에서 93점을 기록하며 전국 239개 센터 중 상위 10%에 진입했다.", category: "수상", published_at: "2024-12-15T00:00:00.000Z" },
  { id: 3, title: "입주기업 투자유치 누적 90억원 돌파", summary: "2025년 3분기 기준 창업보육센터 입주기업들의 누적 투자유치 금액이 90억원을 돌파했다.", category: "실적", published_at: "2024-09-30T00:00:00.000Z" },
  { id: 4, title: "글로컬대학30·RISE 연계 창업생태계 구축 추진", summary: "대학 창업 활성화 및 대학 공동사업 확대를 통한 지산학연 창업생태계 구축을 본격 추진한다.", category: "사업", published_at: "2024-08-20T00:00:00.000Z" },
  { id: 5, title: "투자조합 결성, 교원·학생·동문 기업 투자 확대", summary: "향후 투자조합 결성을 통해 POSTECH 교원, 학생, 동문 기업 중심으로 투자를 확대할 예정이다.", category: "펀드", published_at: "2024-07-15T00:00:00.000Z" },
  { id: 6, title: "포항연합기술지주 자회사 3건 EXIT 완료", summary: "고유계정으로 투자한 자회사 중 3건의 투자 회수를 성공적으로 완료했다.", category: "EXIT", published_at: "2024-06-01T00:00:00.000Z" },
]
