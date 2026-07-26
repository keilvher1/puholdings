"use client"

import { useEffect, useRef, useState } from "react"
import { Particles } from "@/components/magicui/particles"
import { DotGlobe } from "@/components/magicui/dot-globe"

export interface HeroContent {
  label?: string
  title?: string
  subtitle?: string
}

const DEFAULT_HERO = {
  label: "POHANG TECHNOLOGY HOLDINGS",
  title: "기술의 가능성을\n미래의 가치로",
  subtitle:
    "대학 기술지주회사이자 지역 액셀러레이터로서, 창업보육센터 운영과 벤처투자를 통해 지산학연 창업생태계를 구축합니다.",
}

export function HeroSection({ hero }: { hero?: HeroContent } = {}) {
  const label = hero?.label || DEFAULT_HERO.label
  const titleLines = (hero?.title || DEFAULT_HERO.title).split("\n")
  const subtitle = hero?.subtitle || DEFAULT_HERO.subtitle
  const [loaded, setLoaded] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 100)
    return () => clearTimeout(t)
  }, [])

  // 마우스 패럴랙스: -0.5~0.5 정규화 좌표를 CSS 변수로 전달 (rAF 스로틀)
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let ticking = false
    let mx = 0
    let my = 0
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      mx = (e.clientX - r.left) / r.width - 0.5
      my = (e.clientY - r.top) / r.height - 0.5
      if (!ticking) {
        ticking = true
        requestAnimationFrame(() => {
          el.style.setProperty("--mx", mx.toFixed(3))
          el.style.setProperty("--my", my.toFixed(3))
          ticking = false
        })
      }
    }
    el.addEventListener("mousemove", onMove)
    return () => el.removeEventListener("mousemove", onMove)
  }, [])

  // 워드 리빌 딜레이 누적 (줄 바뀌어도 순서대로)
  let wordIndex = 0

  return (
    <section ref={sectionRef} className="relative flex min-h-screen items-end overflow-hidden bg-dark">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src="/images/hero-bg.jpg"
          alt=""
          className="h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/70 to-dark/40" />
      </div>

      {/* Aurora blobs — 배경 레이어, 역방향 패럴랙스 */}
      <div aria-hidden="true" className="parallax-far absolute inset-0 z-[1]">
        <div className="aurora-blob aurora-gold -top-[12%] -left-[8%]" />
        <div className="aurora-blob aurora-indigo top-[28%] right-[-10%]" />
        <div className="aurora-blob aurora-ember bottom-[-14%] left-[30%]" />
      </div>

      {/* Interactive particle network */}
      <Particles
        className="absolute inset-0 z-[1]"
        quantity={70}
        color="#c9a84c"
        size={1}
        speed={0.15}
        interactive
      />

      {/* Masked grid pattern */}
      <div aria-hidden="true" className="hero-grid z-[1]" />

      {/* 3D dot globe — 우측, 데스크톱 전용, 역방향 패럴랙스 */}
      <div
        aria-hidden="true"
        className="parallax-far pointer-events-none absolute top-1/2 right-[-6%] z-[2] hidden -translate-y-1/2 opacity-80 lg:block"
      >
        <DotGlobe size={560} dots={520} />
      </div>

      {/* Vertical accent line */}
      <div className="pointer-events-none absolute top-0 left-8 hidden h-full w-px bg-gradient-to-b from-transparent via-gold/15 to-transparent lg:left-12 lg:block" />

      {/* Content — 정방향 패럴랙스 */}
      <div className="parallax-near relative z-10 w-full px-8 pb-24 pt-48 lg:px-12 lg:pb-32">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            {/* Kicker — 글래스 배지 + 펄스 도트 */}
            <div
              className="mb-10 transition-all duration-[1200ms]"
              style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? "translateY(0)" : "translateY(16px)",
              }}
            >
              <span className="kicker-badge">
                <span className="kicker-dot" aria-hidden="true" />
                <span className="text-[11px] font-medium tracking-[0.3em] text-gold/90">
                  {label}
                </span>
              </span>
            </div>

            {/* Headline — 워드-by-워드 블러 리빌 */}
            <h1 suppressHydrationWarning className="mb-10">
              {titleLines.map((line, i) => {
                const isLast = i === titleLines.length - 1
                const words = line.split(" ")
                return (
                  <span
                    key={i}
                    suppressHydrationWarning
                    className={`block text-4xl font-[900] leading-[1.1] tracking-tight [word-break:keep-all] sm:text-5xl lg:text-[4.5rem] ${
                      i === 0 ? "text-primary-foreground" : "mt-2"
                    }`}
                  >
                    {words.map((word, j) => {
                      const delay = 0.35 + wordIndex++ * 0.09
                      const inner =
                        isLast && titleLines.length > 1 ? (
                          <span className="bg-gradient-to-r from-gold to-gold-light bg-clip-text text-transparent">
                            {word}
                          </span>
                        ) : (
                          word
                        )
                      return (
                        <span key={j} suppressHydrationWarning>
                          <span
                            className="reveal-word"
                            style={{ animationDelay: `${delay.toFixed(2)}s` }}
                          >
                            {inner}
                          </span>
                          {j < words.length - 1 ? " " : null}
                        </span>
                      )
                    })}
                  </span>
                )
              })}
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
              {subtitle}
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
                className="group shimmer-cta relative overflow-hidden border border-gold/60 px-8 py-3.5 text-[11px] font-semibold tracking-[0.2em] text-gold transition-all duration-500 hover:border-gold hover:text-dark"
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

      {/* Scroll hint — 마우스 아이콘 + 휠 드롭 */}
      <button
        onClick={() => document.querySelector("#stats")?.scrollIntoView({ behavior: "smooth" })}
        className="absolute bottom-8 right-8 flex flex-col items-center gap-3 text-text-tertiary/60 transition-colors hover:text-primary-foreground lg:right-12"
        aria-label="Scroll down"
      >
        <div className="scroll-mouse" aria-hidden="true" />
        <span className="text-[10px] font-medium tracking-[0.25em]">SCROLL</span>
      </button>
    </section>
  )
}
