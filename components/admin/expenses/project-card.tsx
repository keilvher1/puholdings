"use client"

import Link from "next/link"
import { CalendarDays, Download, ListChecks, Paperclip, Pencil, Power, RotateCcw, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  daysBetween,
  fileUrl,
  formatPeriod,
  formatRate,
  rateTone,
  todayStr,
  usageRate,
  wonNumber,
} from "@/components/admin/expenses/client-helpers"
import type { ExpenseProject } from "@/lib/expenses"

// 사업·프로젝트 카드 — 한눈에 기간, 총사업비, 집행액·집행률, 증빙 수를 보여 준다.

export const RATE_BAR_CLASS: Record<ReturnType<typeof rateTone>, string> = {
  none: "bg-warm-tan",
  ok: "bg-gold",
  warn: "bg-amber-500",
  over: "bg-destructive",
}

export function RateBar({ rate, className = "" }: { rate: number | null; className?: string }) {
  const tone = rateTone(rate)
  const width = rate === null ? 0 : Math.max(rate > 0 ? 1.5 : 0, Math.min(100, rate))
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-warm-beige ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={rate === null ? undefined : Math.round(Math.min(100, rate))}
    >
      <div className={`h-full rounded-full transition-[width] duration-500 ${RATE_BAR_CLASS[tone]}`} style={{ width: `${width}%` }} />
    </div>
  )
}

function periodBadge(p: ExpenseProject): { text: string; tone: "muted" | "warn" } | null {
  if (!p.end_date) return null
  const today = todayStr()
  if (p.start_date && today < p.start_date) {
    return { text: `시작 전 · ${daysBetween(today, p.start_date)}일 뒤 시작`, tone: "muted" }
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
  const tone = rateTone(rate)
  const remain = typeof p.total_budget === "number" ? p.total_budget - p.spent_total : null
  const badge = periodBadge(p)
  const sub = [p.program_name, p.agency].filter(Boolean).join(" · ")

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md ${
        closed ? "border-warm-tan/70 opacity-80" : "border-warm-tan"
      }`}
    >
      <div className="flex-1 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              closed ? "bg-warm-beige text-text-secondary" : "bg-green-100 text-green-800"
            }`}
          >
            {closed ? "종료" : "진행 중"}
          </span>
          {badge && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                badge.tone === "warn" ? "bg-amber-50 text-amber-800" : "bg-warm-beige/60 text-text-secondary"
              }`}
            >
              {badge.text}
            </span>
          )}
        </div>
        <h3 className="mt-2 text-lg font-bold leading-snug text-dark [word-break:keep-all]">{p.name}</h3>
        {sub && <p className="mt-0.5 text-sm text-text-secondary [word-break:keep-all]">{sub}</p>}
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-text-secondary">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatPeriod(p.start_date, p.end_date)}
        </p>

        <div className="mt-4 rounded-lg bg-warm-beige/35 p-3.5">
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <div>
              <p className="text-[11px] text-text-secondary">집행액</p>
              <p className="text-lg font-bold tabular-nums text-dark">{wonNumber(p.spent_total)}원</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-text-secondary">집행률</p>
              <p
                className={`text-lg font-bold tabular-nums ${
                  tone === "over" ? "text-destructive" : tone === "warn" ? "text-amber-700" : "text-dark"
                }`}
              >
                {formatRate(rate)}
              </p>
            </div>
          </div>
          <RateBar rate={rate} className="mt-2" />
          <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs text-text-secondary">
            <span>
              총사업비{" "}
              {p.total_budget === null ? (
                <button type="button" onClick={onEdit} className="text-gold underline-offset-2 hover:underline">
                  입력하기
                </button>
              ) : (
                <b className="tabular-nums text-dark">{wonNumber(p.total_budget)}원</b>
              )}
            </span>
            {remain !== null && (
              <span className={remain < 0 ? "font-medium text-destructive" : ""}>
                {remain < 0 ? `예산 초과 ${wonNumber(-remain)}원` : `잔액 ${wonNumber(remain)}원`}
              </span>
            )}
            <span>증빙 {p.receipt_count.toLocaleString("ko-KR")}건</span>
          </div>
        </div>

        {p.budget_items.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.budget_items.slice(0, 6).map((b) => (
              <span key={b.name} className="rounded-md border border-warm-tan px-2 py-0.5 text-[11px] text-text-secondary">
                {b.name}
                {typeof b.amount === "number" && <span className="ml-1 tabular-nums text-text-tertiary">{wonNumber(b.amount)}</span>}
              </span>
            ))}
            {p.budget_items.length > 6 && (
              <span className="px-1 py-0.5 text-[11px] text-text-tertiary">외 {p.budget_items.length - 6}개</span>
            )}
          </div>
        )}

        {p.source_files.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5 text-text-tertiary" />
            {p.source_files.map((f) => (
              <a
                key={f.pathname}
                href={fileUrl(f.pathname, { download: true, name: f.name })}
                className="inline-flex max-w-[200px] items-center gap-1 rounded border border-warm-tan px-1.5 py-0.5 text-[11px] text-text-secondary hover:border-gold hover:text-dark"
                title={`${f.name} 내려받기`}
              >
                <span className="truncate">{f.name}</span>
                <Download className="h-3 w-3 shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-warm-tan bg-warm-ivory/40 px-4 py-3">
        {!closed && (
          <Button asChild size="sm">
            <Link href={`/admin/expenses?project_id=${p.id}`} title="이 프로젝트가 미리 선택된 상태로 증빙을 올립니다">
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
          <Button size="sm" variant="ghost" onClick={onToggleStatus} disabled={busy}>
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
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </article>
  )
}
