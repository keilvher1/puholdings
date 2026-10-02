// 월 마감(WP6) 화면 규칙 — 순수 함수만(tests/close-step2-model.test.ts가 고정한다).
//   2단계: 빈칸은 0이 아니라 칸 오류(저장 요청을 만들지 않음), 이동은 저장을 겸하지 않음,
//          확정 체크 기본값은 저장된 확정단가가 없을 때만 켬, ×1.1 반올림 도우미.
//   1단계: 검침 행 상태(입력 전·정상·확인 필요·오류).
//   3·4단계: '확인 필요' 판정·정렬, 납부 기한 제안·검증, 메일 결과 집계.
// 계산 엔진(lib/billing.ts)은 표시용으로 호출만 한다(가드 7.1).

import { calcElecAllocation, calcFactoryElec, type ElecAllocation, type FactoryReadings } from "@/lib/billing"
import { addMonths, daysFrom, isYm, toNumber } from "@/lib/format"
import type { ReviewRow } from "./types"

// ── 2단계: kWh 단가 도우미 ────────────────────────────────────────────────────

/** 고지서 사용단가 × 1.1 → 원 단위 반올림(Math.round). 138 → { raw: 151.8, rounded: 152 } */
export function kwhFromNotice(noticePrice: number): { raw: number; rounded: number } {
  // 정수 곱을 먼저 해 부동소수 오차(138 × 1.1 = 151.80000000000001)를 피한다
  const raw = Math.round(noticePrice * 1100) / 1000
  return { raw: Math.round(raw * 100) / 100, rounded: Math.round((noticePrice * 11) / 10) }
}

// ── 2단계: 폼 ────────────────────────────────────────────────────────────────

export interface Step2Saved {
  /** billing_periods 행이 있나 */
  exists: boolean
  elecTotal: number | null
  unitPrice: number | null
  areaRatio: number | null
  per10: number | null
  dueDate: string | null
}

/** keep = 저장된 확정단가 그대로, suggested = 지금 제안값으로 확정, manual = 직접 입력 */
export type Per10Choice = "keep" | "suggested" | "manual"

export interface Step2Form {
  elecTotal: string | null
  unitPrice: string | null
  /** 면적별 배분율(%) — 저장할 때 ÷100 */
  areaPct: string | null
  per10Choice: Per10Choice
  per10Manual: string | null
}

export type Step2Field = "elecTotal" | "unitPrice" | "areaPct" | "per10"

export const DEFAULT_AREA_RATIO = 0.7

function pctText(ratio: number): string {
  return String(Math.round(ratio * 1000) / 10)
}

/** 저장값 → 처음 폼. kWh 단가는 저장된 달에만 채운다(빈 달에 102를 미리 넣지 않는다). 확정 체크는 저장된 확정단가가 없을 때만 켠다 */
export function initialStep2Form(saved: Step2Saved): Step2Form {
  return {
    elecTotal: saved.elecTotal != null ? String(saved.elecTotal) : null,
    unitPrice: saved.exists && saved.unitPrice != null ? String(saved.unitPrice) : null,
    areaPct: pctText(saved.areaRatio ?? DEFAULT_AREA_RATIO),
    per10Choice: saved.per10 != null ? "keep" : "suggested",
    per10Manual: null,
  }
}

export interface Step2Context {
  readings: FactoryReadings
  prevReadings: FactoryReadings
  /** 면적별 진행 중 계약 부과평형 합 */
  pyeongSum: number
}

/** 화면 미리보기용 배분(엔진 함수를 표시용으로 호출). 한전 금액·kWh 단가가 없으면 null("아직 계산 전") */
export function previewAllocation(form: Step2Form, ctx: Step2Context, per10?: number | null): { factoryA: number; alloc: ElecAllocation } | null {
  const total = toNumber(form.elecTotal)
  const unit = toNumber(form.unitPrice)
  const pct = toNumber(form.areaPct)
  if (total === null || total <= 0 || unit === null || unit <= 0) return null
  const factory = calcFactoryElec(ctx.readings, ctx.prevReadings, unit)
  const alloc = calcElecAllocation(
    { elec_total: total, area_ratio: (pct ?? DEFAULT_AREA_RATIO * 100) / 100, per10_billed: per10 ?? undefined },
    ctx.pyeongSum,
    factory.totalA,
  )
  return { factoryA: factory.totalA, alloc }
}

