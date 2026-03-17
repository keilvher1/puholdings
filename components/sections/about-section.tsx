"use client"

import { BlurFade } from "@/components/magicui/blur-fade"

export function AboutSection() {
  return (
    <section id="about" className="relative bg-warm-ivory py-28 lg:py-40">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        <div className="grid gap-16 lg:grid-cols-12 lg:gap-20">
          {/* Left column - label & heading */}
          <div className="lg:col-span-5">
            <BlurFade delay={0.1}>
              <div className="mb-6 flex items-center gap-4">
                <div className="editorial-rule" />
                <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
                  ABOUT US
                </span>
              </div>
              <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground lg:text-5xl text-balance">
                <span className="block">Bridging Local,</span>
                <span className="mt-2 block text-gold">Building Future</span>
              </h2>
            </BlurFade>
          </div>

          {/* Right column - body copy */}
          <div className="lg:col-span-7 lg:pt-20">
            <BlurFade delay={0.25}>
              <p className="text-base leading-[1.9] text-text-secondary lg:text-lg [word-break:keep-all]">
                포항연합기술지주(Pohang United Holdings)는 대학 기술지주회사이자 지역 액셀러레이터로서, 대학 창업 활성화 및 글로컬대학30·RISE 연계를 통한 지산학연 창업생태계 구축을 추진합니다.
              </p>
              <p className="mt-6 text-base leading-[1.9] text-text-secondary lg:text-lg [word-break:keep-all]">
                창업보육센터 운영, 벤처투자, 창업지원사업을 통해 우수 (예비)창업자를 발굴하고, 액셀러레이팅 프로그램, 멘토링, 투자유치 지원으로 성장을 함께합니다.
              </p>
            </BlurFade>

            {/* Key values - horizontal list */}
            <BlurFade delay={0.4}>
              <div className="mt-14 grid grid-cols-2 gap-8 border-t border-warm-tan pt-10 lg:grid-cols-4">
                {[
                  { label: "창업보육", desc: "입주기업 26개사 운영" },
                  { label: "벤처투자", desc: "TIPS/LIPS 추천" },
                  { label: "액셀러레이팅", desc: "맞춤형 성장 프로그램" },
                  { label: "오픈이노베이션", desc: "지산학연 협력 네트워크" },
                ].map((item) => (
                  <div key={item.label}>
                    <h4 className="text-sm font-bold text-foreground">{item.label}</h4>
                    <p className="mt-1 text-xs leading-relaxed text-text-secondary">{item.desc}</p>
                  </div>
                ))}
              </div>
            </BlurFade>
          </div>
        </div>
      </div>
    </section>
  )
}
