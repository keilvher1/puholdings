// 입주기업 포털 화면용 순수 판정 함수(WP8). 서버·클라이언트·테스트가 같이 쓴다(DB·env 없음).
//   - 낼 관리비 요약(홈·청구서 목록): 합계·건수·기한 지남 문장·기한 없음 문장 — lib/receivables.ts 판정만 쓴다(DB overdue만 보지 않는다)
//   - 청구서 행의 기한 글자, 지난달 비교 한 줄
//   - 프로그램 카드 묶음(해야 할 일·신청할 수 있어요·신청한 프로그램·지난 프로그램)과 카드당 배지 1개
// 금액은 저장값(total_amount·라인 amount)을 더하고 빼기만 한다. 청구 금액을 다시 계산하지 않는다.
//
// 사용 예:
//   const s = summarizeUnpaid(bills, todayKST())   // { count: 2, total: 593934, lateSentence: "8월분 납부 기한이 21일 지났어요", … }
//   const c = comparePrevious(cur, prev)           // { sentence: "지난달보다 11,550원 늘었어요 · 전기료가 가장 많이 늘었어요(+11,550원)", … }
//   const g = groupPrograms(programs, todayKST())  // { todo: [...], available: [...], applied: [...], past: [...] }

import { addMonths, billMonth, billMonthShort, dateShort, daysFrom, due, toKstDate, toNumber, todayKST, won, type DateLike } from "@/lib/format"
import { LATE_BUCKETS, receivableState, type ReceivableState } from "@/lib/receivables"
import { statusMeta, type Tone } from "@/lib/status"

// ── 청구서 ───────────────────────────────────────────────────────────────────

export interface PortalBillRow {
  id: number
  period: string
  total_amount: string | number
  status: string
  due_date: string | null
  issued_at: DateLike
  paid_at?: DateLike
  invoice_pathname?: string | null
}

/** 납부 기한이 비어 있을 때(운영의 모든 청구서) — D-day를 만들지 않고 연체처럼 보이게 하지 않는다 */
export const NO_DUE_SENTENCE = "납부 기한이 따로 정해지지 않았어요. 궁금하면 센터에 문의해 주세요"

/** 청구서 한 행의 기한 글자: "10월 10일(토)까지 · 9일 남음" / "9월 10일(목) · 21일 지남" / "납부 기한 없음" / "9월 20일(일) 납부 확인" */
export function billDueText(bill: Pick<PortalBillRow, "status" | "due_date" | "paid_at">, today: string = todayKST()): string {
  if (bill.status === "paid") {
    const paid = toKstDate(bill.paid_at ?? null)
    return paid ? `${dateShort(paid, today)} 납부 확인` : "납부 완료"
  }
  return bill.due_date ? due(bill.due_date, today) : "납부 기한 없음"
}

/** 기한이 날짜로 지났거나 DB가 연체로 바꾼 미수(기한 없음 구간은 늦음으로 보이지 않는다) */
export function isPastDueState(state: ReceivableState): boolean {
  return state.kind === "receivable" && state.bucket !== null && LATE_BUCKETS.includes(state.bucket)
}

export interface UnpaidRow<T extends PortalBillRow = PortalBillRow> {
  bill: T
  state: ReceivableState
  pastDue: boolean
  dueText: string
}

export interface UnpaidSummary<T extends PortalBillRow = PortalBillRow> {
  count: number
  total: number
  /** 청구월 최신순 */
  rows: UnpaidRow<T>[]
  /** 기한 지남이 있을 때만: "8월분 납부 기한이 21일 지났어요" */
  lateSentence: string | null
  /** 기한이 비어 있는 미수가 있을 때만 NO_DUE_SENTENCE */
  noDueSentence: string | null
  /** 가장 급한 건(기한 지남 중 가장 오래된 것 → 기한 전 중 가장 가까운 것 → 기한 없음 중 가장 오래된 것) */
  mostUrgent: UnpaidRow<T> | null
}

