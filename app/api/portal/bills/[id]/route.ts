import { NextResponse } from "next/server"
import { getPortalSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

// GET /api/portal/bills/[id] — 본인 기업 청구서 상세 (bill_lines 포함)
// 세션의 tenant_id로 스코프하므로 타 기업 청구서 id로는 404가 난다.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const { id } = await params
    const billId = Number(id)
    if (!Number.isInteger(billId) || billId <= 0) {
      return NextResponse.json({ success: false, error: "잘못된 id입니다" }, { status: 400 })
    }

    const bills = await sql`
      SELECT b.id, b.period, b.total_amount, b.status, b.due_date::text AS due_date,
             b.issued_at, b.paid_at, t.name AS tenant_name, t.room_no
      FROM bills b JOIN tenants t ON t.id = b.tenant_id
      WHERE b.id = ${billId}
        AND b.tenant_id = ${session.tenant_id}
        AND b.status IN ('issued', 'paid', 'overdue')
    `
    if (bills.length === 0) {
      return NextResponse.json({ success: false, error: "청구서를 찾을 수 없습니다" }, { status: 404 })
    }

    const lines = await sql`
      SELECT bl.id, bl.label, bl.quantity, bl.unit_price, bl.amount, bi.unit
      FROM bill_lines bl
      LEFT JOIN billing_items bi ON bi.id = bl.item_id
      WHERE bl.bill_id = ${billId}
      ORDER BY bl.id
    `
    return NextResponse.json({ success: true, bill: bills[0], lines })
  } catch (error) {
    console.error("Portal bill detail error:", error)
    return NextResponse.json({ success: false, error: "청구서를 불러오지 못했습니다" }, { status: 500 })
  }
}
