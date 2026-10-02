// 관리자 "오늘 할 일"·월 마감 진행 집계(서버 전용, 기존 테이블 SELECT만) — 계획서 2.2·2.2.1.
// 관리자 레이아웃(사이드바 배지)과 홈(WP1)·월 마감(WP6)이 같은 숫자를 쓰게 하는 단일 기준.
//
// 사용 예(서버 컴포넌트, 세션이 있을 때만):
//   import { getAdminTodo, getCloseProgress, sidebarBadges } from "@/lib/admin-todo"
//   const sql = getDb()!
//   const todo = await getAdminTodo(sql)            // 실패하면 예외 — 0으로 바꾸지 않는다. 화면이 오류 상태를 그린다
//   const badges = sidebarBadges(todo)
//   const progress = await getCloseProgress(sql)     // 기본 마감 월 규칙(아래)으로 고른 달
//   const sep = await getCloseProgress(sql, "2026-09")
//
// - React cache()로 감싸 같은 요청 안에서는 레이아웃·홈·하위 탭이 몇 번 불러도 한 번만 조회한다.
// - getAdminTodo는 한 번의 왕복(neon transaction 묶음)으로 조회한다.
// - 단계 상태(steps) 판정은 getCloseProgress 한 곳에서만 한다(WP6 close-status는 이것을 감싸 필드만 더한다).
//
// 기본 마감 월 규칙(하나뿐): L = 정기 청구서(수기 제외)가 발행(issued·overdue·paid)된 가장 최근 청구월.
//   L에 정기 작성 중·정정 중 청구서가 남아 있으면 대상 청구월 = L, 아니면 L + 1개월. 대상 사용월 = 대상 청구월 − 1개월.
//   발행 이력이 없으면 이번 달 청구월(지난달 사용분). L보다 이전 달의 작성 중 청구서와 수기 초안은 판정에 쓰지 않는다
//   (대신 staleDrafts로 홈에 따로 보인다). 검침 유무도 판정에 쓰지 않는다.

import { cache } from "react"
import type { NeonQueryFunction } from "@neondatabase/serverless"
import { calcElecAllocation, calcFactoryElec, type FactoryReadings } from "./billing"
import { addMonths, isYm, toNumber, todayKST, won } from "./format"
import { isLate, receivableState } from "./receivables"
import { isMailEnabled } from "./runtime-flags"

// ── 공개 타입(계획서 2.2.1 — 병렬 단계에서 바꾸지 않는다) ─────────────────────

type Money = number // 원 단위 정수
type YM = string // "YYYY-MM"

export type AdminTodo = {
  today: string // todayKST()
  draftBills: { billMonth: YM; usageMonth: YM; count: number; total: Money } | null // 마감 대상 청구월의 작성 중(수기 제외)
  staleDrafts: { count: number; oldestBillMonth: YM } | null // 마감 대상보다 이전 달에 남은 작성 중(정리 안 됨)
  correcting: { count: number; billMonths: YM[] } | null // 정정 중(draft + issued_at 있음)
  receivable: {
    // lib/receivables.ts 규칙, 청구월 무관 전체
    count: number
    total: Money
    late: { count: number; total: Money } // isLate (= receivableLate.pastDue + receivableLate.noDue)
    oldest: { billMonth: YM; tenantName: string; dueDate: string | null; issuedAt: string; days: number; kind: "past_due" | "no_due" } | null
    nextDue: { date: string; count: number } | null // 가장 가까운 미래 납부 기한
  }
  expenseInbox: { count: number } // expense_inbox.status='pending'
  // 추가(X1): receivable.late를 둘로 나눈 것 — 홈 문장 "기한 지남 n건"과 "발행 후 31일 넘음 n건"을 따로 쓸 때. getAdminTodo는 늘 채운다.
  // receivable 안이 아니라 바깥에 둔 것·선택 필드인 것은 기존 receivable 모양(테스트의 toEqual)과 AdminTodo 리터럴을 깨지 않기 위해서다.
  receivableLate?: {
    pastDue: { count: number; total: Money } // 납부 기한이 지난 미수(bucket d1_30·d31_60·d60_plus)
    noDue: { count: number; total: Money } // 기한 없이 발행 후 31일 이상 지난 미수(bucket no_due & days ≥ 31)
  }
  leaving: { count: number; nearest: { roomCode: string; endedAt: string } | null } // 활성 계약 + ended_at >= today(오늘 포함, board/route.ts:31과 같음)
  submissions: { toReview: number; resubmitRequested: number } // toReview = submitted·reviewing, 보완 요청은 보조 숫자
  // 추가(X1): 검토할 제출물(submitted·reviewing)이 있는 프로그램 id(오름차순). 한 프로그램뿐이면 홈 줄이 그 상세(programHref)로 보낸다.
  // submissions 안이 아닌 바깥·선택 필드인 이유는 receivableLate와 같다. getAdminTodo는 늘 채운다.
  reviewProgramIds?: number[]
  inquiriesNew: { count: number }
  mail: { enabled: boolean; failed30d: number; notConfigured30d: number } // 설정 안 됨 실패(error가 'RESEND_API_KEY…'·'MAIL_FROM…'로 시작 — 메일 화면과 같은 접두어 일치)는 failed30d에서 뺀다
}
export type SidebarBadges = { billing: number; expenses: number; rooms: number; programs: number; inquiries: number; emails: number; homeTotal: number }
// billing = receivable.late.count + correcting.count, rooms = leaving.count, emails = mail.enabled ? mail.failed30d : 0, homeTotal = 보이는 할 일 줄 수

