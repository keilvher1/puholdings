"use client"

import Link from "next/link"
import { Download, ListChecks, Pencil, Power, RotateCcw, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  daysBetween,
  fileUrl,
  formatPeriod,
  todayStr,
  usageRate,
  wonNumber,
} from "@/components/admin/expenses/client-helpers"
import { DotList, Money, RateValue, StatusChip, UsageBar } from "@/components/admin/expenses/ui"
import { cn } from "@/lib/utils"
import type { ExpenseProject } from "@/lib/expenses"

// 사업·프로젝트 카드: 기간, 총사업비, 집행액·집행률, 증빙 수.

// 기존 import 호환용. 새 코드는 ./ui의 UsageBar를 직접 쓴다.
export function RateBar(p: { rate: number | null; className?: string }) {
  return <UsageBar {...p} />
}

function periodBadge(p: ExpenseProject): { text: string; tone: "muted" | "warn" } | null {
  if (!p.end_date) return null
  const today = todayStr()
  if (p.start_date && today < p.start_date) {
    return { text: `시작 전 · D-${daysBetween(today, p.start_date)}`, tone: "muted" }
  }
  const left = daysBetween(today, p.end_date)
  if (left < 0) return { text: "사업 기간 종료", tone: p.status === "active" ? "warn" : "muted" }
  if (left === 0) return { text: "오늘 종료", tone: "warn" }
  return { text: `D-${left}`, tone: left <= 30 ? "warn" : "muted" }
}

export function ProjectCard({
  project: p,
  busy,
  onEdit,
  onToggleStatus,
  onDelete,
}: {
  project: ExpenseProject
  busy: boolean
  onEdit: () => void
  onToggleStatus: () => void
  onDelete: () => void
}) {
  const closed = p.status === "closed"
  const rate = usageRate(p.spent_total, p.total_budget)
  const remain = typeof p.total_budget === "number" ? p.total_budget - p.spent_total : null
  const badge = periodBadge(p)
  const sub = [p.program_name, p.agency].filter(Boolean).join(" · ")
  const shownItems = p.budget_items.slice(0, 6)
  const hiddenItems = p.budget_items.length - shownItems.length

  return (
    <article className={cn("flex flex-col rounded-md border border-warm-tan", closed ? "bg-warm-ivory" : "bg-card")}>
      <div className="flex-1 p-4">
        <div className="flex items-start gap-2">
          <StatusChip status={closed ? "closed" : "active"} className="mt-0.5" />
          <h3 className="min-w-0 text-base font-semibold leading-6 text-dark [word-break:keep-all]">{p.name}</h3>
        </div>
        {sub && <p className="mt-1 text-sm text-text-secondary [word-break:keep-all]">{sub}</p>}
        <p className="mt-0.5 text-sm tabular-nums text-text-secondary">
          <DotList
            items={[
              formatPeriod(p.start_date, p.end_date),
              badge && <span className={badge.tone === "warn" ? "font-medium text-amber-800" : undefined}>{badge.text}</span>,
            ]}
          />
        </p>

        <div className="mt-4 border-t border-warm-tan pt-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs text-text-secondary">집행액</dt>
              <dd className="mt-0.5 text-base">
                <Money value={p.spent_total} unit strong />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-text-secondary">집행률</dt>
              <dd className="mt-0.5 text-base">
                <RateValue rate={rate} />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-text-secondary">총사업비</dt>
              <dd className="mt-0.5 text-base">
                {p.total_budget === null ? (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="rounded-sm text-sm font-medium text-dark underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    입력하기
                  </button>
                ) : (
                  <Money value={p.total_budget} unit />
                )}
              </dd>
            </div>
          </dl>
          <UsageBar rate={rate} className="mt-2" />
          <p className="mt-1.5 text-xs text-text-secondary">
            <DotList
              items={[
                remain !== null &&
                  (remain < 0 ? (
                    <span className="font-medium tabular-nums text-destructive">예산 초과 {wonNumber(-remain)}원</span>
                  ) : (
                    <>
                      잔액 <span className="tabular-nums text-dark">{wonNumber(remain)}원</span>
                    </>
                  )),
                <>
                  증빙 <span className="tabular-nums text-dark">{p.receipt_count.toLocaleString("ko-KR")}</span>건
                </>,
              ]}
            />
          </p>
        </div>

        {(p.budget_items.length > 0 || p.source_files.length > 0) && (
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 border-t border-warm-tan pt-3">
            {p.budget_items.length > 0 && (
              <>
                <dt className="text-xs text-text-secondary">비목</dt>
                <dd className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm leading-relaxed text-text-secondary">
                  {/* 항목 간격으로만 구분한다(구분점이 줄 끝·줄 앞에 남지 않도록). 항목 안에서는 줄을 바꾸지 않는다. */}
                  {shownItems.map((b) => (
                    <span key={b.name} className="whitespace-nowrap">
                      <span className="text-dark">{b.name}</span>
                      {typeof b.amount === "number" && (
                        <>
                          {" "}
                          <Money value={b.amount} tone="muted" />
                        </>
                      )}
                    </span>
                  ))}
                  {hiddenItems > 0 && <span className="whitespace-nowrap">외 {hiddenItems}개</span>}
                </dd>
              </>
            )}
            {p.source_files.length > 0 && (
              <>
                <dt className="text-xs text-text-secondary">첨부</dt>
                <dd className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {p.source_files.map((f) => (
                    <a
                      key={f.pathname}
                      href={fileUrl(f.pathname, { download: true, name: f.name })}
                      className="inline-flex max-w-[240px] items-center gap-1 rounded-sm text-dark underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      title={`${f.name} 내려받기`}
                    >
                      <span className="truncate">{f.name}</span>
                      <Download className="h-3 w-3 shrink-0 text-text-secondary" aria-hidden />
                    </a>
                  ))}
                </dd>
              </>
            )}
          </dl>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-warm-tan px-4 py-2.5">
        {!closed && (
          <Button asChild size="sm">
            <Link href={`/admin/expenses?project_id=${p.id}`} title="이 프로젝트로 증빙 올리기">
              <Upload className="h-3.5 w-3.5" />
              증빙 올리기
            </Link>
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link href={`/admin/expenses/receipts?project_id=${p.id}`}>
            <ListChecks className="h-3.5 w-3.5" />
            증빙 내역
          </Link>
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit} disabled={busy}>
            <Pencil className="h-3.5 w-3.5" />
            수정
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleStatus}
            disabled={busy}
            title={closed ? undefined : "증빙 올리기 목록에서만 제외 · 저장된 증빙은 유지"}
          >
            {closed ? <RotateCcw className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
            {closed ? "재개" : "종료"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            className="text-text-secondary hover:text-destructive"
            aria-label={`${p.name} 삭제`}
            title="삭제"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </article>
  )
}
