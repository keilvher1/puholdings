import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidPeriod, prevPeriod } from "@/lib/billing"
import { computeElecContext } from "@/lib/billing-db"

// GET /api/admin/billing/meters?period=YYYY-MM — 계량기별 전월/당월 지침·사용량·청구액 미리보기
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const period = new URL(request.url).searchParams.get("period")
    if (!isValidPeriod(period)) return NextResponse.json({ success: false, error: "period(YYYY-MM)가 필요합니다" }, { status: 400 })
    const prev = prevPeriod(period)
    const meters = await sql`
      SELECT m.id, m.name, m.code, m.sort_order,
             cur.reading AS curr_reading, prv.reading AS prev_reading
      FROM meters m
      LEFT JOIN meter_readings cur ON cur.meter_id = m.id AND cur.period = ${period}
      LEFT JOIN meter_readings prv ON prv.meter_id = m.id AND prv.period = ${prev}
      ORDER BY m.sort_order
    `
    const ctx = await computeElecContext(sql, period)
    return NextResponse.json({
      success: true,
      period, prev_period: prev,
      meters: meters.map((m) => ({
        ...m,
        usage: m.curr_reading !== null && m.prev_reading !== null
          ? Number(m.curr_reading) - Number(m.prev_reading) : null,
      })),
      factory: ctx.factory,
      unit_price: ctx.unitPrice,
    })
  } catch (error) {
    console.error("Get meters error:", error)
    return NextResponse.json({ success: false, error: "불러오지 못했습니다" }, { status: 500 })
  }
}

// PUT /api/admin/billing/meters — { period, readings: [{ code, reading }] } 일괄 upsert
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const { period, readings } = await request.json()
    if (!isValidPeriod(period) || !Array.isArray(readings)) {
      return NextResponse.json({ success: false, error: "period와 readings가 필요합니다" }, { status: 400 })
    }
    const meters = await sql`SELECT id, code FROM meters`
    const idByCode = new Map(meters.map((m) => [m.code as string, m.id as number]))

    let saved = 0
    for (const r of readings) {
      const meterId = idByCode.get(String(r.code))
      const reading = Number(r.reading)
      if (!meterId || !Number.isFinite(reading) || reading < 0) continue
      await sql`
        INSERT INTO meter_readings (meter_id, period, reading)
        VALUES (${meterId}, ${period}, ${reading})
        ON CONFLICT (meter_id, period) DO UPDATE SET reading = EXCLUDED.reading
      `
      saved++
    }
    const ctx = await computeElecContext(sql, period)
    return NextResponse.json({ success: true, saved, factory: ctx.factory })
  } catch (error) {
    console.error("Save meters error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}