export type CloseStepKey = "meters" | "allocation" | "generate" | "issue"
export type CloseStepStatus = "done" | "current" | "todo" | "attention" | "blocked"
export type CloseProgress = {
  usageMonth: YM
  billMonth: YM
  isDefault: boolean // 기본 월 규칙으로 고른 달인가
  isOlderThanLatestIssued: boolean // 가장 최근 발행월보다 이전 달을 보고 있음 → 화면 경고
  meters: { saved: number; total: number; negative: number }
  allocation: { kepcoTotal: Money | null; kwhUnitPrice: number | null; per10Confirmed: Money | null; checkOk: boolean | null }
  bills: { draft: number; draftTotal: Money; manualDraft: number; correcting: number; issued: number; overdue: number; paid: number; issuedTotal: Money }
  needsCorrection: boolean // 발행분이 있는 달에서 billing_periods.updated_at > max(issued_at) 또는 발행분에 0원 전기 라인이 있는데 지금 전기 파라미터가 있음(읽기 전용 판정)
  steps: { key: CloseStepKey; status: CloseStepStatus; note: string | null }[] // note 예: "4개 중 4개 입력", "작성 중 22건", "먼저 1단계가 필요해요"
  nextStep: 1 | 2 | 3 | 4 | null
}

// ── 내부 ─────────────────────────────────────────────────────────────────────

export type Sql = NeonQueryFunction<false, false>
type Row = Record<string, unknown>

/** lib/mail.ts가 env 없을 때 남기는 실패 사유(설정 안 됨) */
export const MAIL_NOT_CONFIGURED_ERRORS = ["RESEND_API_KEY not set", "MAIL_FROM not set"] as const
/**
 * 설정 안 됨 판정 LIKE 패턴(접두어 일치). 메일 화면(app/api/admin/emails, lib/email-model.ts의
 * NOT_CONFIGURED_SQL_PATTERNS)과 같은 범위 — "RESEND_API_KEY is missing" 같은 변형도 설정 안 됨으로 센다.
 */
export const MAIL_NOT_CONFIGURED_PATTERNS = ["RESEND_API_KEY%", "MAIL_FROM%"] as const

const n = (v: unknown): number => toNumber(v as string | number | null | undefined) ?? 0

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString()
  return String(v ?? "")
}

/** 청구월별 요약(정기·전체) — 기본 마감 월 판정과 staleDrafts·correcting에 쓴다 */
export interface PeriodSummary {
  period: YM
  regIssued: number // 정기 issued·overdue·paid
  regDraft: number // 정기 작성 중(issued_at 없음)
  regDraftTotal: Money
  regCorrecting: number // 정기 정정 중
  anyDraft: number // 수기 포함 작성 중(issued_at 없음)
  anyCorrecting: number // 수기 포함 정정 중
}

