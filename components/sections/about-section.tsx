"use client"

import { BlurFade } from "@/components/magicui/blur-fade"
import { Building2, Target, Lightbulb, Users } from "lucide-react"

const VALUES = [
  {
    icon: Target,
    title: "기술 발굴",
    description: "POSTECH의 우수한 연구 성과를 발굴하여 사업화 가능성을 평가하고 최적의 투자 기회를 포착합니다.",
  },
  {
    icon: Lightbulb,
    title: "투자 육성",
    description: "초기 단계부터 성장 단계까지 맞춤형 투자와 경영 지원을 통해 기업의 성장을 지원합니다.",
  },
  {
    icon: Users,
    title: "네트워크 연결",
    description: "산학연 네트워크를 활용하여 기술 기업과 산업 파트너를 연결하고 시너지를 창출합니다.",
  },
  {
    icon: Building2,
    title: "가치 창출",
    description: "지속 가능한 기술 생태계를 구축하여 장기적인 가치 창출과 사회적 기여를 실현합니다.",
  },
]

export function AboutSection() {
  return (
    <section id="about" className="relative bg-background py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <BlurFade delay={0.1}>
          <div className="mb-4 text-center">
            <span className="text-xs font-semibold tracking-widest text-blue-accent">
              ABOUT US
            </span>
          </div>
          <h2 className="mb-4 text-center text-3xl font-bold text-foreground md:text-4xl text-balance">
            포항연합기술지주 소개
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center leading-relaxed text-muted-foreground">
            포항연합기술지주(PU Holdings)는 2012년 설립 이래 POSTECH의 혁신 기술을 기반으로
            기술사업화를 전문적으로 수행하는 기술지주회사입니다.
          </p>
        </BlurFade>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((item, i) => (
            <BlurFade key={item.title} delay={0.15 + i * 0.1}>
              <div className="group relative rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:-translate-y-1 hover:border-blue-accent/30 hover:shadow-lg hover:shadow-blue-accent/5">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-accent/10 text-blue-accent transition-colors group-hover:bg-blue-accent group-hover:text-primary-foreground">
                  <item.icon size={24} />
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
