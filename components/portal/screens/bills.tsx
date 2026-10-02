"use client"

// 포털 청구서 목록 본문(WP8, 계획서 4.5.4). 데이터는 서버 page가 세션 tenant_id로 읽어 넘긴다(클라이언트 조회 없음).
//   위: 낼 관리비가 있으면 "낼 관리비 2건 · 593,934원 [계좌 보기]"(PaymentBox 시트)
//   보기 탭 "낼 것 n / 전체 n"(?view=unpaid|all, 낼 것이 있으면 낼 것이 기본)
//   휴대폰: 행 목록(표 아님 — 가로 스크롤 없음), 행 전체가 상세 링크 + 오른쪽 [PDF](있을 때만)
//   데스크톱: 칸마다 TableCell인 진짜 표(머리글·값 열 일치)

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, FilterTabs, Money, StatusBadge, useUrlState } from "@/components/saas"
import { PaymentBox } from "@/components/portal/payment-box"
import { billMonth, todayKST, won } from "@/lib/format"
import { portalBillHref, portalBillsHref } from "@/lib/links"
import { billBadge } from "@/lib/status"
import { cn } from "@/lib/utils"
import type { BillingBankInfo } from "@/lib/bank-info"
import { billDueText, summarizeUnpaid, type PortalBillRow } from "./portal-model"

export interface PortalBillsRow extends PortalBillRow {
  invoice_pathname: string | null
}

function pdfHref(b: PortalBillsRow): string {
  const name = `청구서_${b.period}.pdf`
  return `/api/file?pathname=${encodeURIComponent(b.invoice_pathname ?? "")}&download=1&name=${encodeURIComponent(name)}`
}

