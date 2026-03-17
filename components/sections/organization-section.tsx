"use client"

import { BlurFade } from "@/components/magicui/blur-fade"
import { User, Briefcase, Award } from "lucide-react"

const TEAM_MEMBERS = [
  {
    id: 1,
    name: "이강원",
    role: "사업 기획 총괄",
    credentials: ["전문인력 VC", "창업보육매니저", "기술가치평가사", "기술창업지도사"],
  },
  {
    id: 2,
    name: "김병규",
    role: "투자 / 외부사업",
    credentials: ["투자자산운용사", "재무위험관리사"],
    experience: ["웰컴저축은행", "푸드팡(주) CFO", "스타트업 등"],
  },
  {
    id: 3,
    name: "박진기",
    role: "투자 / 외부사업",
    credentials: ["창업보육전문매니저", "벤처투자분석사"],
    experience: ["조슈아파트너스(AC)", "(주)아트와 CEO", "스타트업 STAFF/PO"],
  },
]

export function OrganizationSection() {
  return (
    <section id="organization" className="relative bg-dark py-28 lg:py-40">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* Header */}
        <div className="mb-16 lg:mb-20">
          <BlurFade delay={0.1}>
            <div className="mb-6 flex items-center gap-4">
              <div className="editorial-rule" />
              <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
                ORGANIZATION
              </span>
            </div>
          </BlurFade>

          <BlurFade delay={0.2}>
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-primary-foreground lg:text-5xl text-balance">
              <span className="block">조직도</span>
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-text-tertiary [word-break:keep-all]">
              포항연합기술지주는 창업 기업의 성장을 함께하는 전문 인력으로 구성되어 있습니다.
            </p>
          </BlurFade>
        </div>

        {/* Organization Chart */}
        <div className="relative">
          {/* CEO/Company Box */}
          <BlurFade delay={0.3}>
            <div className="mx-auto mb-12 max-w-md border border-gold/30 bg-dark-muted p-6 text-center">
              <span className="text-[10px] font-medium tracking-[0.2em] text-gold">
                POHANG UNITED HOLDINGS
              </span>
              <h3 className="mt-2 text-xl font-bold text-primary-foreground">
                (주)포항연합기술지주
              </h3>
            </div>
          </BlurFade>

          {/* Connecting Line */}
          <div className="mx-auto mb-12 h-12 w-px bg-warm-tan/30" />

          {/* Team Members Grid */}
          <div className="grid gap-6 md:grid-cols-3">
            {TEAM_MEMBERS.map((member, i) => (
              <BlurFade key={member.id} delay={0.4 + i * 0.1}>
                <div className="group relative border border-warm-tan/20 bg-dark-muted p-8 transition-all duration-300 hover:border-gold/40">
                  {/* Role Badge */}
                  <div className="mb-6 flex items-center gap-2">
                    <Briefcase size={14} className="text-gold" />
                    <span className="text-[10px] font-medium tracking-[0.15em] text-gold">
                      {member.role.toUpperCase()}
                    </span>
                  </div>

                  {/* Name */}
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/10">
                      <User size={20} className="text-gold" />
                    </div>
                    <h4 className="text-xl font-bold text-primary-foreground">
                      {member.name}
                    </h4>
                  </div>

                  {/* Credentials */}
                  <div className="mt-6 border-t border-warm-tan/20 pt-6">
                    <div className="flex items-start gap-2">
                      <Award size={14} className="mt-0.5 shrink-0 text-gold/70" />
                      <div>
                        <p className="text-[10px] font-medium tracking-wider text-text-tertiary">
                          자격 및 전문성
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {member.credentials.map((cred) => (
                            <span
                              key={cred}
                              className="inline-block bg-gold/10 px-2 py-1 text-[10px] font-medium text-gold/90"
                            >
                              {cred}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Experience (if available) */}
                  {member.experience && (
                    <div className="mt-4">
                      <p className="text-[10px] font-medium tracking-wider text-text-tertiary">
                        주요 경력
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-text-tertiary">
                        {member.experience.join(" · ")}
                      </p>
                    </div>
                  )}
                </div>
              </BlurFade>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
