// 포털 홈 본문(WP8, 계획서 4.5.3) — 서버 컴포넌트(훅 없음). 데이터는 app/portal/page.tsx가 세션 tenant_id로 읽어 넘긴다.
//   h1 한 줄(호실 · 창업보육센터 입주기업) → [낼 관리비] 합계 28px · 기한 지남/기한 없음 문장 · 건별 행(상세 링크) · 입금 계좌 + [계좌번호 복사]
//   → 해야 할 일(프로그램 중 행동이 필요한 것만) → 신청할 수 있는 프로그램·결과 기다리는 신청 한 줄 링크 → 문의처.
// 불러오기 실패는 '없음'으로 바꾸지 않고 오류 상태로 보인다(ISS-233).

import Link from "next/link"
import { ChevronRight, CircleCheck, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState, Money, Notice, Section, StatusBadge } from "@/components/saas"
import { PaymentBox } from "@/components/portal/payment-box"
import { billMonth, dateShort, todayKST, won, wonNum } from "@/lib/format"
import { portalBillHref, portalBillsHref } from "@/lib/links"
import { cn } from "@/lib/utils"
import type { BillingBankInfo } from "@/lib/bank-info"
import { billDueText, groupPrograms, summarizeUnpaid, type PortalProgramRow } from "./portal-model"
import type { PortalBillListRow } from "./portal-data"

/** 첫 화면 높이를 지키려고 홈에는 낼 관리비 행을 이만큼만 보이고 나머지는 청구서 화면으로 보낸다 */
const MAX_HOME_ROWS = 3

export interface PortalHomeProps {
  rooms: string[]
  bills: PortalBillListRow[] | null
  programs: PortalProgramRow[] | null
  bank: BillingBankInfo
  phone: string
  today?: string
}

function headline(rooms: string[]): string {
  const where = rooms.length > 0 ? `${rooms.map((r) => `${r}호`).join(", ")} · ` : ""
  return `${where}창업보육센터 입주기업`
}

function PayCard({ bills, bank, today }: { bills: PortalBillListRow[]; bank: BillingBankInfo; today: string }) {
  const s = summarizeUnpaid(bills, today)
  if (s.count === 0) {
    const lastPaid = bills.find((b) => b.status === "paid") ?? null
    return (
      <section aria-labelledby="pay-title" className="rounded-md border border-warm-tan bg-card px-4 py-4 sm:px-5">
        <h2 id="pay-title" className="flex items-center gap-2 text-lg font-semibold text-dark">
          <CircleCheck className="size-5 shrink-0 text-green-800" aria-hidden />
          낼 관리비가 없어요
        </h2>
        <p className="mt-1.5 text-base text-text-secondary [word-break:keep-all]">
          {lastPaid
            ? `최근: ${billMonth(lastPaid.period)} ${won(lastPaid.total_amount)} · ${billDueText(lastPaid, today)}`
            : "아직 발행된 청구서가 없어요."}
        </p>
        {bills.length > 0 && (
          <Button asChild variant="outline" className="mt-3 h-11 w-full text-base hover:bg-warm-beige hover:text-dark sm:w-auto">
            <Link href={portalBillsHref({ view: "all" })}>청구서 보기</Link>
          </Button>
        )}
      </section>
    )
  }

  const shown = s.rows.slice(0, MAX_HOME_ROWS)
  const hidden = s.count - shown.length
  return (
    <section aria-labelledby="pay-title" className="overflow-hidden rounded-md border border-warm-tan bg-card">
      <div className="px-4 pt-4 sm:px-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="pay-title" className="text-base font-semibold text-dark">
            낼 관리비
          </h2>
          <span className="text-base tabular-nums text-text-secondary">{s.count}건</span>
        </div>
        <p className="mt-0.5 whitespace-nowrap text-[28px] leading-tight font-bold tabular-nums text-dark">
          {wonNum(s.total)}
          <span className="ml-0.5 text-xl font-semibold">원</span>
        </p>
        {s.lateSentence && (
          <p className="mt-1.5 flex items-start gap-1.5 text-base font-medium text-red-800 [word-break:keep-all]">
            <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden />
            {s.lateSentence}
          </p>
        )}
        {s.noDueSentence && <p className="mt-1.5 text-[15px] leading-relaxed text-text-secondary [word-break:keep-all]">{s.noDueSentence}</p>}
      </div>
      <ul className="mt-3 border-t border-warm-tan" aria-label="낼 관리비 청구서">
        {shown.map((r) => (
          <li key={r.bill.id} className="border-b border-warm-tan last:border-b-0">
            <Link
              href={portalBillHref(r.bill.id)}
              className="flex min-h-[52px] items-center gap-3 px-4 py-2 hover:bg-warm-beige/60 sm:px-5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium text-dark [word-break:keep-all]">{billMonth(r.bill.period)}</span>
                <span className={cn("block text-sm [word-break:keep-all]", r.pastDue ? "font-medium text-red-800" : "text-text-secondary")}>
                  {r.dueText}
                </span>
              </span>
              <Money value={r.bill.total_amount} className="text-base font-semibold" />
              <ChevronRight className="size-4 shrink-0 text-text-secondary" aria-hidden />
            </Link>
          </li>
        ))}
        {hidden > 0 && (
          <li>
            <Link
              href={portalBillsHref({ view: "unpaid" })}
              className="flex min-h-11 items-center justify-between gap-3 px-4 text-base text-link underline underline-offset-2 hover:bg-warm-beige/60 sm:px-5"
            >
              그 밖에 {hidden}건 더 보기
              <ChevronRight className="size-4 shrink-0" aria-hidden />
            </Link>
          </li>
        )}
      </ul>
      <div className="border-t border-warm-tan px-4 py-4 sm:px-5">
        <PaymentBox bank={bank} />
      </div>
    </section>
  )
}

