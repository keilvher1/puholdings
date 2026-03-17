"use client"

import { useEffect, useState } from "react"
import { ArrowDown } from "lucide-react"
import { Particles } from "@/components/magicui/particles"

export function HeroSection() {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 100)
    return () => clearTimeout(t)
  }, [])

  return (
    <section className="relative flex min-h-screen items-end overflow-hidden bg-dark">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src="/images/hero-bg.jpg"
          alt=""
          className="h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/70 to-dark/40" />
      </div>

      {/* Magic UI Particles overlay */}
      <Particles
        className="absolute inset-0 z-[1]"
        quantity={40}
        color="#c9a84c"
        size={1}
        speed={0.15}
      />

      {/* Vertical accent line */}
      <div className="pointer-events-none absolute top-0 left-8 hidden h-full w-px bg-gradient-to-b from-transparent via-gold/15 to-transparent lg:left-12 lg:block" />

      {/* Content */}
      <div className="relative z-10 w-full px-8 pb-24 pt-48 lg:px-12 lg:pb-32">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            {/* Label */}
            <div
              className="mb-10 flex items-center gap-4 transition-all duration-[1200ms]"
              style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? "translateY(0)" : "translateY(16px)",
              }}
            >
              <div className="editorial-rule" />
              <span className="text-[11px] font-medium tracking-[0.3em] text-gold/80">
                POHANG TECHNOLOGY HOLDINGS
              </span>
            </div>

            {/* Headline */}
            <h1
              suppressHydrationWarning
              className="mb-10 transition-all duration-[1200ms] delay-200"
              style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? "translateY(0)" : "translateY(24px)",
              }}
            >
              <span suppressHydrationWarning className="block text-4xl font-[900] leading-[1.1] tracking-tight text-primary-foreground sm:text-5xl lg:text-[4.5rem]">
                기술의 가능성을
              </span>
              <span className="mt-2 block text-4xl font-[900] leading-[1.1] tracking-tight sm:text-5xl lg:text-[4.5rem]">
                <span suppressHydrationWarning className="bg-gradient-to-r from-gold to-gold-light bg-clip-text text-transparent">
                  미래의 가치로
                </span>
              </span>
            </h1>

            {/* Subtext */}
            <p
              suppressHydrationWarning
              className="mb-14 max-w-lg text-[15px] font-light leading-[1.9] text-text-tertiary lg:text-base transition-all duration-[1200ms] delay-500"
              style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? "translateY(0)" : "translateY(16px)",
                wordBreak: "keep-all",
                overflowWrap: "break-word",
              }}
            >
              대학 기술지주회사이자 지역 액셀러레이터로서, 창업보육센터 운영과 벤처투자를 통해 지산학연 창업생태계를 구축합니다.
            </p>

            {/* CTA buttons */}
            <div
              className="flex items-center gap-6 transition-all duration-[1200ms] delay-700"
              style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? "translateY(0)" : "translateY(16px)",
              }}
            >
              <button
                onClick={() => document.querySelector("#portfolio")?.scrollIntoView({ behavior: "smooth" })}
                className="group relative overflow-hidden border border-gold/60 px-8 py-3.5 text-[11px] font-semibold tracking-[0.2em] text-gold transition-all duration-500 hover:border-gold hover:text-dark"
              >
                <span className="absolute inset-0 -translate-x-full bg-gold transition-transform duration-500 group-hover:translate-x-0" />
                <span className="relative">PORTFOLIO</span>
              </button>
              <button
                onClick={() => document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth" })}
                className="text-[11px] font-medium tracking-[0.2em] text-text-tertiary/70 transition-colors duration-300 hover:text-primary-foreground"
              >
                CONTACT US
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <button
        onClick={() => document.querySelector("#stats")?.scrollIntoView({ behavior: "smooth" })}
        className="absolute bottom-8 right-8 flex items-center gap-3 text-text-tertiary/60 transition-colors hover:text-primary-foreground lg:right-12"
        aria-label="Scroll down"
      >
        <span className="text-[10px] font-medium tracking-[0.2em]">SCROLL</span>
        <ArrowDown size={14} className="animate-bounce" />
      </button>
    </section>
  )
}
