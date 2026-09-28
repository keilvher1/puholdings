"use client"

import Link from "next/link"
import { Loader2, TriangleAlert } from "lucide-react"
import { RateBar } from "@/components/admin/expenses/project-card"
import { formatRate, normalizeName, rateTone, usageRate, wonNumber } from "@/components/admin/expenses/client-helpers"
import type { ExpenseProject, ExpenseReceipt } from "@/lib/expenses"

// 선택한 프로젝트의 비목별 집행액 vs 예산 표.
// 기간·검색 조건과 상관없이 "프로젝트 전체" 증빙으로 계산한다(예산 대비 현황은 전체 기준이어야 의미가 있다).

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

export function BudgetUsageTable({
  project,
  receipts,
  loading,
}: {
  project: ExpenseProject
  receipts: ExpenseReceipt[] | null
  loading: boolean
}) {
  const list = receipts ?? []
  const rows = buildUsageRows(project, list)
  const spentTotal = list.reduce((s, r) => s + (typeof r.total_amount === "number" ? r.total_amount : 0), 0)
  const itemBudgetSum = project.budget_items.reduce((s, b) => s + (typeof b.amount === "number" ? b.amount : 0), 0)
  const budgetTotal = project.total_budget ?? (itemBudgetSum > 0 ? itemBudgetSum : null)
  const totalRate = usageRate(spentTotal, budgetTotal)
  const hasExtra = rows.some((r) => r.kind !== "planned")

  return (
    <div className="overflow-hidden rounded-xl border border-warm-tan bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-tan bg-warm-beige/40 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-dark">비목별 집행 현황</h3>
        <span className="flex items-center gap-1.5 text-xs text-text-secondary">
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          프로젝트 전체 증빙 기준 · 부가세 포함 합계
        </span>
      </div>

      {project.budget_items.length === 0 && (
        <p className="border-b border-warm-tan/60 px-4 py-2.5 text-xs text-text-secondary [word-break:keep-all]">
          이 프로젝트에는 비목별 예산이 없습니다.{" "}
          <Link href="/admin/expenses/projects" className="font-medium text-gold underline-offset-2 hover:underline">
            사업·프로젝트
          </Link>
          에서 비목과 예산을 넣으면 비목마다 집행률을 볼 수 있습니다.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-text-secondary">아직 이 프로젝트로 저장된 증빙이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs text-text-secondary">
              <tr className="border-b border-warm-tan/60">
                <th className="px-4 py-2 text-left font-medium">비목</th>
                <th className="px-3 py-2 text-right font-medium">예산</th>
                <th className="px-3 py-2 text-right font-medium">집행액</th>
                <th className="w-44 px-3 py-2 text-left font-medium">집행률</th>
                <th className="px-3 py-2 text-right font-medium">잔액</th>
                <th className="px-4 py-2 text-right font-medium">건수</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rate = usageRate(r.spent, r.budget)
                const tone = rateTone(rate)
                const remain = typeof r.budget === "number" ? r.budget - r.spent : null
                return (
                  <tr key={r.key} className="border-b border-warm-tan/40 last:border-0">
                    <td className="px-4 py-2">
                      <span className={r.kind === "unassigned" ? "text-text-secondary" : "font-medium text-dark"}>{r.name}</span>
                      {r.kind === "extra" && (
                        <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">예산표에 없음</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                      {r.budget === null ? "-" : wonNumber(r.budget)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-dark">{wonNumber(r.spent)}</td>
                    <td className="px-3 py-2">
                      {rate === null ? (
                        <span className="text-xs text-text-tertiary">-</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <RateBar rate={rate} className="h-1.5 flex-1" />
                          <span
                            className={`w-12 text-right text-xs tabular-nums ${
                              tone === "over" ? "font-semibold text-destructive" : tone === "warn" ? "text-amber-700" : "text-text-secondary"
                            }`}
                          >
                            {formatRate(rate)}
                          </span>
                        </div>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        remain !== null && remain < 0 ? "font-semibold text-destructive" : "text-text-secondary"
                      }`}
                    >
                      {remain === null ? "-" : wonNumber(remain)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{r.count}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-warm-tan bg-warm-beige/30 font-semibold text-dark">
                <td className="px-4 py-2">합계</td>
                <td className="px-3 py-2 text-right tabular-nums">{budgetTotal === null ? "-" : wonNumber(budgetTotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{wonNumber(spentTotal)}</td>
                <td className="px-3 py-2">
                  {totalRate === null ? (
                    <span className="text-xs font-normal text-text-tertiary">총사업비 미입력</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <RateBar rate={totalRate} className="h-1.5 flex-1" />
                      <span className="w-12 text-right text-xs tabular-nums">{formatRate(totalRate)}</span>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {budgetTotal === null ? "-" : wonNumber(budgetTotal - spentTotal)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{list.length}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {hasExtra && (
        <p className="flex gap-1.5 border-t border-warm-tan/60 px-4 py-2 text-xs text-text-secondary [word-break:keep-all]">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-700" />
          예산표에 없는 비목이나 비목이 비어 있는 증빙이 있습니다. 증빙 행을 눌러 비목을 예산표의 이름으로 맞추면 집행률이 정확해집니다.
        </p>
      )}
    </div>
  )
}
