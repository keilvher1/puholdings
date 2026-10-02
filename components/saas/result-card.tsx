"use client"

// 결과 카드 — 작업한 그 자리(시트·단계 안)에 남는 요약(발행 결과·퇴실 정산·입주 완료). 새로고침해도 다시 볼 수 있게
// 부르는 화면이 서버 데이터로 다시 그린다. 금액은 Money로 오른쪽 정렬. [복사]·[인쇄]는 선택.
//
// 사용 예:
//   <ResultCard
//     title="10월분 청구서 22건을 발행했어요" tone="success"
//     rows={[{ label: "발행", value: "22건" }, { label: "합계", value: 10637510, emphasis: true }, { label: "메일", value: "보내지 않음(메일 꺼짐)" }]}
//     notes={["이메일이 없는 3곳은 PDF를 직접 전달해 주세요"]}
//     nextSteps={[{ label: "PDF 모두 내려받기", href: "/api/admin/billing/bills/download?period=2026-10" }, { label: "받을 돈 보기", href: billsHref() }]}
//     copyText={summaryText} printable
//   />

import type { ReactNode } from "react"
import Link from "next/link"
import { ChevronRight, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { TONE_SURFACE_CLASS, type Tone } from "@/lib/status"
import { CopyButton } from "./copy-button"
import { Money } from "./money"

export interface ResultRow {
  label: ReactNode
  /** 숫자면 금액(Money)으로 그린다. 건수·글자는 문자열로 */
  value: ReactNode | number
  emphasis?: boolean
}

export interface ResultNextStep {
  label: string
  href?: string
  onClick?: () => void
}

export function ResultCard({
  title,
  tone = "success",
  rows,
  notes,
  nextSteps,
  actions,
  copyText,
  printable = false,
  className,
}: {
  title: ReactNode
  tone?: Tone
  rows: ResultRow[]
  notes?: string[]
  nextSteps?: ResultNextStep[]
  actions?: ReactNode
  copyText?: string
  printable?: boolean
  className?: string
}) {
  const head = TONE_SURFACE_CLASS[tone]
  return (
    <section role="status" className={cn("overflow-hidden rounded-md border border-warm-tan bg-card", className)}>
      <div className={cn("border-b px-4 py-3 sm:px-5", head)}>
        <h2 className="text-lg font-semibold leading-snug [word-break:keep-all]">{title}</h2>
      </div>
      <dl className="divide-y divide-warm-tan/70 px-4 sm:px-5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-[15px] text-[#3f3f4e]">{r.label}</dt>
            <dd className={cn("text-right text-[15px] text-dark", r.emphasis && "text-lg font-bold")}>
              {typeof r.value === "number" ? <Money value={r.value} strong={r.emphasis} /> : r.value}
            </dd>
          </div>
        ))}
      </dl>
      {notes && notes.length > 0 && (
        <ul className="list-disc space-y-1 border-t border-warm-tan px-4 py-3 pl-9 text-[15px] leading-relaxed text-dark sm:px-5 sm:pl-10 [word-break:keep-all]">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {((nextSteps && nextSteps.length > 0) || actions || copyText || printable) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-warm-tan bg-warm-ivory/60 px-4 py-3 sm:px-5 print:hidden">
          {nextSteps?.map((s) =>
            s.href ? (
              <Button key={s.label} asChild variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark">
                <Link href={s.href}>
                  {s.label}
                  <ChevronRight aria-hidden />
                </Link>
              </Button>
            ) : (
              <Button key={s.label} type="button" variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark" onClick={s.onClick}>
                {s.label}
              </Button>
            ),
          )}
          {actions}
          {copyText && <CopyButton value={copyText} label="결과 복사" successMessage="결과를 복사했어요" />}
          {printable && (
            <Button type="button" variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark" onClick={() => window.print()}>
              <Printer aria-hidden />
              인쇄
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
