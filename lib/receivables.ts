// 받을 돈(미수) 판정의 단일 기준 — 관리자 홈·사이드바 배지·청구서 "받을 돈"·포털 "낼 관리비"가 모두 이 규칙을 쓴다(계획서 2.2).
// 순수 함수. DB 상태를 바꾸지 않는다. 운영은 납부 기한이 NULL이고 overdue 전환(cron)이 없으므로
// "기한 지남"을 DB 상태가 아니라 날짜로 판정하고, 기한이 없으면 "기한 없음 · 발행 후 n일" 구간에 따로 둔다.
//
// 사용 예:
//   import { receivableState, isLate, RECEIVABLE_SQL } from "@/lib/receivables"
//   const st = receivableState({ status: b.status, due_date: b.due_date, issued_at: b.issued_at })
//   if (st.kind === "receivable" && isLate(st)) …
//   // SQL에서 같은 판정이 필요하면(목록 거르기·합계):
//   const R = RECEIVABLE_SQL("b", todayKST())
//   await sql`SELECT COUNT(*) FROM bills b WHERE ${sql.unsafe(R.isReceivable)} AND ${sql.unsafe(R.isLate)}`
//
// 규칙
//   미수(receivable) = status IN ('issued','overdue')
//   정정 중(correcting) = status='draft' AND issued_at IS NOT NULL (발행했다가 되돌린 것 — 받을 돈 합계와 따로 센다)
//   기한 지남 = status='overdue' 또는 due_date < today
//   구간 bucket: not_due(기한 전·오늘 포함) / d1_30 / d31_60 / d60_plus(지난 일수) / no_due(기한 NULL, days = 발행 후 일수)
//   isLate = d1_30·d31_60·d60_plus, 또는 no_due이고 발행 후 31일 이상

import { daysFrom, toKstDate, todayKST, type DateLike } from "./format"

export interface ReceivableInput {
  status: string
  due_date: DateLike
  issued_at: DateLike
}

export type ReceivableKind = "receivable" | "correcting" | "none"
export type ReceivableBucket = "not_due" | "d1_30" | "d31_60" | "d60_plus" | "no_due"

export interface ReceivableState {
  kind: ReceivableKind
  /** kind="receivable"일 때만 값이 있다(정정 중·그 밖은 null) */
  bucket: ReceivableBucket | null
  /**
   * not_due: 기한까지 남은 일수(오늘이 기한이면 0)
   * d1_30·d31_60·d60_plus: 기한이 지난 일수(1 이상)
   * no_due: 발행 후 일수(issued_at이 없으면 null)
   * correcting·none: null
   */
  days: number | null
}

/** 기한 없음 구간이 "늦음"으로 바뀌는 발행 후 일수 */
export const NO_DUE_LATE_DAYS = 31

export const LATE_BUCKETS: readonly ReceivableBucket[] = ["d1_30", "d31_60", "d60_plus"]

function pastBucket(days: number): ReceivableBucket {
  if (days <= 30) return "d1_30"
  if (days <= 60) return "d31_60"
  return "d60_plus"
}

export function receivableState(bill: ReceivableInput, today: string = todayKST()): ReceivableState {
  const { status } = bill
  if (status === "draft" && toKstDate(bill.issued_at) !== null) return { kind: "correcting", bucket: null, days: null }
  if (status !== "issued" && status !== "overdue") return { kind: "none", bucket: null, days: null }

  const dueDiff = daysFrom(bill.due_date, today) // 남은(+)·지난(−)
  const issuedDiff = daysFrom(bill.issued_at, today)
  const sinceIssued = issuedDiff === null ? null : Math.max(0, -issuedDiff)

  if (dueDiff !== null && dueDiff < 0) {
    const past = -dueDiff
    return { kind: "receivable", bucket: pastBucket(past), days: past }
  }
  if (status === "overdue") {
    // DB가 이미 연체로 바꾼 건은 기한 날짜와 상관없이 기한 지남으로 본다(지난 일수는 최소 1)
    const past = Math.max(1, dueDiff !== null ? -dueDiff : (sinceIssued ?? 1))
    return { kind: "receivable", bucket: pastBucket(past), days: past }
  }
  if (dueDiff === null) return { kind: "receivable", bucket: "no_due", days: sinceIssued }
  return { kind: "receivable", bucket: "not_due", days: dueDiff }
}

