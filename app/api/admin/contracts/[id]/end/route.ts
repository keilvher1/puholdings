import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidDateString } from "@/lib/billing"

// POST /api/admin/contracts/[id]/end — 퇴실 처리
// body: { ended_at, last_month_billing('full'|'prorated'|'none'), deposit_returned_amount?, deposit_returned_at? }
// 계약 status='ended' → 호실은 파생 상태로 자동 공실 전환.
// 미납(issued/overdue) 청구 합을 조회해 보증금 반환과의 상계 내역을 응답한다.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const b = await request.json()
    if (!isValidDateString(b.ended_at)) {
      return NextResponse.json({ success: false, error: "종료일(ended_at)이 필요합니다" }, { status: 400 })
    }
    const lastMonth = ["full", "prorated", "none"].includes(b.last_month_billing) ? b.last_month_billing : "full"
    const returnAmount = Number(b.deposit_returned_amount)
    const returnedAt = isValidDateString(b.deposit_returned_at) ? b.deposit_returned_at : b.ended_at

    const rows = await sql`
      UPDATE contracts
      SET status = 'ended', ended_at = ${b.ended_at}, last_month_billing = ${lastMonth},
          deposit_returned_amount = ${Number.isFinite(returnAmount) ? Math.round(returnAmount) : null},
          deposit_returned_at = ${Number.isFinite(returnAmount) ? returnedAt : null},
          updated_at = NOW()
      WHERE id = ${contractId}
      RETURNING id, tenant_id, deposit_actual
    `
    if (rows.length === 0) return NextResponse.json({ success: false, error: "존재하지 않는 계약입니다" }, { status: 404 })
    const contract = rows[0]

    // 미납 상계 내역: 해당 기업의 미납(issued/overdue) 청구 합
    const unpaidRows = await sql`
      SELECT COALESCE(SUM(total_amount), 0)::bigint AS unpaid
      FROM bills
      WHERE tenant_id = ${contract.tenant_id} AND status IN ('issued', 'overdue')
    `
    const unpaid = Number(unpaidRows[0].unpaid)
    const depositActual = Number(contract.deposit_actual ?? 0)
    const returned = Number.isFinite(returnAmount) ? Math.round(returnAmount) : depositActual - unpaid

    return NextResponse.json({
      success: true,
      offset: {
        deposit_actual: depositActual,
        unpaid_total: unpaid,
        suggested_return: depositActual - unpaid, // 보증금 − 미납 상계 제안액
        returned_amount: returned,
      },
    })
  } catch (error) {
    console.error("End contract error:", error)
    return NextResponse.json({ success: false, error: "퇴실 처리에 실패했습니다" }, { status: 500 })
  }
}
