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
  { id: 1, name: "아이언박스", name_en: "IRONBOX", category: "AI/로봇", description: "지능형 산업로봇 및 감시솔루션", investment_year: 2019, sort_order: 1, status: "active" },
  { id: 2, name: "에이치디에스바이오", name_en: "HDS Bio", category: "바이오/헬스케어", description: "마이크로바이옴 기반 신약개발", investment_year: 2019, sort_order: 2, status: "active" },
  { id: 3, name: "이롭", name_en: "IROP", category: "AI/IT", description: "AI 기반 화재감시 솔루션", investment_year: 2020, sort_order: 3, status: "active" },
  { id: 4, name: "오픈인", name_en: "OpenIn", category: "AI/IT", description: "ML 기반 지능형 CCTV 솔루션", investment_year: 2020, sort_order: 4, status: "active" },
  { id: 5, name: "에콤환경", name_en: "ECOM", category: "에너지/환경", description: "열회수 환기장치", investment_year: 2020, sort_order: 5, status: "active" },
  { id: 6, name: "다솜엑스", name_en: "Dasom X", category: "AI/IT", description: "AI Agentic workflow 기반 플랫폼 개발 및 운영", investment_year: 2025, sort_order: 6, status: "active" },
]

export const FALLBACK_NEWS = [
  { id: 1, title: "다솜엑스, AI Agentic workflow 플랫폼 신규 투자", summary: "포항연합기술지주가 AI Agentic workflow 기반 플랫폼을 개발하는 다솜엑스에 신규 투자를 진행했다.", category: "투자", published_at: "2025-11-01T00:00:00.000Z" },
  { id: 2, title: "창업보육센터 경영평가 93점 달성, 전국 상위 10%", summary: "2024년 중소벤처기업부 창업보육센터 경영평가에서 93점을 기록하며 전국 239개 센터 중 상위 10%에 진입했다.", category: "수상", published_at: "2024-12-15T00:00:00.000Z" },
  { id: 3, title: "입주기업 투자유치 누적 90억원 돌파", summary: "2025년 3분기 기준 창업보육센터 입주기업들의 누적 투자유치 금액이 90억원을 돌파했다.", category: "실적", published_at: "2024-09-30T00:00:00.000Z" },
  { id: 4, title: "글로컬대학30·RISE 연계 창업생태계 구축 추진", summary: "대학 창업 활성화 및 대학 공동사업 확대를 통한 지산학연 창업생태계 구축을 본격 추진한다.", category: "사업", published_at: "2024-08-20T00:00:00.000Z" },
  { id: 5, title: "투자조합 결성, 교원·학생·동문 기업 투자 확대", summary: "향후 투자조합 결성을 통해 POSTECH 교원, 학생, 동문 기업 중심으로 투자를 확대할 예정이다.", category: "펀드", published_at: "2024-07-15T00:00:00.000Z" },
  { id: 6, title: "포항연합기술지주 자회사 3건 EXIT 완료", summary: "고유계정으로 투자한 자회사 중 3건의 투자 회수를 성공적으로 완료했다.", category: "EXIT", published_at: "2024-06-01T00:00:00.000Z" },
]
