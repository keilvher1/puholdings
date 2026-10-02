"use client"

import Link from "next/link"
import { ArrowLeft, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Notice, useUrlState } from "@/components/saas"
import { fileUrl } from "@/components/admin/expenses/client-helpers"
import { buildUsageRows } from "@/components/admin/expenses/ledger-check"
import { date as fullDate, dateShort, wonNum } from "@/lib/format"
import { receiptsHref } from "@/lib/links"
import { DOC_TYPE_LABELS, type ExpenseProject, type ExpenseReceipt } from "@/lib/expenses"
import { cn } from "@/lib/utils"

// 증빙 인쇄 화면(계획서 4.2.6 L-7). 1쪽: 지출 목록표(비목별 소계, 머리말에 프로젝트·기간·출력일),
// 2쪽부터: 증빙 1건마다 요약 표 + 원본 이미지(한 쪽에 1·2·4장). PDF 원본은 이미지로 넣을 수 없어 안내만 한다.
// 사이드바·버튼은 print: 스타일로 숨긴다(관리자 레이아웃의 사이드바는 이미 print:hidden).

const LAYOUTS = ["1", "2", "4"] as const
type Layout = (typeof LAYOUTS)[number]

function isImage(r: ExpenseReceipt): boolean {
  return !!r.file_pathname && (r.file_type ?? "").startsWith("image/")
}
function isPdf(r: ExpenseReceipt): boolean {
  return !!r.file_pathname && ((r.file_type ?? "") === "application/pdf" || /\.pdf$/i.test(r.file_name))
}

function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}