function periodSummaryQuery(sql: Sql) {
  return sql`
    SELECT period,
      COUNT(*) FILTER (WHERE NOT is_manual AND status IN ('issued','overdue','paid'))::int AS reg_issued,
      COUNT(*) FILTER (WHERE NOT is_manual AND status = 'draft' AND issued_at IS NULL)::int AS reg_draft,
      COALESCE(SUM(total_amount) FILTER (WHERE NOT is_manual AND status = 'draft' AND issued_at IS NULL), 0)::text AS reg_draft_total,
      COUNT(*) FILTER (WHERE NOT is_manual AND status = 'draft' AND issued_at IS NOT NULL)::int AS reg_correcting,
      COUNT(*) FILTER (WHERE status = 'draft' AND issued_at IS NULL)::int AS any_draft,
      COUNT(*) FILTER (WHERE status = 'draft' AND issued_at IS NOT NULL)::int AS any_correcting
    FROM bills
    GROUP BY period
    ORDER BY period
  `
}

function toPeriodSummary(rows: Row[]): PeriodSummary[] {
  return rows.map((r) => ({
    period: String(r.period).trim(),
    regIssued: n(r.reg_issued),
    regDraft: n(r.reg_draft),
    regDraftTotal: n(r.reg_draft_total),
    regCorrecting: n(r.reg_correcting),
    anyDraft: n(r.any_draft),
    anyCorrecting: n(r.any_correcting),
  }))
}

/** 기본 마감 월 규칙(파일 머리 주석). latestIssued = L(없으면 null) */
export function pickCloseMonth(
  summary: PeriodSummary[],
  today: string = todayKST(),
): { billMonth: YM; usageMonth: YM; latestIssued: YM | null } {
  const issued = summary.filter((p) => p.regIssued > 0).map((p) => p.period).sort()
  const L = issued.length > 0 ? issued[issued.length - 1] : null
  let billMonth: YM
  if (!L) {
    billMonth = today.slice(0, 7)
  } else {
    const row = summary.find((p) => p.period === L)!
    billMonth = row.regDraft > 0 || row.regCorrecting > 0 ? L : addMonths(L, 1)
  }
  return { billMonth, usageMonth: addMonths(billMonth, -1), latestIssued: L }
}

// ── getAdminTodo ─────────────────────────────────────────────────────────────

