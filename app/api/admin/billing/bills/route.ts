import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidPeriod, isValidDateString } from "@/lib/billing"

// GET /api/admin/billing/bills?period=&status= — 목록. ?id= 지정 시 단건+라인
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const { searchParams } = new URL(request.url)
    const id = Number(searchParams.get("id"))
    if (Number.isInteger(id) && id > 0) {
      const bills = await sql`
        SELECT b.*, b.due_date::text AS due_date, t.name AS tenant_name, t.tax_email, t.contact_email
        FROM bills b JOIN tenants t ON t.id = b.tenant_id WHERE b.id = ${id}
      `
      if (bills.length === 0) return NextResponse.json({ success: false, error: "존재하지 않는 청구서입니다" }, { status: 404 })
      const lines = await sql`SELECT * FROM bill_lines WHERE bill_id = ${id} ORDER BY id`
      return NextResponse.json({ success: true, bill: bills[0], lines })
    }

    const period = searchParams.get("period")
    const status = searchParams.get("status")
    const vPeriod = isValidPeriod(period) ? period : null
    const vStatus = ["draft", "issued", "paid", "overdue"].includes(status || "") ? status : null

    const rows = await sql`
      SELECT b.*, b.due_date::text AS due_date, t.name AS tenant_name
      FROM bills b JOIN tenants t ON t.id = b.tenant_id
      WHERE (${vPeriod}::text IS NULL OR b.period = ${vPeriod})
        AND (${vStatus}::text IS NULL OR b.status = ${vStatus})
      ORDER BY b.period DESC, t.name
      LIMIT 500
    `
    return NextResponse.json({ success: true, bills: rows })
  } catch (error) {
    console.error("List bills error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// PUT /api/admin/billing/bills — { id, memo?, due_date?, mark_paid?, paid_at?, lines? }
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const b = await request.json()
    const id = Number(b.id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    const bills = await sql`SELECT id, status FROM bills WHERE id = ${id}`
    if (bills.length === 0) return NextResponse.json({ success: false, error: "존재하지 않는 청구서입니다" }, { status: 404 })
    const bill = bills[0]

    // 납부 확인 (이체일)
    if (b.mark_paid === true) {
      if (bill.status !== "issued" && bill.status !== "overdue") {
        return NextResponse.json({ success: false, error: "발행된 청구서만 납부 확인할 수 있습니다" }, { status: 400 })
      }
      if (isValidDateString(b.paid_at)) {
        const paidAt = `${b.paid_at}T00:00:00Z`
        await sql`UPDATE bills SET status = 'paid', paid_at = ${paidAt}, updated_at = NOW() WHERE id = ${id}`
      } else {
        await sql`UPDATE bills SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = ${id}`
      }
      return NextResponse.json({ success: true })
    }

    // 라인 수정 (draft만) → 합계 재계산
    if (Array.isArray(b.lines)) {
      if (bill.status !== "draft") {
        return NextResponse.json({ success: false, error: "발행된 청구서의 항목은 수정할 수 없습니다" }, { status: 400 })
      }
      const cleaned = b.lines
        .map((l: { contract_id?: number; room_code?: string; line_type?: string; label?: string; quantity?: number; unit_price?: number; amount?: number }) => ({
          contract_id: Number.isInteger(Number(l.contract_id)) && Number(l.contract_id) > 0 ? Number(l.contract_id) : null,
          room_code: String(l.room_code ?? "").slice(0, 20) || null,
          line_type: ["rent", "mgmt", "elec_area", "elec_metered", "manual"].includes(String(l.line_type)) ? l.line_type : "manual",
          label: String(l.label ?? "").slice(0, 200),
          quantity: l.quantity == null || l.quantity === ("" as unknown) ? null : Number(l.quantity),
          unit_price: l.unit_price == null || l.unit_price === ("" as unknown) ? null : Number(l.unit_price),
          amount: Math.round(Number(l.amount ?? 0)),
        }))
        .filter((l: { label: string; amount: number }) => l.label && Number.isFinite(l.amount))
      if (cleaned.length === 0) return NextResponse.json({ success: false, error: "항목이 최소 1개 필요합니다" }, { status: 400 })

      const rentTotal = cleaned.filter((l: { line_type: string }) => l.line_type === "rent").reduce((s: number, l: { amount: number }) => s + l.amount, 0)
      const mgmtTotal = cleaned.filter((l: { line_type: string }) => l.line_type === "mgmt").reduce((s: number, l: { amount: number }) => s + l.amount, 0)
      const elecTotal = cleaned.filter((l: { line_type: string }) => ["elec_area", "elec_metered"].includes(l.line_type)).reduce((s: number, l: { amount: number }) => s + l.amount, 0)
      const manualTotal = cleaned.filter((l: { line_type: string }) => l.line_type === "manual").reduce((s: number, l: { amount: number }) => s + l.amount, 0)
      const gross = rentTotal + mgmtTotal
      // 공급가액은 생성 경로(calcContractCharge)와 동일하게 계약별로 반올림해 합산
      // (전체 합산 후 반올림하면 다중 호실 기업에서 몇 원 어긋날 수 있음)
      const grossByContract = new Map<string, number>()
      for (const l of cleaned as { contract_id: number | null; line_type: string; amount: number }[]) {
        if (l.line_type !== "rent" && l.line_type !== "mgmt") continue
        const key = String(l.contract_id ?? "manual")
        grossByContract.set(key, (grossByContract.get(key) ?? 0) + l.amount)
      }
      let supply = 0
      for (const g of grossByContract.values()) supply += Math.round(g / 1.1)
      const vat = gross - supply
      const total = gross + elecTotal + manualTotal

      await sql.transaction([
        sql`DELETE FROM bill_lines USING bills WHERE bill_lines.bill_id = bills.id AND bills.id = ${id} AND bills.status = 'draft'`,
        sql`
          INSERT INTO bill_lines (bill_id, contract_id, room_code, line_type, label, quantity, unit_price, amount)
          SELECT ${id}, l.contract_id, l.room_code, l.line_type, l.label, l.quantity, l.unit_price, l.amount
          FROM jsonb_to_recordset(${JSON.stringify(cleaned)}::jsonb)
            AS l(contract_id int, room_code text, line_type text, label text, quantity numeric, unit_price numeric, amount numeric)
          WHERE EXISTS (SELECT 1 FROM bills WHERE id = ${id} AND status = 'draft')
        `,
        sql`UPDATE bills SET rent_total = ${rentTotal}, mgmt_total = ${mgmtTotal}, supply_amount = ${supply},
              vat_amount = ${vat}, elec_amount = ${elecTotal + manualTotal}, total_amount = ${total}, updated_at = NOW()
            WHERE id = ${id} AND status = 'draft'`,
      ])
    }

    if (b.memo !== undefined) await sql`UPDATE bills SET memo = ${b.memo || null}, updated_at = NOW() WHERE id = ${id}`
    if (b.due_date !== undefined && isValidDateString(b.due_date)) {
      await sql`UPDATE bills SET due_date = ${b.due_date}, updated_at = NOW() WHERE id = ${id}`
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Update bill error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}
