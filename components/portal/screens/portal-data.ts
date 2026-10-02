// 입주기업 포털 서버 조회(WP8) — 서버 page.tsx와 /api/portal/bills·/api/portal/bills/[id]가 같은 쿼리를 쓰게 모은 곳.
// 서버 전용(클라이언트 컴포넌트에서 import하지 않는다). 모든 조회는 인자로 받은 세션 tenant_id로만 스코프한다
// (요청 파라미터로 기업을 고르지 않는다, CLAUDE.md 5항·계획서 7.1). 초안(draft)은 금액·라인을 내보내지 않는다.
//
// 사용 예(서버 컴포넌트):
//   const session = await getPortalSession(); const sql = getDb()
//   const r = await getPortalBillDetail(sql, session.tenant_id, 87)
//   if (r.kind === "correcting") …   // 정정 중: 안내 문장만(금액·라인 없음)

import { getDb } from "@/lib/db"
import { getSiteContent } from "@/lib/site-content"
import { getBillingBankInfo, type BillingBankInfo } from "@/lib/bank-info"
import type { ContactInfo } from "@/components/sections/footer"
import { comparePrevious, type PortalBillRow, type PortalProgramRow, type PreviousCompare } from "./portal-model"

type Sql = NonNullable<ReturnType<typeof getDb>>

/** 창업보육센터 전화(공개 푸터와 같은 값). 조회 실패면 기본값 */
export async function getPortalContactPhone(): Promise<string> {
  // 공개 푸터(React 컴포넌트 파일)는 서버 화면에서만 필요하므로 여기서 늦게 불러온다(테스트가 이 파일을 import해도 JSX를 읽지 않게)
  const { DEFAULT_CONTACT } = await import("@/components/sections/footer")
  try {
    const c = await getSiteContent<ContactInfo>("contact")
    return c?.phone || DEFAULT_CONTACT.phone
  } catch {
    return DEFAULT_CONTACT.phone
  }
}

// ── 청구서 목록 ──────────────────────────────────────────────────────────────

export interface PortalBillListRow extends PortalBillRow {
  invoice_pathname: string | null
}

/** 본인 기업의 발행 이후 청구서(issued·paid·overdue), 청구월 최신순. draft(작성 중·정정 중)는 넣지 않는다 */
export async function listPortalBills(sql: Sql, tenantId: number): Promise<PortalBillListRow[]> {
  const rows = await sql`
    SELECT id, period, total_amount, status, due_date::text AS due_date, issued_at, paid_at, invoice_pathname
    FROM bills
    WHERE tenant_id = ${tenantId} AND status IN ('issued', 'paid', 'overdue')
    ORDER BY period DESC, id DESC
  `
  return rows as unknown as PortalBillListRow[]
}

// ── 청구서 상세 ──────────────────────────────────────────────────────────────

export interface PortalBillDetail extends PortalBillRow {
  rent_total: string
  mgmt_total: string
  supply_amount: string
  vat_amount: string
  elec_amount: string
  tenant_name: string
  room_no: string | null
  invoice_pathname: string | null
}

export interface PortalBillLine {
  id: number
  contract_id: number | null
  room_code: string | null
  line_type: string
  label: string | null
  quantity: string | null
  unit_price: string | null
  amount: string
}

export type PortalBillDetailResult =
  | { kind: "ok"; bill: PortalBillDetail; lines: PortalBillLine[]; previous: PreviousCompare | null; bank_info: BillingBankInfo }
  /** 발행했다가 되돌린 본인 청구서(draft + issued_at). 화면에는 안내 문장만 — period는 탭 제목용이고 API로는 내보내지 않는다 */
  | { kind: "correcting"; period: string }
  | { kind: "not_found" }

