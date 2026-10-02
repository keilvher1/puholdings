// 청구서 화면(WP7)의 순수 규칙 — 받을 돈 구간·정렬·월별 요약, 상세 시트에서 할 수 있는 일, 조정 라인 저장 본문,
// 추가 청구 네 가지 상태, 일괄 납부 입력 검사, 납부 안내 문구, 지난달 비교 한 줄. 화면(.tsx)과 테스트가 같이 쓴다.
// 서버·클라이언트 공용(브라우저 API 없음). 금액을 다시 계산하지 않는다 — 합계는 늘 서버 값(total_amount)을 쓴다.
//
// 사용 예:
//   const s = bucketSummary(rows)                       // 구간 카드 5개 + 정정 중 묶음
//   const a = sheetActions(bill)                        // { primary: "pay" | "issue_single" | null, … }
//   const body = buildLinesPayload(serverLines, manualEdits)   // PUT lines(전체 교체)용
//   const d = addChargeDecision({ period, bills, hasActiveContract: generateWouldBill(contracts, period).bills })   // ①~④

import { billBadge, type BillBadgeStatus } from "@/lib/status"
import { receivableState, isLate, BUCKET_LABEL, type ReceivableBucket, type ReceivableState } from "@/lib/receivables"
import { addMonths, billMonth, billMonthShort, toKstDate, toNumber, todayKST, won } from "@/lib/format"

export type BillDbStatus = "draft" | "issued" | "paid" | "overdue"

/** bills GET 목록 행(필요한 필드만). 금액은 NUMERIC 문자열로 온다 */
export interface BillRow {
  id: number
  tenant_id: number
  tenant_name: string
  period: string
  status: BillDbStatus | string
  rent_total: string | number
  mgmt_total: string | number
  elec_amount: string | number
  total_amount: string | number
  supply_amount?: string | number | null
  vat_amount?: string | number | null
  due_date: string | null
  paid_at: string | null
  issued_at: string | null
  is_manual: boolean
  memo?: string | null
  mail_status?: string | null
  mail_at?: string | null
}

export interface BillLine {
  id?: number
  contract_id: number | null
  room_code: string | null
  line_type: string
  label: string
  quantity: string | number | null
  unit_price: string | number | null
  amount: string | number
}

const amt = (v: string | number | null | undefined): number => toNumber(v ?? null) ?? 0

export function stateOf(row: Pick<BillRow, "status" | "due_date" | "issued_at">, today: string = todayKST()): ReceivableState {
  return receivableState({ status: String(row.status), due_date: row.due_date, issued_at: row.issued_at }, today)
}

export function badgeOf(row: BillRow, today: string = todayKST()): { status: BillBadgeStatus; detail: string | null } {
  return billBadge({ status: String(row.status), due_date: row.due_date, issued_at: row.issued_at, paid_at: row.paid_at }, today)
}

// ── 받을 돈 ───────────────────────────────────────────────────────────────────

/** 구간 카드 순서(계획서 4.4.7 B-1: 기한 전 / 1~30일 / 31~60일 / 60일 넘음 / 기한 없음) */
export const BUCKET_ORDER: ReceivableBucket[] = ["not_due", "d1_30", "d31_60", "d60_plus", "no_due"]

export const BUCKET_CARD_LABEL: Record<ReceivableBucket, string> = {
  not_due: "기한 전",
  d1_30: "1~30일 지남",
  d31_60: "31~60일 지남",
  d60_plus: "60일 넘게 지남",
  no_due: "기한 없음",
}

/** 주소 ?bucket= 값(구간 5개 + late 묶음 + correcting) */
export type BucketFilter = ReceivableBucket | "late" | "correcting"
export const BUCKET_FILTERS: BucketFilter[] = [...BUCKET_ORDER, "late", "correcting"]
export function parseBucket(v: string | null | undefined): BucketFilter | "" {
  return (BUCKET_FILTERS as string[]).includes(v ?? "") ? (v as BucketFilter) : ""
}
export function bucketFilterLabel(b: BucketFilter): string {
  // late 묶음 = isLate(기한 지남 + 기한 없이 발행 후 31일 넘음) — 홈 할 일 줄과 같은 두 말로 부른다
  if (b === "late") return "기한 지남·발행 후 31일 넘음"
  if (b === "correcting") return "정정 중"
  return BUCKET_CARD_LABEL[b] ?? BUCKET_LABEL[b]
}

