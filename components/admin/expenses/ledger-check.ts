// 증빙 내역(장부) 점검 — 이미 불러온 증빙 열만으로 "확인할 것"을 계산하는 순수 함수(계획서 4.2.6 L-1·L-2, 4.2.8 K-1).
// 서버 전용 모듈을 import하지 않는다(화면·테스트 공용). 판정만 하고 금액·집행액 계산은 바꾸지 않는다.
//
// 확인 필요(warning, 돈·정산 인정에 영향): ① 같은 거래로 보이는 쌍 ② 금액 불일치 ③ 비목 미지정·예산 외 ④ 사업 기간 밖
// 참고(회색 글자, 상태 아님): ⑤ 인식 신뢰도 낮음 ⑥ 환율 직접 입력 ⑦ 원본 없음(인건비 제외)
//
// 같은 거래 판정은 lib/expense-dedupe.ts의 sameTransactionReason(업로드 중복 검사와 같은 규칙)을 그대로 쓴다.
// 편집 시트 [다른 거래로 표시하고 저장]은 메모에 "[다른 거래 확인 #상대id]"를 붙인다 — 그 쌍만 빠지고,
// 나중에 들어온 다른 증빙과의 쌍은 다시 잡힌다. 예전 표시 "[다른 거래 확인]"(상대 없음)은 그 증빙의 모든 쌍을 뺀다(호환).
//
// 사용 예:
//   const checks = checkReceipts(shown, projects, { pairSource: projectAll })
//   checks.get(r.id)?.warnings  // ["same_tx"]
//   buildUsageRows(project, receipts)   // 비목별 집행 표 행(ledger-budget-table과 같은 계산)
//   spentByItem(receipts)               // { 외주용역비: 35200000, "": 0 … } — listProjects의 spent_by_item과 같은 규칙

import { amountMismatch, normalizeBudgetName, type ExpenseProject, type ExpenseReceipt } from "@/lib/expenses"
import { normalizeApproval, sameTransactionReason, type SameTxReason } from "@/lib/expense-dedupe"

/** 예전 표시(상대 없음) — 그 증빙의 모든 쌍을 뺀다 */
export const DIFFERENT_TX_MARK = "[다른 거래 확인]"

/** 쌍 단위 표시: "[다른 거래 확인 #32]" */
export function differentTxMark(otherId: number): string {
  return `[다른 거래 확인 #${otherId}]`
}

/** 예전 표시(상대 없음)가 있는지 */
export function hasDifferentTxMark(memo: string | null | undefined): boolean {
  return (memo ?? "").includes(DIFFERENT_TX_MARK)
}

/** 메모가 상대(otherId)와의 쌍을 "다른 거래"로 표시했는지(예전 표시면 누구와도 true) */
export function marksDifferentTx(memo: string | null | undefined, otherId: number): boolean {
  const m = memo ?? ""
  return m.includes(DIFFERENT_TX_MARK) || m.includes(differentTxMark(otherId))
}

/** 메모 끝에 표시를 덧붙인다(이미 있으면 그대로). otherId를 주면 그 쌍만 빼는 표시, 없으면 예전 표시 */
export function appendDifferentTxMark(memo: string | null | undefined, otherId?: number): string {
  const m = (memo ?? "").trim()
  if (m.includes(DIFFERENT_TX_MARK)) return m
  const mark = typeof otherId === "number" ? differentTxMark(otherId) : DIFFERENT_TX_MARK
  if (m.includes(mark)) return m
  return m ? `${m} ${mark}` : mark
}

export type CheckWarning = "same_tx" | "amount_mismatch" | "unassigned" | "off_budget" | "out_of_period"
export type CheckNote = "low_confidence" | "manual_fx" | "no_file"
export type CheckReason = CheckWarning | CheckNote

export const CHECK_WARNINGS: CheckWarning[] = ["same_tx", "amount_mismatch", "unassigned", "off_budget", "out_of_period"]
export const CHECK_NOTES: CheckNote[] = ["low_confidence", "manual_fx", "no_file"]

/** short: 표의 배지 글자 · label: 점검 시트 묶음 이름 · hint: 무엇을 하면 되는지 */
export const CHECK_LABELS: Record<CheckReason, { short: string; label: string; hint: string }> = {
  same_tx: {
    short: "같은 거래?",
    label: "같은 거래로 보이는 쌍",
    hint: "한 거래의 서류(세금계산서·이체확인증 등)를 두 번 저장하면 집행액이 두 번 잡혀요. 한 건만 남기거나, 다른 거래면 증빙을 열어 [다른 거래로 표시하고 저장]을 눌러 주세요",
  },
  amount_mismatch: { short: "금액 불일치", label: "금액 불일치", hint: "공급가액 + 부가세가 합계와 달라요" },
  unassigned: { short: "비목 미지정", label: "비목 미지정", hint: "비목을 골라야 비목별 집행액에 들어가요" },
  off_budget: { short: "예산 외 비목", label: "예산 외 비목", hint: "프로젝트 예산에 없는 비목이에요. 철자가 다르면 예산 비목으로 고쳐 주세요" },
  out_of_period: { short: "기간 밖", label: "사업 기간 밖 거래", hint: "거래일(인건비는 귀속월)이 사업 기간을 벗어나요" },
  low_confidence: { short: "신뢰도 낮음", label: "인식 신뢰도 낮음", hint: "자동 인식이 확신하지 못한 증빙이에요. 원본과 한 번 대조해 보세요" },
  manual_fx: { short: "환율 직접 입력", label: "환율 직접 입력", hint: "결제일 환율 대신 직접 넣은 환율이에요" },
  no_file: { short: "원본 없음", label: "원본 없음", hint: "증빙 파일이 없어요(인건비가 아닌데 원본이 없는 건)" },
}

