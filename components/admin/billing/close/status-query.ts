// 월 마감 상태 조회(서버 전용, 읽기 전용) — GET /api/admin/billing/close-status와 /admin/billing 페이지가 같이 쓴다.
// getCloseProgress()(lib/admin-todo.ts)를 감싸 화면에 필요한 필드만 더한다. 단계 판정은 다시 만들지 않는다.
//
// 사용 예(서버):
//   const status = await getCloseStatus(sql, "2026-09")   // 형식이 틀리거나 없으면 기본 마감 월
//
// 더하는 것: 최근 달 상태 글자, 한전 금액 지난달·작년, 청구월 기업별 행(지난달 비교·메일 결과·계약 사유),
//            발행 대상 요약(건수·합계·메일·이메일 없음·전기료 0원), 납부 기한 제안.

import { getCloseProgress, type Sql } from "@/lib/admin-todo"
import { computeElecContext, factoryChargeByRoom } from "@/lib/billing-db"
import { addMonths, thisMonthKST, toNumber, todayKST } from "@/lib/format"
import { suggestDueDate } from "./close-model"
import type { CloseStatus, MonthNotes, ReviewRow } from "./types"

type Row = Record<string, unknown>
const n = (v: unknown): number => toNumber(v as string | number | null | undefined) ?? 0
const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v))

function dayLabel(d: string): string {
  return `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`
}

/**
 * 이 청구월에 시작·끝난 계약 → 사유 글자("9월 15일 입주 · 일할").
 * 지난 청구월에 일할·첫 달 청구 안 함으로 시작한 계약은 이번 달이 첫 온달이라 크게 오르므로 "지난달 9월 15일 입주 · 일할"도 붙인다.
 */
function eventText(r: Row, billMonth: string): string | null {
  const start = r.start_date ? String(r.start_date) : null
  const end = r.ended_at ? String(r.ended_at) : null
  const prevBm = addMonths(billMonth, -1)
  if (start && start.slice(0, 7) === prevBm && (r.first_month_billing === "prorated" || r.first_month_billing === "none")) {
    return `지난달 ${dayLabel(start)} 입주${r.first_month_billing === "prorated" ? " · 일할" : " · 첫 달 청구 안 함"}`
  }
  if (start && start.slice(0, 7) === billMonth) {
    const how = r.first_month_billing === "prorated" ? " · 일할" : r.first_month_billing === "none" ? " · 첫 달 청구 안 함" : ""
    return `${dayLabel(start)} 입주${how}`
  }
  if (end && end.slice(0, 7) === billMonth) {
    const how = r.last_month_billing === "prorated" ? " · 일할" : r.last_month_billing === "none" ? " · 마지막 달 청구 안 함" : ""
    return `${dayLabel(end)} 퇴실${how}`
  }
  return null
}

/** issue 라우트의 전기료 0원 가드(findStaleElecBills)와 같은 판정 — 발행 대상 draft 중 전기료가 0원으로 굳은 기업 */
async function staleElecNames(sql: Sql, usageMonth: string, draftIds: number[]): Promise<string[]> {
  if (draftIds.length === 0) return []
  const ctx = await computeElecContext(sql, usageMonth)
  const byRoom = factoryChargeByRoom(ctx.factory)
  const per10 = ctx.allocation.per10Billed
  const meteredRooms = Object.entries(byRoom).filter(([, v]) => v > 0).map(([k]) => k)
  if (per10 <= 0 && meteredRooms.length === 0) return []
  const rows = await sql`
    SELECT DISTINCT t.name
    FROM bill_lines l JOIN bills b ON b.id = l.bill_id JOIN tenants t ON t.id = b.tenant_id
    WHERE l.bill_id = ANY(${draftIds}::int[]) AND l.amount = 0
      AND (
        (l.line_type = 'elec_area' AND ${per10}::numeric > 0)
        OR (l.line_type = 'elec_metered' AND l.room_code = ANY(${meteredRooms}::text[]))
      )
  `
  return rows.map((r) => String(r.name)).sort((a, b) => a.localeCompare(b, "ko"))
}

