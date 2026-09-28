"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { normalizeName, usageRate } from "@/components/admin/expenses/client-helpers"
import {
  BusyText,
  Chip,
  DotList,
  Money,
  Panel,
  PanelHeader,
  RateValue,
  TABLE_CLASS,
  TableFrame,
  UsageBar,
} from "@/components/admin/expenses/ui"
import { cn } from "@/lib/utils"
import type { ExpenseProject, ExpenseReceipt } from "@/lib/expenses"

// 선택한 프로젝트의 비목별 집행액 vs 예산 표.
// 기간·검색 조건과 상관없이 "프로젝트 전체" 증빙으로 계산한다(예산 대비 현황은 전체 기준이어야 의미가 있다).
// 기본은 접힌 상태(비목별 집행률 한 줄 + 예산 초과·예산 외 표시)로 두어 아래 증빙 목록이 첫 화면에 들어오게 한다.
// md 미만에서는 표 대신 비목별 목록을 보여 준다(가로 스크롤 없이 집행액·잔액·집행률이 한 화면에).

interface UsageRow {
  key: string
  name: string
  budget: number | null
  spent: number
  count: number
  kind: "planned" | "extra" | "unassigned"
}

export function buildUsageRows(project: ExpenseProject, receipts: ExpenseReceipt[]): UsageRow[] {
  const spentBy = new Map<string, { spent: number; count: number }>()
  for (const r of receipts) {
    const k = normalizeName(r.budget_item || "")
    const cur = spentBy.get(k) ?? { spent: 0, count: 0 }
    cur.spent += typeof r.total_amount === "number" ? r.total_amount : 0
    cur.count += 1
    spentBy.set(k, cur)
  }
  const planned = new Set<string>()
  const rows: UsageRow[] = project.budget_items.map((b, i) => {
    const k = normalizeName(b.name)
    planned.add(k)
    const s = spentBy.get(k) ?? { spent: 0, count: 0 }
    return { key: `p${i}`, name: b.name, budget: b.amount, spent: s.spent, count: s.count, kind: "planned" }
  })
  for (const [k, s] of spentBy) {
    if (!k || planned.has(k)) continue
    rows.push({ key: `x-${k}`, name: k, budget: null, spent: s.spent, count: s.count, kind: "extra" })
  }
  const none = spentBy.get("")
  if (none) rows.push({ key: "none", name: "비목 미지정", budget: null, spent: none.spent, count: none.count, kind: "unassigned" })
  return rows
}

// 읽기 전용 요약 표라 행 hover 강조는 두지 않는다(TABLE_CLASS.row에서 hover만 뺀 것).
const ROW_CLASS = "border-b border-warm-tan/70 even:bg-warm-ivory/40"
const TH = (extra?: string) => cn(TABLE_CLASS.th, "px-3", extra)
const TD = (extra?: string) => cn(TABLE_CLASS.td, "px-3", extra)
const EXTRA_TITLE = "예산 외 비목 또는 비목 미지정 증빙이 있습니다. 증빙 행에서 비목을 수정하세요."

function RateCell({ rate, empty = "-" }: { rate: number | null; empty?: string }) {
  if (rate === null) return <span className="text-xs font-normal text-text-secondary">{empty}</span>
  return (
    <div className="flex items-center gap-2">
      <UsageBar className="w-28" rate={rate} />
      <RateValue className="w-14 text-right text-xs" rate={rate} />
    </div>
  )
}

function RowName({ row }: { row: UsageRow }) {
  if (row.kind === "unassigned") return <Chip tone="warning">비목 미지정</Chip>
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      <span className="truncate font-medium text-dark">{row.name}</span>
      {row.kind === "extra" && <Chip tone="warning">예산 외</Chip>}
    </span>
  )
}

function Remain({ value, strong = false }: { value: number | null; strong?: boolean }) {
  return value !== null && value < 0 ? (
    <Money value={value} tone="danger" strong />
  ) : (
    <Money value={value} strong={strong} className={strong ? undefined : "font-medium"} />
  )
}

