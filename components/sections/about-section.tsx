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
                <span className="block">{"포항연합기술지주,"}</span>
                <span className="mt-2 block text-gold">{"기술벤처 창업시장을"}</span>
                <span className="block">{"주도합니다."}</span>
              </h2>
            </BlurFade>
          </div>

          {/* Right column - body copy */}
          <div className="lg:col-span-7 lg:pt-20">
            <BlurFade delay={0.25}>
              <p className="text-base leading-[1.9] text-text-secondary lg:text-lg">
                {"포항연합기술지주(PU Holdings)는 2012년 설립 이래 POSTECH의 혁신 기술을 기반으로 기술사업화를 전문적으로 수행하는 기술지주회사입니다."}
              </p>
              <p className="mt-6 text-base leading-[1.9] text-text-secondary lg:text-lg">
                {"국내 최고의 교수진과 연구진이 창출한 우수한 성과를 기반으로 투자 대상을 발굴하고, 사업 전략 수립 및 투자, 성장 지원을 통해 미래 유망 기업을 집중 육성합니다."}
              </p>
            </BlurFade>

            {/* Key values - horizontal list */}
            <BlurFade delay={0.4}>
              <div className="mt-14 grid grid-cols-2 gap-8 border-t border-warm-tan pt-10 lg:grid-cols-4">
                {[
                  { label: "기술 발굴", desc: "우수 연구성과 사업화" },
                  { label: "투자 육성", desc: "맞춤형 성장 지원" },
                  { label: "네트워크", desc: "산학연 시너지 창출" },
                  { label: "가치 창출", desc: "지속 가능한 생태계" },
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
