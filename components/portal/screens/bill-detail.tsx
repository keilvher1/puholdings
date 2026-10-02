"use client"

// 포털 청구서 상세 본문(WP8, 계획서 4.5.5). 데이터는 서버 page가 세션 tenant_id로 읽어 넘긴다.
//   ← 청구서 목록 / h1 "2026년 9월분 관리비" + 상태 배지
//   (기한 지남) 행동 문장 Notice → 금액 상자(낼 금액 28px · 기한) + 입금 계좌(계좌번호만 복사·금액 복사)
//   → 기간 한 줄 → 항목(describeBillLine) → 합계·공급가액/부가세 → 지난달 비교 한 줄 → 문서(PDF·없음 안내·화면 인쇄) → 문의
// 정정 중 청구서는 PortalBillCorrecting(안내 문장만, 금액·항목 없음). 합계는 bills.total_amount 그대로(다시 계산하지 않음).

import Link from "next/link"
import { ArrowLeft, CircleCheck, Download, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Money, Notice, PageHeader, StatusBadge } from "@/components/saas"
import { PaymentBox } from "@/components/portal/payment-box"
import { BillLineList } from "@/components/portal/bill-line-list"
import { billMonth, billMonthShort, dateShort, due, month, toNumber, todayKST, won } from "@/lib/format"
import { usageMonthOf } from "@/lib/bill-display"
import { billBadge } from "@/lib/status"
import { portalBillsHref } from "@/lib/links"
import { PORTAL_BILLS_HELP } from "@/lib/help/portal"
import type { BillingBankInfo } from "@/lib/bank-info"
import { NO_DUE_SENTENCE, isPastDueState, monthDay, type PreviousCompare } from "./portal-model"
import { receivableState } from "@/lib/receivables"
import type { PortalBillDetail, PortalBillLine } from "./portal-data"

function BackLink() {
  return (
    <Link
      href={portalBillsHref()}
      className="-ml-1 mb-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-base text-link underline underline-offset-2 hover:text-dark print:hidden"
    >
      <ArrowLeft className="size-4" aria-hidden />
      청구서 목록
    </Link>
  )
}