/**
 * 2단계 배분을 계산해도 되는가 — 1단계 공장동 계량기 4개(MAIN·F101·F103·HVAC)의 이번 달 지침이 모두 **저장돼** 있고,
 * 지난달 지침도 있고, 음수 사용량이 없을 때만. 아니면 화면은 "계산 전"으로 두고 제안값·검산·확정 체크를 보이지 않는다
 * (검침 전 달에 지침 0으로 계산해 음수·거대값·"배분이 맞아요"가 뜨던 결함, 가드 #18).
 */
export function factoryMetersReady(rows: { code: string; prev: number | null; curr: number | null }[]): {
  ready: boolean
  missing: number
  noPrev: number
  negative: number
} {
  const codes: (keyof FactoryReadings)[] = ["MAIN", "F101", "F103", "HVAC"]
  let missing = 0
  let noPrev = 0
  let negative = 0
  for (const c of codes) {
    const m = rows.find((r) => r.code === c)
    if (!m || m.curr === null) missing++
    else if (m.prev === null) noPrev++
    else if (m.curr < m.prev) negative++
  }
  return { ready: missing === 0 && noPrev === 0 && negative === 0, missing, noPrev, negative }
}

/** 배분을 계산할 수 없을 때 화면에 보일 한 문장(계산 가능하면 null) */
export function metersBlockText(r: ReturnType<typeof factoryMetersReady>): string | null {
  if (r.ready) return null
  if (r.missing > 0) return `1단계 검침 ${r.missing}개를 먼저 저장해 주세요. 그 전에는 배분을 계산하지 않아요`
  if (r.negative > 0) return `1단계 검침 ${r.negative}개가 지난달보다 작아요. 1단계에서 고쳐 저장해 주세요`
  return "지난달 지침이 없는 계량기가 있어 배분을 계산할 수 없어요"
}

/** 저장할 10평당 확정단가. suggested인데 계산 전이면 null */
export function per10ToSave(form: Step2Form, saved: Step2Saved, suggested: number | null): number | null {
  if (form.per10Choice === "keep") return saved.per10
  if (form.per10Choice === "suggested") return suggested
  const v = toNumber(form.per10Manual)
  return v === null ? null : Math.round(v)
}

export interface Step2Check {
  errors: Partial<Record<Step2Field, string>>
  /** 직접 입력을 골랐는데 칸이 비었음 → 3버튼 확인창(제안값으로 확정 / 확정하지 않고 저장 / 닫기) */
  needsPer10Decision: boolean
}

/** 저장 전 검증. 빈칸은 0이 아니라 칸 오류 */
export function validateStep2(form: Step2Form, suggested: number | null): Step2Check {
  const errors: Step2Check["errors"] = {}
  const total = toNumber(form.elecTotal)
  if (total === null) errors.elecTotal = "한전 청구금액을 넣어 주세요"
  else if (total <= 0) errors.elecTotal = "한전 청구금액은 0원보다 커야 해요"
  const unit = toNumber(form.unitPrice)
  if (unit === null) errors.unitPrice = "공장동 kWh 단가를 넣어 주세요"
  else if (unit <= 0) errors.unitPrice = "kWh 단가는 0원보다 커야 해요"
  const pct = toNumber(form.areaPct)
  if (pct === null) errors.areaPct = "면적별 배분율을 넣어 주세요"
  else if (pct < 0 || pct > 100) errors.areaPct = "면적별 배분율은 0%에서 100% 사이로 넣어 주세요"
  let needsPer10Decision = false
  if (form.per10Choice === "manual") {
    const v = toNumber(form.per10Manual)
    if (v === null) needsPer10Decision = true
    else if (v <= 0) errors.per10 = "10평당 청구단가는 0원보다 커야 해요"
  } else if (form.per10Choice === "suggested" && !errors.elecTotal && !errors.unitPrice && suggested !== null && suggested <= 0) {
    errors.per10 = "10평당 단가가 0원 이하로 계산돼요. 한전 청구금액과 1단계 검침을 확인해 주세요"
  }
  return { errors, needsPer10Decision }
}

export interface Step2Payload {
  period: string
  elec_total: number
  elec_unit_price: number
  area_ratio: number
  per10_billed: number | null
  due_date?: string
}

/**
 * 저장 요청 본문. 검증을 통과하지 못하면 null(요청을 만들지 않는다).
 * per10Override: 3버튼 확인창 결과("suggested"=제안값으로 확정, null=확정하지 않고 저장).
 */