function monthNote(r: Row): string {
  const draft = n(r.draft)
  const correcting = n(r.correcting)
  const issued = n(r.issued)
  const paid = n(r.paid)
  if (correcting > 0) return `정정 중 ${correcting}건`
  if (draft > 0) return issued > 0 ? `작성 중 ${draft}건 · 발행 ${issued}건` : `작성 중 ${draft}건`
  if (issued > 0) return paid === issued ? "발행 완료 · 모두 납부" : "발행 완료"
  return ""
}

export async function getCloseStatus(sql: Sql, usageMonth?: string | null, today: string = todayKST()): Promise<CloseStatus> {
  const progress = await getCloseProgress(sql, usageMonth)
  const { usageMonth: um, billMonth: bm } = progress
  const prevBm = addMonths(bm, -1)
  // 월 고르기 목록: 이번 달 기준 최근 24개월(사용월) — 청구월로는 +1
  const topUsage = um > thisMonthKST(today) ? um : thisMonthKST(today)
  const fromBill = addMonths(topUsage, -23 + 1)
  const toBill = addMonths(topUsage, 1)

  const [monthRows, latestRows, kepcoRows, billRows, prevRows, eventRows, mailRows, dueRows] = (await sql.transaction(
    [
      sql`
        SELECT period,
          COUNT(*) FILTER (WHERE NOT is_manual AND status = 'draft' AND issued_at IS NULL)::int AS draft,
          COUNT(*) FILTER (WHERE NOT is_manual AND status = 'draft' AND issued_at IS NOT NULL)::int AS correcting,
          COUNT(*) FILTER (WHERE NOT is_manual AND status IN ('issued','overdue','paid'))::int AS issued,
          COUNT(*) FILTER (WHERE NOT is_manual AND status = 'paid')::int AS paid
        FROM bills WHERE period >= ${fromBill} AND period <= ${toBill}
        GROUP BY period
      `,
      sql`SELECT MAX(period) AS l FROM bills WHERE NOT is_manual AND status IN ('issued','overdue','paid')`,
      sql`
        SELECT period, elec_total::text AS elec_total, elec_unit_price::text AS elec_unit_price
        FROM billing_periods WHERE period IN (${addMonths(um, -1)}, ${addMonths(um, -12)})
      `,
      sql`
        SELECT b.id, b.tenant_id, t.name AS tenant_name, b.status, COALESCE(b.is_manual, FALSE) AS is_manual,
               b.issued_at, b.due_date::text AS due_date, b.total_amount::text AS total, b.elec_amount::text AS elec_amount,
               (COALESCE(NULLIF(t.tax_email, ''), NULLIF(t.contact_email, '')) IS NOT NULL) AS has_email,
               EXISTS (SELECT 1 FROM bill_lines l WHERE l.bill_id = b.id AND l.line_type IN ('elec_area','elec_metered') AND l.amount = 0) AS zero_elec
        FROM bills b JOIN tenants t ON t.id = b.tenant_id
        WHERE b.period = ${bm}
        ORDER BY t.name
      `,
      sql`SELECT tenant_id, total_amount::text AS total, COALESCE(is_manual, FALSE) AS is_manual FROM bills WHERE period = ${prevBm}`,
      sql`
        SELECT c.tenant_id, c.start_date::text AS start_date, c.ended_at::text AS ended_at, c.first_month_billing, c.last_month_billing
        FROM contracts c
        WHERE to_char(c.start_date, 'YYYY-MM') IN (${bm}, ${prevBm}) OR to_char(c.ended_at, 'YYYY-MM') = ${bm}
      `,
      // 메일 결과: 발행 이후(issued_at 이후) 로그만 — 정정 재발행은 같은 id라 예전 로그가 섞이지 않게
      sql`
        SELECT DISTINCT ON (l.related_id) l.related_id, l.status, l.error
        FROM email_logs l JOIN bills b ON b.id = l.related_id
        WHERE l.related_type = 'bill' AND l.template_code = 'bill_issued'
          AND b.period = ${bm} AND b.issued_at IS NOT NULL AND l.created_at >= b.issued_at
        ORDER BY l.related_id, l.created_at DESC, l.id DESC
      `,
      sql`
        SELECT period, due_date::text AS due_date FROM bills
        WHERE NOT COALESCE(is_manual, FALSE) AND due_date IS NOT NULL AND issued_at IS NOT NULL AND period <> ${bm}
        ORDER BY period DESC, issued_at DESC
        LIMIT 1
      `,
    ],
    { readOnly: true },
  )) as Row[][]

  // 최근 달 상태 글자(키 = 사용월)
  const monthNotes: MonthNotes = {}
  for (const r of monthRows) {
    const note = monthNote(r)
    if (note) monthNotes[addMonths(String(r.period).trim(), -1)] = note
  }

  const kp = (ym: string) => kepcoRows.find((r) => String(r.period).trim() === ym)
  const prevK = kp(addMonths(um, -1))
  const lastYearK = kp(addMonths(um, -12))

  const prevByTenant = new Map<number, number>()
  let prevRegularTotal = 0
  let prevRegularCount = 0
  for (const r of prevRows) {
    prevByTenant.set(n(r.tenant_id), n(r.total))
    if (!r.is_manual) {
      prevRegularTotal += n(r.total)
      prevRegularCount++
    }
  }
  const eventsByTenant = new Map<number, string[]>()
  for (const r of eventRows) {
    const t = eventText(r, bm)
    if (!t) continue
    const list = eventsByTenant.get(n(r.tenant_id)) ?? []
    list.push(t)
    eventsByTenant.set(n(r.tenant_id), list)
  }
  const mailByBill = new Map<number, { status: string; error: string | null }>()
  for (const r of mailRows) mailByBill.set(n(r.related_id), { status: String(r.status), error: r.error == null ? null : String(r.error) })

  const rows: ReviewRow[] = billRows.map((r) => {
    const id = n(r.id)
    const tenantId = n(r.tenant_id)
    return {
      billId: id,
      tenantId,
      tenantName: String(r.tenant_name ?? ""),
      status: String(r.status),
      isManual: Boolean(r.is_manual),
      correcting: r.status === "draft" && r.issued_at != null,
      total: n(r.total),
      prevTotal: prevByTenant.has(tenantId) ? prevByTenant.get(tenantId)! : null,
      elecAmount: n(r.elec_amount),
      zeroElec: Boolean(r.zero_elec),
      hasEmail: Boolean(r.has_email),
      dueDate: (r.due_date as string | null) ?? null,
      issuedAt: iso(r.issued_at),
      events: eventsByTenant.get(tenantId) ?? [],
      mail: mailByBill.get(id) ?? null,
    }
  })

  // 발행 대상 = 그 청구월 draft 전부(issue 라우트 WHERE period = X AND status = 'draft'와 같음)
  const drafts = rows.filter((r) => r.status === "draft")
  const draftIds = drafts.map((r) => r.billId)
  const staleElec = await staleElecNames(sql, um, draftIds)
  const lastDue = dueRows[0] ? { period: String(dueRows[0].period).trim(), dueDate: String(dueRows[0].due_date) } : null
  const due = suggestDueDate(bm, lastDue)

  return {
    ...progress,
    latestIssuedBillMonth: latestRows[0]?.l ? String(latestRows[0].l).trim() : null,
    monthNotes,
    kepco: {
      prevMonthTotal: prevK ? toNumber(prevK.elec_total as string | null) : null,
      lastYearTotal: lastYearK ? toNumber(lastYearK.elec_total as string | null) : null,
      prevUnitPrice: prevK ? toNumber(prevK.elec_unit_price as string | null) : null,
    },
    rows,
    prevMonthTotal: prevRegularCount > 0 ? prevRegularTotal : null,
    issue: {
      billIds: draftIds,
      count: drafts.length,
      total: drafts.reduce((s, r) => s + r.total, 0),
      mailable: drafts.filter((r) => r.hasEmail).length,
      noEmail: drafts.filter((r) => !r.hasEmail).map((r) => ({ tenantId: r.tenantId, name: r.tenantName })),
      correcting: drafts.filter((r) => r.correcting).length,
      withDueDate: drafts.filter((r) => r.dueDate !== null).length,
      staleElec,
      dueSuggestion: due.date,
      dueRule: due.rule,
    },
  }
}
