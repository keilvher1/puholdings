import { neon } from "@neondatabase/serverless"

export function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) return null
  return neon(url)
}

// ---------- Fallback static data (used when DATABASE_URL is absent) ----------

export const FALLBACK_STATS = [
  { id: 1, label: "설립연도", value: 2012, suffix: "년", sort_order: 1 },
  { id: 2, label: "포트폴리오 기업", value: 112, suffix: "개+", sort_order: 2 },
  { id: 3, label: "운용 펀드", value: 8, suffix: "개", sort_order: 3 },
  { id: 4, label: "누적 투자금액", value: 1500, suffix: "억+", sort_order: 4 },
  { id: 5, label: "투자 전문인력", value: 15, suffix: "명", sort_order: 5 },
]

export const FALLBACK_PORTFOLIO = [
  { id: 1, name: "에이치엘비생명과학", name_en: "HLB Life Science", category: "바이오/헬스케어", description: "바이오 신약 개발 전문 기업", investment_year: 2018, sort_order: 1, status: "active" },
  { id: 2, name: "퓨처켐", name_en: "FutureChem", category: "바이오/헬스케어", description: "방사성 의약품 개발 기업", investment_year: 2019, sort_order: 2, status: "active" },
  { id: 3, name: "나노브릭", name_en: "NanoBrick", category: "소재/화학", description: "나노소재 기반 디스플레이 기술", investment_year: 2017, sort_order: 3, status: "active" },
  { id: 4, name: "에이아이더뉴트리진", name_en: "AI DeNutrizen", category: "AI/IT", description: "AI 기반 맞춤형 영양 솔루션", investment_year: 2021, sort_order: 4, status: "active" },
  { id: 5, name: "라이트브라더스", name_en: "Light Brothers", category: "에너지/환경", description: "드론 기반 태양광 패널 검사", investment_year: 2020, sort_order: 5, status: "active" },
  { id: 6, name: "씨앤투스성진", name_en: "CN2S SJ", category: "소재/화학", description: "고기능성 필름 소재 개발", investment_year: 2018, sort_order: 6, status: "active" },
  { id: 7, name: "엔서", name_en: "Encer", category: "AI/IT", description: "AI 기반 음성인식 솔루션", investment_year: 2022, sort_order: 7, status: "active" },
  { id: 8, name: "크라우드웍스", name_en: "Crowdworks", category: "AI/IT", description: "AI 데이터 구축 플랫폼", investment_year: 2021, sort_order: 8, status: "active" },
  { id: 9, name: "에이피알", name_en: "APR", category: "바이오/헬스케어", description: "뷰티테크 기반 화장품", investment_year: 2019, sort_order: 9, status: "active" },
  { id: 10, name: "포스텍나노팹", name_en: "POSTECH NanoFab", category: "소재/화학", description: "반도체 나노소재 기술", investment_year: 2017, sort_order: 10, status: "active" },
  { id: 11, name: "이노테라피", name_en: "InnoTherapy", category: "바이오/헬스케어", description: "세포치료제 개발", investment_year: 2020, sort_order: 11, status: "active" },
  { id: 12, name: "메디픽셀", name_en: "MediPixel", category: "AI/IT", description: "AI 기반 의료영상 분석", investment_year: 2022, sort_order: 12, status: "active" },
]

export const FALLBACK_NEWS = [
  { id: 1, title: "포항연합기술지주, 2024년 신규 펀드 300억 규모 결성", summary: "포항연합기술지주가 POSTECH 기술사업화를 위한 신규 펀드를 결성하며 초기 기술기업에 대한 투자를 확대한다.", category: "펀드", published_at: "2024-03-15T00:00:00.000Z" },
  { id: 2, title: "AI 의료영상 분석 스타트업 메디픽셀 시리즈A 투자 주도", summary: "포항연합기술지주가 AI 기반 의료영상 분석 스타트업 메디픽셀의 시리즈A 라운드를 주도하며 50억원 규모의 투자를 진행했다.", category: "투자", published_at: "2024-02-20T00:00:00.000Z" },
  { id: 3, title: "2023년 포트폴리오 기업 3사 코스닥 상장", summary: "포항연합기술지주가 투자한 포트폴리오 기업 중 3개사가 2023년 코스닥 시장에 성공적으로 상장했다.", category: "실적", published_at: "2024-01-10T00:00:00.000Z" },
  { id: 4, title: "POSTECH 기술지주회사 연합 기술사업화 포럼 개최", summary: "POSTECH과 연합 기술지주회사들이 공동으로 기술사업화 촉진을 위한 포럼을 개최하고 산학협력 방안을 논의했다.", category: "행사", published_at: "2023-11-25T00:00:00.000Z" },
  { id: 5, title: "에너지 분야 신규 투자 - 라이트브라더스 후속투자 진행", summary: "드론 기반 태양광 패널 검사 기술을 보유한 라이트브라더스에 대한 후속 투자를 진행하며 에너지 분야 투자를 강화한다.", category: "투자", published_at: "2023-10-05T00:00:00.000Z" },
  { id: 6, title: "포항연합기술지주, 중소벤처기업부 우수 기술지주회사 선정", summary: "중소벤처기업부가 실시한 기술지주회사 평가에서 포항연합기술지주가 우수 기술지주회사로 선정되었다.", category: "수상", published_at: "2023-09-01T00:00:00.000Z" },
]