export async function getPortalBillDetail(sql: Sql, tenantId: number, billId: number): Promise<PortalBillDetailResult> {
  const bills = await sql`
    SELECT b.id, b.period, b.rent_total, b.mgmt_total, b.supply_amount, b.vat_amount,
           b.elec_amount, b.total_amount, b.status, b.due_date::text AS due_date,
           b.issued_at, b.paid_at, b.invoice_pathname, t.name AS tenant_name, t.room_no
    FROM bills b JOIN tenants t ON t.id = b.tenant_id
    WHERE b.id = ${billId}
      AND b.tenant_id = ${tenantId}
      AND (b.status IN ('issued', 'paid', 'overdue') OR (b.status = 'draft' AND b.issued_at IS NOT NULL))
  `
  if (bills.length === 0) return { kind: "not_found" }
  const bill = bills[0] as unknown as PortalBillDetail
  if (bill.status === "draft") return { kind: "correcting", period: bill.period }

  const [lines, prevBills] = await Promise.all([
    sql`
      SELECT id, contract_id, room_code, line_type, label, quantity, unit_price, amount
      FROM bill_lines
      WHERE bill_id = ${bill.id}
      ORDER BY id
    `,
    // 비교 대상: 같은 기업의 바로 앞 발행 청구서(초안·정정 중 제외)
    sql`
      SELECT id, period, total_amount
      FROM bills
      WHERE tenant_id = ${tenantId} AND status IN ('issued', 'paid', 'overdue') AND period < ${bill.period}
      ORDER BY period DESC, id DESC
      LIMIT 1
    `,
  ])
  let previous: PreviousCompare | null = null
  if (prevBills.length > 0) {
    const prev = prevBills[0] as { id: number; period: string; total_amount: string }
    const prevLines = await sql`SELECT line_type, amount FROM bill_lines WHERE bill_id = ${prev.id}`
    previous = comparePrevious(
      { period: bill.period, total_amount: bill.total_amount, lines: lines as unknown as PortalBillLine[] },
      { period: prev.period, total_amount: prev.total_amount, lines: prevLines as unknown as { line_type: string; amount: string }[] },
    )
  }
  return { kind: "ok", bill, lines: lines as unknown as PortalBillLine[], previous, bank_info: getBillingBankInfo() }
}

// ── 홈·계정 ──────────────────────────────────────────────────────────────────

/** 진행 중 계약의 호실 코드(계약 기준). 없으면 빈 배열 */
export async function getTenantRooms(sql: Sql, tenantId: number): Promise<string[]> {
  const rows = await sql`
    SELECT DISTINCT r.code, r.sort_order
    FROM contracts c JOIN rooms r ON r.id = c.room_id
    WHERE c.tenant_id = ${tenantId} AND c.status = 'active'
    ORDER BY r.sort_order, r.code
  `
  return (rows as { code: string }[]).map((r) => r.code)
}

export interface PortalCompanyInfo {
  name: string
  rooms: string[]
  billEmail: string | null
}

export async function getPortalCompany(sql: Sql, tenantId: number): Promise<PortalCompanyInfo> {
  const [t, rooms] = await Promise.all([
    sql`SELECT name, room_no, tax_email, contact_email FROM tenants WHERE id = ${tenantId}`,
    getTenantRooms(sql, tenantId),
  ])
  const row = (t[0] ?? {}) as { name?: string; room_no?: string | null; tax_email?: string | null; contact_email?: string | null }
  return {
    name: row.name ?? "",
    rooms: rooms.length > 0 ? rooms : row.room_no ? [row.room_no] : [],
    // 발행 메일 받는 주소와 같은 규칙(issue 라우트: tax_email || contact_email)
    billEmail: row.tax_email || row.contact_email || null,
  }
}

/** 마지막 납부 완료 청구서(낼 관리비가 없을 때 "최근" 한 줄) */
export async function getLastPaidBill(sql: Sql, tenantId: number): Promise<PortalBillListRow | null> {
  const rows = await sql`
    SELECT id, period, total_amount, status, due_date::text AS due_date, issued_at, paid_at, invoice_pathname
    FROM bills
    WHERE tenant_id = ${tenantId} AND status = 'paid'
    ORDER BY period DESC, id DESC
    LIMIT 1
  `
  return (rows[0] as unknown as PortalBillListRow | undefined) ?? null
}

/** 홈·프로그램 묶음용 목록 — /api/portal/programs 목록과 같은 범위(모집 중 + 본인이 신청한 마감 공고) + 검토 의견 */
export async function listPortalPrograms(sql: Sql, tenantId: number): Promise<PortalProgramRow[]> {
  const rows = await sql`
    SELECT p.id, p.title, p.category, p.status,
           p.apply_start::text AS apply_start, p.apply_end::text AS apply_end,
           p.submit_deadline::text AS submit_deadline,
           a.status AS application_status,
           s.status AS submission_status, s.feedback
    FROM programs p
    LEFT JOIN program_applications a ON a.program_id = p.id AND a.tenant_id = ${tenantId}
    LEFT JOIN submissions s ON s.program_id = p.id AND s.tenant_id = ${tenantId}
    WHERE p.status = 'open' OR (p.status = 'closed' AND a.id IS NOT NULL)
    ORDER BY p.apply_end NULLS LAST, p.id DESC
  `
  return rows as unknown as PortalProgramRow[]
}

/** 프로그램 상세 탭 제목용(포털에 보이는 open·closed만) */
export async function getPortalProgramTitle(sql: Sql, programId: number): Promise<string | null> {
  const rows = await sql`SELECT title FROM programs WHERE id = ${programId} AND status IN ('open', 'closed')`
  return (rows[0] as { title?: string } | undefined)?.title ?? null
}
