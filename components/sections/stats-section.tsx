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
    <section id="stats" className="relative bg-warm-ivory py-20 lg:py-0">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        <div className="grid grid-cols-2 gap-px bg-warm-tan lg:grid-cols-5 lg:-translate-y-12">
          {stats.map((stat, i) => (
            <BlurFade key={stat.id} delay={0.1 + i * 0.08}>
              <div className="flex flex-col items-center bg-card px-6 py-10 text-center lg:py-14">
                <span className="text-3xl font-bold tracking-tight text-foreground lg:text-5xl">
                  <NumberTicker
                    value={stat.value}
                    delay={100 + i * 120}
                    suffix={stat.suffix}
                  />
                </span>
                <span className="mt-3 text-[11px] font-medium tracking-[0.15em] text-text-secondary">
                  {stat.label.toUpperCase()}
                </span>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  )
}