export function buildStep2Payload(
  usageMonth: string,
  form: Step2Form,
  saved: Step2Saved,
  suggested: number | null,
  per10Override?: "suggested" | null,
): Step2Payload | null {
  const effective: Step2Form = per10Override === "suggested" ? { ...form, per10Choice: "suggested" } : form
  const check = validateStep2(effective, suggested)
  if (Object.keys(check.errors).length > 0) return null
  if (check.needsPer10Decision && per10Override === undefined) return null
  const per10 = per10Override === null ? null : per10ToSave(effective, saved, suggested)
  const body: Step2Payload = {
    period: usageMonth,
    elec_total: Math.round(toNumber(effective.elecTotal)!),
    elec_unit_price: toNumber(effective.unitPrice)!,
    area_ratio: Math.round(toNumber(effective.areaPct)! * 10) / 1000,
    per10_billed: per10,
  }
  // periods POST는 due_date를 보내지 않으면 NULL로 덮어쓴다 — 저장된 값을 그대로 돌려보내 지우지 않는다
  if (saved.dueDate) body.due_date = saved.dueDate
  return body
}

/** 저장값과 지금 폼이 다른가(주 버튼이 "배분 저장하고 다음"이 되는 조건) */
export function isStep2Dirty(form: Step2Form, saved: Step2Saved, suggested: number | null): boolean {
  const same = (a: number | null, b: number | null) => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) < 1e-9)
  if (!same(toNumber(form.elecTotal), saved.elecTotal)) return true
  if (!same(toNumber(form.unitPrice), saved.exists ? saved.unitPrice : null)) return true
  const pct = toNumber(form.areaPct)
  const ratio = pct === null ? null : Math.round(pct * 10) / 1000
  if (!same(ratio, saved.areaRatio ?? DEFAULT_AREA_RATIO)) return true
  if (form.per10Choice === "manual" && toNumber(form.per10Manual) === null) return saved.per10 !== null
  return !same(per10ToSave(form, saved, suggested), saved.per10)
}

/** 하단 바 주 버튼 하나. 이동은 저장을 겸하지 않는다(바뀐 값이 있을 때만 저장) */
export function step2Primary(dirty: boolean, locked: boolean): { label: string; action: "save_and_next" | "next" } {
  if (dirty && !locked) return { label: "배분 저장하고 다음", action: "save_and_next" }
  return { label: "다음: 청구서 만들기", action: "next" }
}

/** 한전 금액이 지난달과 30% 넘게 다르면 자릿수 확인 경고 */
export function kepcoOutlier(value: number | null, prev: number | null): boolean {
  if (value === null || prev === null || prev <= 0) return false
  return Math.abs(value - prev) / prev > 0.3
}

// ── 달 상태 ─────────────────────────────────────────────────────────────────

/** 발행이 끝난 달: 정기 발행분이 있고 작성 중·정정 중이 없고 발행 뒤 바뀐 값도 없음(1·2단계 '확인 필요'는 정정이 필요할 때만 볼 일) */
export function isMonthFinished(s: {
  bills: { draft: number; correcting: number; issued: number; overdue: number; paid: number }
  needsCorrection: boolean
}): boolean {
  const issuedAll = s.bills.issued + s.bills.overdue + s.bills.paid
  return issuedAll > 0 && s.bills.draft === 0 && s.bills.correcting === 0 && !s.needsCorrection
}

// ── 1단계: 검침 행 상태 ───────────────────────────────────────────────────────

export type MeterState = "empty" | "ok" | "check" | "error" | "noPrev"

/** 입력 전 / 정상 / 확인 필요(평소 대비 ±50% 이상) / 오류(지난달보다 작음 = 음수 사용량) */
export function meterRowState(cur: number | null, prev: number | null, typical: number | null): { state: MeterState; usage: number | null } {
  if (cur === null) return { state: "empty", usage: null }
  if (prev === null) return { state: "noPrev", usage: null }
  const usage = Math.round((cur - prev) * 10) / 10
  if (usage < 0) return { state: "error", usage }
  if (typical !== null && typical > 0 && Math.abs(usage - typical) >= typical * 0.5) return { state: "check", usage }
  return { state: "ok", usage }
}

// ── 3·4단계: 확인 필요 ───────────────────────────────────────────────────────

export const REVIEW_PCT = 0.1
export const REVIEW_WON = 50000