function PdfLink({ bill, className }: { bill: PortalBillsRow; className?: string }) {
  if (!bill.invoice_pathname) return null
  return (
    <a
      href={pdfHref(bill)}
      aria-label={`${billMonth(bill.period)} 청구서 PDF 받기`}
      title="청구서 PDF 받기"
      className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-md text-[#3f3f4e] hover:bg-warm-beige hover:text-dark", className)}
    >
      <FileDown className="size-5" aria-hidden />
    </a>
  )
}

export function PortalBills({ bills, bank, today = todayKST() }: { bills: PortalBillsRow[]; bank: BillingBankInfo; today?: string }) {
  const router = useRouter()
  const unpaid = summarizeUnpaid(bills, today)
  const defaultView = unpaid.count > 0 ? "unpaid" : "all"
  const [rawView, setView] = useUrlState("view", defaultView)
  const view = rawView === "unpaid" || rawView === "all" ? rawView : defaultView
  const unpaidIds = new Set(unpaid.rows.map((r) => r.bill.id))
  const shown = view === "unpaid" ? bills.filter((b) => unpaidIds.has(b.id)) : bills

  if (bills.length === 0) {
    return <EmptyState kind="first-use" bordered title="아직 발행된 청구서가 없어요" description="센터에서 청구서를 발행하면 여기에 보여요." />
  }

  return (
    <div className="space-y-4">
      {unpaid.count > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-warm-tan bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-base text-dark">
            낼 관리비 {unpaid.count}건 · <strong className="font-bold tabular-nums">{won(unpaid.total)}</strong>
            {unpaid.lateSentence && <span className="mt-0.5 block text-sm font-medium text-red-800 [word-break:keep-all]">{unpaid.lateSentence}</span>}
          </p>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="h-11 w-full text-base hover:bg-warm-beige hover:text-dark sm:w-auto">
                계좌 보기
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="app-shell mx-auto w-full max-w-lg gap-0 rounded-t-lg bg-card p-0 [&>button:last-child]:hidden">
              <SheetHeader className="border-b border-warm-tan px-5 py-4">
                <SheetTitle className="text-lg font-semibold text-dark">입금 계좌</SheetTitle>
                <SheetDescription className="text-base text-text-secondary">
                  낼 관리비 {unpaid.count}건 · {won(unpaid.total)}
                </SheetDescription>
              </SheetHeader>
              <div className="px-5 py-4">
                <PaymentBox bank={bank} />
              </div>
              <div className="border-t border-warm-tan px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-right">
                <SheetClose asChild>
                  <Button variant="outline" className="h-11 hover:bg-warm-beige hover:text-dark">
                    닫기
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      )}

      <FilterTabs
        label="청구서 보기"
        value={view}
        onValueChange={setView}
        options={[
          { value: "unpaid", label: "낼 것", count: unpaid.count },
          { value: "all", label: "전체", count: bills.length },
        ]}
      />

      {shown.length === 0 ? (
        <EmptyState
          kind="no-results"
          bordered
          title="낼 관리비가 없어요"
          description="지난 청구서는 ‘전체’에서 볼 수 있어요."
          clearLabel="전체 보기"
          clearHref={portalBillsHref({ view: "all" })}
        />
      ) : (
        <>
          {/* 휴대폰: 행 목록 */}
          <ul className="overflow-hidden rounded-md border border-warm-tan bg-card sm:hidden" aria-label="청구서 목록">
            {shown.map((b) => {
              const badge = billBadge(b, today)
              const late = badge.status === "late" || badge.status === "overdue"
              return (
                <li key={b.id} className="flex items-stretch border-b border-warm-tan last:border-b-0">
                  <Link href={portalBillHref(b.id)} className="flex min-h-16 min-w-0 flex-1 items-center gap-2 py-3 pr-1 pl-4 hover:bg-warm-beige/60">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-base font-medium text-dark [word-break:keep-all]">{billMonth(b.period)}</span>
                        <StatusBadge domain="bill" status={badge.status} detail={null} showDefaultDetail={false} />
                      </span>
                      <span className="mt-1 flex items-baseline justify-between gap-2">
                        <span className={cn("min-w-0 text-sm [word-break:keep-all]", late ? "font-medium text-red-800" : "text-text-secondary")}>
                          {billDueText(b, today)}
                        </span>
                        <Money value={b.total_amount} className="text-base font-semibold" />
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-text-secondary" aria-hidden />
                  </Link>
                  {b.invoice_pathname && (
                    <span className="flex items-center border-l border-warm-tan px-1">
                      <PdfLink bill={b} />
                    </span>
                  )}
                </li>
              )
            })}
          </ul>

          {/* 데스크톱: 표 */}
          <div className="hidden overflow-hidden rounded-md border border-warm-tan bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-warm-beige/60 hover:bg-warm-beige/60">
                  <TableHead className="px-4 text-sm text-[#3f3f4e]">청구월</TableHead>
                  <TableHead className="px-4 text-right text-sm text-[#3f3f4e]">금액</TableHead>
                  <TableHead className="px-4 text-sm text-[#3f3f4e]">납부 기한</TableHead>
                  <TableHead className="px-4 text-sm text-[#3f3f4e]">상태</TableHead>
                  <TableHead className="w-16 px-4 text-center text-sm text-[#3f3f4e]">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((b) => {
                  const badge = billBadge(b, today)
                  const late = badge.status === "late" || badge.status === "overdue"
                  return (
                    <TableRow
                      key={b.id}
                      className="cursor-pointer hover:bg-warm-beige/40"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("a")) return
                        router.push(portalBillHref(b.id))
                      }}
                    >
                      <TableCell className="h-12 px-4 text-[15px]">
                        <Link href={portalBillHref(b.id)} className="font-medium text-dark underline-offset-2 hover:underline">
                          {billMonth(b.period)}
                        </Link>
                      </TableCell>
                      <TableCell className="px-4 text-right text-[15px]">
                        <Money value={b.total_amount} className="font-semibold" />
                      </TableCell>
                      <TableCell className={cn("px-4 text-[15px]", late ? "font-medium text-red-800" : "text-text-secondary")}>{billDueText(b, today)}</TableCell>
                      <TableCell className="px-4">
                        <StatusBadge domain="bill" status={badge.status} detail={null} showDefaultDetail={false} />
                      </TableCell>
                      <TableCell className="px-4 py-0 text-center">
                        {b.invoice_pathname ? <PdfLink bill={b} className="size-9" /> : <span className="text-sm text-text-secondary">없음</span>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
