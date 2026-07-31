import { describe, it, expect } from "vitest"
import {
  calcContractCharge,
  calcAreaElec,
  calcFactoryElec,
  calcElecAllocation,
  calcBill,
  type BillContractInput,
  type FactoryReadings,
} from "@/lib/billing"
import fixtures from "./fixtures/billing-excel-parity.json"

// ============================================================================
// 엑셀 원본("창업보육센터 임대료 정산 내역 면적별 2605") 전 행 → 엔진 전수 대조.
// fixture는 엑셀 캐시값을 기계 추출한 것으로, 수식 재계산 없이 실제 청구된 값 그대로다.
//
// 엑셀 쪽 수동 처리 행(엔진 대상 아님):
//  - 2605 r10  F102 윤홍섭 교수: 임대료 수동 0 처리(전기료만 청구)
//  - 2605 r32  에코앤라이프 소계 행(301호 반복)
//  - 2501 r9/10 HEM: 임대료 열 자체가 비어 있음(별도 청구)
//  - 2501 r26~28 헤세드바이오: 3실 일괄 2,000,000원 수동 청구
//  - 공실(202·306): 청구 대상 아님
// ============================================================================

interface Row {
  row: number
  tenant: string | null
  room: string
  pyeong_billed: number | null
  rent_unit: number | null
  mgmt: number | null
  rent_a: number | null
  gross_q: number | null
  supply_r: number | null
  vat_s: number | null
  total_t: number | null
  elec_w: number | null
  sum_y: number | null
}

const f = fixtures as unknown as {
  "2605": { rows: Row[]; params: Record<string, number> }
  "2501": { rows: Row[]; params: Record<string, number> }
  factory_2604: Record<string, number>
  invoices_2606: { per10_billed: number }
}

const MANUAL_2605 = new Set([10, 32])
const MANUAL_2501 = new Set([9, 10, 26, 27, 28])
const isFactory = (room: string) => /^F\d/.test(room)

// ---------- 1) 임대료·관리비·부가세: 정상 행 전수 ----------

describe("2605 시트 — 임대료/부가세 전수 대조", () => {
  const rows = f["2605"].rows.filter(
    (r) => !MANUAL_2605.has(r.row) && r.gross_q != null && r.total_t === r.gross_q,
  )
  it("검증 대상 행 수 (공실 포함 27행)", () => {
    expect(rows.length).toBe(27)
  })
  it.each(rows.map((r) => [r.row, r.room, r] as const))("r%i %s", (_row, _room, r) => {
    const c = calcContractCharge({
      pyeong_billed: r.pyeong_billed!,
      rent_unit_price: r.rent_unit!,
      mgmt_fee: r.mgmt!,
    })
    if (r.rent_a != null) expect(c.rent).toBe(r.rent_a) // 임대료(a)
    expect(c.gross).toBe(r.gross_q) // 확인(a+b)
    if (r.supply_r != null) expect(c.supply).toBe(r.supply_r) // 공급가액
    expect(c.supply + c.vat).toBe(r.total_t) // 계(c+d) = 부가세 포함 총액
  })
})

describe("2501 시트 — 임대료/부가세 전수 대조 (단가 20,000 시절)", () => {
  const rows = f["2501"].rows.filter(
    (r) => !MANUAL_2501.has(r.row) && r.gross_q != null && r.total_t === r.gross_q,
  )
  it("검증 대상 행 수", () => {
    expect(rows.length).toBe(24)
  })
  it.each(rows.map((r) => [r.row, r.room, r] as const))("r%i %s", (_row, _room, r) => {
    const c = calcContractCharge({
      pyeong_billed: r.pyeong_billed!,
      rent_unit_price: r.rent_unit!,
      mgmt_fee: r.mgmt!,
    })
    if (r.rent_a != null) expect(c.rent).toBe(r.rent_a)
    expect(c.gross).toBe(r.gross_q)
    if (r.supply_r != null) expect(c.supply).toBe(r.supply_r)
    expect(c.supply + c.vat).toBe(r.total_t)
  })
})

// ---------- 2) 면적별 전기료: 사무실 전 행 ----------

