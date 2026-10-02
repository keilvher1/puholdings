"use client"

import { useEffect, useId, useState, type ReactNode } from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { EmptyState, Section, ToneBadge } from "@/components/saas"
import { formatRate, usageRate } from "@/components/admin/expenses/client-helpers"
import { Money, RateValue, UsageBar } from "@/components/admin/expenses/ui"
import { buildUsageRows, type UsageRow } from "@/components/admin/expenses/ledger-check"
import { normalizeBudgetName, type ExpenseProject, type ExpenseReceipt } from "@/lib/expenses"
import { won } from "@/lib/format"
import { cn } from "@/lib/utils"

// 선택한 프로젝트의 비목별 집행액 vs 예산 표(계획서 4.2.6 L-3·L-4).
// 기간·검색 조건과 상관없이 "프로젝트 전체" 증빙으로 계산한다(예산 대비 현황은 전체 기준이어야 의미가 있다).
// 기본은 접힘: 제목 + 비목별 집행률 요약 한 줄 + [펼치기]만 보인다(계획서 4.0 #4 — 1280×600에서 장부 첫 행이 첫 화면에 보이게).
// 펼치거나 접으면 이 브라우저에 기억한다(localStorage, 못 쓰면 기억만 안 함). 불러오기 실패는 접혀 있어도 그대로 보인다.
// 행을 누르면 그 비목 증빙만 거른다. receipts가 null이면(아직 못 불러옴·실패) 0원으로 보이지 않고 불러오는 중·오류를 보인다.
// 예산을 넘긴 비목에는 "같은 거래로 보이는 쌍 n ›"을 붙여 초과가 진짜인지 바로 확인하게 한다.
// md 미만에서는 표 대신 비목별 목록(가로 스크롤 없이 집행액·잔액·집행률이 한 화면에).

// 예전 import 호환(buildUsageRows는 ledger-check.ts로 옮겼다)
export { buildUsageRows, type UsageRow }

const OPEN_KEY = "expenses.ledger.budget-open"

function readOpenPref(): boolean | null {
  try {
    const v = window.localStorage.getItem(OPEN_KEY)
    return v === "1" ? true : v === "0" ? false : null
  } catch {
    return null
  }
}

function writeOpenPref(open: boolean) {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? "1" : "0")
  } catch {
    // 저장소를 못 쓰면 기억만 하지 않는다
  }
}

/** 행의 정규화 비목 키(미지정은 "") */
export function usageRowKey(row: UsageRow): string {
  return row.kind === "unassigned" ? "" : normalizeBudgetName(row.name)
}

function RowName({ row }: { row: UsageRow }) {
  if (row.kind === "unassigned") return <ToneBadge tone="warning">비목 미지정</ToneBadge>
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      <span className="truncate font-medium text-dark">{row.name}</span>
      {row.kind === "extra" && <ToneBadge tone="warning">예산 외</ToneBadge>}
    </span>
  )
}

function Remain({ value, strong = false }: { value: number | null; strong?: boolean }) {
  return value !== null && value < 0 ? <Money value={value} tone="danger" strong /> : <Money value={value} strong={strong} />
}

const TH = "h-10 whitespace-nowrap border-b border-warm-tan bg-warm-beige px-3 text-left align-middle text-sm font-semibold text-dark"
const TD = "h-11 px-3 py-1.5 align-middle text-[15px]"
const NUM = "text-right tabular-nums whitespace-nowrap"

