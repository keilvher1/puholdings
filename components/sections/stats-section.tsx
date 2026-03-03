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
    <section id="stats" className="relative bg-warm-ivory">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* Overlapping bridge from hero */}
        <div className="relative -mt-16 lg:-mt-20">
          <div className="grid grid-cols-2 lg:grid-cols-5">
            {stats.map((stat, i) => (
              <BlurFade key={stat.id} delay={0.08 + i * 0.06}>
                <div className="flex flex-col items-center border border-warm-tan/60 bg-card px-4 py-10 text-center lg:py-14">
                  <span className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-[2.5rem]">
                    <NumberTicker
                      value={stat.value}
                      delay={200 + i * 100}
                      suffix={stat.suffix}
                    />
                  </span>
                  <span className="mt-3 text-[10px] font-medium tracking-[0.15em] text-text-secondary">
                    {stat.label.toUpperCase()}
                  </span>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>
      </div>
      {/* Spacer below stats */}
      <div className="h-16 lg:h-24" />
    </section>
  )
}