describe("면적별 전기료 전수 대조", () => {
  const rows2605 = f["2605"].rows.filter(
    (r) => !isFactory(r.room) && !MANUAL_2605.has(r.row) && r.elec_w != null,
  )
  it.each(rows2605.map((r) => [r.row, r.room, r] as const))(
    "2605 r%i %s (10평당 19,560)",
    (_row, _room, r) => {
      expect(calcAreaElec(f["2605"].params.per10_billed, r.pyeong_billed!)).toBe(r.elec_w)
    },
  )

  const rows2501 = f["2501"].rows.filter(
    (r) => !isFactory(r.room) && !MANUAL_2501.has(r.row) && r.elec_w != null,
  )
  it.each(rows2501.map((r) => [r.row, r.room, r] as const))(
    "2501 r%i %s (10평당 25,000)",
    (_row, _room, r) => {
      expect(calcAreaElec(f["2501"].params.per10_billed, r.pyeong_billed!)).toBe(r.elec_w)
    },
  )
})

// ---------- 3) 공장동 검침: 실제 계량기 지침 → 청구액 ----------

describe("공장동 검침 전기료 (2026-04 실제 지침)", () => {
  const fx = f.factory_2604
  const curr: FactoryReadings = { MAIN: fx.main_curr, F101: fx.f101_curr, F103: fx.f103_curr, HVAC: fx.hvac_curr }
  const prev: FactoryReadings = { MAIN: fx.main_prev, F101: fx.f101_prev, F103: fx.f103_prev, HVAC: fx.hvac_prev }
  const r = calcFactoryElec(curr, prev, fx.unit_price)

  it("사용량 = 당월 지침 − 전월 지침", () => {
    expect(r.usages.MAIN).toBe(fx.main_usage) // 2,261
    expect(r.usages.F101).toBe(fx.f101_usage_raw) // 435
    expect(r.usages.F103).toBeCloseTo(fx.f103_usage_raw, 6) // 52.8
    expect(r.usages.HVAC / 2).toBeCloseTo(fx.hvac_half, 6) // 45
  })
  it("F101/F102/F103 청구액 — 엑셀 공장동 시트와 동일", () => {
    expect(r.F101).toBe(fx.f101_bill) // 48,000
    expect(r.F102).toBe(fx.f102_bill) // 177,000
    expect(r.F103).toBe(fx.f103_bill) // 9,000
    expect(r.deduction).toBe(fx.deduction) // 53,550
    expect(r.totalA).toBe(f["2605"].params.factory_A) // 234,000
  })
  it("정산 시트의 실사용료 행(W열)과 동일", () => {
    const w = (row: number) => f["2605"].rows.find((x) => x.row === row)!.elec_w
    expect(r.F101).toBe(w(14)) // 포어텔 F101
    expect(r.F103).toBe(w(38)) // 리에이치 F103
    expect(r.F102).toBe(w(10)) // 윤홍섭 F102
  })
})

// ---------- 4) 전기료 3단 배분 ----------

describe("전기료 3단 배분 (2605 하단 블록)", () => {
  const p = f["2605"].params
  it("엑셀 유효 분모(31.1 = 311평) 기준 — B·C·제안단가 일치", () => {
    const a = calcElecAllocation(
      { elec_total: p.elec_total, area_ratio: 0.7, per10_billed: p.per10_billed },
      311,
      p.factory_A,
    )
    expect(a.areaShare).toBeCloseTo(p.area_share, 0) // 608,223
    expect(a.per10Calc).toBeCloseTo(p.per10_calc_excel, 2) // 19,557.01
    expect(a.per10Suggested).toBe(p.per10_billed) // 19,560
    expect(a.officeB).toBe(p.office_B) // 608,316
    expect(a.centerC).toBe(p.center_C) // 260,574
    expect(p.factory_A + a.officeB + a.centerC).toBe(p.elec_total) // A+B+C = 총액
  })
  it("한전 총액 < 공장동 부담이면 제안단가가 음수 — generate 라우트가 force와 무관하게 차단", () => {
    const a = calcElecAllocation({ elec_total: 100000, area_ratio: 0.7 }, 311, 234000)
    expect(a.per10Suggested).toBeLessThan(0)
    expect(a.per10Billed).toBeLessThan(0)
  })

  it("확정단가만 같으면 분모와 무관하게 개별 청구액은 동일", () => {
    // 분모(사무실 평형합)는 '제안 단가'와 센터부담 리포트에만 영향.
    // 실제 기업별 전기료 = per10_billed × 평형/10 뿐이므로 확정단가 19,560이면 전 행 일치.
    const withDbSum = calcElecAllocation(
      { elec_total: p.elec_total, area_ratio: 0.7, per10_billed: p.per10_billed },
      336, // 2605 시트 기준 실제 면적별 계약 평형 총합
      p.factory_A,
    )
    expect(withDbSum.per10Billed).toBe(19560)
    expect(calcAreaElec(withDbSum.per10Billed, 20)).toBe(39120)
  })
})