async function computeAdminTodo(sql: Sql, today: string): Promise<AdminTodo> {
  const [periodRows, receivableRows, countRows, leavingRows] = (await sql.transaction(
    [
      periodSummaryQuery(sql),
      sql`
        SELECT b.period, b.status, b.due_date::text AS due_date, b.issued_at, b.total_amount::text AS total, t.name AS tenant_name
        FROM bills b JOIN tenants t ON t.id = b.tenant_id
        WHERE b.status IN ('issued', 'overdue')
      `,
      sql`
        SELECT
          (SELECT COUNT(*)::int FROM expense_inbox WHERE status = 'pending') AS inbox,
          (SELECT COUNT(*)::int FROM submissions WHERE status IN ('submitted', 'reviewing')) AS to_review,
          (SELECT COUNT(*)::int FROM submissions WHERE status = 'resubmit_requested') AS resubmit,
          (SELECT COALESCE(array_agg(DISTINCT program_id ORDER BY program_id), '{}') FROM submissions WHERE status IN ('submitted', 'reviewing')) AS review_programs,
          (SELECT COUNT(*)::int FROM inquiries WHERE COALESCE(status, 'new') = 'new') AS inquiries_new,
          (SELECT COUNT(*)::int FROM email_logs
             WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '30 days'
               AND NOT (COALESCE(error, '') LIKE ${MAIL_NOT_CONFIGURED_PATTERNS[0]} OR COALESCE(error, '') LIKE ${MAIL_NOT_CONFIGURED_PATTERNS[1]})) AS mail_failed,
          (SELECT COUNT(*)::int FROM email_logs
             WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '30 days'
               AND (COALESCE(error, '') LIKE ${MAIL_NOT_CONFIGURED_PATTERNS[0]} OR COALESCE(error, '') LIKE ${MAIL_NOT_CONFIGURED_PATTERNS[1]})) AS mail_not_configured
      `,
      sql`
        SELECT r.code, c.ended_at::text AS ended_at
        FROM contracts c JOIN rooms r ON r.id = c.room_id
        WHERE c.status = 'active' AND c.ended_at IS NOT NULL AND c.ended_at >= ${today}::date
          AND r.is_active = TRUE AND r.status <> 'maintenance'
        ORDER BY c.ended_at, r.code
      `,
    ],
    { readOnly: true },
  )) as Row[][]

  const summary = toPeriodSummary(periodRows)
  const target = pickCloseMonth(summary, today)

  // 작성 중(마감 대상 청구월, 수기 제외)
  const targetRow = summary.find((p) => p.period === target.billMonth)
  const draftBills =
    targetRow && targetRow.regDraft > 0
      ? { billMonth: target.billMonth, usageMonth: target.usageMonth, count: targetRow.regDraft, total: targetRow.regDraftTotal }
      : null

  // 정리 안 된 작성 중(마감 대상보다 이전 달, 수기 포함)
  const stale = summary.filter((p) => p.period < target.billMonth && p.anyDraft > 0)
  const staleDrafts = stale.length > 0 ? { count: stale.reduce((s, p) => s + p.anyDraft, 0), oldestBillMonth: stale[0].period } : null

  // 정정 중(수기 포함, 청구월 무관)
  const corr = summary.filter((p) => p.anyCorrecting > 0)
  const correcting = corr.length > 0 ? { count: corr.reduce((s, p) => s + p.anyCorrecting, 0), billMonths: corr.map((p) => p.period) } : null

  // 받을 돈(청구월 무관 전체)
  let count = 0
  let total = 0
  let lateCount = 0
  let lateTotal = 0
  const pastDue = { count: 0, total: 0 }
  const noDue = { count: 0, total: 0 }
  let oldest: AdminTodo["receivable"]["oldest"] = null
  let oldestKey = ""
  const dueCounts = new Map<string, number>()
  for (const r of receivableRows) {
    const st = receivableState({ status: String(r.status), due_date: (r.due_date as string | null) ?? null, issued_at: r.issued_at as Date | string | null }, today)
    if (st.kind !== "receivable") continue
    const amount = n(r.total)
    count++
    total += amount
    if (isLate(st)) {
      lateCount++
      lateTotal += amount
      const part = st.bucket === "no_due" ? noDue : pastDue
      part.count++
      part.total += amount
    }
    const dueDate = (r.due_date as string | null) ?? null
    if (st.bucket === "not_due" && dueDate) dueCounts.set(dueDate, (dueCounts.get(dueDate) ?? 0) + 1)
    if (st.bucket !== "not_due" && st.days !== null) {
      // 가장 오래된 것: 청구월이 가장 이른 것(같으면 기한·발행일이 이른 것)
      const key = `${String(r.period).trim()}|${dueDate ?? "9999-99-99"}|${iso(r.issued_at)}`
      if (!oldest || key < oldestKey) {
        oldestKey = key
        oldest = {
          billMonth: String(r.period).trim(),
          tenantName: String(r.tenant_name ?? ""),
          dueDate,
          issuedAt: iso(r.issued_at),
          days: st.days,
          kind: st.bucket === "no_due" ? "no_due" : "past_due",
        }
      }
    }
  }
  const nextDueDate = [...dueCounts.keys()].sort()[0]
  const nextDue = nextDueDate ? { date: nextDueDate, count: dueCounts.get(nextDueDate)! } : null

  const c = countRows[0] ?? {}
  const first = leavingRows[0]
  return {
    today,
    draftBills,
    staleDrafts,
    correcting,
    receivable: { count, total, late: { count: lateCount, total: lateTotal }, oldest, nextDue },
    receivableLate: { pastDue, noDue },
    expenseInbox: { count: n(c.inbox) },
    leaving: { count: leavingRows.length, nearest: first ? { roomCode: String(first.code), endedAt: String(first.ended_at) } : null },
    submissions: { toReview: n(c.to_review), resubmitRequested: n(c.resubmit) },
    reviewProgramIds: Array.isArray(c.review_programs) ? (c.review_programs as unknown[]).map((v) => n(v)).filter((v) => v > 0) : [],
    inquiriesNew: { count: n(c.inquiries_new) },
    mail: { enabled: isMailEnabled(), failed30d: n(c.mail_failed), notConfigured30d: n(c.mail_not_configured) },
  }
}