export interface BucketCell {
  count: number
  sum: number
}

export interface ReceivableSummary {
  buckets: Record<ReceivableBucket, BucketCell>
  receivable: BucketCell
  late: BucketCell
  correcting: BucketCell & { periods: string[] }
}

export function bucketSummary(rows: BillRow[], today: string = todayKST()): ReceivableSummary {
  const cell = (): BucketCell => ({ count: 0, sum: 0 })
  const buckets = { not_due: cell(), d1_30: cell(), d31_60: cell(), d60_plus: cell(), no_due: cell() } as Record<ReceivableBucket, BucketCell>
  const receivable = cell()
  const late = cell()
  const correcting = { ...cell(), periods: [] as string[] }
  for (const r of rows) {
    const st = stateOf(r, today)
    const v = amt(r.total_amount)
    if (st.kind === "correcting") {
      correcting.count++
      correcting.sum += v
      if (!correcting.periods.includes(r.period)) correcting.periods.push(r.period)
      continue
    }
    if (st.kind !== "receivable" || !st.bucket) continue
    buckets[st.bucket].count++
    buckets[st.bucket].sum += v
    receivable.count++
    receivable.sum += v
    if (isLate(st)) {
      late.count++
      late.sum += v
    }
  }
  correcting.periods.sort()
  return { buckets, receivable, late, correcting }
}

/** 받을 돈 보기의 행 거르기. bucket이 없으면 미수 전체(정정 중 제외) */
export function filterReceivables(
  rows: BillRow[],
  f: { bucket?: BucketFilter | ""; q?: string; period?: string; tenantId?: number | null },
  today: string = todayKST(),
): BillRow[] {
  const q = (f.q ?? "").trim().toLowerCase()
  return rows.filter((r) => {
    const st = stateOf(r, today)
    if (f.bucket === "correcting") {
      if (st.kind !== "correcting") return false
    } else {
      if (st.kind !== "receivable") return false
      if (f.bucket === "late" && !isLate(st)) return false
      if (f.bucket && f.bucket !== "late" && st.bucket !== f.bucket) return false
    }
    if (q && !r.tenant_name.toLowerCase().includes(q)) return false
    if (f.period && r.period !== f.period) return false
    if (f.tenantId && r.tenant_id !== f.tenantId) return false
    return true
  })
}

/** 정렬 열쇠: 기한 지남(지난 일수 긴 순) → 기한 없음(발행 후 오래된 순) → 기한 전(기한 가까운 순) → 정정 중 */
function elapsedRank(r: BillRow, today: string): [number, number] {
  const st = stateOf(r, today)
  if (st.kind === "receivable" && st.bucket && st.bucket !== "not_due" && st.bucket !== "no_due") return [0, -(st.days ?? 0)]
  if (st.kind === "receivable" && st.bucket === "no_due") return [1, -(st.days ?? 0)]
  if (st.kind === "receivable" && st.bucket === "not_due") return [2, st.days ?? 0]
  return [3, 0]
}

/** 받을 돈 기본 정렬: 경과일 긴 순(같으면 청구월 오래된 순 → 기업 이름) */
export function sortByElapsed(rows: BillRow[], today: string = todayKST()): BillRow[] {
  return [...rows].sort((a, b) => {
    const ra = elapsedRank(a, today)
    const rb = elapsedRank(b, today)
    if (ra[0] !== rb[0]) return ra[0] - rb[0]
    if (ra[1] !== rb[1]) return ra[1] - rb[1]
    if (a.period !== b.period) return a.period < b.period ? -1 : 1
    return a.tenant_name.localeCompare(b.tenant_name, "ko")
  })
}

