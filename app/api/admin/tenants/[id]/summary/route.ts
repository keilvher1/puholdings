import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { RECEIVABLE_SQL } from "@/lib/receivables"
import { todayKST } from "@/lib/format"
import { coreName } from "@/lib/tenant-model"

// GET /api/admin/tenants/[id]/summary — 기업 카드(오른쪽 시트) 한 번에 읽기. 조회 전용(SELECT만, 읽기 전용 transaction 1회).
// 돌려주는 것: 기업 행(목록과 같은 필드) · 계약 전체 · 최근 청구서 12건 · 받을 돈(건수·합계·기한 지남·가장 오래된 청구·미수 청구서 전체) ·
//             최근 메일 5건 · 이름이 들어간 관리자 메모(이름 일치) · 삭제 영향 건수(청구서·계약·신청·제출·포털 계정).
// 받을 돈 판정은 lib/receivables.ts의 같은 SQL 조각을 쓴다.

type Row = Record<string, unknown>

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }

  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }

  const { id } = await params
  const tenantId = Number(id)
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return NextResponse.json({ success: false, error: "기업 번호가 올바르지 않아요" }, { status: 400 })
  }

  try {
    const R = RECEIVABLE_SQL("b", todayKST())
    const [tenantRows, contractRows, billRows, recvRows, unpaidRows, emailRows, impactRows] = (await sql.transaction(
      [
        sql`
          SELECT t.id, t.name, t.business_no, t.ceo_name, t.room_no, t.contact_email, t.contact_phone,
                 t.move_in_date::text AS move_in_date, t.move_out_date::text AS move_out_date,
                 t.status, t.memo, t.overpaid_balance, t.created_at, t.updated_at,
                 u.id AS account_id, u.email AS account_email, u.last_login AS account_last_login,
                 t.tax_email, t.manager_name,
                 (SELECT string_agg(rm.code, ', ' ORDER BY rm.sort_order, rm.code)
                    FROM contracts ct JOIN rooms rm ON rm.id = ct.room_id
                   WHERE ct.tenant_id = t.id AND ct.status = 'active') AS contract_rooms,
                 (SELECT COUNT(*)::int FROM contracts ct WHERE ct.tenant_id = t.id AND ct.status = 'active') AS active_contracts,
                 (SELECT MIN(ct.start_date)::text FROM contracts ct WHERE ct.tenant_id = t.id AND ct.status = 'active') AS contract_start
          FROM tenants t
          LEFT JOIN tenant_users u ON u.tenant_id = t.id
          WHERE t.id = ${tenantId}
        `,
        sql`
          SELECT ct.id, rm.code AS room_code, rm.building, ct.status,
                 ct.start_date::text AS start_date, ct.ended_at::text AS ended_at,
                 ct.pyeong_billed::text AS pyeong_billed, ct.rent_unit_price::text AS rent_unit_price,
                 ct.mgmt_fee::text AS mgmt_fee, ct.deposit_standard::text AS deposit_standard,
                 ct.deposit_actual::text AS deposit_actual, ct.deposit_returned_amount::text AS deposit_returned_amount,
                 ct.elec_method, ct.renewal_type
          FROM contracts ct LEFT JOIN rooms rm ON rm.id = ct.room_id
          WHERE ct.tenant_id = ${tenantId}
          ORDER BY (ct.status = 'active') DESC, ct.start_date DESC NULLS LAST, ct.id DESC
        `,
        sql`
          SELECT b.id, b.period, b.total_amount::text AS total_amount, b.status, b.is_manual,
                 b.due_date::text AS due_date, b.issued_at, b.paid_at
          FROM bills b
          WHERE b.tenant_id = ${tenantId}
          ORDER BY b.period DESC, b.id DESC
          LIMIT 12
        `,
        sql`
          SELECT COUNT(*) FILTER (WHERE ${sql.unsafe(R.isReceivable)})::int AS count,
                 COALESCE(SUM(b.total_amount) FILTER (WHERE ${sql.unsafe(R.isReceivable)}), 0)::text AS total,
                 COUNT(*) FILTER (WHERE ${sql.unsafe(R.isLate)})::int AS late_count,
                 COUNT(*) FILTER (WHERE ${sql.unsafe(R.isCorrecting)})::int AS correcting_count
          FROM bills b
          WHERE b.tenant_id = ${tenantId}
        `,
        sql`
          SELECT b.id, b.period, b.status, b.total_amount::text AS total_amount, b.due_date::text AS due_date, b.issued_at
          FROM bills b
          WHERE b.tenant_id = ${tenantId} AND ${sql.unsafe(R.isReceivable)}
          ORDER BY b.period ASC, b.id ASC
        `,
        sql`
          SELECT e.id, e.template_code, e.subject, e.to_email, e.status, e.error, e.created_at
          FROM email_logs e
          WHERE e.tenant_id = ${tenantId}
          ORDER BY e.created_at DESC, e.id DESC
          LIMIT 5
        `,
        sql`
          SELECT (SELECT COUNT(*)::int FROM bills WHERE tenant_id = ${tenantId}) AS bills,
                 (SELECT COUNT(*)::int FROM contracts WHERE tenant_id = ${tenantId}) AS contracts,
                 (SELECT COUNT(*)::int FROM program_applications WHERE tenant_id = ${tenantId}) AS applications,
                 (SELECT COUNT(*)::int FROM submissions WHERE tenant_id = ${tenantId}) AS submissions,
                 EXISTS (SELECT 1 FROM tenant_users WHERE tenant_id = ${tenantId}) AS has_account
        `,
      ],
      { readOnly: true },
    )) as Row[][]

    if (tenantRows.length === 0) {
      return NextResponse.json({ success: false, error: "이 기업을 찾을 수 없어요(삭제됐을 수 있어요)" }, { status: 404 })
    }
    const tenant = tenantRows[0]
    const recv = recvRows[0] ?? {}

    // 관리자 메모 중 기업 이름이 들어간 것(이름 일치 — admin_notes에 tenant_id가 없다). 실패해도 카드는 연다.
    let notes: Row[] = []
    const core = coreName(String(tenant.name ?? ""))
    if (core.length >= 2) {
      try {
        const pattern = `%${core.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
        notes = (await sql`
          SELECT id, title, status, created_at
          FROM admin_notes
          WHERE replace(title, ' ', '') ILIKE ${pattern} OR replace(COALESCE(body, ''), ' ', '') ILIKE ${pattern}
          ORDER BY (status = 'open') DESC, created_at DESC
          LIMIT 5
        `) as Row[]
      } catch (error) {
        console.error("Tenant summary notes error:", error)
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        tenant: { ...tenant, unpaid_count: recv.count ?? 0, unpaid_total: recv.total ?? "0", unpaid_late_count: recv.late_count ?? 0 },
        contracts: contractRows,
        bills: billRows,
        receivable: {
          count: Number(recv.count ?? 0),
          total: Number(recv.total ?? 0),
          late_count: Number(recv.late_count ?? 0),
          correcting_count: Number(recv.correcting_count ?? 0),
          oldest: unpaidRows[0] ?? null,
          bills: unpaidRows,
        },
        emails: emailRows,
        notes,
        impact: impactRows[0] ?? { bills: 0, contracts: 0, applications: 0, submissions: 0, has_account: false },
      },
    })
  } catch (error) {
    console.error("Tenant summary error:", error)
    return NextResponse.json({ success: false, error: "기업 정보를 불러오지 못했습니다" }, { status: 500 })
  }
}