export function changeOf(row: Pick<ReviewRow, "total" | "prevTotal">): { diff: number | null; pct: number | null } {
  if (row.prevTotal === null) return { diff: null, pct: null }
  const diff = row.total - row.prevTotal
  const pct = row.prevTotal !== 0 ? Math.round((diff / row.prevTotal) * 1000) / 10 : null
  return { diff, pct }
}

/**
 * 이번 달 "보통 변동"(지난달이 있는 정기 청구서 증감률의 가운데 값, %). 한전 금액이 바뀌면 모든 기업이 같은 비율로
 * 오르내리므로, 그 공통 변동을 빼고 봐야 정말 튀는 곳만 남는다. 비교할 행이 3개 미만이면 0.
 */
export function monthBaselinePct(rows: ReviewRow[]): number {
  const pcts = rows
    .filter((r) => !r.isManual && r.prevTotal !== null && r.prevTotal > 0)
    .map((r) => ((r.total - r.prevTotal!) / r.prevTotal!) * 100)
    .sort((a, b) => a - b)
  if (pcts.length < 3) return 0
  const mid = Math.floor(pcts.length / 2)
  const m = pcts.length % 2 ? pcts[mid] : (pcts[mid - 1] + pcts[mid]) / 2
  return Math.round(m * 10) / 10
}

/**
 * '확인 필요' 사유(없으면 빈 배열). 기준: 지난달 대비 ±10% 또는 ±5만 원(이번 달 보통 변동 baselinePct를 뺀 나머지로 잰다), 신규, 0원, 전기 0원.
 * baselinePct = 0이면 지난달 대비 그대로.
 */
export function reviewReasons(row: ReviewRow, baselinePct = 0): string[] {
  const out: string[] = []
  if (row.total === 0) out.push("0원")
  if (row.zeroElec) out.push("전기 0원")
  if (row.prevTotal === null) out.push("신규")
  else {
    const { diff, pct } = changeOf(row)
    if (diff !== null && diff !== 0) {
      const residual = diff - (row.prevTotal * baselinePct) / 100
      const pctOff = pct === null ? null : Math.abs(pct - baselinePct)
      if (Math.abs(residual) >= REVIEW_WON || (pctOff !== null && pctOff >= REVIEW_PCT * 100)) out.push("변동 큼")
    }
  }
  return out
}

/**
 * 사유 배지 글자. "변동 큼"은 보통 변동을 뺀 근거를 같이 쓴다(화면의 증감 숫자와 깃발 근거가 달라 헷갈리지 않게).
 * 예: 이번 달 보통 변동 −13.1%, 이 기업 −6.3% → "변동 큼 · 다른 기업보다 +6.8%p"
 */
export function reviewReasonLabel(reason: string, row: ReviewRow, baselinePct = 0): string {
  if (reason !== "변동 큼" || baselinePct === 0) return reason
  const { pct } = changeOf(row)
  if (pct === null) return reason
  const off = Math.round((pct - baselinePct) * 10) / 10
  return `변동 큼 · 다른 기업보다 ${off >= 0 ? "+" : "−"}${Math.abs(off)}%p`
}

/** 기업 대부분이 함께 크게 오르내린 달(보통 변동이 ±10% 이상) — 한전 금액·확정단가 오입력일 수 있어 따로 알린다 */
export const BASELINE_ALERT_PCT = 10

export function baselineAlert(baselinePct: number): string | null {
  if (Math.abs(baselinePct) < BASELINE_ALERT_PCT) return null
  const sign = baselinePct > 0 ? "+" : "−"
  return `기업 대부분이 지난달보다 ${sign}${Math.abs(baselinePct)}% 안팎으로 바뀌었어요. 한전 청구금액·10평당 단가가 맞는지 확인해 주세요`
}

export function needsReview(row: ReviewRow, baselinePct = 0): boolean {
  return reviewReasons(row, baselinePct).length > 0
}

/** 증감 절댓값 큰 순(신규는 청구액 전체를 변동으로 본다), 같으면 이름순 */
export function sortByChange(rows: ReviewRow[]): ReviewRow[] {
  const mag = (r: ReviewRow) => Math.abs(changeOf(r).diff ?? r.total)
  return [...rows].sort((a, b) => mag(b) - mag(a) || a.tenantName.localeCompare(b.tenantName, "ko"))
}

// ── 4단계: 납부 기한 ─────────────────────────────────────────────────────────

