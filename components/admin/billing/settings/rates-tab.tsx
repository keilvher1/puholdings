"use client"

// 기준 정보 > 단가·기본값(읽기 위주) — 진행 중 계약의 평당 임대료·관리비를 단가별로 세어 보이고, 규칙 문장·전기료 기본값·입금 계좌를 한곳에 둔다.
// 값을 고치는 곳은 계약 시트(행별)와 월 마감 2단계(전기료)다. 단가 일괄 변경·적용 시작일은 이번 범위 밖(계획서 5장).

import Link from "next/link"
import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState, Section } from "@/components/saas"
import { num, won } from "@/lib/format"
import { billingCloseHref } from "@/lib/links"
import type { RateGroup, RatesSummary } from "./rates-data"
import { MGMT_RULE_TEXT, RENT_RULE_TEXT } from "./rate-rules"

export function RatesTab({
  rates,
  bankText,
  supportContact,
  onShowContracts,
}: {
  rates: RatesSummary | null
  bankText: string | null
  supportContact: string | null
  onShowContracts: (filter: { rent?: string; mgmt?: string }) => void
}) {
  if (!rates) {
    return (
      <EmptyState
        kind="error"
        title="단가 요약을 불러오지 못했어요"
        description="인터넷 연결을 확인하고 다시 시도해 주세요. 계약 탭에서 계약별 단가는 볼 수 있어요."
        retryHref="/admin/billing/settings"
        bordered
      />
    )
  }
  const lp = rates.latestPeriod
  const usage = lp ? `${Number(lp.usageMonth.slice(5))}월 사용분` : null
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section
        title="평당 임대료"
        description={`진행 중 계약 ${rates.activeCount}건 기준이에요. 월 임대료 = 부과 면적 × 평당 임대료`}
      >
        <RateList groups={rates.rent} unit="평당" onShow={(v) => onShowContracts({ rent: String(v) })} />
        <Rule>{RENT_RULE_TEXT}</Rule>
      </Section>

      <Section title="관리비" description="계약마다 매달 같은 금액(정액)을 청구해요">
        <RateList groups={rates.mgmt} unit="월" onShow={(v) => onShowContracts({ mgmt: String(v) })} />
        <Rule>{MGMT_RULE_TEXT}. 입주·퇴실한 달을 날짜만큼(일할) 청구하면 관리비도 날짜만큼 줄어요</Rule>
      </Section>

      <Section title="전기료 기본값" description="실제 값은 매달 월 마감 2단계에서 넣고 확정해요">
        <dl className="divide-y divide-warm-tan/70">
          <Row label="공장동 kWh 단가">
            한전 고지서 사용단가 × 1.1
            <span className="block text-[15px] text-text-secondary">
              {lp?.kwhUnitPrice != null ? `최근 적용 ${won(lp.kwhUnitPrice)}(${usage})` : "아직 적용한 달이 없어요"}
            </span>
          </Row>
          <Row label="면적 배분율">
            {lp?.areaRatio != null ? `${num(lp.areaRatio * 100, 0)}%` : "70%(기본값)"}
            <span className="block text-[15px] text-text-secondary">공장동 몫을 뺀 전기료 중 사무실 기업이 면적만큼 나눠 내는 비율이에요. 나머지는 센터가 내요</span>
          </Row>
          {lp?.per10Billed != null && (
            <Row label="10평당 전기료">
              {won(lp.per10Billed)}
              <span className="block text-[15px] text-text-secondary">{usage} 확정값이에요</span>
            </Row>
          )}
        </dl>
        <div className="mt-3">
          <Button asChild variant="outline" size="sm" className="hover:bg-warm-beige">
            <Link href={billingCloseHref(null, 2)}>
              월 마감 2단계 열기
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        </div>
      </Section>

      <Section title="입금 계좌" description="PDF 청구서(메일 첨부)·포털에 이렇게 찍혀요">
        {bankText ? (
          <p className="whitespace-pre-line rounded-md border border-warm-tan bg-warm-ivory px-3 py-2.5 text-base text-dark">{bankText}</p>
        ) : (
          <p className="text-base text-text-secondary">입금 계좌 정보가 없어요.</p>
        )}
        <p className="mt-3 text-[15px] leading-relaxed text-text-secondary [word-break:keep-all]">
          이 화면에서는 바꿀 수 없어요.
          {supportContact ? ` 바꿔야 하면 ${supportContact}에게 알려 주세요.` : ""}
        </p>
      </Section>
    </div>
  )
}

function RateList({ groups, unit, onShow }: { groups: RateGroup[]; unit: "평당" | "월"; onShow: (value: number) => void }) {
  if (groups.length === 0) return <p className="text-base text-text-secondary">진행 중인 계약이 없어요.</p>
  return (
    <ul className="divide-y divide-warm-tan/70">
      {groups.map((g) => (
        <li key={g.value} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
          <p className="min-w-0 text-base text-dark">
            <span className="font-semibold tabular-nums">{won(g.value)}</span>
            {g.building && <span className="text-text-secondary">({g.building})</span>}
            <span className="ml-2 tabular-nums text-text-secondary">{g.count}개 계약</span>
          </p>
          <button
            type="button"
            onClick={() => onShow(g.value)}
            className="inline-flex min-h-8 items-center gap-0.5 text-[15px] text-link underline underline-offset-2 hover:text-dark"
            aria-label={`이 단가 쓰는 계약 보기(${unit === "평당" ? "평당 임대료" : "관리비"} ${won(g.value)})`}
          >
            이 단가 쓰는 계약 보기
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  )
}

function Rule({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-md bg-warm-beige px-3 py-2 text-[15px] leading-relaxed text-[#3f3f4e] [word-break:keep-all]">
      <span className="font-semibold">규칙</span> · {children}
    </p>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-[15px] font-medium text-[#3f3f4e]">{label}</dt>
      <dd className="text-base text-dark tabular-nums [word-break:keep-all]">{children}</dd>
    </div>
  )
}