/** 경과 열 글자 — 배지(billBadge)와 같은 판정에서 나온다: "21일 지남" / "발행 후 52일" / "9일 남음" / "오늘까지" */
export function elapsedText(r: BillRow, today: string = todayKST()): string {
  const st = stateOf(r, today)
  if (st.kind === "correcting") return "정정 중"
  if (st.kind !== "receivable") return "-"
  if (st.bucket === "no_due") return st.days === null ? "기한 없음" : `발행 후 ${st.days}일`
  if (st.bucket === "not_due") return st.days === 0 ? "오늘까지" : `${st.days}일 남음`
  return `${st.days}일 지남`
}

/** 같은 기업의 미수 청구월 수(정정 중 제외). 3개월 이상이면 기업명 옆 "3개월 미납" */
export function unpaidMonthsByTenant(rows: BillRow[], today: string = todayKST()): Map<number, number> {
  const months = new Map<number, Set<string>>()
  for (const r of rows) {
    if (stateOf(r, today).kind !== "receivable") continue
    const s = months.get(r.tenant_id) ?? new Set<string>()
    s.add(r.period)
    months.set(r.tenant_id, s)
  }
  return new Map([...months].map(([k, v]) => [k, v.size]))
}

export const LONG_UNPAID_MONTHS = 3

/** 일괄 납부에 고를 수 있는 행: 납부 대기·기한 지남(DB issued·overdue) */
export function isPayable(r: Pick<BillRow, "status">): boolean {
  return r.status === "issued" || r.status === "overdue"
}

// ── 월별 보기 ─────────────────────────────────────────────────────────────────

export type MonthTab = "all" | "draft" | "issued" | "late" | "paid"
export const MONTH_TABS: MonthTab[] = ["all", "draft", "issued", "late", "paid"]
export const MONTH_TAB_LABEL: Record<MonthTab, string> = {
  all: "전체",
  draft: "작성 중",
  issued: "납부 대기",
  late: "기한 지남",
  paid: "납부 완료",
}
export function parseMonthTab(v: string | null | undefined): MonthTab {
  // 링크 계약(lib/links.ts BillsStatusParam)의 overdue는 "기한 지남" 탭으로 연다
  if (v === "overdue") return "late"
  return (MONTH_TABS as string[]).includes(v ?? "") ? (v as MonthTab) : "all"
}

/** 화면 배지 기준 탭 분류(정정 중은 "작성 중" 탭에 함께) */
export function monthTabOf(r: BillRow, today: string = todayKST()): Exclude<MonthTab, "all"> {
  const b = badgeOf(r, today).status
  if (b === "draft" || b === "correcting") return "draft"
  if (b === "late" || b === "overdue") return "late"
  if (b === "paid") return "paid"
  return "issued"
}

export interface MonthSummary {
  counts: Record<MonthTab, number>
  total: BucketCell
  paid: BucketCell
  receivable: BucketCell
}

export function monthSummary(rows: BillRow[], today: string = todayKST()): MonthSummary {
  const counts: Record<MonthTab, number> = { all: 0, draft: 0, issued: 0, late: 0, paid: 0 }
  const total = { count: 0, sum: 0 }
  const paid = { count: 0, sum: 0 }
  const receivable = { count: 0, sum: 0 }
  for (const r of rows) {
    const v = amt(r.total_amount)
    counts.all++
    counts[monthTabOf(r, today)]++
    total.count++
    total.sum += v
    if (r.status === "paid") {
      paid.count++
      paid.sum += v
    }
    if (stateOf(r, today).kind === "receivable") {
      receivable.count++
      receivable.sum += v
    }
  }
  return { counts, total, paid, receivable }
}

// ── 상세 시트 ─────────────────────────────────────────────────────────────────

/** 시트에서 고칠 수 있는 라인: 작성 중 청구서의 조정(manual) 라인만. 임대료·관리비·전기료는 재생성이 덮어쓰므로 읽기 전용 */
export function canEditLine(bill: Pick<BillRow, "status">, line: Pick<BillLine, "line_type">): boolean {
  return bill.status === "draft" && line.line_type === "manual"
}

