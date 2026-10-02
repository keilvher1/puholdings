// 기준 정보 > 단가·기본값 요약 데이터(서버 전용, 읽기만). 진행 중 계약을 단가별로 세고, 전기료를 확정한(10평당 전기료가 있는)
// 가장 최근 정산 월의 kWh 단가·면적 배분율을 읽는다(2단계를 임시 저장만 한 달의 기본값 102원이 "최근 적용"으로 보이지 않게). 저장소(billing_settings)가 없으므로 "규칙"은 화면 문장이고 숫자는 계약·정산 월에서 센다(계획서 4.3.9, 5장).
//
// 사용 예(page.tsx):
//   const rates = await loadRatesSummary(getDb()!)        // 실패하면 예외 → 화면은 오류 상태
//   <RatesTab rates={rates} … />

import type { NeonQueryFunction } from "@neondatabase/serverless"

type Sql = NeonQueryFunction<false, false>

export interface RateGroup {
  /** 원 단위 정수 */
  value: number
  count: number
  /** 이 단가를 쓰는 계약이 모두 공장동이면 "공장동"(문구 "15,000원(공장동)") */
  building: string | null
}

export interface RatesSummary {
  activeCount: number
  rent: RateGroup[]
  mgmt: RateGroup[]
  /** 전기료를 확정한 가장 최근 정산 월(전기 사용월) 값. 없으면 null */
  latestPeriod: {
    usageMonth: string
    kwhUnitPrice: number | null
    areaRatio: number | null
    per10Billed: number | null
  } | null
}

interface CountRow {
  rent: string
  mgmt: string
  building: string
  n: number | string
}

/** 계약 행(단가·관리비·건물·건수) → 단가별 묶음. 건수 많은 순, 같으면 단가 높은 순 */
export function groupRates(rows: CountRow[], key: "rent" | "mgmt"): RateGroup[] {
  const map = new Map<number, { count: number; buildings: Set<string> }>()
  for (const r of rows) {
    const v = Math.round(Number(r[key]))
    if (!Number.isFinite(v)) continue
    const g = map.get(v) ?? { count: 0, buildings: new Set<string>() }
    g.count += Number(r.n)
    g.buildings.add(r.building)
    map.set(v, g)
  }
  return [...map.entries()]
    .map(([value, g]) => ({ value, count: g.count, building: g.buildings.size === 1 && g.buildings.has("공장동") ? "공장동" : null }))
    .sort((a, b) => b.count - a.count || b.value - a.value)
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function loadRatesSummary(sql: Sql): Promise<RatesSummary> {
  const [rows, periods] = await Promise.all([
    sql`
      SELECT c.rent_unit_price::text AS rent, c.mgmt_fee::text AS mgmt, r.building, COUNT(*)::int AS n
      FROM contracts c
      JOIN rooms r ON r.id = c.room_id
      WHERE c.status = 'active'
      GROUP BY 1, 2, 3
    `,
    sql`
      SELECT period, elec_unit_price::text AS elec_unit_price, area_ratio::text AS area_ratio, per10_billed::text AS per10_billed
      FROM billing_periods
      WHERE per10_billed IS NOT NULL
      ORDER BY period DESC
      LIMIT 1
    `,
  ])
  const counts = rows as unknown as CountRow[]
  const p = periods[0]
  return {
    activeCount: counts.reduce((s, r) => s + Number(r.n), 0),
    rent: groupRates(counts, "rent"),
    mgmt: groupRates(counts, "mgmt"),
    latestPeriod: p
      ? {
          usageMonth: String(p.period).trim(),
          kwhUnitPrice: toNum(p.elec_unit_price),
          areaRatio: toNum(p.area_ratio),
          per10Billed: toNum(p.per10_billed),
        }
      : null,
  }
}