function ProgramArea({ programs, today }: { programs: PortalProgramRow[] | null; today: string }) {
  if (programs === null) {
    return (
      <Notice tone="warning" title="프로그램을 불러오지 못했어요">
        잠시 뒤 새로고침해 주세요.
      </Notice>
    )
  }
  const g = groupPrograms(programs, today)
  const waiting = g.applied.filter((c) => c.program.application_status === "applied")
  const openNow = g.available.filter((c) => c.badge.domain === "portalProgram" && c.badge.status === "available")
  const soonest = openNow.find((c) => c.program.apply_end)?.program.apply_end ?? null
  const links: { href: string; text: string }[] = []
  if (openNow.length > 0)
    links.push({
      href: "/portal/programs",
      text: `신청할 수 있는 프로그램 ${openNow.length}개${soonest ? ` · 가장 빠른 마감 ${dateShort(soonest, today)}` : ""}`,
    })
  if (waiting.length > 0) links.push({ href: "/portal/programs", text: `결과를 기다리는 신청 ${waiting.length}건` })

  return (
    <div className="space-y-4">
      {g.todo.length > 0 && (
        <Section title="해야 할 일" bodyClassName="p-0" flush>
          <ul className="divide-y divide-warm-tan">
            {g.todo.map((c) => (
              <li key={c.program.id} className="flex flex-col gap-2 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusBadge domain={c.badge.domain} status={c.badge.status} showDefaultDetail={false} />
                    <span className="text-sm whitespace-nowrap text-text-secondary">{c.line.split(" · ").slice(1).join(" · ")}</span>
                  </p>
                  <p className="mt-1 text-base font-medium text-dark [word-break:keep-all]">{c.program.title}</p>
                  {c.program.submission_status === "resubmit_requested" && c.program.feedback && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary [word-break:keep-all]">“{c.program.feedback}”</p>
                  )}
                </div>
                <Button asChild className="h-11 w-full text-base sm:w-auto sm:self-start">
                  <Link href={`/portal/programs/${c.program.id}#submit`}>{c.actionLabel}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {links.length > 0 ? (
        <ul className="overflow-hidden rounded-md border border-warm-tan bg-card" aria-label="프로그램">
          {links.map((l) => (
            <li key={l.text} className="border-b border-warm-tan last:border-b-0">
              <Link href={l.href} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 text-base text-dark hover:bg-warm-beige/60 sm:px-5">
                <span className="min-w-0 [word-break:keep-all]">{l.text}</span>
                <ChevronRight className="size-4 shrink-0 text-text-secondary" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        g.todo.length === 0 && (
          <p className="rounded-md border border-warm-tan bg-card px-4 py-3 text-base text-text-secondary sm:px-5">
            지금 모집 중인 프로그램이 없어요.{" "}
            <Link href="/portal/programs" className="text-link underline underline-offset-2 hover:text-dark">
              프로그램 보기
            </Link>
          </p>
        )
      )}
    </div>
  )
}

export function PortalHome({ rooms, bills, programs, bank, phone, today = todayKST() }: PortalHomeProps) {
  return (
    <div>
      <h1 className="mb-4 text-xl leading-tight font-bold text-dark [word-break:keep-all] sm:mb-6 sm:text-2xl">
        {headline(rooms)}
      </h1>
      <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
        <div className="lg:col-span-3">
          {bills === null ? (
            <EmptyState kind="error" bordered title="청구서를 불러오지 못했어요" description="잠시 뒤 새로고침해 주세요." retryHref="/portal" />
          ) : (
            <PayCard bills={bills} bank={bank} today={today} />
          )}
        </div>
        <div className="space-y-4 lg:col-span-2">
          <ProgramArea programs={programs} today={today} />
          <p className="px-1 text-[15px] leading-relaxed text-text-secondary [word-break:keep-all]">
            도움이 필요하면 창업보육센터{" "}
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="whitespace-nowrap text-link underline underline-offset-2 hover:text-dark">
              {phone}
            </a>{" "}
            ·{" "}
            <Link href="/portal/messenger" className="text-link underline underline-offset-2 hover:text-dark">
              메신저
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