/** 낼 관리비 요약. 미수 판정은 receivableState(납부 대기 + 기한 지남, 청구월 무관). 정정 중·작성 중·납부 완료는 넣지 않는다 */
export function summarizeUnpaid<T extends PortalBillRow>(bills: T[], today: string = todayKST()): UnpaidSummary<T> {
  const rows: UnpaidRow<T>[] = bills
    .map((bill) => {
      const state = receivableState({ status: bill.status, due_date: bill.due_date, issued_at: bill.issued_at }, today)
      return { bill, state, pastDue: isPastDueState(state), dueText: billDueText(bill, today) }
    })
    .filter((r) => r.state.kind === "receivable")
    .sort((a, b) => (a.bill.period < b.bill.period ? 1 : a.bill.period > b.bill.period ? -1 : b.bill.id - a.bill.id))

  const total = rows.reduce((s, r) => s + (toNumber(r.bill.total_amount) ?? 0), 0)
  const late = rows.filter((r) => r.pastDue).sort((a, b) => (b.state.days ?? 0) - (a.state.days ?? 0))
  let lateSentence: string | null = null
  if (late.length === 1) {
    lateSentence = `${billMonthShort(late[0].bill.period, today)} 납부 기한이 ${late[0].state.days ?? 1}일 지났어요`
  } else if (late.length > 1) {
    lateSentence = `${late.length}건의 납부 기한이 지났어요 · 가장 오래된 ${billMonthShort(late[0].bill.period, today)}은 ${late[0].state.days ?? 1}일 지났어요`
  }
  const noDue = rows.filter((r) => r.state.bucket === "no_due")
  const notDue = rows.filter((r) => r.state.bucket === "not_due").sort((a, b) => (a.state.days ?? 0) - (b.state.days ?? 0))
  const noDueOldest = [...noDue].sort((a, b) => (b.state.days ?? 0) - (a.state.days ?? 0))
  return {
    count: rows.length,
    total,
    rows,
    lateSentence,
    noDueSentence: noDue.length > 0 ? NO_DUE_SENTENCE : null,
    mostUrgent: late[0] ?? notDue[0] ?? noDueOldest[0] ?? null,
  }
}

// ── 지난달 비교 ──────────────────────────────────────────────────────────────

export interface CompareBill {
  period: string
  total_amount: string | number
  lines: { line_type: string; amount: string | number }[]
}

export type CompareGroup = "rent" | "mgmt" | "elec" | "manual"

const GROUP_OF: Record<string, CompareGroup> = {
  rent: "rent",
  mgmt: "mgmt",
  elec_area: "elec",
  elec_metered: "elec",
  manual: "manual",
}
const GROUP_SUBJECT: Record<CompareGroup, string> = {
  rent: "임대료가",
  mgmt: "관리비가",
  elec: "전기료가",
  manual: "조정 항목 때문에",
}
export const GROUP_LABEL: Record<CompareGroup, string> = {
  rent: "임대료",
  mgmt: "관리비",
  elec: "전기료",
  manual: "조정",
}

export interface PreviousCompare {
  /** 비교한 청구서의 청구월 */
  period: string
  /** 바로 앞 달이면 true("지난달"), 아니면 그 달 이름으로 말한다 */
  consecutive: boolean
  previousTotal: number
  /** 이번 − 비교 대상 */
  diff: number
  /** 항목 묶음별 금액(이번·비교 대상) — 선택 표에 쓴다 */
  groups: { group: CompareGroup; label: string; current: number; previous: number; diff: number }[]
  /** "지난달보다 11,550원 늘었어요 · 전기료가 가장 많이 늘었어요(+11,550원)" */
  sentence: string
}

function sumGroups(lines: CompareBill["lines"]): Record<CompareGroup, number> {
  const out: Record<CompareGroup, number> = { rent: 0, mgmt: 0, elec: 0, manual: 0 }
  for (const l of lines) {
    const g = GROUP_OF[l.line_type] ?? "manual"
    out[g] += toNumber(l.amount) ?? 0
  }
  return out
}