export function BudgetUsageTable({
  project,
  receipts,
  loading,
}: {
  project: ExpenseProject
  receipts: ExpenseReceipt[] | null
  loading: boolean
}) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const list = receipts ?? []
  const rows = buildUsageRows(project, list)
  const spentTotal = list.reduce((s, r) => s + (typeof r.total_amount === "number" ? r.total_amount : 0), 0)
  const itemBudgetSum = project.budget_items.reduce((s, b) => s + (typeof b.amount === "number" ? b.amount : 0), 0)
  const budgetTotal = project.total_budget ?? (itemBudgetSum > 0 ? itemBudgetSum : null)
  const totalRate = usageRate(spentTotal, budgetTotal)
  const totalRemain = budgetTotal === null ? null : budgetTotal - spentTotal
  const hasExtra = rows.some((r) => r.kind !== "planned")
  const overNames = rows.filter((r) => typeof r.budget === "number" && r.spent > r.budget).map((r) => r.name)
  const overLabel =
    overNames.length === 0 ? null : overNames.slice(0, 2).join(" · ") + (overNames.length > 2 ? ` 외 ${overNames.length - 2}` : "")

  return (
    <Panel>
      <PanelHeader
        as="h3"
        title="비목별 집행 현황"
        meta="전체 기간 · 부가세 포함"
        actions={
          <>
            {loading && <BusyText>불러오는 중</BusyText>}
            {overLabel && (
              <Chip tone="danger" title={`예산 초과 비목: ${overNames.join(" · ")}`}>
                예산 초과: {overLabel}
              </Chip>
            )}
            {hasExtra && (
              <Chip tone="warning" title={EXTRA_TITLE}>
                예산 외·미지정 있음
              </Chip>
            )}
            {rows.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => setOpen((v) => !v)}
              >
                {open ? "접기" : "비목별 보기"}
                <ChevronDown className={cn("h-3.5 w-3.5", open && "rotate-180")} aria-hidden />
              </Button>
            )}
          </>
        }
      />

      {project.budget_items.length === 0 && (
        <p className="border-b border-warm-tan px-4 py-2.5 text-xs text-text-secondary [word-break:keep-all]">
          비목별 예산 미입력 ·{" "}
          <Link href="/admin/expenses/projects" className="font-medium text-dark underline underline-offset-2">
            사업·프로젝트
          </Link>
          에서 입력
        </p>
      )}

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-text-secondary">저장된 증빙 없음</p>
      ) : !open ? (
        // 접힌 상태: 비목별 집행률(예산이 없는 비목은 집행액) 한 줄
        <ul id={bodyId} className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-2.5 text-sm" aria-label="비목별 집행률">
          {rows.map((r) => {
            const rate = usageRate(r.spent, r.budget)
            return (
              <li key={r.key} className="whitespace-nowrap">
                <span className={r.kind === "planned" ? "text-text-secondary" : "text-amber-800"}>{r.name}</span>{" "}
                {rate === null ? <Money value={r.spent} /> : <RateValue rate={rate} />}
              </li>
            )
          })}
        </ul>
      ) : (
        <div id={bodyId}>
          {/* md 이상: 표 */}
          <TableFrame maxHeight={false} className="hidden md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className={TH("pl-4")}>비목</th>
                  <th className={TH("text-right")}>예산</th>
                  <th className={TH("text-right")}>집행액</th>
                  <th className={TH("w-48")}>집행률</th>
                  <th className={TH("text-right")}>잔액</th>
                  <th className={TH("pr-4 text-right")}>건수</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rate = usageRate(r.spent, r.budget)
                  const remain = typeof r.budget === "number" ? r.budget - r.spent : null
                  return (
                    <tr key={r.key} className={ROW_CLASS}>
                      <td className={TD("pl-4")}>
                        <RowName row={r} />
                      </td>
                      <td className={TD(TABLE_CLASS.num)}>
                        <Money value={r.budget} tone="muted" />
                      </td>
                      <td className={TD(TABLE_CLASS.num)}>
                        <Money value={r.spent} strong />
                      </td>
                      <td className={TD()}>
                        <RateCell rate={rate} />
                      </td>
                      <td className={TD(TABLE_CLASS.num)}>
                        <Remain value={remain} />
                      </td>
                      <td className={TD(cn(TABLE_CLASS.num, "pr-4 text-text-secondary"))}>{r.count}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className={TABLE_CLASS.foot}>
                  <td className={TD("pl-4")}>합계</td>
                  <td className={TD(TABLE_CLASS.num)}>
                    <Money value={budgetTotal} strong />
                  </td>
                  <td className={TD(TABLE_CLASS.num)}>
                    <Money value={spentTotal} strong />
                  </td>
                  <td className={TD()}>
                    <RateCell rate={totalRate} empty="총사업비 미입력" />
                  </td>
                  <td className={TD(TABLE_CLASS.num)}>
                    <Remain value={totalRemain} strong />
                  </td>
                  <td className={TD(cn(TABLE_CLASS.num, "pr-4"))}>{list.length}</td>
                </tr>
              </tfoot>
            </table>
          </TableFrame>

          {/* md 미만: 비목별 목록(가로 스크롤 없이 집행률·집행액·잔액이 보이게) */}
          <ul className="divide-y divide-warm-tan md:hidden">
            {rows.map((r) => {
              const rate = usageRate(r.spent, r.budget)
              const remain = typeof r.budget === "number" ? r.budget - r.spent : null
              return (
                <li key={r.key} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <RowName row={r} />
                    <RateValue rate={rate} className="text-sm" />
                  </div>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    <DotList
                      items={[
                        <>집행 <Money value={r.spent} className="font-medium" /></>,
                        typeof r.budget === "number" && <>예산 <Money value={r.budget} tone="muted" /></>,
                        remain !== null && <>잔액 <Remain value={remain} /></>,
                        `${r.count}건`,
                      ]}
                    />
                  </p>
                  {rate !== null && <UsageBar className="mt-1.5" rate={rate} />}
                </li>
              )
            })}
            <li className="bg-warm-ivory px-4 py-2.5">
              <div className="flex items-center justify-between gap-3 text-sm font-semibold text-dark">
                <span>합계</span>
                {totalRate === null ? (
                  <span className="text-xs font-normal text-text-secondary">총사업비 미입력</span>
                ) : (
                  <RateValue rate={totalRate} className="text-sm" />
                )}
              </div>
              <p className="mt-0.5 text-xs text-text-secondary">
                <DotList
                  items={[
                    <>집행 <Money value={spentTotal} strong /></>,
                    budgetTotal !== null && <>예산 <Money value={budgetTotal} /></>,
                    totalRemain !== null && <>잔액 <Remain value={totalRemain} strong /></>,
                    `${list.length}건`,
                  ]}
                />
              </p>
              {totalRate !== null && <UsageBar className="mt-1.5" rate={totalRate} />}
            </li>
          </ul>
        </div>
      )}
    </Panel>
  )
}