// ---------- 5) 기업 단위 청구서 합성 — 시트 Y열/청구서(xlsm) 최종 금액 ----------

interface TenantCase {
  name: string
  contracts: BillContractInput[]
  per10: number
  expected: { rentMgmt: number; elec: number; total: number }
}

function contractOf(r: Row, metered?: number): BillContractInput {
  return {
    id: r.row,
    room_code: r.room,
    pyeong_billed: r.pyeong_billed!,
    rent_unit_price: r.rent_unit!,
    mgmt_fee: r.mgmt!,
    elec_method: isFactory(r.room) ? "metered" : "area",
    metered_elec: metered,
  }
}

describe("기업 단위 최종 청구액 — 2605(5월분)", () => {
  const row = (n: number) => f["2605"].rows.find((x) => x.row === n)!
  const per10 = f["2605"].params.per10_billed

  const cases: TenantCase[] = [
    // 다중 호실: 포어텔 = 203(면적별) + F101(실사용 48,000) → Y15 = 1,167,120
    {
      name: "포어텔마이헬스 (203 + F101)",
      contracts: [contractOf(row(13)), contractOf(row(14), f.factory_2604.f101_bill)],
      per10,
      expected: { rentMgmt: 1080000, elec: 87120, total: 1167120 },
    },
    {
      name: "리에이치사이클즈 (F103)",
      contracts: [contractOf(row(38), f.factory_2604.f103_bill)],
      per10,
      expected: { rentMgmt: 615000, elec: 9000, total: 624000 },
    },
  ]
  // 단일 사무실 호실 기업 전부: Y = T + W 그대로 나와야 한다
  for (const r of f["2605"].rows) {
    if (MANUAL_2605.has(r.row) || isFactory(r.room)) continue
    if (r.tenant === "공실" || r.total_t == null || r.total_t !== r.gross_q || r.elec_w == null) continue
    if (r.row === 13) continue // 포어텔은 위 다중호실 케이스에서 검증
    cases.push({
      name: `${r.tenant} (${r.room})`,
      contracts: [contractOf(r)],
      per10,
      expected: { rentMgmt: r.total_t, elec: r.elec_w, total: r.sum_y! },
    })
  }

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_n, c) => {
    const bill = calcBill(c.contracts, c.per10, "5", "4")
    expect(bill.rent_total + bill.mgmt_total).toBe(c.expected.rentMgmt)
    expect(bill.elec_amount).toBe(c.expected.elec)
    expect(bill.total_amount).toBe(c.expected.total)
    expect(bill.supply_amount + bill.vat_amount).toBe(c.expected.rentMgmt) // 공급가+부가세=임대료·관리비 총액
  })
})

