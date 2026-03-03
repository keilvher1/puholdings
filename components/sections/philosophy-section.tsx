"use client"

import { BlurFade } from "@/components/magicui/blur-fade"
import { BorderBeam } from "@/components/magicui/border-beam"
import { Particles } from "@/components/magicui/particles"

const STEPS = [
  {
    num: "01",
    title: "기술 발굴 및 평가",
    description: "POSTECH 연구실 기술을 지속적으로 모니터링하고, 사업화 가능성이 높은 기술을 발굴하여 심층 분석합니다.",
  },
  {
    num: "02",
    title: "초기 투자 및 인큐베이팅",
    description: "기술 기반 스타트업에 시드 및 시리즈A 단계의 투자를 실행하고, 사업 전략 수립을 지원합니다.",
  },
  {
    num: "03",
    title: "성장 지원 및 멘토링",
    description: "경영, 재무, 법무 등 전문 멘토링을 제공하며, 후속 투자 유치 및 사업 확장을 지원합니다.",
  },
  {
    num: "04",
    title: "EXIT 및 가치 실현",
    description: "IPO, M&A 등 다양한 경로를 통한 투자 회수를 지원하여 지속 가능한 투자 생태계를 구축합니다.",
  },
]

export function PhilosophySection() {
  return (
    <section id="philosophy" className="relative overflow-hidden bg-dark py-28 lg:py-40">
      <Particles
        className="absolute inset-0"
        quantity={25}
        color="#c9a84c"
        size={0.8}
        speed={0.08}
      />
      <div className="relative z-10 mx-auto max-w-7xl px-8 lg:px-12">
        {/* Header */}
        <div className="mb-20 grid gap-8 lg:grid-cols-2 lg:gap-16">
          <BlurFade delay={0.1}>
            <div className="mb-6 flex items-center gap-4">
              <div className="editorial-rule" />
              <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
                INVESTMENT
              </span>
            </div>
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-primary-foreground lg:text-5xl text-balance">
              <span className="block">{"기술기반 스타트업에"}</span>
              <span className="block">{"투자합니다."}</span>
            </h2>
          </BlurFade>
          <BlurFade delay={0.2}>
            <div className="flex items-end lg:justify-end lg:pb-2">
              <p className="max-w-md text-[15px] leading-[1.9] text-text-tertiary">
                {"Pre-seed에서 IPO까지, 기술의 가능성을 발견하고 기업의 성장을 함께하며 미래의 가치를 창출합니다."}
              </p>
            </div>
          </BlurFade>
        </div>

        {/* Steps - editorial numbered list */}
        <div className="space-y-0">
          {STEPS.map((step, i) => (
            <BlurFade key={step.num} delay={0.15 + i * 0.1}>
              <div className="group grid grid-cols-12 gap-4 border-t border-dark-muted/40 py-8 transition-colors hover:border-gold/30 lg:py-10">
                <div className="col-span-2 lg:col-span-1">
                  <span className="text-sm font-light text-gold/70">{step.num}</span>
                </div>
                <div className="col-span-10 lg:col-span-4">
                  <h3 className="text-base font-bold text-primary-foreground transition-colors group-hover:text-gold lg:text-lg">
                    {step.title}
                  </h3>
                </div>
                <div className="col-span-10 col-start-3 mt-2 lg:col-span-6 lg:col-start-6 lg:mt-0">
                  <p className="text-sm leading-[1.8] text-text-tertiary">
                    {step.description}
                  </p>
                </div>
              </div>
            </BlurFade>
          ))}
          <div className="border-t border-dark-muted/40" />
        </div>

        {/* Two highlight boxes with BorderBeam */}
        <div className="mt-16 grid gap-4 lg:grid-cols-2">
          <BlurFade delay={0.5}>
            <div className="group relative overflow-hidden border border-dark-muted/40 p-10 transition-colors hover:border-gold/20 lg:p-12">
              <BorderBeam size={160} duration={10} colorFrom="#c9a84c" colorTo="#dbb960" />
              <span className="text-[11px] font-medium tracking-[0.2em] text-gold/70">DISRUPTIVE TECH</span>
              <h4 className="mt-4 text-lg font-bold text-primary-foreground">{"파괴적 기술"}</h4>
              <p className="mt-3 text-sm leading-[1.8] text-text-tertiary">
                {"신규 시장을 창출할 수 있거나, 글로벌 수준의 경쟁력이 있는 기술을 가진 기업에 투자합니다."}
              </p>
            </div>
          </BlurFade>
          <BlurFade delay={0.6}>
            <div className="group relative overflow-hidden border border-dark-muted/40 p-10 transition-colors hover:border-gold/20 lg:p-12">
              <BorderBeam size={160} duration={12} delay={4} colorFrom="#dbb960" colorTo="#c9a84c" />
              <span className="text-[11px] font-medium tracking-[0.2em] text-gold/70">INNOVATIVE TECH</span>
              <h4 className="mt-4 text-lg font-bold text-primary-foreground">{"혁신형 기술"}</h4>
              <p className="mt-3 text-sm leading-[1.8] text-text-tertiary">
                {"기존 시장 내에서 제품을 혁신하거나, 개선할 수 있는 기술을 가진 기업에 투자합니다."}
              </p>
            </div>
          </BlurFade>
        </div>
      </div>
    </section>
  )
}