export interface PairRef {
  otherId: number
  reason: SameTxReason
}

export interface ReceiptCheck {
  /** 확인 필요 사유(표시 순서대로) */
  warnings: CheckWarning[]
  /** 참고 사유(회색) */
  notes: CheckNote[]
  /** 같은 거래로 보이는 상대 증빙 */
  pairs: PairRef[]
}

export interface SameTxPair {
  a: number
  b: number
  reason: SameTxReason
}

type CheckProject = Pick<ExpenseProject, "id" | "budget_items" | "start_date" | "end_date">

/**
 * 같은 거래로 보이는 쌍. 합계가 같거나 승인번호가 같은 후보끼리만 비교한다(전체 n² 비교를 피함).
 * 한쪽 메모가 상대를 "다른 거래"로 표시했으면(marksDifferentTx) 그 쌍은 뺀다. 결과는 (작은 id, 큰 id) 순서, 중복 없음.
 */
export function findSameTxPairs(receipts: ExpenseReceipt[]): SameTxPair[] {
  const byTotal = new Map<number, ExpenseReceipt[]>()
  const byApproval = new Map<string, ExpenseReceipt[]>()
  for (const r of receipts) {
    if (typeof r.total_amount === "number" && r.total_amount !== 0) {
      const list = byTotal.get(r.total_amount)
      if (list) list.push(r)
      else byTotal.set(r.total_amount, [r])
    }
    const ap = normalizeApproval(r.approval_no)
    if (ap.length >= 6) {
      const list = byApproval.get(ap)
      if (list) list.push(r)
      else byApproval.set(ap, [r])
    }
  }
  const seen = new Set<string>()
  const out: SameTxPair[] = []
  const scan = (group: ExpenseReceipt[]) => {
    if (group.length < 2) return
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const x = group[i]
        const y = group[j]
        if (x.id === y.id) continue
        const a = Math.min(x.id, y.id)
        const b = Math.max(x.id, y.id)
        const key = `${a}:${b}`
        if (seen.has(key)) continue
        seen.add(key)
        if (marksDifferentTx(x.memo, y.id) || marksDifferentTx(y.memo, x.id)) continue
        const reason = sameTransactionReason(x, y)
        if (reason) out.push({ a, b, reason })
      }
    }
  }
  for (const g of byApproval.values()) scan(g)
  for (const g of byTotal.values()) scan(g)
  return out.sort((p, q) => p.a - q.a || p.b - q.b)
}

function outOfPeriod(r: ExpenseReceipt, p: CheckProject | undefined): boolean {
  if (!p || (!p.start_date && !p.end_date)) return false
  // 인건비는 귀속월(일한 달)로 본다. 마지막 달 급여를 다음 달 초에 주는 일이 흔하다.
  if (r.doc_type === "payroll" && /^\d{4}-\d{2}$/.test(r.payroll_month)) {
    const ym = r.payroll_month
    if (p.start_date && ym < p.start_date.slice(0, 7)) return true
    if (p.end_date && ym > p.end_date.slice(0, 7)) return true
    return false
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.issue_date)) return false
  if (p.start_date && r.issue_date < p.start_date) return true
  if (p.end_date && r.issue_date > p.end_date) return true
  return false
}

/**
 * 증빙마다 점검 결과. pairSource를 주면 같은 거래 쌍은 그 목록(예: 프로젝트 전체)에서 찾는다 —
 * 기간·검색으로 좁힌 화면에서도 상대 증빙이 걸러졌다고 쌍이 사라지지 않게.
 */