describe("기업 단위 최종 청구액 — 2606 청구서(xlsm) 실제 발행분", () => {
  const per10 = f.invoices_2606.per10_billed // 28,300 (5월 사용분 확정단가)

  it("포어텔마이헬스: 1,080,000 + (56,600 + 33,000) = 1,169,600", () => {
    const bill = calcBill(
      [
        { id: 1, room_code: "203", pyeong_billed: 20, rent_unit_price: 21000, mgmt_fee: 15000, elec_method: "area" },
        { id: 2, room_code: "F101", pyeong_billed: 30, rent_unit_price: 21000, mgmt_fee: 15000, elec_method: "metered", metered_elec: 33000 },
      ],
      per10, "6", "5",
    )
    expect(bill.rent_total + bill.mgmt_total).toBe(1080000)
    expect(bill.elec_amount).toBe(89600)
    expect(bill.total_amount).toBe(1169600)
  })

  it("에이치이엠파마: 1,030,000 + (195,000 + 28,300) = 1,253,300", () => {
    const bill = calcBill(
      [
        { id: 1, room_code: "102", pyeong_billed: 10, rent_unit_price: 20000, mgmt_fee: 15000, elec_method: "area" },
        { id: 2, room_code: "F102", pyeong_billed: 40, rent_unit_price: 20000, mgmt_fee: 15000, elec_method: "metered", metered_elec: 195000 },
      ],
      per10, "6", "5",
    )
    expect(bill.rent_total + bill.mgmt_total).toBe(1030000)
    expect(bill.elec_amount).toBe(223300)
    expect(bill.total_amount).toBe(1253300)
  })

  it("리에이치사이클즈: 615,000 + 20,000 = 635,000", () => {
    const bill = calcBill(
      [{ id: 1, room_code: "F103", pyeong_billed: 30, rent_unit_price: 20000, mgmt_fee: 15000, elec_method: "metered", metered_elec: 20000 }],
      per10, "6", "5",
    )
    expect(bill.total_amount).toBe(635000)
  })

  it("포세나 (3/1 신규입주, 첫 청구 전기료 제외): 225,000", () => {
    const bill = calcBill(
      [{ id: 1, room_code: "410", pyeong_billed: 10, rent_unit_price: 21000, mgmt_fee: 15000, elec_method: "area", skip_elec: true }],
      per10, "6", "5",
    )
    expect(bill.rent_total + bill.mgmt_total).toBe(225000)
    expect(bill.elec_amount).toBe(0)
    expect(bill.total_amount).toBe(225000)
    expect(bill.lines.some((l) => l.line_type.startsWith("elec"))).toBe(false)
  })

  it("임대료 면제 계약 (윤홍섭 교수 F102 방식: 단가 0·관리비 0): 전기만 청구, 0원 라인 없음", () => {
    // 엑셀 2605 r10: F102 임대료 수동 0 처리, 전기(실사용) 177,000원만 청구
    const bill = calcBill(
      [{ id: 1, room_code: "F102", pyeong_billed: 40, rent_unit_price: 0, mgmt_fee: 0, elec_method: "metered", metered_elec: 177000 }],
      19560, "5", "4",
    )
    expect(bill.rent_total).toBe(0)
    expect(bill.mgmt_total).toBe(0)
    expect(bill.elec_amount).toBe(177000)
    expect(bill.total_amount).toBe(177000) // 엑셀 Y10과 동일
    expect(bill.lines.map((l) => l.line_type)).toEqual(["elec_metered"]) // 0원 임대료·관리비 라인 미생성
  })
})

// ---------- 6) 부가세 표시 차이 문서화 ----------

describe("부가세 표기 차이 (금액 영향 없음)", () => {
  // 엑셀은 S열을 ROUND(R×0.1)로 계산한 뒤 ±1 수동 보정으로 T=Q를 맞춘다.
  // 엔진은 부가세 = 총액 − 공급가액으로 정의해 보정 없이 항상 T=Q.
  // → 최종 청구액(T)은 전 행 동일. S열 '표시'만 1원 차이 나는 행이 존재할 수 있다.
  it("2605에서 S열 표시가 엔진 부가세와 1원 다른 행 목록 (참고용)", () => {
    const diffs: string[] = []
    for (const r of f["2605"].rows) {
      if (MANUAL_2605.has(r.row) || r.gross_q == null || r.total_t !== r.gross_q || r.vat_s == null) continue
      const c = calcContractCharge({ pyeong_billed: r.pyeong_billed!, rent_unit_price: r.rent_unit!, mgmt_fee: r.mgmt! })
      if (c.vat !== r.vat_s) diffs.push(`r${r.row} ${r.room}: 엑셀 S=${r.vat_s} vs 엔진 vat=${c.vat}`)
      expect(c.supply + c.vat).toBe(r.total_t) // 총액은 항상 동일
    }
    // 차이는 ±1원뿐이어야 한다
    for (const d of diffs) {
      const m = d.match(/S=(\d+) vs 엔진 vat=(\d+)/)!
      expect(Math.abs(Number(m[1]) - Number(m[2]))).toBeLessThanOrEqual(1)
    }
  })
})