// 부호는 항목 목록의 금액(won(), 하이픈 "-")과 같은 글자를 쓴다.
function signedWon(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${won(Math.abs(n))}`
}

/** 이번 청구서와 바로 앞 발행 청구서(같은 기업, issued·paid·overdue) 비교. 비교 대상이 없으면 null */
export function comparePrevious(current: CompareBill, previous: CompareBill | null): PreviousCompare | null {
  if (!previous) return null
  const cur = toNumber(current.total_amount) ?? 0
  const prev = toNumber(previous.total_amount) ?? 0
  const diff = cur - prev
  const consecutive = addMonths(previous.period, 1) === current.period
  const name = consecutive ? "지난달" : billMonth(previous.period)
  const cg = sumGroups(current.lines)
  const pg = sumGroups(previous.lines)
  const groups = (Object.keys(GROUP_LABEL) as CompareGroup[])
    .map((group) => ({ group, label: GROUP_LABEL[group], current: cg[group], previous: pg[group], diff: cg[group] - pg[group] }))
    .filter((g) => g.current !== 0 || g.previous !== 0)

  let sentence: string
  if (diff === 0) {
    sentence = `${name}과 같은 금액이에요`
  } else {
    const verb = diff > 0 ? "늘었어요" : "줄었어요"
    sentence = `${name}보다 ${won(Math.abs(diff))} ${verb}`
    const top = groups
      .filter((g) => (diff > 0 ? g.diff > 0 : g.diff < 0))
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0]
    if (top) sentence += ` · ${GROUP_SUBJECT[top.group]} 가장 많이 ${verb}(${signedWon(top.diff)})`
  }
  return { period: previous.period, consecutive, previousTotal: prev, diff, groups, sentence }
}

// ── 프로그램 ─────────────────────────────────────────────────────────────────

export interface PortalProgramRow {
  id: number
  title: string
  description?: string | null
  category?: string | null
  status: string
  apply_start: string | null
  apply_end: string | null
  submit_deadline: string | null
  application_status: string | null
  submission_status: string | null
  feedback?: string | null
}

export type ProgramGroup = "todo" | "available" | "applied" | "past"

/** 카드 배지 = lib/status 사전 한 칸(화면은 <StatusBadge domain status />로 그린다). label·tone은 사전 값 그대로(문장·테스트용) */
export interface ProgramBadge {
  domain: "portalProgram" | "submission" | "application"
  status: string
  label: string
  tone: Tone
}

export interface ProgramCard {
  program: PortalProgramRow
  group: ProgramGroup
  /** 카드당 배지 하나 */
  badge: ProgramBadge
  /** 날짜·할 일 한 줄(줄바꿈 없이 보인다) */
  line: string
  /** 카드 안 주 행동(해야 할 일만) */
  actionLabel: string | null
}

/** "8월 1일"(올해) / "2025년 8월 1일"(다른 해). 요일 없이 짧게 — 기간 표시용 */
export function monthDay(d: string | null | undefined, today: string = todayKST()): string {
  const ymd = toKstDate(d ?? null)
  if (!ymd) return "-"
  const [y, m, day] = ymd.split("-").map(Number)
  return `${String(y) === today.slice(0, 4) ? "" : `${y}년 `}${m}월 ${day}일`
}

/** "8월 1일 ~ 8월 20일". 둘 다 없으면 "기간 없음" */
export function dateRange(start: string | null, end: string | null, today: string = todayKST()): string {
  if (!start && !end) return "기간 없음"
  if (!start) return `${monthDay(end, today)}까지`
  if (!end) return `${monthDay(start, today)}부터`
  return `${monthDay(start, today)} ~ ${monthDay(end, today)}`
}

/** "신청 마감 10월 10일(토) · 9일 남음" / "신청 마감 오늘" */
export function applyDeadlineText(end: string | null, today: string = todayKST()): string {
  if (!end) return "신청 마감일 없음"
  const left = daysFrom(end, today)
  if (left === null) return "신청 마감일 없음"
  if (left === 0) return "신청 마감 오늘"
  if (left < 0) return `신청 마감 ${dateShort(end, today)} · 지남`
  return `신청 마감 ${dateShort(end, today)} · ${left}일 남음`
}

/** 제출 마감 글자: "10월 20일(화)까지(19일 남음)" / "오늘까지" / "마감일 없음" */
export function submitDueText(deadline: string | null, today: string = todayKST()): string {
  if (!deadline) return "마감일 없음"
  const left = daysFrom(deadline, today)
  if (left === null) return "마감일 없음"
  if (left === 0) return "오늘까지"
  if (left < 0) return `${dateShort(deadline, today)} · ${-left}일 지남`
  return `${dateShort(deadline, today)}까지(${left}일 남음)`
}

function badgeOf(domain: "portalProgram" | "submission" | "application", status: string): ProgramBadge {
  const m = statusMeta(domain, status)
  return { domain, status, label: m.label, tone: m.tone }
}

/** 신청 가능 기간 안인가(KST 날짜, 서버 applications 라우트와 같은 비교) */
export function isApplyOpen(p: Pick<PortalProgramRow, "status" | "apply_start" | "apply_end">, today: string = todayKST()): boolean {
  return p.status === "open" && (!p.apply_start || today >= p.apply_start) && (!p.apply_end || today <= p.apply_end)
}

/** 제출 마감이 지났는가(서버 submissions 라우트와 같은 비교: today > submit_deadline) */
export function isSubmitClosed(p: Pick<PortalProgramRow, "submit_deadline">, today: string = todayKST()): boolean {
  return !!p.submit_deadline && today > p.submit_deadline
}

export function classifyProgram(p: PortalProgramRow, today: string = todayKST()): ProgramCard {
  const app = p.application_status
  const sub = p.submission_status
  const submitClosed = isSubmitClosed(p, today)
  const card = (group: ProgramGroup, badge: ProgramBadge, line: string, actionLabel: string | null = null): ProgramCard => ({
    program: p,
    group,
    badge,
    line,
    actionLabel,
  })
  const submitLine = (prefix: string) => `${prefix} · ${submitDueText(p.submit_deadline, today)}`

  if (!app) {
    if (isApplyOpen(p, today)) return card("available", badgeOf("portalProgram", "available"), applyDeadlineText(p.apply_end, today))
    if (p.status === "open" && p.apply_start && today < p.apply_start)
      return card("available", badgeOf("portalProgram", "not_started"), `신청 ${monthDay(p.apply_start, today)}부터`)
    return card("past", badgeOf("portalProgram", "closed"), `신청 ${dateRange(p.apply_start, p.apply_end, today)}`)
  }
  if (app === "applied") return card("applied", badgeOf("portalProgram", "waiting_result"), `신청 ${dateRange(p.apply_start, p.apply_end, today)}`)
  if (app === "rejected") return card("past", badgeOf("portalProgram", "rejected"), `신청 ${dateRange(p.apply_start, p.apply_end, today)}`)
  if (app === "completed") return card("past", badgeOf("application", "completed"), `신청 ${dateRange(p.apply_start, p.apply_end, today)}`)

  // 선정(accepted)
  if (!sub) {
    if (submitClosed) return card("past", badgeOf("portalProgram", "submit_closed"), `제출 마감 ${monthDay(p.submit_deadline, today)}`)
    return card("todo", badgeOf("portalProgram", "submit_needed"), submitLine("자료 제출"), "제출하기")
  }
  if (sub === "resubmit_requested") {
    if (submitClosed) return card("past", badgeOf("portalProgram", "submit_closed"), `제출 마감 ${monthDay(p.submit_deadline, today)}`)
    return card("todo", badgeOf("portalProgram", "resubmit_requested"), submitLine("보완 요청"), "다시 제출하기")
  }
  if (sub === "approved") return card("applied", badgeOf("portalProgram", "approved"), "제출 자료가 승인됐어요")
  if (sub === "rejected") return card("applied", badgeOf("submission", "rejected"), "제출 자료가 반려됐어요")
  // submitted·reviewing — 담당자 검토를 기다리는 중
  return card(
    "applied",
    badgeOf("portalProgram", "reviewing"),
    p.submit_deadline ? `제출함 · 마감 ${monthDay(p.submit_deadline, today)}` : "제출함",
  )
}

export function groupPrograms(list: PortalProgramRow[], today: string = todayKST()): Record<ProgramGroup, ProgramCard[]> {
  const out: Record<ProgramGroup, ProgramCard[]> = { todo: [], available: [], applied: [], past: [] }
  for (const p of list) {
    const c = classifyProgram(p, today)
    out[c.group].push(c)
  }
  const asc = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1)
  out.todo.sort((a, b) => asc(a.program.submit_deadline, b.program.submit_deadline) || a.program.id - b.program.id)
  out.available.sort((a, b) => asc(a.program.apply_end, b.program.apply_end) || a.program.id - b.program.id)
  out.applied.sort((a, b) => b.program.id - a.program.id)
  out.past.sort((a, b) => -asc(a.program.apply_end, b.program.apply_end) || b.program.id - a.program.id)
  return out
}
