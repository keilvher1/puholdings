"use client"

import { BlurFade } from "@/components/magicui/blur-fade"
import Image from "next/image"

const HANDONG_ACTIVITIES = [
  "창업 교육",
  "창업 동아리",
  "특허 관리 및 기술이전",
  "창업경진대회",
]

const PUHOLDINGS_ACTIVITIES = [
  "창업보육센터 운영",
  "벤처투자",
  "액셀러레이팅 프로그램 운영",
  "TIPS/LIPS 추천",
]

const EXTERNAL_NETWORK = [
  "오픈 이노베이션",
  "VC, PE, IB 투자",
  "판로 개척",
  "해외 진출",
]

const PORTFOLIO_COMPANIES = [
  { name: "HEM파마",      src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/HEM%E1%84%91%E1%85%A1%E1%84%86%E1%85%A1_CI-1-fYz4G5Ld5rfaFhdppQPaawBcivPYA2.png", cropTop: true },
  { name: "Impactive AI", src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Impactive_AI_%E1%84%85%E1%85%A9%E1%84%80%E1%85%A9-63XPQG0DuzorwF4HiMH9d2sHX7laM4.svg" },
  { name: "MIDBAR",       src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/MIDBAR_%E1%84%85%E1%85%A9%E1%84%80%E1%85%A9-VTtxhnWkT0lkNPatvqcC6xX3ga4sla.png" },
  { name: "deep visions", src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/deep_visions_%E1%84%85%E1%85%A9%E1%84%80%E1%85%A9-ohjOSZUffMN9CqIwYpaZy1jcwni4bR.jpg" },
]

const LOCAL_GOVERNMENTS = [
  { name: "경상북도", src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-vU26IRzJJ4kKcaskgj7rSaM3kdCcvW.png", height: "h-12", width: "w-48" },
  { name: "포항시",   src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/%E1%84%91%E1%85%A9%E1%84%92%E1%85%A1%E1%86%BC%E1%84%89%E1%85%B5_%E1%84%89%E1%85%B5%E1%86%B7%E1%84%87%E1%85%A5%E1%86%AF%E1%84%86%E1%85%A1%E1%84%8F%E1%85%B3-RtbRvsaGUZ6vMr2I3UNyB4gS6ZdM2v.png", height: "h-12", width: "w-32" },
  { name: "영덕군",   src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-AJ08NsEDJN4DhAMh1aDXCKhiXlvhTH.png", height: "h-12", width: "w-32" },
  { name: "안동시",   src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/%E1%84%8B%E1%85%A1%E1%86%AB%E1%84%83%E1%85%A9%E1%86%BC%E1%84%89%E1%85%B5_%E1%84%89%E1%85%B5%E1%86%B7%E1%84%87%E1%85%A5%E1%86%AF%E1%84%86%E1%85%A1%E1%84%8F%E1%85%B3-g9cwmiJZ7cngWjO49gYBwS9cPk2qos.png", height: "h-12", width: "w-20" },
]

const RELATED_ORGANIZATIONS = [
  { name: "포항테크노파크",         src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/%E1%84%91%E1%85%A9%E1%84%92%E1%85%A1%E1%86%BC%E1%84%90%E1%85%A6%E1%84%8F%E1%85%B3%E1%84%82%E1%85%A9%E1%84%91%E1%85%A1%E1%84%8F%E1%85%B3_%E1%84%85%E1%85%A9%E1%84%80%E1%85%A9-KYY9EfhPyxhtWAW9eEvhxglAhkC65T.png" },
  { name: "경북창조경제혁신센터",   src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/%E1%84%80%E1%85%A7%E1%86%BC%E1%84%87%E1%85%AE%E1%86%A8%E1%84%8E%E1%85%A1%E1%86%BC%E1%84%8C%E1%85%A9%E1%84%80%E1%85%A7%E1%86%BC%E1%84%8C%E1%85%A6%E1%84%92%E1%85%A7%E1%86%A8%E1%84%89%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A6%E1%86%AB%E1%84%90%E1%85%A5_%E1%84%85%E1%85%A9%E1%84%80%E1%85%A9-we2uo0tpDzF3DqJVXR7oA19yG4hwXn.png" },
  { name: "Y&ARCHER",              src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Y%26ARCHER_%E1%84%85%E1%85%A9%E1%84%80%E1%85%A9-ev97r2lvSbWl3AORjo7HDgtH0Ug0tt.svg" },
  { name: "경북콘텐츠기업지원센터", src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/%E1%84%80%E1%85%A7%E1%86%BC%E1%84%87%E1%85%AE%E1%86%A8%E1%84%8F%E1%85%A9%E1%86%AB%E1%84%90%E1%85%A6%E1%86%AB%E1%84%8E%E1%85%B3%E1%84%80%E1%85%B5%E1%84%8B%E1%85%A5%E1%86%B8%E1%84%8C%E1%85%B5%E1%84%8B%E1%85%AF%E1%86%AB%E1%84%89%E1%85%A6%E1%86%AB%E1%84%90%E1%85%A5_%E1%84%85%E1%85%A9%E1%84%80%E1%85%A9-Vrn2WSg3scOaJu02kaEDCkVzLX3BAE.png" },
  { name: "대경기술지주", src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/%E1%84%83%E1%85%A2%E1%84%80%E1%85%A7%E1%86%BC%E1%84%80%E1%85%B5%E1%84%89%E1%85%AE%E1%86%AF%E1%84%8C%E1%85%B5%E1%84%8C%E1%85%AE__1_-removebg-preview-KgVQlK1S7F9yBq8M9meixvYNqLBWyW.png" },
]

export function CoreFunctionsSection() {
  return (
    <section className="relative bg-warm-ivory py-28 lg:py-40 border-t border-warm-tan">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* Header */}
        <BlurFade delay={0.1}>
          <div className="mb-6 flex items-center gap-4">
            <div className="editorial-rule" />
            <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
              DEPARTMENT OVERVIEW
            </span>
          </div>
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground lg:text-4xl">
            핵심 기능 및 역할
          </h2>
        </BlurFade>

        {/* Description */}
        <BlurFade delay={0.2}>
          <div className="mt-8 max-w-4xl space-y-4">
            <p className="text-base leading-[1.9] text-text-secondary [word-break:keep-all]">
              대학 기술지주회사이자 지역 액셀러레이터로서 대학 창업 활성화 및 대학 공동 사업 확대(글로컬, RISE 연계)를 통한 지산학연 창업 생태계 구축 추진
            </p>
            <p className="text-base leading-[1.9] text-text-secondary [word-break:keep-all]">
              창업보육센터 운영, 벤처투자 및 창업지원 사업 등을 통해 우수 (예비)창업자 발굴, 육성, 투자 등의 업무 진행
            </p>
          </div>
        </BlurFade>

        {/* Main Layout */}
        <BlurFade delay={0.3}>
          {/* Outer flex: [left+center+지자체 column] | [portfolio column] */}
          <div className="mt-16 flex gap-6 items-stretch">

            {/* Left side: stacked (top boxes + 지자체) */}
            <div className="flex-1 flex flex-col gap-6">

              {/* Top row: 내부 역량 + 네트워크 */}
              <div className="flex gap-6 flex-1">

                {/* Left: 내부 역량 기반 자체 지원 */}
                <div className="flex-1 border border-warm-tan bg-card p-6 lg:p-8 flex flex-col">
                  <div className="flex justify-center mb-6">
                    <div className="border border-gold/30 bg-gold/5 px-5 py-2.5">
                      <p className="text-xs text-center text-text-secondary">
                        내부 역량 기반<br />
                        <span className="font-semibold text-foreground">자체 지원</span>
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 flex-1">
                    {/* 한동대학교 column */}
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-center items-center h-12 mb-2">
                        <div className="relative h-10 w-full">
                          <Image
                            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-Gr0HGRS2EgHMVp6hUlFloPH4NbnZqE.png"
                            alt="한동대학교"
                            fill
                            className="object-contain"
                          />
                        </div>
                      </div>
                      {HANDONG_ACTIVITIES.map((item) => (
                        <div key={item} className="flex-1 border border-warm-tan bg-warm-beige flex items-center justify-center px-3 py-2.5 min-h-[42px]">
                          <span className="text-xs text-foreground text-center leading-tight">{item}</span>
                        </div>
                      ))}
                    </div>
                    {/* 포항연합기술지주 column */}
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-center items-center h-12 mb-2">
                        <div className="relative h-10 w-full">
                          <Image
                            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-5SMkRAzZQ5MANmKw9kknm38UuBSgc1.png"
                            alt="(주)포항연합기술지주"
                            fill
                            className="object-contain"
                          />
                        </div>
                      </div>
                      {PUHOLDINGS_ACTIVITIES.map((item) => (
                        <div key={item} className="flex-1 border border-gold/30 bg-gold/5 flex items-center justify-center px-3 py-2.5 min-h-[42px]">
                          <span className="text-xs text-foreground text-center leading-tight">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Center: 네트워크 기반 외부 연계 */}
                <div className="w-56 border border-warm-tan bg-card p-6 lg:p-8 flex flex-col">
                  <div className="flex justify-center mb-6">
                    <div className="border border-gold/30 bg-gold/5 px-5 py-2.5">
                      <p className="text-xs text-center text-text-secondary">
                        네트워크 기반<br />
                        <span className="font-semibold text-foreground">외부 연계</span>
                      </p>
                    </div>
                  </div>
                  {/* 로고 영역과 높이 맞추기: h-12 + mb-2 = 왼쪽 로고 영역과 동일 */}
                  <div className="flex justify-center items-center h-12 mb-2">
                    <p className="text-base font-bold text-foreground text-center whitespace-nowrap">
                      동문, 대기업, 해외 대학 등
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 flex-1">
                    {EXTERNAL_NETWORK.map((item) => (
                      <div key={item} className="flex-1 border border-warm-tan bg-warm-beige flex items-center justify-center px-4 py-2.5 min-h-[42px]">
                        <span className="text-xs text-foreground text-center leading-tight whitespace-nowrap">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom: 지자체 협력 박스 */}
              <div className="relative mt-6">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 bg-warm-ivory px-4">
                  <span className="text-xs font-medium tracking-wide text-gold whitespace-nowrap">지자체 협력</span>
                </div>
                <div className="border border-warm-tan bg-warm-beige/50 px-10 py-6 flex items-center justify-around gap-6">
                  {LOCAL_GOVERNMENTS.map((gov) => (
                    <div key={gov.name} className={`relative ${gov.height} ${gov.width}`}>
                      <Image
                        src={gov.src}
                        alt={gov.name}
                        fill
                        className="object-contain"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom: 유관기관 협력 박스 */}
              <div className="relative mt-6">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 bg-warm-ivory px-4">
                  <span className="text-xs font-medium tracking-wide text-gold whitespace-nowrap">유관기관 협력</span>
                </div>
                <div className="border border-warm-tan bg-warm-beige/50 px-10 py-6 flex items-center justify-around gap-6">
                  {RELATED_ORGANIZATIONS.map((org) => (
                    <div key={org.name} className="relative h-14 w-36">
                      <Image
                        src={org.src}
                        alt={org.name}
                        fill
                        className="object-contain"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Portfolio Companies — stretches full height including 지자체 row */}
            <div className="w-52 border border-gold/20 bg-gold/5 p-6 flex flex-col justify-center gap-8">
              {PORTFOLIO_COMPANIES.map((company) => (
                company.cropTop ? (
                  // CI 디자인 페이지 이미지의 상단 절반(로고 영역)만 표시
                  <div key={company.name} className="relative w-full overflow-hidden" style={{ height: 52 }}>
                    <div className="absolute inset-0" style={{ height: '200%' }}>
                      <Image
                        src={company.src}
                        alt={company.name}
                        fill
                        className="object-contain object-top"
                      />
                    </div>
                  </div>
                ) : (
                  <div key={company.name} className="relative h-14 w-full">
                    <Image
                      src={company.src}
                      alt={company.name}
                      fill
                      className="object-contain"
                    />
                  </div>
                )
              ))}
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
