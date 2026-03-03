"use client"

import { useEffect, useState } from "react"
import { ArrowDown } from "lucide-react"

export function HeroSection() {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 100)
    return () => clearTimeout(t)
  }, [])

  return (
    <section className="relative flex min-h-screen items-end overflow-hidden bg-dark">
      {/* Background image with overlay */}
      <div className="absolute inset-0">
        <img
          src="/images/hero-bg.jpg"
          alt=""
          className="h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/60 to-dark/30" />
      </div>

      {/* Thin gold line accent */}
      <div className="absolute top-0 left-0 h-full w-px bg-gradient-to-b from-transparent via-gold/20 to-transparent ml-8 lg:ml-12 hidden lg:block" />

      {/* Content */}
      <div className="relative z-10 w-full px-8 pb-20 pt-40 lg:px-12 lg:pb-28">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            {/* Label */}
            <div
              className="mb-8 flex items-center gap-4 transition-all duration-1000"
              style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? "translateY(0)" : "translateY(20px)",
              }}
            >
              <div className="editorial-rule" />
              <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
                POSTECH TECHNOLOGY HOLDINGS
              </span>
            </div>

            {/* Headline */}
            <h1
              className="mb-8 text-4xl font-bold leading-[1.15] tracking-tight text-primary-foreground sm:text-5xl lg:text-7xl transition-all duration-1000 delay-200"
              style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? "translateY(0)" : "translateY(30px)",
              }}
            >
              <span className="block">{"기술의 가능성을"}</span>
              <span className="block text-gold">{"미래의 가치로"}</span>
            </h1>

            {/* Subtext */}
            <p
              className="mb-12 max-w-lg text-base leading-relaxed text-text-tertiary font-light lg:text-lg transition-all duration-1000 delay-500"
              style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? "translateY(0)" : "translateY(20px)",
              }}
            >
              {"POSTECH의 우수한 기술력을 기반으로 혁신적인 기술 스타트업을 발굴하고 투자하여 대한민국 기술사업화를 선도합니다."}
            </p>

            {/* CTA */}
            <div
              className="flex items-center gap-8 transition-all duration-1000 delay-700"
              style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? "translateY(0)" : "translateY(20px)",
              }}
            >
              <button
                onClick={() => document.querySelector("#portfolio")?.scrollIntoView({ behavior: "smooth" })}
                className="border border-gold bg-gold/10 px-8 py-3.5 text-[11px] font-semibold tracking-[0.2em] text-gold transition-all duration-300 hover:bg-gold hover:text-dark"
              >
                PORTFOLIO
              </button>
              <button
                onClick={() => document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth" })}
                className="text-[11px] font-medium tracking-[0.2em] text-text-tertiary transition-colors hover:text-primary-foreground"
              >
                CONTACT US
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll down indicator */}
      <button
        onClick={() => document.querySelector("#stats")?.scrollIntoView({ behavior: "smooth" })}
        className="absolute bottom-8 right-8 flex items-center gap-3 text-text-tertiary transition-colors hover:text-primary-foreground lg:right-12"
        aria-label="Scroll down"
      >
        <span className="text-[10px] font-medium tracking-[0.2em]">SCROLL</span>
        <ArrowDown size={14} className="animate-bounce" />
      </button>
    </section>
  )
}