// 같은 요청 안에서 today가 같으면 첫 호출의 결과(Promise)를 함께 쓴다. RSC 밖(테스트)에서는 cache가 메모하지 않는다.
const adminTodoOnce = cache((today: string) => {
  let pending: Promise<AdminTodo> | null = null
  return (sql: Sql) => (pending ??= computeAdminTodo(sql, today))
})

/** 오늘 할 일 집계. 실패하면 예외(0으로 바꾸지 않는다). 세션이 있을 때만 부른다. */
export function getAdminTodo(sql: Sql, today?: string): Promise<AdminTodo> {
  return adminTodoOnce(today ?? todayKST())(sql)
}

// ── 홈 할 일 줄·사이드바 배지 ─────────────────────────────────────────────────

export type TodoLineKey =
  | "correcting"
  | "draftBills"
  | "receivable"
  | "staleDrafts"
  | "expenseInbox"
  | "leaving"
  | "submissions"
  | "inquiries"
  | "mail"

/** 홈 "오늘 할 일"에 보이는 줄(0건 줄은 숨김), 계획서 3.2 정렬 순서. 메일 줄은 메일 발송이 켜져 있을 때만 */
export function visibleTodoLines(todo: AdminTodo): TodoLineKey[] {
  const out: TodoLineKey[] = []
  if (todo.correcting && todo.correcting.count > 0) out.push("correcting")
  if (todo.draftBills && todo.draftBills.count > 0) out.push("draftBills")
  if (todo.receivable.count > 0) out.push("receivable")
  if (todo.staleDrafts && todo.staleDrafts.count > 0) out.push("staleDrafts")
  if (todo.expenseInbox.count > 0) out.push("expenseInbox")
  if (todo.leaving.count > 0) out.push("leaving")
  if (todo.submissions.toReview > 0) out.push("submissions")
  if (todo.inquiriesNew.count > 0) out.push("inquiries")
  if (todo.mail.enabled && todo.mail.failed30d > 0) out.push("mail")
  return out
}

/** 사이드바·모바일 바 건수 배지(0이면 배지를 그리지 않는다) */
export function sidebarBadges(todo: AdminTodo): SidebarBadges {
  return {
    billing: todo.receivable.late.count + (todo.correcting?.count ?? 0),
    expenses: todo.expenseInbox.count,
    rooms: todo.leaving.count,
    programs: todo.submissions.toReview,
    inquiries: todo.inquiriesNew.count,
    emails: todo.mail.enabled ? todo.mail.failed30d : 0,
    homeTotal: visibleTodoLines(todo).length,
  }
}

// ── getCloseProgress ─────────────────────────────────────────────────────────

const METER_CODES: (keyof FactoryReadings)[] = ["MAIN", "F101", "F103", "HVAC"]