export function BudgetUsageTable({
  project,
  receipts,
  loading,
  error = "",
  onRetry,
  pairCountByItem,
  selectedItem = null,
  onSelectItem,
  onShowPairs,
  actions,
}: {
  project: ExpenseProject
  receipts: ExpenseReceipt[] | null
  loading: boolean
  /** 프로젝트 전체 목록을 못 불러왔을 때의 문구(receipts가 null일 때만 쓴다) */
  error?: string
  onRetry?: () => void
  /** 정규화 비목 키 → 그 비목의 같은 거래로 보이는 쌍 수 */
  pairCountByItem?: Map<string, number>
  /** 지금 걸러 보는 비목(정규화 키, 미지정은 "") — 행을 강조한다 */
  selectedItem?: string | null
  onSelectItem?: (row: UsageRow) => void
  onShowPairs?: (itemKey: string) => void
  actions?: ReactNode
}) {
  const list = receipts ?? []
  const rows = buildUsageRows(project, list)
  // 기본 접힘. 펼쳐 둔 기억이 있으면 펼친다(서버 렌더와 어긋나지 않게 마운트 뒤에 읽는다)
  const [open, setOpen] = useState(false)
  const bodyId = useId()

  useEffect(() => {
    const pref = readOpenPref()
    if (pref !== null) setOpen(pref)
  }, [])

  const toggle = () => {
    setOpen((v) => {
      writeOpenPref(!v)
      return !v
    })
  }

  const spentTotal = list.reduce((s, r) => s + (typeof r.total_amount === "number" ? r.total_amount : 0), 0)
  const itemBudgetSum = project.budget_items.reduce((s, b) => s + (typeof b.amount === "number" ? b.amount : 0), 0)
  const budgetTotal = project.total_budget ?? (itemBudgetSum > 0 ? itemBudgetSum : null)
  const totalRate = usageRate(spentTotal, budgetTotal)
  const totalRemain = budgetTotal === null ? null : budgetTotal - spentTotal
  const overRows = rows.filter((r) => typeof r.budget === "number" && r.spent > r.budget)
  const pairsOf = (row: UsageRow) => pairCountByItem?.get(usageRowKey(row)) ?? 0
  const isOver = (row: UsageRow) => typeof row.budget === "number" && row.spent > row.budget

  const pairTag = (row: UsageRow) => {
    const n = pairsOf(row)
    if (!isOver(row) || n === 0) return null
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onShowPairs?.(usageRowKey(row))
        }}
        className="inline-flex min-h-8 items-center gap-0.5 whitespace-nowrap rounded-sm text-sm font-medium text-link underline underline-offset-2 hover:bg-warm-beige"
      >
        같은 거래로 보이는 쌍 {n}
        <ChevronRight className="size-4" aria-hidden />
      </button>
    )
  }

  const description = (
    <span className="inline-flex flex-wrap items-center gap-1">
      전체 기간 · 부가세 포함
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="부가세 포함 기준 설명" className="inline-flex size-8 items-center justify-center rounded-sm hover:bg-warm-beige">
            <Info className="size-4 text-text-secondary" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 text-sm [word-break:keep-all]">
          집행액은 증빙 합계(부가세 포함)예요. 지원사업에 따라 환급받는 부가세는 사업비로 인정되지 않을 수 있으니 기관 지침을 확인해 주세요.
        </TooltipContent>
      </Tooltip>
    </span>
  )

  // 접힌 상태(불러온 뒤 비목이 있을 때): 테두리 띠 한 줄 — 제목 · 비목별 집행률 요약(넘치면 말줄임, 전체는 title) · 예산 초과 · 동작 · [펼치기].
  // 펼치기 전에도 "예산 초과"와 비목별 집행률은 보인다. 처음 불러오는 중이면 같은 띠에 "불러오는 중…"(높이가 튀지 않게).
  // 실패·증빙 없음은 아래 Section이 그대로 보인다(실패를 접어 숨기지 않는다).
  if (!open && (receipts ? rows.length > 0 : !error)) {
    const digestText = receipts
      ? rows
          .map((r) => {
            const rate = usageRate(r.spent, r.budget)
            return `${r.name} ${rate === null ? won(r.spent) : formatRate(rate)}`
          })
          .join(" · ")
      : ""
    return (
      <section
        aria-label="비목별 집행 현황"
        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-warm-tan bg-card px-4 py-2 sm:flex-nowrap"
      >
        <h3 className="shrink-0 text-base font-semibold text-dark">비목별 집행 현황</h3>
        <p id={bodyId} className="min-w-0 flex-1 basis-full truncate text-[15px] text-text-secondary sm:basis-auto" title={digestText || undefined}>
          <span className="sr-only">비목별 집행률(전체 기간·부가세 포함): </span>
          {!receipts && "불러오는 중…"}
          {receipts && rows.map((r, i) => {
            const rate = usageRate(r.spent, r.budget)
            return (
              <span key={r.key}>
                {i > 0 && <span aria-hidden> · </span>}
                <span className={r.kind === "planned" ? undefined : "text-amber-800"}>{r.name}</span>{" "}
                {rate === null ? <Money value={r.spent} /> : <RateValue rate={rate} />}
              </span>
            )
          })}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {receipts && overRows.length > 0 && (
            <ToneBadge tone="danger" title={`예산 초과 비목: ${overRows.map((r) => r.name).join(" · ")}`}>
              예산 초과 {overRows.length}개
            </ToneBadge>
          )}
          {actions}
          <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige" aria-expanded={false} aria-controls={bodyId} onClick={toggle} disabled={!receipts}>
            펼치기
            <ChevronDown className="size-4" aria-hidden />
          </Button>
        </div>
      </section>
    )
  }

  return (
    <Section
      title="비목별 집행 현황"
      headingLevel={3}
      description={description}
      flush
      actions={
        <>
          {loading && <span className="text-sm text-text-secondary">불러오는 중…</span>}
          {receipts && overRows.length > 0 && (
            <ToneBadge tone="danger" title={`예산 초과 비목: ${overRows.map((r) => r.name).join(" · ")}`}>
              예산 초과 {overRows.length}개
            </ToneBadge>
          )}
          {actions}
          {receipts && rows.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="hover:bg-warm-beige"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={toggle}
            >
              {open ? "접기" : "펼치기"}
              <ChevronDown className={cn("size-4", open && "rotate-180")} aria-hidden />
            </Button>
          )}
        </>
      }
    >
      {project.budget_items.length === 0 && (
        <p className="border-b border-warm-tan px-4 py-2.5 text-sm text-text-secondary [word-break:keep-all]">
          비목별 예산이 아직 없어요.{" "}
          <Link href="/admin/expenses/projects" className="font-medium text-link underline underline-offset-2">
            사업·프로젝트
          </Link>
          에서 입력하면 비목별 잔액이 보여요.
        </p>
      )}

      {!receipts ? (
        error ? (
          <EmptyState
            kind="error"
            compact
            title="비목별 집행액을 불러오지 못했어요"
            description={`${error} 불러오기 전에는 집행액·잔액을 알 수 없어요.`}
            onRetry={onRetry}
          />
        ) : (
          <p className="px-4 py-6 text-center text-[15px] text-text-secondary">불러오는 중…</p>
        )
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[15px] text-text-secondary">{loading ? "불러오는 중…" : "아직 저장한 증빙이 없어요"}</p>
      ) : (
        <div id={bodyId}>
          {/* md 이상: 표. 행을 누르면 그 비목만 보기 */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-[15px]">
              <thead>
                <tr>
                  <th className={cn(TH, "pl-4")}>비목</th>
                  <th className={cn(TH, "text-right")}>예산</th>
                  <th className={cn(TH, "text-right")}>집행액</th>
                  <th className={cn(TH, "w-48")}>집행률</th>
                  <th className={cn(TH, "text-right")}>잔액</th>
                  <th className={cn(TH, "text-right")}>건수</th>
                  <th className={cn(TH, "pr-4")}>
                    <span className="sr-only">확인할 것</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rate = usageRate(r.spent, r.budget)
                  const remain = typeof r.budget === "number" ? r.budget - r.spent : null
                  const selected = selectedItem !== null && selectedItem === usageRowKey(r)
                  return (
                    <tr
                      key={r.key}
                      onClick={() => onSelectItem?.(r)}
                      className={cn(
                        "border-b border-warm-tan/70",
                        onSelectItem && "cursor-pointer hover:bg-warm-beige/50",
                        selected && "bg-warm-beige/70",
                      )}
                    >
                      <td className={cn(TD, "pl-4")}>
                        {onSelectItem ? (
                          <button
                            type="button"
                            aria-pressed={selected}
                            aria-label={`${r.name} 증빙만 보기`}
                            onClick={(e) => {
                              e.stopPropagation()
                              onSelectItem(r)
                            }}
                            className="rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-dark"
                          >
                            <RowName row={r} />
                          </button>
                        ) : (
                          <RowName row={r} />
                        )}
                      </td>
                      <td className={cn(TD, NUM)}>
                        <Money value={r.budget} tone="muted" />
                      </td>
                      <td className={cn(TD, NUM)}>
                        <Money value={r.spent} strong />
                      </td>
                      <td className={TD}>
                        {rate === null ? (
                          <span className="text-sm text-text-secondary">-</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <UsageBar className="w-24" rate={rate} />
                            <RateValue className="w-14 text-right text-sm" rate={rate} />
                          </div>
                        )}
                      </td>
                      <td className={cn(TD, NUM)}>
                        <Remain value={remain} />
                      </td>
                      <td className={cn(TD, NUM, "text-text-secondary")}>{r.count}</td>
                      <td className={cn(TD, "pr-4")}>{pairTag(r)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-warm-tan bg-warm-ivory font-semibold text-dark">
                  <td className={cn(TD, "pl-4")}>합계</td>
                  <td className={cn(TD, NUM)}>
                    <Money value={budgetTotal} strong />
                  </td>
                  <td className={cn(TD, NUM)}>
                    <Money value={spentTotal} strong />
                  </td>
                  <td className={TD}>
                    {totalRate === null ? (
                      <span className="text-sm font-normal text-text-secondary">총사업비 미입력</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <UsageBar className="w-24" rate={totalRate} />
                        <RateValue className="w-14 text-right text-sm" rate={totalRate} />
                      </div>
                    )}
                  </td>
                  <td className={cn(TD, NUM)}>
                    <Remain value={totalRemain} strong />
                  </td>
                  <td className={cn(TD, NUM)}>{list.length}</td>
                  <td className={cn(TD, "pr-4")} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* md 미만: 비목별 목록 */}
          <ul className="divide-y divide-warm-tan md:hidden">
            {rows.map((r) => {
              const rate = usageRate(r.spent, r.budget)
              const remain = typeof r.budget === "number" ? r.budget - r.spent : null
              const selected = selectedItem !== null && selectedItem === usageRowKey(r)
              return (
                <li key={r.key} className={cn("px-4 py-2.5", selected && "bg-warm-beige/70")}>
                  <div className="flex items-center justify-between gap-3">
                    {onSelectItem ? (
                      <button
                        type="button"
                        aria-pressed={selected}
                        aria-label={`${r.name} 증빙만 보기`}
                        onClick={() => onSelectItem(r)}
                        className="min-h-8 min-w-0 rounded-sm text-left"
                      >
                        <RowName row={r} />
                      </button>
                    ) : (
                      <RowName row={r} />
                    )}
                    <RateValue rate={rate} className="text-[15px]" />
                  </div>
                  <p className="mt-0.5 flex flex-wrap gap-x-2 text-sm text-text-secondary">
                    <span>
                      집행 <Money value={r.spent} />
                    </span>
                    {typeof r.budget === "number" && (
                      <span>
                        예산 <Money value={r.budget} tone="muted" />
                      </span>
                    )}
                    {remain !== null && (
                      <span>
                        잔액 <Remain value={remain} />
                      </span>
                    )}
                    <span>{r.count}건</span>
                  </p>
                  {rate !== null && <UsageBar className="mt-1.5" rate={rate} />}
                  {pairTag(r) && <div className="mt-1">{pairTag(r)}</div>}
                </li>
              )
            })}
            <li className="bg-warm-ivory px-4 py-2.5">
              <div className="flex items-center justify-between gap-3 text-[15px] font-semibold text-dark">
                <span>합계</span>
                {totalRate === null ? (
                  <span className="text-sm font-normal text-text-secondary">총사업비 미입력</span>
                ) : (
                  <RateValue rate={totalRate} className="text-[15px]" />
                )}
              </div>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-sm text-text-secondary">
                <span>
                  집행 <Money value={spentTotal} strong />
                </span>
                {budgetTotal !== null && (
                  <span>
                    예산 <Money value={budgetTotal} />
                  </span>
                )}
                {totalRemain !== null && (
                  <span>
                    잔액 <Remain value={totalRemain} strong />
                  </span>
                )}
                <span>{list.length}건</span>
              </p>
              {totalRate !== null && <UsageBar className="mt-1.5" rate={totalRate} />}
            </li>
          </ul>
        </div>
      )}
    </Section>
  )
}
