"use client"

import { NumberTicker } from "@/components/magicui/number-ticker"
import { BlurFade } from "@/components/magicui/blur-fade"

interface Stat {
  id: number
  label: string
  value: number
  suffix: string
}

export function StatsSection({ stats }: { stats: Stat[] }) {
  return (
    <section id="stats" className="relative overflow-hidden bg-navy-deep py-24 md:py-32">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(30,136,229,0.08)_0%,_transparent_70%)]" />

      <div className="relative mx-auto max-w-7xl px-6">
        <BlurFade delay={0.1}>
          <div className="mb-4 text-center">
            <span className="text-xs font-semibold tracking-widest text-blue-accent">
              KEY FIGURES
            </span>
          </div>
          <h2 className="mb-4 text-center text-3xl font-bold text-primary-foreground md:text-4xl text-balance">
            주요 성과
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center leading-relaxed text-slate-400">
            포항연합기술지주의 핵심 성과를 숫자로 확인하세요.
          </p>
        </BlurFade>

        <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-5">
          {stats.map((stat, i) => (
            <BlurFade key={stat.id} delay={0.15 + i * 0.1}>
              <div className="text-center">
                <div className="mb-2 text-3xl font-black text-primary-foreground md:text-4xl lg:text-5xl">
                  <NumberTicker
                    value={stat.value}
                    delay={200 + i * 150}
                    suffix={stat.suffix}
                  />
                </div>
                <p className="text-sm font-medium text-slate-400">{stat.label}</p>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  )
}