/** 조정 라인을 더하거나 고칠 수 있는가(작성 중이면 정기·수기 모두) */
export function canEditManualLines(bill: Pick<BillRow, "status">): boolean {
  return bill.status === "draft"
}

/** 이 청구서만 발행: 작성 중 수기 청구서만. 정기 청구서는 월 마감 4단계 검토를 거쳐 발행한다 */
export function canIssueSingle(bill: Pick<BillRow, "status" | "is_manual">): boolean {
  return bill.status === "draft" && bill.is_manual === true
}

export type SheetMore = "pdf" | "due" | "memo" | "guide" | "unpay"

export interface SheetActions {
  /** 주 버튼 1개 */
  primary: "issue_single" | "pay" | null
  /** 정기 작성 중이면 "월 마감 4단계에서 발행해요 ›" 링크 */
  closeLink: boolean
  more: SheetMore[]
  /** 납부 기한 바꾸기 옆 경고(발행된 청구서) */
  dueWarning: string | null
}

export function sheetActions(bill: BillRow, today: string = todayKST()): SheetActions {
  const badge = badgeOf(bill, today).status
  if (bill.status === "paid") return { primary: null, closeLink: false, more: ["pdf", "unpay"], dueWarning: null }
  if (bill.status === "draft") {
    return {
      primary: canIssueSingle(bill) ? "issue_single" : null,
      closeLink: !canIssueSingle(bill),
      more: ["pdf", "due", "memo"],
      dueWarning: null,
    }
  }
  if (isPayable(bill)) {
    // 납부 기한 바꾸기는 납부 대기(기한 전·기한 없음)에만. 기한이 지난 건(DB overdue 포함)은 미뤄도 overdue가 되돌아가지 않는다
    const dueOk = badge === "issued"
    return {
      primary: "pay",
      closeLink: false,
      more: dueOk ? ["pdf", "due", "memo", "guide"] : ["pdf", "memo", "guide"],
      dueWarning: dueOk ? "이미 보낸 메일·포털 안내와 달라져요" : null,
    }
  }
  return { primary: null, closeLink: false, more: ["pdf"], dueWarning: null }
}

/** 시트에서 편집하는 조정 라인(금액은 WonInput 값 계약: 쉼표 없는 숫자 문자열, 빈칸 null) */
export interface ManualLineEdit {
  key: string
  /** 기존 라인이면 원래 값(contract_id·room_code 보존용) */
  contract_id?: number | null
  room_code?: string | null
  label: string
  amount: string | null
}

export function manualEditsFrom(lines: BillLine[]): ManualLineEdit[] {
  return lines
    .filter((l) => l.line_type === "manual")
    .map((l, i) => ({
      key: `m-${l.id ?? i}`,
      contract_id: l.contract_id,
      room_code: l.room_code,
      label: l.label ?? "",
      amount: toNumber(l.amount) === null ? null : String(Math.round(toNumber(l.amount)!)),
    }))
}

export interface LinesPayloadLine {
  contract_id: number | null
  room_code: string | null
  line_type: string
  label: string
  quantity: string | number | null
  unit_price: string | number | null
  amount: number
}

export interface LinesPayloadResult {
  lines: LinesPayloadLine[]
  /** 칸 오류: key → { label?, amount? } */
  errors: Record<string, { label?: string; amount?: string }>
}

/**
 * PUT lines 본문(라인 전체 교체). 생성 라인(임대료·관리비·전기료)은 서버에서 받은 그대로 보내고(순서 유지),
 * 조정 라인은 편집 목록으로 바꾼다. 화면은 합계를 계산하지 않는다(저장 뒤 서버 값으로 다시 그린다).
 */
