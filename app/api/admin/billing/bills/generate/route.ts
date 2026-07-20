import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidPeriod, prevPeriod, daysInMonthOf, calcBill, type BillContractInput, type ProrateOption } from "@/lib/billing"
import { computeElecContext, factoryChargeByRoom } from "@/lib/billing-db"

// POST /api/admin/billing/bills/generate — { billMonth: 'YYYY-MM' }
// 청구월 M = M월 임대료 + (M−1)월 전기료. 공실 자동 제외, 이미 발행(issued+)된 건 스킵.
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const { billMonth } = await request.json()
    if (!isValidPeriod(billMonth)) return NextResponse.json({ success: false, error: "billMonth(YYYY-MM)가 필요합니다" }, { status: 400 })
    const elecMonth = prevPeriod(billMonth)
    const billLabel = String(Number(billMonth.slice(5, 7)))
    const elecLabel = String(Number(elecMonth.slice(5, 7)))
    const dim = daysInMonthOf(billMonth)

    const elecCtx = await computeElecContext(sql, elecMonth)
    const per10Billed = elecCtx.allocation.per10Billed
    const factoryByRoom = factoryChargeByRoom(elecCtx.factory)

    // 청구 대상 계약: 진행중 + billMonth에 종료된 계약(마지막달 청구용)
    const contracts = await sql`
      SELECT c.id, c.tenant_id, c.pyeong_billed, c.rent_unit_price, c.mgmt_fee, c.elec_method,
             c.status, c.start_date::text AS start_date, c.ended_at::text AS ended_at,
             c.first_month_billing, c.last_month_billing, r.code AS room_code,
             t.name AS tenant_name
      FROM contracts c
      JOIN rooms r ON r.id = c.room_id
      JOIN tenants t ON t.id = c.tenant_id
      WHERE c.status = 'active'
         OR (c.status = 'ended' AND to_char(c.ended_at, 'YYYY-MM') = ${billMonth})
      ORDER BY c.tenant_id
    `

    const existing = await sql`SELECT tenant_id, status FROM bills WHERE period = ${billMonth}`
    const billByTenant = new Map(existing.map((b) => [b.tenant_id, b.status]))

    // 기업별 그룹화
    const byTenant = new Map<number, { name: string; contracts: typeof contracts }>()
    for (const c of contracts) {
      if (!byTenant.has(c.tenant_id)) byTenant.set(c.tenant_id, { name: c.tenant_name, contracts: [] })
      byTenant.get(c.tenant_id)!.contracts.push(c)
    }

    let created = 0
    let regenerated = 0
    const skipped: { tenant_name: string; reason: string }[] = []

    for (const [tenantId, group] of byTenant) {
      const status = billByTenant.get(tenantId)
      if (status && status !== "draft") {
        skipped.push({ tenant_name: group.name, reason: `이미 ${status} 상태` })
        continue
      }

      const inputs: BillContractInput[] = []
      for (const c of group.contracts) {
        // 일할/제외 판정
        let prorate: ProrateOption | undefined
        let skip = false
        const startsThisMonth = c.start_date && c.start_date.slice(0, 7) === billMonth
        const endsThisMonth = c.ended_at && c.ended_at.slice(0, 7) === billMonth
        if (startsThisMonth) {
          if (c.first_month_billing === "none") skip = true
          else if (c.first_month_billing === "prorated") {
            const startDay = Number(c.start_date.slice(8, 10))
            prorate = { usedDays: dim - startDay + 1, daysInMonth: dim }
          }
        } else if (endsThisMonth) {
          if (c.last_month_billing === "none") skip = true
          else if (c.last_month_billing === "prorated") {
            const endDay = Number(c.ended_at.slice(8, 10))
            prorate = { usedDays: endDay, daysInMonth: dim }
          }
        }
        if (skip) continue

        inputs.push({
          id: c.id,
          room_code: c.room_code,
          pyeong_billed: Number(c.pyeong_billed),
          rent_unit_price: Number(c.rent_unit_price),
          mgmt_fee: Number(c.mgmt_fee),
          elec_method: c.elec_method,
          metered_elec: c.elec_method === "metered" ? factoryByRoom[c.room_code] ?? 0 : undefined,
          prorate,
        })
      }

      if (inputs.length === 0) {
        skipped.push({ tenant_name: group.name, reason: "청구할 계약 없음" })
        continue
      }

      const bill = calcBill(inputs, per10Billed, billLabel, elecLabel)

      if (status === "draft") {
        await sql`DELETE FROM bills WHERE tenant_id = ${tenantId} AND period = ${billMonth} AND status = 'draft'`
        regenerated++
      } else {
        created++
      }

      // 청구서 + 라인을 한 문장으로 원자 삽입
      await sql`
        WITH b AS (
          INSERT INTO bills (tenant_id, period, rent_total, mgmt_total, supply_amount, vat_amount, elec_amount, total_amount, status)
          VALUES (${tenantId}, ${billMonth}, ${bill.rent_total}, ${bill.mgmt_total}, ${bill.supply_amount},
                  ${bill.vat_amount}, ${bill.elec_amount}, ${bill.total_amount}, 'draft')
          RETURNING id
        )
        INSERT INTO bill_lines (bill_id, contract_id, room_code, line_type, label, quantity, unit_price, amount)
        SELECT b.id, l.contract_id, l.room_code, l.line_type, l.label, l.quantity, l.unit_price, l.amount
        FROM b, jsonb_to_recordset(${JSON.stringify(bill.lines)}::jsonb)
          AS l(contract_id int, room_code text, line_type text, label text, quantity numeric, unit_price numeric, amount numeric)
      `
    }

    return NextResponse.json({
      success: true,
      bill_month: billMonth,
      elec_month: elecMonth,
      per10_billed: per10Billed,
      created, regenerated, skipped,
    })
  } catch (error) {
    console.error("Generate bills error:", error)
    return NextResponse.json({ success: false, error: "청구서 생성에 실패했습니다" }, { status: 500 })
  }
}
