import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidPeriod, isValidDateString } from "@/lib/billing"

// POST /api/admin/billing/bills/manual — 정산표 밖 수기 청구 (퇴거 정산 등)
// body: { tenant_id?, tenant_name?, period, due_date?, memo?, lines: [{ label, amount, line_type? }] }
// 기존 tenant 없이 이름만으로도 발행 가능(tenant_id NULL 불가 → 기업 지정 필수 케이스는 tenant_id 사용).
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const b = await request.json()
    const tenantId = Number(b.tenant_id)
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return NextResponse.json({ success: false, error: "기업(tenant_id)을 선택해주세요" }, { status: 400 })
    }
    if (!isValidPeriod(b.period)) return NextResponse.json({ success: false, error: "청구월(period)이 필요합니다" }, { status: 400 })
    if (!Array.isArray(b.lines) || b.lines.length === 0) {
      return NextResponse.json({ success: false, error: "청구 항목이 필요합니다" }, { status: 400 })
    }

    const lines = b.lines
      .map((l: { label?: string; amount?: number; line_type?: string }) => ({
        contract_id: null,
        room_code: null,
        line_type: ["rent", "mgmt", "elec_area", "elec_metered", "manual"].includes(String(l.line_type)) ? l.line_type : "manual",
        label: String(l.label ?? "").slice(0, 200),
        quantity: null,
        unit_price: null,
        amount: Math.round(Number(l.amount ?? 0)),
      }))
      .filter((l: { label: string; amount: number }) => l.label && Number.isFinite(l.amount))
    if (lines.length === 0) return NextResponse.json({ success: false, error: "유효한 항목이 없습니다" }, { status: 400 })
    const total = lines.reduce((s: number, l: { amount: number }) => s + l.amount, 0)
    const dueDate = isValidDateString(b.due_date) ? b.due_date : null

    // 수동 청구는 전액 elec_amount에 넣지 않고 manual 합계를 total로. rent/mgmt=0.
    const rows = await sql`
      WITH nb AS (
        INSERT INTO bills (tenant_id, period, rent_total, mgmt_total, supply_amount, vat_amount, elec_amount, total_amount, status, is_manual, due_date, memo)
        VALUES (${tenantId}, ${b.period}, 0, 0, 0, 0, 0, ${total}, 'draft', TRUE, ${dueDate}, ${b.memo || null})
        ON CONFLICT (tenant_id, period) DO NOTHING
        RETURNING id
      )
      SELECT id FROM nb
    `
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "해당 기업의 이 청구월 청구서가 이미 존재합니다" }, { status: 409 })
    }
    const billId = rows[0].id
    await sql`
      INSERT INTO bill_lines (bill_id, contract_id, room_code, line_type, label, quantity, unit_price, amount)
      SELECT ${billId}, l.contract_id, l.room_code, l.line_type, l.label, l.quantity, l.unit_price, l.amount
      FROM jsonb_to_recordset(${JSON.stringify(lines)}::jsonb)
        AS l(contract_id int, room_code text, line_type text, label text, quantity numeric, unit_price numeric, amount numeric)
    `
    return NextResponse.json({ success: true, id: billId })
  } catch (error) {
    console.error("Manual bill error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}
