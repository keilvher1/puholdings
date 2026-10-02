import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidDateString } from "@/lib/billing"

// GET /api/admin/contracts/[id]/end/preview?ended_at=YYYY-MM-DD — 퇴실 정산 미리보기(조회 전용, 아무것도 바꾸지 않는다)
// 퇴실 처리(POST …/end) 전에 2단계 "정산 확인"에 보일 숫자를 돌려준다. 계산은 end/route.ts와 **같은 SQL·같은 식**이다
// (받을 돈 = 이 기업의 issued·overdue 청구 합, 보증금 = 이 계약의 deposit_actual(NULL이면 0), 제안 반환액 = 보증금 − 받을 돈).
// end/route.ts는 고치지 않는다. 두 계산이 같은지는 tests/contract-end-preview.test.ts가 확인한다.
// 덧붙여 돌려주는 것: 보증금 기록 여부(NULL 구분), 받을 돈 건수, 같은 기업의 다른 진행 중 계약, 퇴실 달 정기 청구서의 발행 여부.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const { id } = await params
    const contractId = Number(id)
    if (!Number.isInteger(contractId) || contractId <= 0) {
      return NextResponse.json({ success: false, error: "잘못된 계약 id입니다" }, { status: 400 })
    }
    const endedAtRaw = new URL(request.url).searchParams.get("ended_at")
    const endedAt = isValidDateString(endedAtRaw) ? endedAtRaw : null
    const endMonth = endedAt ? endedAt.slice(0, 7) : null

    const rows = await sql`
      SELECT c.id, c.tenant_id, c.status, c.deposit_actual, c.ended_at::text AS ended_at,
             t.name AS tenant_name, r.code AS room_code, r.building
      FROM contracts c
      JOIN tenants t ON t.id = c.tenant_id
      JOIN rooms r ON r.id = c.room_id
      WHERE c.id = ${contractId}
    `
    if (rows.length === 0) return NextResponse.json({ success: false, error: "존재하지 않는 계약입니다" }, { status: 404 })
    const contract = rows[0]

    // end/route.ts와 같은 받을 돈 SQL(해당 기업의 issued/overdue 청구 합) + 건수
    const unpaidRows = await sql`
      SELECT COALESCE(SUM(total_amount), 0)::bigint AS unpaid, COUNT(*)::int AS unpaid_count
      FROM bills
      WHERE tenant_id = ${contract.tenant_id} AND status IN ('issued', 'overdue')
    `
    const unpaid = Number(unpaidRows[0].unpaid)
    const depositActual = Number(contract.deposit_actual ?? 0)

    const others = await sql`
      SELECT c.id, r.code AS room_code, r.building
      FROM contracts c JOIN rooms r ON r.id = c.room_id
      WHERE c.tenant_id = ${contract.tenant_id} AND c.status = 'active' AND c.id <> ${contractId}
      ORDER BY r.building, r.sort_order, r.code
    `

    // 퇴실 달 정기 청구서(수기 제외) — 이미 발행됐으면 생성이 그 달을 건너뛴다
    const endBills = endMonth
      ? await sql`
          SELECT id, status, total_amount
          FROM bills
          WHERE tenant_id = ${contract.tenant_id} AND period = ${endMonth} AND COALESCE(is_manual, FALSE) = FALSE
          ORDER BY id
          LIMIT 1
        `
      : []
    const endBill = endBills[0] ?? null
    const endIssued = !!endBill && ["issued", "overdue", "paid"].includes(endBill.status)

    return NextResponse.json({
      success: true,
      preview: {
        contract: {
          id: contract.id,
          tenant_id: contract.tenant_id,
          tenant_name: contract.tenant_name,
          room_code: contract.room_code,
          building: contract.building,
          status: contract.status,
          deposit_actual: contract.deposit_actual,
          ended_at: contract.ended_at,
        },
        deposit_actual: depositActual,
        deposit_recorded: contract.deposit_actual !== null && contract.deposit_actual !== undefined,
        unpaid_total: unpaid,
        unpaid_count: Number(unpaidRows[0].unpaid_count),
        suggested_return: depositActual - unpaid, // end/route.ts의 suggested_return과 같은 식
        other_active_contracts: others.map((o) => ({ id: o.id, room_code: o.room_code, building: o.building })),
        end_month: endMonth,
        end_month_bill: endBill ? { id: endBill.id, status: endBill.status, total_amount: Number(endBill.total_amount) } : null,
        end_month_issued: endIssued,
      },
    })
  } catch (error) {
    console.error("End contract preview error:", error)
    return NextResponse.json({ success: false, error: "정산 미리보기를 불러오지 못했어요" }, { status: 500 })
  }
}
