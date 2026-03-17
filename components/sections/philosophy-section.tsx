"use client"

import { BlurFade } from "@/components/magicui/blur-fade"
import { BorderBeam } from "@/components/magicui/border-beam"
import { Particles } from "@/components/magicui/particles"

const STEPS = [
  {
    num: "01",
    title: "창업교육 및 동아리 지원",
    description: "창업 경진대회, 창업동아리 운영을 통해 예비창업자를 발굴하고, 특허관리 및 기술이전을 지원합니다.",
  },
  {
    num: "02",
    title: "창업보육센터 입주",
    description: "창업보육센터 입주를 통해 사무공간과 시설을 제공하고, 액셀러레이팅 프로그램으로 사업화를 지원합니다.",
  },
  {
    num: "03",
    title: "벤처투자 및 TIPS/LIPS 추천",
    description: "고유계정 및 투자조합을 통한 직접 투자와 TIPS/LIPS 프로그램 추천으로 성장 자금을 확보합니다.",
  },
  {
    num: "04",
    title: "판로개척 및 EXIT",
    description: "오픈이노베이션, 해외진출, VC/PE/IB 투자 연계로 판로를 개척하고, EXIT을 통해 가치를 실현합니다.",
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
              <span className="block">창업부터 EXIT까지</span>
              <span className="block">함께합니다.</span>
            </h2>
          </BlurFade>
          <BlurFade delay={0.2}>
            <div className="flex items-end lg:justify-end lg:pb-2">
              <p className="max-w-md text-[15px] leading-[1.9] text-text-tertiary [word-break:keep-all]">
                창업교육에서 벤처투자, 오픈이노베이션까지. 내부 역량 기반 자체지원과 네트워크 기반 외부연계로 창업생태계를 구축합니다.
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
              <span className="text-[11px] font-medium tracking-[0.2em] text-gold/70">INTERNAL SUPPORT</span>
              <h4 className="mt-4 text-lg font-bold text-primary-foreground">내부역량 기반 자체지원</h4>
              <p className="mt-3 text-sm leading-[1.8] text-text-tertiary [word-break:keep-all]">
                창업보육센터 운영, 액셀러레이팅 프로그램, 벤처투자, TIPS/LIPS 추천 등 직접 지원합니다.
              </p>
            </div>
          </BlurFade>
          <BlurFade delay={0.6}>
            <div className="group relative overflow-hidden border border-dark-muted/40 p-10 transition-colors hover:border-gold/20 lg:p-12">
              <BorderBeam size={160} duration={12} delay={4} colorFrom="#dbb960" colorTo="#c9a84c" />
              <span className="text-[11px] font-medium tracking-[0.2em] text-gold/70">EXTERNAL NETWORK</span>
              <h4 className="mt-4 text-lg font-bold text-primary-foreground">네트워크 기반 외부연계</h4>
              <p className="mt-3 text-sm leading-[1.8] text-text-tertiary [word-break:keep-all]">
                오픈이노베이션, 판로개척, 해외진출, VC/PE/IB 투자연계, 동문/대기업/해외대학 네트워크를 활용합니다.
              </p>
            </div>
          </BlurFade>
        </div>
      </div>
    </section>
  )
}
