"use client"

import { BlurFade } from "@/components/magicui/blur-fade"
import { Search, TrendingUp, Handshake, Rocket } from "lucide-react"

const STEPS = [
  {
    icon: Search,
    step: "01",
    title: "기술 발굴 및 평가",
    description: "POSTECH 연구실 기술을 지속적으로 모니터링하고, 사업화 가능성이 높은 기술을 발굴하여 심층 분석합니다.",
  },
  {
    icon: TrendingUp,
    step: "02",
    title: "초기 투자 및 인큐베이팅",
    description: "기술 기반 스타트업에 시드 및 시리즈A 단계의 투자를 실행하고, 사업 전략 수립을 지원합니다.",
  },
  {
    icon: Handshake,
    step: "03",
    title: "성장 지원 및 멘토링",
    description: "경영, 재무, 법무 등 전문 멘토링을 제공하며, 후속 투자 유치 및 사업 확장을 지원합니다.",
  },
  {
    icon: Rocket,
    step: "04",
    title: "EXIT 및 가치 실현",
    description: "IPO, M&A 등 다양한 경로를 통한 투자 회수를 지원하여 지속 가능한 투자 생태계를 구축합니다.",
  },
]

export function PhilosophySection() {
  return (
    <section id="philosophy" className="relative bg-background py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <BlurFade delay={0.1}>
          <div className="mb-4 text-center">
            <span className="text-xs font-semibold tracking-widest text-blue-accent">
              INVESTMENT PHILOSOPHY
            </span>
          </div>
          <h2 className="mb-4 text-center text-3xl font-bold text-foreground md:text-4xl text-balance">
            투자 철학
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center leading-relaxed text-muted-foreground">
            기술의 가능성을 발견하고, 기업의 성장을 함께하며, 미래의 가치를 창출합니다.
          </p>
        </BlurFade>

        <div className="relative grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Connecting line (desktop) */}
          <div className="absolute top-16 left-[12.5%] right-[12.5%] hidden h-[1px] bg-gradient-to-r from-transparent via-blue-accent/30 to-transparent lg:block" />

          {STEPS.map((item, i) => (
            <BlurFade key={item.step} delay={0.15 + i * 0.12}>
              <div className="relative flex flex-col items-center text-center">
                <div className="relative mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-accent/20 bg-navy-deep text-blue-accent shadow-lg shadow-blue-accent/10">
                  <item.icon size={24} />
                  <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-accent text-[10px] font-bold text-primary-foreground">
                    {item.step}
                  </span>
                </div>
                <h3 className="mb-3 text-lg font-bold text-foreground">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  )
}
