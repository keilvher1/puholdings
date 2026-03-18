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

const LOCAL_GOVERNMENTS = [
  { name: "경상북도", logo: "/images/partners/gyeongbuk.png" },
  { name: "포항시", logo: "/images/partners/pohang.png" },
  { name: "영덕군", logo: "/images/partners/yeongdeok.png" },
  { name: "안동시", logo: "/images/partners/andong.png" },
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
              CORE FUNCTIONS
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

        {/* Two Column: Handong + PU Holdings */}
        <BlurFade delay={0.3}>
          <div className="mt-16 grid gap-8 lg:grid-cols-2">
            {/* Handong University */}
            <div className="border border-blue-500/30 bg-card p-8 lg:p-10">
              <div className="mb-6 flex flex-col items-center gap-4">
                <div className="w-20 h-20 relative">
                  <Image 
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-j9ESHtfkYL1xEZKqq4jMQaY5mBeL3A.png"
                    alt="한동대학교"
                    fill
                    className="object-contain"
                  />
                </div>
                <h3 className="text-lg font-bold text-foreground text-center">한동대학교</h3>
              </div>
              <div className="space-y-3">
                {HANDONG_ACTIVITIES.map((item) => (
                  <div key={item} className="border border-blue-500/30 bg-white rounded-full px-5 py-3 text-center">
                    <span className="text-sm text-foreground font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* PU Holdings */}
            <div className="border border-red-500/30 bg-card p-8 lg:p-10">
              <div className="mb-6 flex flex-col items-center gap-4">
                <div className="w-20 h-20 relative">
                  <Image 
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-hQULUJohK58buj11npJv65rkDqO3C8.png"
                    alt="포항연합기술지주"
                    fill
                    className="object-contain"
                  />
                </div>
                <h3 className="text-lg font-bold text-foreground text-center">(주)포항연합기술지주</h3>
              </div>
              <div className="space-y-3">
                {PUHOLDINGS_ACTIVITIES.map((item) => (
                  <div key={item} className="border border-red-500/30 bg-white rounded-full px-5 py-3 text-center">
                    <span className="text-sm text-foreground font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </BlurFade>

        {/* External Network */}
        <BlurFade delay={0.4}>
          <div className="mt-12 border border-warm-tan bg-card p-8 lg:p-10">
            <div className="mb-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">네트워크 기반 외부 연계</h3>
                <p className="text-xs text-text-secondary">동문, 대기업, 해외 대학</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {EXTERNAL_NETWORK.map((item) => (
                <div key={item} className="flex items-center gap-2 bg-warm-beige px-3 py-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                  <span className="text-sm text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </BlurFade>

        {/* Local Government Cooperation */}
        <BlurFade delay={0.5}>
          <div className="mt-16 pt-12 border-t border-warm-tan">
            <h3 className="text-lg font-bold text-foreground mb-8 text-center">지자체 협력</h3>
            <div className="flex flex-wrap justify-center items-center gap-8 lg:gap-16">
              {LOCAL_GOVERNMENTS.map((gov) => (
                <div key={gov.name} className="flex items-center gap-2 text-text-secondary">
                  <span className="text-sm font-medium">{gov.name}</span>
                </div>
              ))}
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