/** 기한 지남(구간 d1_30·d31_60·d60_plus) 또는 기한 없이 발행 후 31일 이상 */
export function isLate(state: ReceivableState): boolean {
  if (state.kind !== "receivable" || state.bucket === null) return false
  if (LATE_BUCKETS.includes(state.bucket)) return true
  return state.bucket === "no_due" && state.days !== null && state.days >= NO_DUE_LATE_DAYS
}

/** 화면 문구용 구간 이름(받을 돈 구간 카드·필터) */
export const BUCKET_LABEL: Record<ReceivableBucket, string> = {
  not_due: "기한 전",
  d1_30: "1~30일 지남",
  d31_60: "31~60일 지남",
  d60_plus: "60일 넘게 지남",
  no_due: "기한 없음",
}

// ── 같은 규칙의 SQL 조각 ──────────────────────────────────────────────────────

export interface ReceivableSql {
  /** status IN ('issued','overdue') */
  isReceivable: string
  /** draft + issued_at 있음 */
  isCorrecting: string
  /** 미수이면서 기한 지남(overdue 또는 due_date < today) */
  isPastDue: string
  /** isLate()와 같은 판정(미수 전제 포함) */
  isLate: string
  /** 미수 행의 구간 이름(text). 미수가 아니면 NULL */
  bucket: string
  /** receivableState().days와 같은 값(int). 미수가 아니면 NULL */
  days: string
}

/**
 * receivableState()와 같은 규칙의 SQL 조각. alias는 bills 테이블 별칭, today는 "YYYY-MM-DD"(기본 todayKST()).
 * 값은 문자열이므로 neon에서는 sql.unsafe(조각)으로 끼운다. alias·today는 형식을 검사해 그대로 넣는다(사용자 입력을 넣지 않는다).
 */
export function RECEIVABLE_SQL(alias = "b", today: string = todayKST()): ReceivableSql {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error("RECEIVABLE_SQL: alias 형식이 아닙니다")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("RECEIVABLE_SQL: today는 YYYY-MM-DD여야 합니다")
  const a = alias
  const t = `DATE '${today}'`
  const issuedDay = `((${a}.issued_at AT TIME ZONE 'Asia/Seoul')::date)`
  const since = `(CASE WHEN ${a}.issued_at IS NULL THEN NULL ELSE GREATEST(0, ${t} - ${issuedDay}) END)`
  const isReceivable = `(${a}.status IN ('issued','overdue'))`
  const isCorrecting = `(${a}.status = 'draft' AND ${a}.issued_at IS NOT NULL)`
  // NULL 비교(due_date NULL)가 NULL로 남지 않게 COALESCE로 true/false만 돌려준다
  const isPastDue = `COALESCE(${isReceivable} AND (${a}.status = 'overdue' OR ${a}.due_date < ${t}), FALSE)`
  const pastDays = `(CASE WHEN ${a}.due_date < ${t} THEN ${t} - ${a}.due_date
                         WHEN ${a}.due_date IS NOT NULL THEN 1
                         ELSE GREATEST(1, COALESCE(${since}, 1)) END)`
  const days = `(CASE WHEN NOT ${isReceivable} THEN NULL
                     WHEN ${isPastDue} THEN ${pastDays}
                     WHEN ${a}.due_date IS NULL THEN ${since}
                     ELSE ${a}.due_date - ${t} END)`
  const bucket = `(CASE WHEN NOT ${isReceivable} THEN NULL
                       WHEN ${isPastDue} THEN (CASE WHEN ${pastDays} <= 30 THEN 'd1_30' WHEN ${pastDays} <= 60 THEN 'd31_60' ELSE 'd60_plus' END)
                       WHEN ${a}.due_date IS NULL THEN 'no_due'
                       ELSE 'not_due' END)`
  const isLateSql = `COALESCE(${isPastDue} OR (${isReceivable} AND ${a}.due_date IS NULL AND ${a}.issued_at IS NOT NULL AND ${since} >= ${NO_DUE_LATE_DAYS}), FALSE)`
  return { isReceivable, isCorrecting, isPastDue, isLate: isLateSql, bucket, days }
}