export function buildLinesPayload(serverLines: BillLine[], edits: ManualLineEdit[]): LinesPayloadResult {
  const errors: LinesPayloadResult["errors"] = {}
  const generated: LinesPayloadLine[] = serverLines
    .filter((l) => l.line_type !== "manual")
    .map((l) => ({
      contract_id: l.contract_id ?? null,
      room_code: l.room_code ?? null,
      line_type: l.line_type,
      label: l.label,
      quantity: l.quantity ?? null,
      unit_price: l.unit_price ?? null,
      amount: Math.round(amt(l.amount)),
    }))
  const manual: LinesPayloadLine[] = []
  for (const e of edits) {
    const label = e.label.trim()
    const n = toNumber(e.amount)
    const err: { label?: string; amount?: string } = {}
    if (!label) err.label = "항목 이름을 적어 주세요"
    if (n === null) err.amount = "금액을 적어 주세요"
    else if (n === 0) err.amount = "0원이 아닌 금액을 적어 주세요"
    if (err.label || err.amount) {
      errors[e.key] = err
      continue
    }
    manual.push({
      contract_id: e.contract_id ?? null,
      room_code: e.room_code ?? null,
      line_type: "manual",
      label: label.slice(0, 200),
      quantity: null,
      unit_price: null,
      amount: Math.round(n!),
    })
  }
  return { lines: [...generated, ...manual], errors }
}

/** 조정 라인 편집이 서버 값과 달라졌는가(시트 dirty) */
export function manualEditsDirty(serverLines: BillLine[], edits: ManualLineEdit[]): boolean {
  const a = manualEditsFrom(serverLines).map((e) => `${e.label.trim()}|${e.amount ?? ""}`)
  const b = edits.map((e) => `${e.label.trim()}|${e.amount ?? ""}`)
  return a.length !== b.length || a.some((v, i) => v !== b[i])
}

/** 지난달 같은 기업 청구서와 비교 한 줄. prev가 없거나 둘 중 하나가 수기 청구서면 null(정기 청구서끼리만 비교한다) */
export function prevMonthComparison(cur: BillRow, prev: BillRow | null | undefined): string | null {
  if (!prev || cur.is_manual || prev.is_manual) return null
  const parts = (r: BillRow) => {
    const rent = amt(r.rent_total)
    const mgmt = amt(r.mgmt_total)
    const elec = amt(r.elec_amount)
    const total = amt(r.total_amount)
    return { 임대료: rent, 관리비: mgmt, 전기료: elec, 조정: total - rent - mgmt - elec, total }
  }
  const a = parts(cur)
  const b = parts(prev)
  const diff = a.total - b.total
  if (diff === 0) return "지난달과 같은 금액이에요"
  const keys = ["임대료", "관리비", "전기료", "조정"] as const
  let top: (typeof keys)[number] | null = null
  let topDiff = 0
  for (const k of keys) {
    const d = a[k] - b[k]
    if (Math.sign(d) === Math.sign(diff) && Math.abs(d) > Math.abs(topDiff)) {
      top = k
      topDiff = d
    }
  }
  const head = diff > 0 ? `지난달보다 ${won(diff)} 늘었어요` : `지난달보다 ${won(-diff)} 줄었어요`
  if (!top) return head
  return `${head} · ${top === "조정" ? "조정 항목" : top}${top === "조정" ? "이" : "가"} 가장 많이 ${diff > 0 ? "늘었어요" : "줄었어요"}`
}

// ── 추가 청구 ─────────────────────────────────────────────────────────────────

/** contracts GET 행 중 생성 판정에 쓰는 필드 */
export interface ContractForBilling {
  status: string
  start_date?: string | null
  ended_at?: string | null
  first_month_billing?: string | null
  last_month_billing?: string | null
}

/**
 * 월 마감 생성(generate)이 그 청구월에 이 기업 정기 청구서를 만드는가 — generate/route.ts와 같은 기준(가드 #19).
 * 대상: 진행 중 계약 + 그 청구월에 끝난 계약(마지막 달 청구). 첫 달·마지막 달 청구 'none'인 계약은 생성도 건너뛴다.
 * endedOnly: 청구 대상이 그 달에 끝난 계약뿐(퇴실한 달) — 막음 안내 문구를 고르는 데 쓴다.
 * 모르는 값(필드 없음)은 청구하는 쪽으로 본다(막는 쪽이 안전).
 */