export function ReceiptPrint({
  project,
  receipts,
  from,
  to,
  printedOn,
}: {
  project: ExpenseProject | null
  receipts: ExpenseReceipt[]
  from: string | null
  to: string | null
  printedOn: string
}) {
  const [layoutRaw, setLayout] = useUrlState("layout", "2")
  const layout: Layout = (LAYOUTS as readonly string[]).includes(layoutRaw) ? (layoutRaw as Layout) : "2"
  const perPage = Number(layout)

  // 거래일 오름차순(정산 서류 관례)
  const sorted = [...receipts].sort((a, b) => (a.issue_date === b.issue_date ? a.id - b.id : a.issue_date < b.issue_date ? -1 : 1))
  const total = sorted.reduce((s, r) => s + (typeof r.total_amount === "number" ? r.total_amount : 0), 0)
  const images = sorted.filter(isImage)
  const pdfs = sorted.filter(isPdf)
  const noFile = sorted.filter((r) => !r.file_pathname)
  const usage = project ? buildUsageRows(project, sorted) : []
  const period = from || to ? `${from ? fullDate(from) : "처음"} ~ ${to ? fullDate(to) : "현재"}` : "전체 기간"
  const backHref = receiptsHref({ project_id: project?.id ?? null, from, to })

  return (
    <div className="mx-auto max-w-[210mm] print:max-w-none">
      {/* 화면 전용 도구 줄 */}
      <div className="mb-4 grid gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className="hover:bg-warm-beige">
            <Link href={backHref}>
              <ArrowLeft className="size-4" aria-hidden />
              증빙 내역으로
            </Link>
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span className="text-[15px] text-dark" id="print-layout-label">
              한 쪽에 원본
            </span>
            <RadioGroup
              value={layout}
              onValueChange={(v) => setLayout(v)}
              aria-labelledby="print-layout-label"
              className="flex gap-3"
            >
              {LAYOUTS.map((l) => (
                <div key={l} className="flex items-center gap-1.5">
                  <RadioGroupItem id={`layout-${l}`} value={l} />
                  <Label htmlFor={`layout-${l}`} className="text-[15px] font-normal">
                    {l}장
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <Button type="button" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden />
              인쇄하기
            </Button>
          </div>
        </div>
        {!project && (
          <Notice>프로젝트를 고르지 않아 모든 프로젝트 증빙이 들어가요. 정산용이면 증빙 내역에서 프로젝트를 먼저 골라 주세요.</Notice>
        )}
        {pdfs.length > 0 && (
          <Notice tone="warning">
            PDF 원본 {pdfs.length}건은 이 화면에 넣을 수 없어요. 원본 zip으로 받아 함께 인쇄해 주세요(증빙 내역 › 내려받기 › 지금 조건으로 원본 zip).
          </Notice>
        )}
      </div>

      {/* 1쪽: 지출 목록표 */}
      <section className="rounded-md border border-warm-tan bg-card p-4 text-dark sm:p-6 print:rounded-none print:border-0 print:p-0">
        <header className="mb-4 border-b border-dark pb-3">
          <h1 className="text-2xl font-bold">지출 증빙 목록</h1>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[15px]">
            <dt className="text-text-muted-strong">프로젝트</dt>
            <dd>{project ? project.name : "전체 프로젝트"}</dd>
            {project?.program_name && (
              <>
                <dt className="text-text-muted-strong">지원사업</dt>
                <dd>{project.program_name}</dd>
              </>
            )}
            <dt className="text-text-muted-strong">거래 기간</dt>
            <dd>{period}</dd>
            <dt className="text-text-muted-strong">출력일</dt>
            <dd>{fullDate(printedOn)}</dd>
          </dl>
        </header>

        <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[640px] border-collapse text-sm print:min-w-0">
          <thead>
            <tr className="border-y border-dark text-left">
              <th className="whitespace-nowrap py-1.5 pr-2 font-semibold">번호</th>
              <th className="py-1.5 pr-2 font-semibold">거래일자</th>
              <th className="py-1.5 pr-2 font-semibold">문서 종류</th>
              <th className="py-1.5 pr-2 font-semibold">거래처</th>
              <th className="py-1.5 pr-2 font-semibold">비목</th>
              <th className="py-1.5 pr-2 font-semibold">적요</th>
              <th className="py-1.5 text-right font-semibold">합계(원)</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.id} className="border-b border-warm-tan align-top [break-inside:avoid]">
                <td className="py-1 pr-2 tabular-nums">{i + 1}</td>
                <td className="whitespace-nowrap py-1 pr-2 tabular-nums">{dateShort(r.issue_date)}</td>
                <td className="whitespace-nowrap py-1 pr-2">{DOC_TYPE_LABELS[r.doc_type] ?? r.doc_type}</td>
                <td className="py-1 pr-2">{r.vendor_name}</td>
                <td className="py-1 pr-2">{r.budget_item || "미지정"}</td>
                <td className="py-1 pr-2">{r.purpose}</td>
                <td className="py-1 text-right tabular-nums">{wonNum(r.total_amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-dark font-semibold">
              <td colSpan={6} className="py-1.5">
                합계 {sorted.length.toLocaleString("ko-KR")}건
              </td>
              <td className="py-1.5 text-right tabular-nums">{wonNum(total)}</td>
            </tr>
          </tfoot>
        </table>
        </div>

        {usage.length > 0 && (
          <>
            <h2 className="mt-6 text-lg font-semibold">비목별 소계</h2>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-dark text-left">
                  <th className="py-1.5 pr-2 font-semibold">비목</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">건수</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">예산</th>
                  <th className="py-1.5 text-right font-semibold">이 기간 집행액</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.key} className="border-b border-warm-tan">
                    <td className="py-1 pr-2">{u.name}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{u.count}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{u.budget === null ? "-" : wonNum(u.budget)}</td>
                    <td className="py-1 text-right tabular-nums">{wonNum(u.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {(pdfs.length > 0 || noFile.length > 0) && (
          <p className="mt-4 text-sm text-text-muted-strong [word-break:keep-all]">
            {pdfs.length > 0 && `PDF 원본 ${pdfs.length}건은 따로 인쇄해 붙여요. `}
            {noFile.length > 0 && `원본 없이 직접 등록한 인건비 ${noFile.length}건은 목록에만 있어요.`}
          </p>
        )}
      </section>

      {/* 2쪽부터: 원본 이미지 모아찍기 */}
      {chunk(images, perPage).map((group, gi) => (
        <section
          key={gi}
          className={cn(
            "mt-6 grid gap-4 [break-before:page] print:mt-0",
            perPage === 4 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {group.map((r) => (
            <figure key={r.id} className="flex flex-col rounded-md border border-warm-tan bg-card p-3 [break-inside:avoid] print:rounded-none">
              <figcaption className="mb-2 grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                <span className="text-text-muted-strong">거래</span>
                <span>
                  {dateShort(r.issue_date)} · {r.vendor_name} · <b className="tabular-nums">{wonNum(r.total_amount)}원</b>
                </span>
                <span className="text-text-muted-strong">비목·적요</span>
                <span>
                  {r.budget_item || "미지정"}
                  {r.purpose ? ` · ${r.purpose}` : ""}
                </span>
              </figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl(r.file_pathname!)}
                alt={`${r.vendor_name} ${dateShort(r.issue_date)} 원본`}
                className={cn(
                  "mx-auto w-auto max-w-full object-contain",
                  perPage === 1 ? "max-h-[220mm]" : perPage === 2 ? "max-h-[105mm]" : "max-h-[95mm]",
                )}
              />
            </figure>
          ))}
        </section>
      ))}
    </div>
  )
}
