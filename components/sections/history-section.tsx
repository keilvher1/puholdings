"use client"

import { BlurFade } from "@/components/magicui/blur-fade"

const HISTORY_DATA = [
  { year: 2026, items: [
    { date: "2026. 03", text: "중소벤처기업부, 모두의 창업 주관기관 선정" },
    { date: "2026. 03", text: "중소벤처기업부, '특화역량 BI(산학협력형)지원사업' 주관기관 선정" },
  ]},
  { year: 2025, items: [
    { date: "2025. 12", text: "한동대학교 RISE사업단 '기업밀착 보육 및 사업화 지원 프로그램' 운영 용역기관 선정" },
    { date: "2025. 11", text: "한동대학교 RISE사업단 '경북지역 ESG 역량강화 프로그램' 운영 용역기관 선정" },
    { date: "2025. 07", text: "경북문화재단, '경북 북부 청년크리에이터 성장지원사업' 용역 기관 선정" },
    { date: "2025. 04", text: "중기부, '2025 특화 역량 BI 육성지원사업' 주관기관 선정" },
  ]},
  { year: 2024, items: [
    { date: "2024. 07", text: "영덕군, '창업 및 이전스타트업 활성화지원사업' 용역기관 선정" },
    { date: "2024. 04", text: "(주)에이치디에스바이오 투자 회수(M&A)" },
    { date: "2024. 04", text: "경북문화재단, '콘텐츠기업 투자유치 프로그램' 용역기관 선정" },
    { date: "2024. 04", text: "문체부, '2024년 아이디어사업화 지원사업' 주관기관 선정" },
    { date: "2024. 04", text: "중기부, '2024 창업보육센터 보육역량강화사업' 주관기관 선정" },
  ]},
  { year: 2023, items: [
    { date: "2023. 12", text: "(주)에콤환경, (주)이롭 투자 회수" },
    { date: "2023. 05", text: "중기부, '창업기획자' 등록" },
    { date: "2023. 04", text: "중기부, '2023년 지역기술창업육성 지원사업' 주관기관 선정" },
    { date: "2023. 01", text: "한동대학교 창업보육센터 위탁 운영" },
  ]},
  { year: 2021, items: [
    { date: "2021. 09", text: "환동해기술금융협의회 회원사 가입" },
    { date: "2021. 02", text: "(주)에콤환경, (주)오픈인, (주)이롭 연구소 기업 등록 지원" },
  ]},
  { year: 2020, items: [
    { date: "2020. 12", text: "(주)에콤환경, (주)오픈인, (주)이롭 투자" },
    { date: "2020. 03", text: "(주)에이치디에스바이오 연구소기업 등록" },
  ]},
  { year: 2019, items: [
    { date: "2019. 07", text: "(주)아이언박스 투자" },
    { date: "2019. 03", text: "(주)에이치디에스바이오 투자" },
  ]},
  { year: 2018, items: [
    { date: "2018. 06", text: "(주)포항연합기술지주 설립" },
  ]},
  { year: 2017, items: [
    { date: "2017. 12", text: "산학연협력기술지주회사 교육부 인가" },
  ]},
]

type HistoryGroup = { year: number; items: { date: string; text: string }[] }

export function HistorySection({ groups }: { groups?: HistoryGroup[] }) {
  const data = groups && groups.length > 0 ? groups : HISTORY_DATA
  return (
    <section id="history" className="relative bg-dark py-28 lg:py-40">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* Header */}
        <div className="mb-16 lg:mb-20">
          <BlurFade delay={0.1}>
            <div className="mb-6 flex items-center gap-4">
              <div className="editorial-rule bg-gold" />
              <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
                HISTORY
              </span>
            </div>
          </BlurFade>
          <BlurFade delay={0.2}>
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-primary-foreground lg:text-5xl text-balance">
              연혁
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-tertiary [word-break:keep-all]">
              포항연합기술지주의 주요 발자취를 소개합니다.
            </p>
          </BlurFade>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 hidden h-full w-px bg-gold/20 lg:left-32 lg:block" />

          <div className="space-y-12 lg:space-y-16">
            {data.map((group, groupIndex) => (
              <BlurFade key={group.year} delay={0.1 + groupIndex * 0.05}>
                <div className="relative">
                  {/* Year marker */}
                  <div className="mb-6 flex items-center gap-6 lg:mb-8">
                    <div className="relative z-10 flex h-16 w-16 items-center justify-center bg-dark lg:h-20 lg:w-64">
                      <span className="text-2xl font-bold text-gold lg:text-3xl">
                        {group.year}
                      </span>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="ml-0 space-y-4 lg:ml-64 lg:pl-12">
                    {group.items.map((item, itemIndex) => (
                      <div
                        key={itemIndex}
                        className="group relative border-l-2 border-gold/30 py-2 pl-6 transition-all duration-300 hover:border-gold"
                      >
                        <div className="absolute -left-[5px] top-4 h-2 w-2 rounded-full bg-gold/50 transition-all duration-300 group-hover:bg-gold" />
                        <span className="text-xs font-medium tabular-nums tracking-wider text-gold/70">
                          {item.date}
                        </span>
                        <p className="mt-1 text-sm leading-relaxed text-text-tertiary transition-colors group-hover:text-primary-foreground [word-break:keep-all]">
                          {item.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
