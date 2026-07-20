import type { NeonQueryFunction } from "@neondatabase/serverless"
import {
  calcFactoryElec,
  calcElecAllocation,
  prevPeriod,
  type FactoryReadings,
  type FactoryElecResult,
  type ElecAllocation,
} from "./billing"

type Sql = NeonQueryFunction<false, false>

const METER_CODES: (keyof FactoryReadings)[] = ["MAIN", "F101", "F103", "HVAC"]

async function readingsFor(sql: Sql, period: string): Promise<FactoryReadings> {
  const rows = await sql`
    SELECT m.code, r.reading
    FROM meters m
    LEFT JOIN meter_readings r ON r.meter_id = m.id AND r.period = ${period}
  `
  const map: FactoryReadings = { MAIN: 0, F101: 0, F103: 0, HVAC: 0 }
  for (const row of rows) {
    const code = row.code as keyof FactoryReadings
    if (METER_CODES.includes(code)) map[code] = Number(row.reading ?? 0)
  }
  return map
}

export interface ElecContext {
  period: string
  unitPrice: number
  areaRatio: number
  elecTotal: number
  per10Billed: number | null
  pyeongSumArea: number
  readings: FactoryReadings
  prevReadings: FactoryReadings
  factory: FactoryElecResult
  allocation: ElecAllocation
}

// 전기 사용월(period)의 전기료 전체 그림: 공장동 검침 + 3단 배분.
export async function computeElecContext(sql: Sql, period: string): Promise<ElecContext> {
  const prev = prevPeriod(period)
  const [paramsRows, readings, prevReadings, areaRows] = await Promise.all([
    sql`SELECT elec_total, elec_unit_price, area_ratio, per10_billed FROM billing_periods WHERE period = ${period}`,
    readingsFor(sql, period),
    readingsFor(sql, prev),
    sql`
      SELECT COALESCE(SUM(pyeong_billed), 0)::numeric AS s
      FROM contracts WHERE status = 'active' AND elec_method = 'area'
    `,
  ])
  const p = paramsRows[0] ?? {}
  const unitPrice = Number(p.elec_unit_price ?? 102)
  const areaRatio = Number(p.area_ratio ?? 0.7)
  const elecTotal = Number(p.elec_total ?? 0)
  const per10Billed = p.per10_billed === null || p.per10_billed === undefined ? null : Number(p.per10_billed)
  const pyeongSumArea = Number(areaRows[0].s)

  const factory = calcFactoryElec(readings, prevReadings, unitPrice)
  const allocation = calcElecAllocation(
    { elec_total: elecTotal, area_ratio: areaRatio, per10_billed: per10Billed ?? undefined },
    pyeongSumArea,
    factory.totalA,
  )
  return { period, unitPrice, areaRatio, elecTotal, per10Billed, pyeongSumArea, readings, prevReadings, factory, allocation }
}

// 공장동 metered 계약의 호실별 전기 청구액 매핑 (room_code → amount)
export function factoryChargeByRoom(factory: FactoryElecResult): Record<string, number> {
  return { F101: factory.F101, F102: factory.F102, F103: factory.F103 }
}