export function generateWouldBill(contracts: ContractForBilling[], period: string): { bills: boolean; endedOnly: boolean } {
  let active = false
  let ended = false
  for (const c of contracts) {
    const endsThisMonth = !!c.ended_at && c.ended_at.slice(0, 7) === period
    const target = c.status === "active" || (c.status === "ended" && endsThisMonth)
    if (!target) continue
    const startsThisMonth = !!c.start_date && c.start_date.slice(0, 7) === period
    if (startsThisMonth) {
      if (c.first_month_billing === "none") continue
    } else if (endsThisMonth) {
      if (c.last_month_billing === "none") continue
    }
    if (c.status === "active") active = true
    else ended = true
  }
  return { bills: active || ended, endedOnly: ended && !active }
}

export type AddChargeKind = "add_to_draft" | "issued" | "blocked" | "new_manual"

export interface AddChargeDecision {
  kind: AddChargeKind
  /** ① 그 달 작성 중 청구서 / ② 다음 달 작성 중 청구서(있을 때만) */
  target: BillRow | null
  /** ② 발행된 그 달 청구서 */
  existing: BillRow | null
  nextPeriod: string
}

/**
 * 청구월을 고르는 순간의 네 가지 상태(계획서 4.4.7 B-5, 가드 #19).
 * ① 그 달 작성 중 청구서가 있음 → 항목으로 추가 ② 그 달 청구서를 이미 발행했음 → 다음 달 작성 중이 있을 때만 그곳에 추가
 * ③ 생성이 그 달 정기 청구서를 만들 기업(진행 중 계약 또는 그 달에 끝난 계약)이고 그 달 청구서가 없음 → 막음
 *    (생성이 수기 청구서 있는 기업을 건너뛰어 정기 청구가 빠진다)
 * ④ 그 밖(진행 중 계약 없음)이고 그 달 청구서가 없음 → 새 수기 청구서
 */
export function addChargeDecision(p: {
  period: string
  bills: BillRow[]
  /** 월 마감 생성이 그 청구월에 이 기업 정기 청구서를 만드는가 — generateWouldBill(contracts, period).bills */
  hasActiveContract: boolean
}): AddChargeDecision {
  const nextPeriod = addMonths(p.period, 1)
  const same = p.bills.find((b) => b.period === p.period) ?? null
  if (same && same.status === "draft") return { kind: "add_to_draft", target: same, existing: null, nextPeriod }
  if (same) {
    const next = p.bills.find((b) => b.period === nextPeriod && b.status === "draft") ?? null
    return { kind: "issued", target: next, existing: same, nextPeriod }
  }
  if (p.hasActiveContract) return { kind: "blocked", target: null, existing: null, nextPeriod }
  return { kind: "new_manual", target: null, existing: null, nextPeriod }
}

/** 추가 청구 항목(수기 청구서 POST·조정 라인 추가 공용). 종류는 조정(manual)만 */
export interface ChargeItemEdit {
  key: string
  label: string
  amount: string | null
}

export function validateChargeItems(items: ChargeItemEdit[]): {
  lines: { label: string; amount: number; line_type: "manual" }[]
  errors: Record<string, { label?: string; amount?: string }>
} {
  const errors: Record<string, { label?: string; amount?: string }> = {}
  const lines: { label: string; amount: number; line_type: "manual" }[] = []
  for (const it of items) {
    const label = it.label.trim()
    const n = toNumber(it.amount)
    // 둘 다 비어 있는 줄은 없는 줄로 본다
    if (!label && n === null) continue
    const err: { label?: string; amount?: string } = {}
    if (!label) err.label = "항목 이름을 적어 주세요"
    if (n === null) err.amount = "금액을 적어 주세요"
    else if (n === 0) err.amount = "0원이 아닌 금액을 적어 주세요"
    if (err.label || err.amount) errors[it.key] = err
    else lines.push({ label: label.slice(0, 200), amount: Math.round(n!), line_type: "manual" })
  }
  return { lines, errors }
}

// ── 일괄 납부 ─────────────────────────────────────────────────────────────────

