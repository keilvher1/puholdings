"use client"

import Link from "next/link"
import { CircleAlert, Download, ListChecks, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RowActions, ToneBadge } from "@/components/saas"
import { daysBetween, fileUrl, todayStr, usageRate, wonNumber } from "@/components/admin/expenses/client-helpers"
import { Money, RateValue, UsageBar } from "@/components/admin/expenses/ui"
import { formatItemRate, overBudgetItems } from "@/components/admin/expenses/ledger-check"
import { expensesHref, receiptsHref } from "@/lib/links"
import { normalizeBudgetName, type ExpenseProject } from "@/lib/expenses"
import { cn } from "@/lib/utils"
import { date as formatDate } from "@/lib/format"

// 사업 기간 — 날짜 표기는 lib/format 하나로("2026. 6. 1.(월) ~ 2026. 11. 30.(월)")
function periodText(start: string | null, end: string | null): string {
  if (!start && !end) return "기간 미입력"
  return `${start ? formatDate(start) : "시작일 미정"} ~ ${end ? formatDate(end) : "종료일 미정"}`
}

// 사업·프로젝트 카드: 기간, 집행액·집행률·총사업비, 비목 초과(K-1), 비목 예산, 첨부.
// 버튼은 주 [증빙 올리기] + 보조 [증빙 내역] + ⋯(수정·종료/재개·삭제)(K-2). 종료된 프로젝트는 [증빙 내역]만 주 버튼.
// 비목 초과는 listProjects의 spent_by_item(장부 비목별 집행 표와 같은 숫자)으로 계산하고, 누르면 장부의 그 비목 보기로 간다.

// 기존 import 호환용. 새 코드는 ./ui의 UsageBar를 직접 쓴다.
export function RateBar(p: { rate: number | null; className?: string }) {
  return <UsageBar {...p} />
}

function periodBadge(p: ExpenseProject): { text: string; tone: "muted" | "warn" } | null {
  if (!p.end_date) return null
  const today = todayStr()
  if (p.start_date && today < p.start_date) {
    return { text: `시작 전 · ${daysBetween(today, p.start_date)}일 남음`, tone: "muted" }
  }
  const left = daysBetween(today, p.end_date)
  if (left < 0) return { text: "사업 기간 끝남", tone: p.status === "active" ? "warn" : "muted" }
  if (left === 0) return { text: "오늘 끝나요", tone: "warn" }
  return { text: `끝나기까지 ${left}일`, tone: left <= 30 ? "warn" : "muted" }
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
  const over = overBudgetItems(p)

  return (
    <article className={cn("flex flex-col rounded-md border border-warm-tan", closed ? "bg-warm-ivory" : "bg-card")}>
      <div className="flex-1 p-4">
        <div className="flex items-start gap-2">
          {closed && <ToneBadge tone="neutral" className="mt-0.5">종료</ToneBadge>}
          <h3 className="min-w-0 text-lg font-semibold leading-6 text-dark [word-break:keep-all]">{p.name}</h3>
        </div>
        {sub && <p className="mt-1 text-sm text-text-secondary [word-break:keep-all]">{sub}</p>}
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-sm tabular-nums text-text-secondary">
          <span>{periodText(p.start_date, p.end_date)}</span>
          {badge && <span className={badge.tone === "warn" ? "font-medium text-amber-800" : undefined}>· {badge.text}</span>}
        </p>

        <div className="mt-4 border-t border-warm-tan pt-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-sm text-text-secondary">집행액</dt>
              <dd className="mt-0.5 text-base">
                <Money value={p.spent_total} unit strong />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-text-secondary">집행률</dt>
              <dd className="mt-0.5 text-base">
                <RateValue rate={rate} />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-text-secondary">총사업비</dt>
              <dd className="mt-0.5 text-base">
                {p.total_budget === null ? (
                  <button type="button" onClick={onEdit} className="min-h-8 rounded-sm text-[15px] font-medium text-link underline underline-offset-2">
                    입력하기
                  </button>
                ) : (
                  <Money value={p.total_budget} unit />
                )}
              </dd>
            </div>
          </dl>
          <UsageBar rate={rate} className="mt-2" />
          <p className="mt-1.5 flex flex-wrap gap-x-3 text-sm text-text-secondary">
            {remain !== null &&
              (remain < 0 ? (
                <span className="font-medium tabular-nums text-red-800">예산 초과 {wonNumber(-remain)}원</span>
              ) : (
                <span>
                  잔액 <span className="tabular-nums text-dark">{wonNumber(remain)}원</span>
                </span>
              ))}
            <span>
              증빙 <span className="tabular-nums text-dark">{p.receipt_count.toLocaleString("ko-KR")}</span>건
            </span>
          </p>
          {over.length > 0 && (
            <Link
              href={receiptsHref({ project_id: p.id, item: normalizeBudgetName(over[0].name) })}
              className="mt-2 inline-flex min-h-8 items-start gap-1.5 rounded-sm text-[15px] font-medium text-red-800 underline underline-offset-2 [word-break:keep-all]"
            >
              <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden />
              <span>
                비목 초과 {over.length}개: {over.map((o) => `${o.name} ${formatItemRate(o.rate)}`).join(" · ")}
                <span className="sr-only"> — 증빙 내역에서 이 비목 보기</span>
              </span>
            </Link>
          )}
        </div>

        {(p.budget_items.length > 0 || p.source_files.length > 0) && (
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 border-t border-warm-tan pt-3">
            {p.budget_items.length > 0 && (
              <>
                <dt className="text-sm text-text-secondary">비목</dt>
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
                <dt className="text-sm text-text-secondary">첨부</dt>
                <dd className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {p.source_files.map((f) => (
                    <a
                      key={f.pathname}
                      href={fileUrl(f.pathname, { download: true, name: f.name })}
                      className="inline-flex min-h-8 max-w-[240px] items-center gap-1 rounded-sm text-link underline underline-offset-2"
                      aria-label={`${f.name} 내려받기`}
                    >
                      <span className="truncate">{f.name}</span>
                      <Download className="size-4 shrink-0" aria-hidden />
                    </a>
                  ))}
                </dd>
              </>
            )}
          </dl>
        )}
      </div>

      <div data-card-actions className="flex flex-wrap items-center gap-2 border-t border-warm-tan px-4 py-2.5">
        {!closed && (
          <Button asChild size="sm">
            <Link href={expensesHref({ project_id: p.id })}>
              <Upload className="size-4" aria-hidden />
              증빙 올리기
            </Link>
          </Button>
        )}
        <Button asChild size="sm" variant={closed ? "default" : "outline"} className={closed ? undefined : "hover:bg-warm-beige"}>
          <Link href={receiptsHref({ project_id: p.id })}>
            <ListChecks className="size-4" aria-hidden />
            증빙 내역
          </Link>
        </Button>
        <div className="ml-auto">
          <RowActions
            label={p.name}
            items={[
              { label: "정보 수정", onSelect: onEdit, disabled: busy },
              {
                label: closed ? "다시 진행하기" : "종료하기",
                onSelect: onToggleStatus,
                disabled: busy,
              },
              // 증빙이 있는 종료 프로젝트는 권할 다른 동작(종료)도 없으니 메뉴에서 바로 이유를 보인다
              closed && p.receipt_count > 0
                ? { label: "삭제", danger: true, disabled: true, disabledReason: "증빙이 있는 프로젝트는 삭제할 수 없어요. 이미 종료돼 증빙 올리기 목록에는 나오지 않아요." }
                : { label: "삭제", onSelect: onDelete, danger: true, disabled: busy },
            ]}
          />
        </div>
      </div>
    </article>
  )
}