function daysInYm(ym: string): number {
  const [y, m] = ym.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * 납부 기한 제안: 지난번 발행에 쓴 규칙(청구월 기준 몇 달 뒤 며칠)을 이번 청구월에 적용한다.
 * 지난 기한이 그 달 말일이었으면 "말일" 규칙. 이력이 없으면 청구월 말일.
 */
export function suggestDueDate(billMonth: string, last: { period: string; dueDate: string } | null): { date: string; rule: string } {
  if (last && isYm(last.period) && /^\d{4}-\d{2}-\d{2}$/.test(last.dueDate)) {
    const dueYm = last.dueDate.slice(0, 7)
    const [py, pm] = last.period.split("-").map(Number)
    const [dy, dm] = dueYm.split("-").map(Number)
    const offset = (dy - py) * 12 + (dm - pm)
    const day = Number(last.dueDate.slice(8, 10))
    const lastDay = day === daysInYm(dueYm)
    const target = addMonths(billMonth, offset)
    const d = lastDay ? daysInYm(target) : Math.min(day, daysInYm(target))
    const when = offset === 0 ? "청구월" : offset === 1 ? "다음 달" : offset > 0 ? `${offset}개월 뒤` : `${-offset}개월 전`
    return { date: `${target}-${String(d).padStart(2, "0")}`, rule: `지난번 발행과 같은 규칙(${when} ${lastDay ? "말일" : `${day}일`})` }
  }
  const dim = daysInYm(billMonth)
  return { date: `${billMonth}-${String(dim).padStart(2, "0")}`, rule: "청구월 말일(지난 발행에 쓴 기한이 없어요)" }
}

/** 납부 기한 칸 검증: 비었거나 오늘보다 앞이면 칸 오류 */
export function validateDueDate(value: string | null | undefined, today: string): string | null {
  if (!value) return "납부 기한을 골라 주세요"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "납부 기한 날짜를 다시 골라 주세요"
  const d = daysFrom(value, today)
  if (d === null) return "납부 기한 날짜를 다시 골라 주세요"
  if (d < 0) return "오늘이나 그 뒤 날짜를 골라 주세요"
  return null
}

// ── 4단계: 메일 결과 ─────────────────────────────────────────────────────────

/** lib/mail.ts가 env 없을 때 남기는 실패 사유(lib/admin-todo.ts MAIL_NOT_CONFIGURED_ERRORS와 같은 값) */
const NOT_CONFIGURED = ["RESEND_API_KEY not set", "MAIL_FROM not set"]

export function isMailNotConfigured(error: string | null | undefined): boolean {
  return !!error && NOT_CONFIGURED.includes(error)
}

/** 메일 실패 사유를 사용자 문구로(원문은 메일 기록 화면에서 본다) */
export function mailErrorText(error: string | null | undefined): string {
  const e = (error ?? "").toLowerCase()
  if (isMailNotConfigured(error)) return "메일 발송이 설정되지 않아 보내지 않았어요"
  if (/거부|reject|mailbox|full|blocked|bounce/.test(e)) return "받는 서버가 거부했어요 — 주소를 확인해 주세요"
  if (/형식|invalid|to` field|address/.test(e)) return "메일 주소 형식이 맞지 않아요 — 주소를 확인해 주세요"
  return "보내지 못했어요 — 메일 기록에서 사유를 확인해 주세요"
}

export interface IssueOutcome {
  issued: number
  total: number
  sent: number
  failed: ReviewRow[]
  notConfigured: number
  noEmail: ReviewRow[]
  /** 발행됐지만 이번 발행 뒤 메일 기록이 없음(예전 데이터 등) */
  noLog: number
}

/** 발행된 행(issued·overdue·paid, 정기·수기 모두)으로 완료 화면 숫자를 만든다. 메일 결과는 issued_at 이후 로그만(서버가 거름) */
export function issueOutcome(rows: ReviewRow[]): IssueOutcome {
  const out: IssueOutcome = { issued: 0, total: 0, sent: 0, failed: [], notConfigured: 0, noEmail: [], noLog: 0 }
  for (const r of rows) {
    if (!["issued", "overdue", "paid"].includes(r.status)) continue
    out.issued++
    out.total += r.total
    if (!r.hasEmail) {
      out.noEmail.push(r)
      continue
    }
    if (!r.mail) out.noLog++
    else if (r.mail.status === "sent") out.sent++
    else if (r.mail.status === "failed" && isMailNotConfigured(r.mail.error)) out.notConfigured++
    else if (r.mail.status === "failed") out.failed.push(r)
    else out.noLog++
  }
  return out
}
