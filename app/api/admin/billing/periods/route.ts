import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidPeriod, isValidDateString } from "@/lib/billing"
import { computeElecContext } from "@/lib/billing-db"

// GET /api/admin/billing/periods?period=YYYY-MM — 파라미터 + 배분 검산(자동 재계산)
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const period = new URL(request.url).searchParams.get("period")
    if (!isValidPeriod(period)) return NextResponse.json({ success: false, error: "period(YYYY-MM)가 필요합니다" }, { status: 400 })
    const rows = await sql`SELECT *, due_date::text AS due_date FROM billing_periods WHERE period = ${period}`
    const ctx = await computeElecContext(sql, period)
    return NextResponse.json({
      success: true,
      period: rows[0] ?? { period, status: "open" },
      allocation: ctx.allocation,
      factory: ctx.factory,
      pyeong_sum_area: ctx.pyeongSumArea,
    })
  } catch (error) {
    console.error("Get period error:", error)
    return NextResponse.json({ success: false, error: "불러오지 못했습니다" }, { status: 500 })
  }
}

// POST /api/admin/billing/periods — { period, elec_total, elec_unit_price?, area_ratio?, per10_billed?, due_date? }
// 저장 후 per10_calc를 재계산해 응답.
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const b = await request.json()
    if (!isValidPeriod(b.period)) return NextResponse.json({ success: false, error: "period(YYYY-MM)가 필요합니다" }, { status: 400 })
    const elecTotal = Number(b.elec_total)
    const unitPrice = Number.isFinite(Number(b.elec_unit_price)) ? Number(b.elec_unit_price) : 102
    const areaRatio = Number.isFinite(Number(b.area_ratio)) ? Number(b.area_ratio) : 0.7
    const per10Billed = b.per10_billed === null || b.per10_billed === undefined || b.per10_billed === ""
      ? null : Math.round(Number(b.per10_billed))
    const dueDate = isValidDateString(b.due_date) ? b.due_date : null

    await sql`
      INSERT INTO billing_periods (period, elec_total, elec_unit_price, area_ratio, per10_billed, due_date, updated_at)
      VALUES (${b.period}, ${Number.isFinite(elecTotal) ? Math.round(elecTotal) : null}, ${unitPrice}, ${areaRatio}, ${per10Billed}, ${dueDate}, NOW())
      ON CONFLICT (period) DO UPDATE SET
        elec_total = EXCLUDED.elec_total, elec_unit_price = EXCLUDED.elec_unit_price,
        area_ratio = EXCLUDED.area_ratio, per10_billed = EXCLUDED.per10_billed,
        due_date = EXCLUDED.due_date, updated_at = NOW()
    `
    // 재계산 후 per10_calc 저장
    const ctx = await computeElecContext(sql, b.period)
    await sql`UPDATE billing_periods SET per10_calc = ${Math.round(ctx.allocation.per10Calc * 100) / 100} WHERE period = ${b.period}`

    return NextResponse.json({ success: true, allocation: ctx.allocation, factory: ctx.factory, pyeong_sum_area: ctx.pyeongSumArea })
  } catch (error) {
    console.error("Save period error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}
