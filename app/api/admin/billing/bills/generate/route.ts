import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidPeriod, isValidDateString } from "@/lib/billing"

// POST /api/admin/billing/bills/generate — { period, due_date }
// active 기업별로 검침(사용량×단가) + 정액 항목을 합산해 bills(draft) + bill_lines 생성.
// 이미 있는 (tenant, period)는 draft만 재생성, issued 이후 상태면 스킵.
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const { period, due_date } = await request.json()
    if (!isValidPeriod(period)) {
      return NextResponse.json({ success: false, error: "period(YYYY-MM)가 필요합니다" }, { status: 400 })
    }
    if (!isValidDateString(due_date)) {
      return NextResponse.json({ success: false, error: "올바른 납부 기한(due_date)이 필요합니다" }, { status: 400 })
    }

    const [tenants, items, readings, existingBills] = await Promise.all([
      sql`SELECT id, name FROM tenants WHERE status = 'active' ORDER BY name`,
      sql`SELECT id, name, unit, unit_price, is_metered, default_amount FROM billing_items WHERE is_active = TRUE ORDER BY sort_order, id`,
      sql`SELECT tenant_id, item_id, prev_value, curr_value FROM meter_readings WHERE period = ${period}`,
      sql`SELECT id, tenant_id, status FROM bills WHERE period = ${period}`,
    ])
    const readingMap = new Map(readings.map((r) => [`${r.tenant_id}:${r.item_id}`, r]))
    const billByTenant = new Map(existingBills.map((b) => [b.tenant_id, b]))

    let created = 0
    let regenerated = 0
    const skipped: { tenant_name: string; reason: string }[] = []

    for (const tenant of tenants) {
      const existing = billByTenant.get(tenant.id)
      if (existing && existing.status !== "draft") {
        skipped.push({ tenant_name: tenant.name, reason: `이미 ${existing.status} 상태입니다` })
        continue
      }

      // 라인 계산
      const lines: { item_id: number; label: string; quantity: number | null; unit_price: number | null; amount: number }[] = []
      for (const item of items) {
        if (item.is_metered) {
          const reading = readingMap.get(`${tenant.id}:${item.id}`)
          if (!reading) continue // 검침값 없는 항목은 제외
          const quantity = Number(reading.curr_value) - Number(reading.prev_value)
          const unitPrice = Number(item.unit_price ?? 0)
          lines.push({
            item_id: item.id,
            label: item.name,
            quantity,
            unit_price: unitPrice,
            amount: Math.round(quantity * unitPrice),
          })
        } else {
          if (item.default_amount === null || item.default_amount === undefined) continue
          const amount = Math.round(Number(item.default_amount))
          lines.push({ item_id: item.id, label: item.name, quantity: null, unit_price: null, amount })
        }
      }

      if (lines.length === 0) {
        skipped.push({ tenant_name: tenant.name, reason: "청구할 항목이 없습니다 (검침값 미입력)" })
        continue
      }
      const total = lines.reduce((sum, l) => sum + l.amount, 0)

      try {
        if (existing) {
          // draft 재생성: 삭제된 행 수를 확인해 그 사이 발행된 경우를 건너뛴다
          const deleted = await sql`
            DELETE FROM bills WHERE id = ${existing.id} AND status = 'draft' RETURNING id
          `
          if (deleted.length === 0) {
            skipped.push({ tenant_name: tenant.name, reason: "처리 중 상태가 변경되어 건너뜀" })
            continue
          }
        }

        // 청구서 + 라인을 CTE 한 문장으로 원자적으로 생성
        await sql`
          WITH b AS (
            INSERT INTO bills (tenant_id, period, total_amount, status, due_date)
            VALUES (${tenant.id}, ${period}, ${total}, 'draft', ${due_date})
            RETURNING id
          )
          INSERT INTO bill_lines (bill_id, item_id, label, quantity, unit_price, amount)
          SELECT b.id, l.item_id, l.label, l.quantity, l.unit_price, l.amount
          FROM b, jsonb_to_recordset(${JSON.stringify(lines)}::jsonb)
            AS l(item_id int, label text, quantity numeric, unit_price numeric, amount numeric)
        `
        if (existing) regenerated++
        else created++
      } catch (error) {
        // 동시 생성으로 인한 unique 충돌 등 — 해당 기업만 건너뛰고 계속 진행
        console.error(`Generate bill error (tenant ${tenant.id}):`, error)
        skipped.push({ tenant_name: tenant.name, reason: "생성 실패 (동시 작업 충돌 가능)" })
      }
    }

    return NextResponse.json({ success: true, created, regenerated, skipped })
  } catch (error) {
    console.error("Generate bills error:", error)
    return NextResponse.json({ success: false, error: "청구서 생성에 실패했습니다" }, { status: 500 })
  }
}
