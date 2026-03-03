"use client"

import { Particles } from "@/components/magicui/particles"
import { TextAnimate } from "@/components/magicui/text-animate"
import { ShimmerButton } from "@/components/magicui/shimmer-button"
import { ChevronDown } from "lucide-react"

export function HeroSection() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-deep">
      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(30,136,229,0.15)_0%,_transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(0,188,212,0.1)_0%,_transparent_60%)]" />

      <Particles
        className="absolute inset-0"
        quantity={50}
        color="#1e88e5"
        size={1.2}
        speed={0.2}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-accent/30 bg-blue-accent/10 px-5 py-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-blue-accent" />
          <span className="text-xs font-medium tracking-wider text-blue-light">
            POSTECH TECHNOLOGY HOLDINGS
          </span>
        </div>

        <h1 className="mb-6">
          <TextAnimate
            className="block text-4xl font-black leading-tight tracking-tight text-primary-foreground md:text-6xl lg:text-7xl"
            animation="blurIn"
            by="word"
          >
            기술의 가능성을
          </TextAnimate>
          <TextAnimate
            className="block text-4xl font-black leading-tight tracking-tight text-primary-foreground md:text-6xl lg:text-7xl"
            animation="blurIn"
            by="word"
            delay={0.4}
          >
            미래의 가치로
          </TextAnimate>
        </h1>

        <TextAnimate
          className="mx-auto mb-10 block max-w-2xl text-base leading-relaxed text-slate-400 md:text-lg"
          animation="fadeIn"
          by="word"
          delay={0.8}
        >
          포항연합기술지주는 POSTECH의 우수한 기술력을 기반으로 혁신적인 기술 스타트업을 발굴하고 투자하여 대한민국 기술사업화를 선도합니다.
        </TextAnimate>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <ShimmerButton
            onClick={() =>
              document.querySelector("#portfolio")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            포트폴리오 보기
          </ShimmerButton>
          <button
            onClick={() =>
              document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth" })
            }
            className="rounded-full border border-slate-400/30 px-8 py-3 text-sm font-medium text-slate-400 transition-all hover:border-blue-accent/50 hover:text-primary-foreground"
          >
            투자 문의
          </button>
        </div>
      </div>

      {/* Scroll indicator */}
      <button
        onClick={() =>
          document.querySelector("#about")?.scrollIntoView({ behavior: "smooth" })
        }
        className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce text-slate-400"
        aria-label="아래로 스크롤"
      >
        <ChevronDown size={28} />
      </button>
    </section>
  )
}
