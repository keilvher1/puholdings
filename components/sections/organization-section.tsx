"use client"

import { BlurFade } from "@/components/magicui/blur-fade"

const TEAM_MEMBERS = [
  {
    id: 1,
    name: "이강원",
    role: "사업 기획 총괄",
    credentials: ["전문인력 VC", "창업보육매니저", "기술가치평가사", "기술창업지도사"],
    experience: null,
  },
  {
    id: 2,
    name: "김병규",
    role: "투자 / 외부사업",
    credentials: ["투자자산운용사", "재무위험관리사"],
    experience: "웰컴저축은행 · 푸드팡(주) CFO · 스타트업 등",
  },
  {
    id: 3,
    name: "박진기",
    role: "투자 / 외부사업",
    credentials: ["창업보육전문매니저", "벤처투자분석사"],
    experience: "조슈아파트너스(AC) · (주)아트와 CEO · 스타트업 STAFF/PO",
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
              구성원
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-text-tertiary [word-break:keep-all]">
              창업 기업의 성장을 함께하는 전문 인력
            </p>
          </BlurFade>
        </div>

        {/* Team Members */}
        <div className="grid gap-px bg-warm-tan/10 md:grid-cols-3">
          {TEAM_MEMBERS.map((member, i) => (
            <BlurFade key={member.id} delay={0.2 + i * 0.08}>
              <div className="flex h-full min-h-[320px] flex-col bg-dark-muted p-8 lg:p-10">
                {/* Role */}
                <p className="text-[11px] font-medium tracking-[0.1em] text-gold">
                  {member.role}
                </p>

                {/* Name */}
                <h4 className="mt-4 text-2xl font-bold tracking-tight text-primary-foreground">
                  {member.name}
                </h4>

                {/* Divider */}
                <div className="mt-6 h-px w-12 bg-warm-tan/30" />

                {/* Credentials */}
                <div className="mt-6">
                  <p className="text-[10px] font-medium tracking-wider text-text-tertiary/70">
                    자격
                  </p>
                  <ul className="mt-2 space-y-1">
                    {member.credentials.map((cred) => (
                      <li
                        key={cred}
                        className="text-sm text-text-tertiary"
                      >
                        {cred}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Experience */}
                <div className="mt-auto pt-6">
                  {member.experience ? (
                    <>
                      <p className="text-[10px] font-medium tracking-wider text-text-tertiary/70">
                        경력
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-text-tertiary [word-break:keep-all]">
                        {member.experience}
                      </p>
                    </>
                  ) : (
                    <div className="h-[52px]" />
                  )}
                </div>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  )
}