export function checkReceipts(
  receipts: ExpenseReceipt[],
  projects: CheckProject[],
  opts: { pairSource?: ExpenseReceipt[] | null } = {},
): Map<number, ReceiptCheck> {
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const budgetSets = new Map<number, Set<string>>()
  for (const p of projects) {
    const names = p.budget_items.map((b) => normalizeBudgetName(b.name)).filter(Boolean)
    if (names.length > 0) budgetSets.set(p.id, new Set(names))
  }

  const pool = new Map<number, ExpenseReceipt>()
  for (const r of opts.pairSource ?? []) pool.set(r.id, r)
  for (const r of receipts) pool.set(r.id, r)
  const pairsOf = new Map<number, PairRef[]>()
  const addPair = (id: number, ref: PairRef) => {
    const list = pairsOf.get(id)
    if (list) list.push(ref)
    else pairsOf.set(id, [ref])
  }
  for (const pr of findSameTxPairs([...pool.values()])) {
    addPair(pr.a, { otherId: pr.b, reason: pr.reason })
    addPair(pr.b, { otherId: pr.a, reason: pr.reason })
  }

  const out = new Map<number, ReceiptCheck>()
  for (const r of pool.values()) {
    const warnings: CheckWarning[] = []
    const notes: CheckNote[] = []
    const pairs = pairsOf.get(r.id) ?? []
    if (pairs.length > 0) warnings.push("same_tx")
    if (amountMismatch(r)) warnings.push("amount_mismatch")
    const item = normalizeBudgetName(r.budget_item)
    if (!item) warnings.push("unassigned")
    else {
      const set = budgetSets.get(r.project_id)
      if (set && !set.has(item)) warnings.push("off_budget")
    }
    if (outOfPeriod(r, projectById.get(r.project_id))) warnings.push("out_of_period")
    if (r.ai_confidence === "low") notes.push("low_confidence")
    if (r.currency && r.currency !== "KRW" && r.exchange_rate_source === "manual") notes.push("manual_fx")
    if (!r.file_pathname && r.doc_type !== "payroll") notes.push("no_file")
    out.set(r.id, { warnings, notes, pairs })
  }
  return out
}

export function needsCheck(c: ReceiptCheck | undefined | null): boolean {
  return !!c && c.warnings.length > 0
}

/** 사유별 건수(주어진 id만). 같은 거래 쌍은 증빙 수가 아니라 "쌍" 수로 센다 */
export function countChecks(
  ids: number[],
  checks: Map<number, ReceiptCheck>,
): { byReason: Record<CheckReason, number>; pairs: number; receipts: number } {
  const byReason = Object.fromEntries([...CHECK_WARNINGS, ...CHECK_NOTES].map((k) => [k, 0])) as Record<CheckReason, number>
  const pairKeys = new Set<string>()
  let receipts = 0
  for (const id of ids) {
    const c = checks.get(id)
    if (!c) continue
    if (c.warnings.length > 0) receipts += 1
    for (const w of c.warnings) byReason[w] += 1
    for (const n of c.notes) byReason[n] += 1
    for (const p of c.pairs) {
      // 상대가 목록 밖이어도 쌍 하나로 센다(양쪽 다 목록에 있으면 한 번만)
      pairKeys.add(id < p.otherId ? `${id}:${p.otherId}` : `${p.otherId}:${id}`)
    }
  }
  return { byReason, pairs: pairKeys.size, receipts }
}

// ── 비목별 집행(장부 표·프로젝트 카드 공용) ─────────────────────────────────────

export interface UsageRow {
  key: string
  name: string
  budget: number | null
  spent: number
  count: number
  kind: "planned" | "extra" | "unassigned"
}

/** 비목별 집행 표의 행 — 예산 비목 순서, 그다음 예산 외 비목, 마지막에 비목 미지정. 기간·검색과 무관한 프로젝트 전체로 부른다 */
export function buildUsageRows(project: Pick<ExpenseProject, "budget_items">, receipts: ExpenseReceipt[]): UsageRow[] {
  const spentBy = new Map<string, { spent: number; count: number }>()
  for (const r of receipts) {
    const k = normalizeBudgetName(r.budget_item || "")
    const cur = spentBy.get(k) ?? { spent: 0, count: 0 }
    cur.spent += typeof r.total_amount === "number" ? r.total_amount : 0
    cur.count += 1
    spentBy.set(k, cur)
  }
  const planned = new Set<string>()
  const rows: UsageRow[] = project.budget_items.map((b, i) => {
    const k = normalizeBudgetName(b.name)
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

/** 비목별 집행액(키 = normalizeBudgetName, 미지정은 ""). listProjects의 spent_by_item과 같은 규칙 */
export function spentByItem(receipts: Pick<ExpenseReceipt, "budget_item" | "total_amount">[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of receipts) {
    const k = normalizeBudgetName(r.budget_item)
    out[k] = (out[k] ?? 0) + (typeof r.total_amount === "number" ? r.total_amount : 0)
  }
  return out
}

export interface OverItem {
  name: string
  budget: number
  spent: number
  /** 집행률(%) — usageRate와 같은 식(spent ÷ budget × 100) */
  rate: number
}

/** 예산을 넘긴 비목(예산 순서). spent_by_item이 없으면 빈 배열 */
export function overBudgetItems(project: Pick<ExpenseProject, "budget_items" | "spent_by_item">): OverItem[] {
  const by = project.spent_by_item
  if (!by) return []
  const out: OverItem[] = []
  for (const b of project.budget_items) {
    const name = normalizeBudgetName(b.name)
    if (!name || typeof b.amount !== "number" || !(b.amount > 0)) continue
    const spent = by[name] ?? 0
    if (spent > b.amount) out.push({ name: b.name, budget: b.amount, spent, rate: (spent / b.amount) * 100 })
  }
  return out
}

/** "117%" — 100% 이상은 정수, 그 아래는 소수 한 자리(장부 집행률 표기와 같음) */
export function formatItemRate(rate: number): string {
  return `${rate.toFixed(rate >= 100 || Number.isInteger(rate) ? 0 : 1)}%`
}