async function computeCloseProgress(sql: Sql, requested: string | null, today: string): Promise<CloseProgress> {
  const summary = toPeriodSummary((await periodSummaryQuery(sql)) as Row[])
  const def = pickCloseMonth(summary, today)
  const usageMonth = requested && isYm(requested) ? requested : def.usageMonth
  const billMonth = addMonths(usageMonth, 1)
  const prevUsage = addMonths(usageMonth, -1)

  const [meterRows, periodRows, billRows, zeroElecRows, areaRows] = (await sql.transaction(
    [
      sql`
        SELECT m.code, cur.reading::text AS cur, prev.reading::text AS prev
        FROM meters m
        LEFT JOIN meter_readings cur ON cur.meter_id = m.id AND cur.period = ${usageMonth}
        LEFT JOIN meter_readings prev ON prev.meter_id = m.id AND prev.period = ${prevUsage}
        ORDER BY m.sort_order, m.id
      `,
      sql`
        SELECT elec_total::text AS elec_total, elec_unit_price::text AS elec_unit_price, area_ratio::text AS area_ratio,
               per10_billed::text AS per10_billed, updated_at
        FROM billing_periods WHERE period = ${usageMonth}
      `,
      sql`
        SELECT
          COUNT(*) FILTER (WHERE NOT is_manual AND status = 'draft' AND issued_at IS NULL)::int AS draft,
          COALESCE(SUM(total_amount) FILTER (WHERE NOT is_manual AND status = 'draft' AND issued_at IS NULL), 0)::text AS draft_total,
          COUNT(*) FILTER (WHERE is_manual AND status = 'draft' AND issued_at IS NULL)::int AS manual_draft,
          COUNT(*) FILTER (WHERE NOT is_manual AND status = 'draft' AND issued_at IS NOT NULL)::int AS correcting,
          COUNT(*) FILTER (WHERE NOT is_manual AND status = 'issued')::int AS issued,
          COUNT(*) FILTER (WHERE NOT is_manual AND status = 'overdue')::int AS overdue,
          COUNT(*) FILTER (WHERE NOT is_manual AND status = 'paid')::int AS paid,
          COALESCE(SUM(total_amount) FILTER (WHERE NOT is_manual AND status IN ('issued','overdue','paid')), 0)::text AS issued_total,
          MAX(issued_at) FILTER (WHERE NOT is_manual AND status IN ('issued','overdue','paid')) AS max_issued_at
        FROM bills WHERE period = ${billMonth}
      `,
      sql`
        SELECT EXISTS (
          SELECT 1 FROM bill_lines l JOIN bills b ON b.id = l.bill_id
          WHERE b.period = ${billMonth} AND NOT b.is_manual AND b.status IN ('issued','overdue','paid')
            AND l.line_type IN ('elec_area', 'elec_metered') AND l.amount = 0
        ) AS zero_elec
      `,
      sql`SELECT COALESCE(SUM(pyeong_billed), 0)::text AS s FROM contracts WHERE status = 'active' AND elec_method = 'area'`,
    ],
    { readOnly: true },
  )) as Row[][]

  // 1단계 검침
  const total = meterRows.length
  let saved = 0
  let negative = 0
  const readings: FactoryReadings = { MAIN: 0, F101: 0, F103: 0, HVAC: 0 }
  const prevReadings: FactoryReadings = { MAIN: 0, F101: 0, F103: 0, HVAC: 0 }
  for (const r of meterRows) {
    const cur = toNumber(r.cur as string | null)
    const prev = toNumber(r.prev as string | null)
    if (cur !== null) saved++
    if (cur !== null && prev !== null && cur < prev) negative++
    const code = String(r.code) as keyof FactoryReadings
    if (METER_CODES.includes(code)) {
      readings[code] = cur ?? 0
      prevReadings[code] = prev ?? 0
    }
  }

  // 2단계 전기료 배분
  const p = periodRows[0]
  const kepcoTotal = p ? toNumber(p.elec_total as string | null) : null
  const kwhUnitPrice = p ? toNumber(p.elec_unit_price as string | null) : null
  const per10Confirmed = p ? toNumber(p.per10_billed as string | null) : null
  let checkOk: boolean | null = null
  if (kepcoTotal !== null) {
    const factory = calcFactoryElec(readings, prevReadings, kwhUnitPrice ?? 102)
    const alloc = calcElecAllocation(
      { elec_total: kepcoTotal, area_ratio: toNumber(p!.area_ratio as string | null) ?? 0.7, per10_billed: per10Confirmed ?? undefined },
      n(areaRows[0]?.s),
      factory.totalA,
    )
    checkOk = alloc.checkOk && alloc.per10Billed >= 0
  }

  // 3·4단계 청구서
  const b = billRows[0] ?? {}
  const bills = {
    draft: n(b.draft),
    draftTotal: n(b.draft_total),
    manualDraft: n(b.manual_draft),
    correcting: n(b.correcting),
    issued: n(b.issued),
    overdue: n(b.overdue),
    paid: n(b.paid),
    issuedTotal: n(b.issued_total),
  }
  const issuedAll = bills.issued + bills.overdue + bills.paid
  const maxIssuedAt = b.max_issued_at ? new Date(b.max_issued_at as string | Date).getTime() : null
  const periodUpdatedAt = p?.updated_at ? new Date(p.updated_at as string | Date).getTime() : null
  const hasElecParams = (kepcoTotal !== null && kepcoTotal > 0) || per10Confirmed !== null
  const needsCorrection =
    issuedAll > 0 &&
    ((maxIssuedAt !== null && periodUpdatedAt !== null && periodUpdatedAt > maxIssuedAt) ||
      (Boolean(zeroElecRows[0]?.zero_elec) && hasElecParams))

  // 단계 판정(여기 한 곳에서만)
  const done = [
    total > 0 && saved === total && negative === 0,
    kepcoTotal !== null && per10Confirmed !== null && checkOk !== false,
    bills.draft + bills.correcting + issuedAll > 0,
    issuedAll > 0 && bills.draft === 0 && bills.correcting === 0,
  ]
  const attention = [negative > 0, checkOk === false, false, bills.correcting > 0 || needsCorrection]
  const doneNotes: (string | null)[] = [
    `${total}개 중 ${saved}개 입력`,
    per10Confirmed !== null ? `10평당 ${won(per10Confirmed)}` : null,
    bills.draft > 0 ? `작성 중 ${bills.draft}건` : `만든 청구서 ${bills.draft + bills.correcting + issuedAll}건`,
    `발행 ${issuedAll}건`,
  ]
  const pendingNotes: (string | null)[] = [
    `${total}개 중 ${saved}개 입력`,
    kepcoTotal === null ? "한전 금액 입력 전" : per10Confirmed === null ? "10평당 단가 확정 전" : null,
    null,
    bills.draft > 0 ? `발행 전 ${bills.draft}건` : null,
  ]
  const attentionNotes: (string | null)[] = [
    `음수 사용량 ${negative}개`,
    "배분 검산이 맞지 않아요",
    null,
    bills.correcting > 0 ? `정정 중 ${bills.correcting}건` : "발행 뒤 바뀐 값이 있어요",
  ]
  const keys: CloseStepKey[] = ["meters", "allocation", "generate", "issue"]
  const firstIncomplete = done.findIndex((d) => !d)
  const steps = keys.map((key, i) => {
    if (attention[i]) return { key, status: "attention" as const, note: attentionNotes[i] }
    if (done[i]) return { key, status: "done" as const, note: doneNotes[i] }
    if (i === firstIncomplete) return { key, status: "current" as const, note: pendingNotes[i] }
    return { key, status: "blocked" as const, note: `먼저 ${firstIncomplete + 1}단계가 필요해요` }
  })
  const nextIdx = steps.findIndex((s) => s.status === "current" || s.status === "attention")
  const nextStep = nextIdx === -1 ? null : ((nextIdx + 1) as 1 | 2 | 3 | 4)

  return {
    usageMonth,
    billMonth,
    isDefault: usageMonth === def.usageMonth,
    isOlderThanLatestIssued: def.latestIssued !== null && billMonth < def.latestIssued,
    meters: { saved, total, negative },
    allocation: { kepcoTotal, kwhUnitPrice, per10Confirmed, checkOk },
    bills,
    needsCorrection,
    steps,
    nextStep,
  }
}

const closeProgressOnce = cache((usageMonth: string, today: string) => {
  let pending: Promise<CloseProgress> | null = null
  return (sql: Sql) => (pending ??= computeCloseProgress(sql, usageMonth || null, today))
})

/**
 * 월 마감 진행 상태. usageMonth(전기 사용월 "YYYY-MM")가 없거나 형식이 아니면 기본 마감 월 규칙으로 고른다.
 * 실패하면 예외(0으로 바꾸지 않는다). 읽기 전용.
 */
export function getCloseProgress(sql: Sql, usageMonth?: string | null): Promise<CloseProgress> {
  return closeProgressOnce(usageMonth && isYm(usageMonth) ? usageMonth : "", todayKST())(sql)
}