export interface PayItem {
  id: number
  include: boolean
  /** "YYYY-MM-DD" 또는 "" */
  date: string
}

export interface PayCheck {
  /** 보낼 건(포함 + 날짜 있음) */
  ready: { id: number; paid_at: string }[]
  /** 날짜가 빈 포함 행 id — 비어 있으면 보내지 않는다(이체일을 비워 보내면 서버가 조용히 오늘로 기록한다) */
  missingDate: number[]
  /** 형식이 틀린 날짜 */
  invalidDate: number[]
  /** 입금일이 발행일보다 앞섬(주황 경고, 막지는 않음) */
  beforeIssued: number[]
  /** 입금일이 오늘보다 뒤(주황 경고) */
  future: number[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 실제 있는 날짜인가("2026-13-40" 거름) */
function isRealDate(d: string): boolean {
  if (!DATE_RE.test(d)) return false
  const t = new Date(`${d}T00:00:00Z`)
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d
}

export function checkPayItems(items: PayItem[], rows: Pick<BillRow, "id" | "issued_at">[], today: string = todayKST()): PayCheck {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const out: PayCheck = { ready: [], missingDate: [], invalidDate: [], beforeIssued: [], future: [] }
  for (const it of items) {
    if (!it.include) continue
    const d = it.date.trim()
    if (!d) {
      out.missingDate.push(it.id)
      continue
    }
    if (!isRealDate(d)) {
      out.invalidDate.push(it.id)
      continue
    }
    const issued = toKstDate(byId.get(it.id)?.issued_at ?? null)
    if (issued && d < issued) out.beforeIssued.push(it.id)
    if (d > today) out.future.push(it.id)
    out.ready.push({ id: it.id, paid_at: d })
  }
  return out
}

/** 납부 처리 결과 토스트 문장 */
export function paidToastText(rows: Pick<BillRow, "tenant_name" | "period">[]): string {
  if (rows.length === 1) return `${rows[0].tenant_name} ${billMonthShort(rows[0].period)}을 납부 완료로 바꿨어요`
  return `${rows.length}건을 납부 완료로 바꿨어요`
}

/** 납부 메모 한 줄(입금일 + 적은 메모) */
export function payMemoLine(paidAt: string, memo: string): string | null {
  const m = memo.trim()
  if (!m) return null
  return `${paidAt} 입금 확인 · ${m}`
}

// ── 납부 안내 문구 ─────────────────────────────────────────────────────────────

export interface BankForGuide {
  text: string
  bank: string | null
  account: string | null
  holder: string | null
}

/**
 * 문자·카카오톡으로 보낼 납부 안내 문구(계획서 4.4.7 B-9). 메일이 꺼진 운영에서도 쓸 수 있는 독촉 수단.
 * 계좌는 getBillingBankInfo()(PDF와 같은 원문) — 분해된 값이 있으면 "하나은행 910-…(예금주)", 없으면 원문을 한 줄로.
 */
export function paymentGuideText(p: {
  tenantName: string
  bills: Pick<BillRow, "period" | "total_amount">[]
  bank: BankForGuide
  phone?: string | null
  today?: string
}): string {
  const periods = [...new Set(p.bills.map((b) => b.period))].sort()
  const today = p.today ?? todayKST()
  const thisYear = today.slice(0, 4)
  const sameYear = periods.every((ym) => ym.slice(0, 4) === thisYear)
  const names = periods.map((ym) => (sameYear ? `${Number(ym.slice(5, 7))}월분` : billMonth(ym))).join("·")
  const sum = p.bills.reduce((s, b) => s + amt(b.total_amount), 0)
  const account =
    p.bank.bank && p.bank.account
      ? `${p.bank.bank} ${p.bank.account}${p.bank.holder ? `(${p.bank.holder})` : ""}`
      : p.bank.text.replace(/\s*\n\s*/g, " · ").trim()
  const contact = p.phone ? ` 문의 ${p.phone}` : ""
  return `${p.tenantName} ${names} 관리비 ${won(sum)}이 아직 입금 확인 전이에요. ${account}로 보내 주세요.${contact}`
}
