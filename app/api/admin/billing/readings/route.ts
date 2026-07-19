import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidPeriod, prevPeriod } from "@/lib/billing"

// GET /api/admin/billing/readings?period=YYYY-MM
// active 기업 × 검침 항목 매트릭스. 당월 저장값이 없으면 전월 curr_value를 prev로 제안.
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get("period")
    if (!isValidPeriod(period)) {
      return NextResponse.json({ success: false, error: "period(YYYY-MM)가 필요합니다" }, { status: 400 })
    }
    const prev = prevPeriod(period)

    const [tenants, items, currReadings, prevReadings] = await Promise.all([
      sql`SELECT id, name, room_no FROM tenants WHERE status = 'active' ORDER BY room_no NULLS LAST, name`,
      sql`SELECT id, name, unit, unit_price FROM billing_items WHERE is_metered = TRUE AND is_active = TRUE ORDER BY sort_order, id`,
      sql`SELECT tenant_id, item_id, prev_value, curr_value FROM meter_readings WHERE period = ${period}`,
      sql`SELECT tenant_id, item_id, curr_value FROM meter_readings WHERE period = ${prev}`,
    ])

    const currMap = new Map(currReadings.map((r) => [`${r.tenant_id}:${r.item_id}`, r]))
    const prevMap = new Map(prevReadings.map((r) => [`${r.tenant_id}:${r.item_id}`, r]))

    const rows = tenants.map((t) => {
      const cells: Record<number, { prev_value: string; curr_value: string | null; saved: boolean }> = {}
      for (const item of items) {
        const key = `${t.id}:${item.id}`
        const curr = currMap.get(key)
        if (curr) {
          cells[item.id] = { prev_value: String(curr.prev_value), curr_value: String(curr.curr_value), saved: true }
        } else {
          const prevRow = prevMap.get(key)
          cells[item.id] = { prev_value: prevRow ? String(prevRow.curr_value) : "0", curr_value: null, saved: false }
        }
      }
      return { tenant_id: t.id, tenant_name: t.name, room_no: t.room_no, cells }
    })

    return NextResponse.json({ success: true, period, items, rows })
  } catch (error) {
    console.error("Readings matrix error:", error)
    return NextResponse.json({ success: false, error: "검침 데이터를 불러오지 못했습니다" }, { status: 500 })
  }
}

// PUT /api/admin/billing/readings — 일괄 upsert
// body: { period, readings: [{ tenant_id, item_id, prev_value, curr_value }] }
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const { period, readings } = await request.json()
    if (!isValidPeriod(period) || !Array.isArray(readings)) {
      return NextResponse.json({ success: false, error: "period와 readings가 필요합니다" }, { status: 400 })
    }

    let saved = 0
    const errors: string[] = []
    for (const r of readings) {
      const tenantId = Number(r.tenant_id)
      const itemId = Number(r.item_id)
      const prevValue = Number(r.prev_value)
      const currValue = Number(r.curr_value)
      if (!Number.isInteger(tenantId) || !Number.isInteger(itemId)) continue
      if (!Number.isFinite(prevValue) || !Number.isFinite(currValue)) continue
      if (prevValue < 0 || currValue < 0) {
        errors.push(`tenant ${tenantId} / item ${itemId}: 음수는 입력할 수 없습니다`)
        continue
      }
      if (currValue < prevValue) {
        errors.push(`tenant ${tenantId} / item ${itemId}: 당월지침이 전월지침보다 작습니다`)
        continue
      }
      try {
        await sql`
          INSERT INTO meter_readings (tenant_id, item_id, period, prev_value, curr_value)
          VALUES (${tenantId}, ${itemId}, ${period}, ${prevValue}, ${currValue})
          ON CONFLICT (tenant_id, item_id, period) DO UPDATE
          SET prev_value = EXCLUDED.prev_value, curr_value = EXCLUDED.curr_value
        `
        saved++
      } catch (error) {
        console.error("Reading upsert error:", error)
        errors.push(`tenant ${tenantId} / item ${itemId}: 저장 실패`)
      }
    }

    return NextResponse.json({ success: true, saved, errors })
  } catch (error) {
    console.error("Readings save error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}