function tel(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`
}

function Inquiry({ phone }: { phone: string }) {
  return (
    <p className="text-[15px] leading-relaxed text-text-secondary [word-break:keep-all] print:hidden">
      이 청구서에 대해 묻기 ·{" "}
      <a href={tel(phone)} className="whitespace-nowrap text-link underline underline-offset-2 hover:text-dark">
        {phone}
      </a>{" "}
      ·{" "}
      <Link href="/portal/messenger" className="text-link underline underline-offset-2 hover:text-dark">
        메신저
      </Link>
    </p>
  )
}

/** 사용월 이름: 올해면 "8월", 다른 해면 "2025년 12월" */
function usageName(period: string, today: string): string {
  const u = usageMonthOf(period)
  return u.slice(0, 4) === today.slice(0, 4) ? `${Number(u.slice(5, 7))}월` : month(u)
}

export function PortalBillDetailView({
  bill,
  lines,
  previous,
  bank,
  phone,
  today = todayKST(),
}: {
  bill: PortalBillDetail
  lines: PortalBillLine[]
  previous: PreviousCompare | null
  bank: BillingBankInfo
  phone: string
  today?: string
}) {
  const badge = billBadge(bill, today)
  const state = receivableState({ status: bill.status, due_date: bill.due_date, issued_at: bill.issued_at }, today)
  const paid = bill.status === "paid"
  const pastDue = isPastDueState(state)
  const hasElec = lines.some((l) => l.line_type === "elec_area" || l.line_type === "elec_metered")
  const supply = toNumber(bill.supply_amount) ?? 0
  const vat = toNumber(bill.vat_amount) ?? 0
  const title = `${billMonth(bill.period)} 관리비`
  const pdfName = `청구서_${bill.period}.pdf`

  return (
    <div className="space-y-4">
      <div>
        <BackLink />
        <PageHeader title={title} help={PORTAL_BILLS_HELP} helpContact={`창업보육센터 ${phone}`} className="mb-0">
          <div className="mt-2">
            <StatusBadge domain="bill" status={badge.status} detail={badge.detail} />
          </div>
        </PageHeader>
      </div>

      {pastDue && (
        <Notice tone="danger">
          {bill.due_date ? `납부 기한(${monthDay(bill.due_date, today)})이 ${state.days ?? 1}일 지났어요.` : "납부 기한이 지났어요."} 아래 계좌로 입금해 주세요.
          이미 입금했다면 확인까지 시간이 걸릴 수 있어요. 궁금한 점은{" "}
          <a href={tel(phone)} className="whitespace-nowrap underline underline-offset-2">
            {phone}
          </a>
          으로 연락해 주세요.
        </Notice>
      )}

      <section aria-labelledby="amount-title" className="overflow-hidden rounded-md border border-warm-tan bg-card">
        <div className="px-4 py-4 sm:px-5">
          <p id="amount-title" className="text-base font-semibold text-dark">
            {paid ? "낸 금액" : "낼 금액"}
          </p>
          <p className="mt-0.5 whitespace-nowrap text-[28px] leading-tight font-bold tabular-nums text-dark">{won(bill.total_amount)}</p>
          {paid ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-base text-green-800">
              <CircleCheck className="mt-1 size-4 shrink-0" aria-hidden />
              {bill.paid_at ? `${dateShort(bill.paid_at, today)}에 납부가 확인됐어요` : "납부가 확인됐어요"}
            </p>
          ) : bill.due_date ? (
            <p className={pastDue ? "mt-1.5 text-base font-medium text-red-800" : "mt-1.5 text-base text-dark"}>{due(bill.due_date, today)}</p>
          ) : (
            <p className="mt-1.5 text-[15px] leading-relaxed text-text-secondary [word-break:keep-all]">{NO_DUE_SENTENCE}</p>
          )}
        </div>
        <div className="border-t border-warm-tan px-4 py-4 sm:px-5 print:hidden">
          {paid ? <PaymentBox bank={bank} collapsible defaultOpen={false} showNote={false} /> : <PaymentBox bank={bank} amount={bill.total_amount} />}
        </div>
      </section>

      <p className="text-base text-dark [word-break:keep-all]">
        {hasElec
          ? `임대료·관리비는 ${billMonthShort(bill.period, today)}, 전기료는 ${usageName(bill.period, today)} 사용분이에요.`
          : `${billMonthShort(bill.period, today)} 임대료·관리비예요.`}
      </p>

      <section aria-labelledby="lines-title" className="overflow-hidden rounded-md border border-warm-tan bg-card">
        <h2 id="lines-title" className="border-b border-warm-tan px-4 py-3 text-lg font-semibold text-dark sm:px-5">
          항목
        </h2>
        <div className="px-4 sm:px-2">
          <BillLineList lines={lines} />
        </div>
        <div className="border-t border-warm-tan bg-warm-beige/40 px-4 py-3 sm:px-5">
          <p className="flex items-baseline justify-between gap-3 text-lg font-bold text-dark">
            <span>합계</span>
            <Money value={bill.total_amount} className="text-xl font-bold" />
          </p>
          {supply > 0 && (
            <p className="mt-0.5 text-sm text-text-secondary [word-break:keep-all]">
              임대료·관리비 공급가액 {won(supply)} · 부가세 {won(vat)}
            </p>
          )}
        </div>
      </section>

      {previous && (
        <div className="rounded-md border border-warm-tan bg-card px-4 py-3 sm:px-5">
          <p className="text-base text-dark [word-break:keep-all]">{previous.sentence}</p>
          {previous.groups.length > 0 && (
            <details className="mt-1 text-[15px]">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-link underline underline-offset-2 hover:text-dark sm:min-h-8">
                항목별로 비교하기
              </summary>
              <table className="mt-1 w-full text-[15px]">
                <caption className="sr-only">항목별 금액 비교</caption>
                <thead>
                  <tr className="text-left text-sm text-[#3f3f4e]">
                    <th scope="col" className="py-1 font-medium">
                      항목
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      {previous.consecutive ? "지난달" : billMonthShort(previous.period, today)}
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      이번
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      차이
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {previous.groups.map((g) => (
                    <tr key={g.group} className="border-t border-warm-tan">
                      <th scope="row" className="py-1.5 text-left font-normal text-dark">
                        {g.label}
                      </th>
                      <td className="py-1.5 text-right">
                        <Money value={g.previous} unit="none" />
                      </td>
                      <td className="py-1.5 text-right">
                        <Money value={g.current} unit="none" />
                      </td>
                      <td className="py-1.5 text-right">
                        <Money value={g.diff} unit="none" tone={g.diff === 0 ? "muted" : "default"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center print:hidden">
        {bill.invoice_pathname ? (
          <Button asChild variant="outline" className="h-11 w-full text-base hover:bg-warm-beige hover:text-dark sm:w-auto">
            <a href={`/api/file?pathname=${encodeURIComponent(bill.invoice_pathname)}&download=1&name=${encodeURIComponent(pdfName)}`}>
              <Download aria-hidden />
              청구서 PDF 받기
            </a>
          </Button>
        ) : (
          <p className="text-[15px] text-text-secondary [word-break:keep-all]">PDF 파일이 아직 없어요. 필요하면 센터에 요청해 주세요.</p>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hidden text-[#3f3f4e] hover:bg-warm-beige hover:text-dark sm:inline-flex"
          onClick={() => window.print()}
        >
          <Printer aria-hidden />
          화면 인쇄
        </Button>
      </div>

      <Inquiry phone={phone} />
    </div>
  )
}

/** 정정 중(발행했다가 센터가 되돌린) 청구서 — 안내 문장만, 금액·항목은 보이지 않는다 */
export function PortalBillCorrecting({ period, phone }: { period: string; phone: string }) {
  return (
    <div className="space-y-4">
      <div>
        <BackLink />
        <h1 className="text-2xl leading-tight font-bold text-dark">{billMonth(period)} 관리비</h1>
      </div>
      <Notice
        tone="info"
        title="이 청구서는 센터에서 고치는 중이에요"
        action={
          <Button asChild variant="outline" className="h-11 hover:bg-warm-beige hover:text-dark">
            <Link href={portalBillsHref({ view: "all" })}>청구서 목록</Link>
          </Button>
        }
      >
        다시 발행되면 여기서 볼 수 있어요.
      </Notice>
      <Inquiry phone={phone} />
    </div>
  )
}
