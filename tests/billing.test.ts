import { describe, it, expect } from "vitest"
import {
  calcContractCharge,
  calcAreaElec,
  calcFactoryElec,
  calcElecAllocation,
  prorate,
  decideBillRegen,
  type FactoryReadings,
} from "@/lib/billing"

// 2026년 5월 실측값 기준 — 실제 엑셀 정산표에서 역공학한 값이 그대로 나와야 한다.

describe("calcContractCharge — 임대료·부가세 분리", () => {
  it("갱신 17평 (단가 21,000 / 관리비 15,000)", () => {
    const c = calcContractCharge({ pyeong_billed: 17, rent_unit_price: 21000, mgmt_fee: 15000 })
    expect(c.rent).toBe(357000)
    expect(c.gross).toBe(372000)
    expect(c.supply).toBe(338182)
    expect(c.vat).toBe(33818)
    expect(c.supply + c.vat).toBe(372000) // 불변식
  })

  it("비갱신 10평 (단가 20,000 / 관리비 15,000)", () => {
    const c = calcContractCharge({ pyeong_billed: 10, rent_unit_price: 20000, mgmt_fee: 15000 })
    expect(c.gross).toBe(215000)
    expect(c.supply).toBe(195455)
    expect(c.vat).toBe(19545)
    expect(c.supply + c.vat).toBe(215000)
  })
})

describe("calcAreaElec — 면적별 전기료 (per10_billed=19,560)", () => {
  it.each([
    [17, 33252],
    [10, 19560],
    [13, 25428],
    [20, 39120],
  ])("%i평 → %i원", (pyeong, expected) => {
    expect(calcAreaElec(19560, pyeong)).toBe(expected)
  })
})

describe("calcFactoryElec — 공장동 검침 (단가 102)", () => {
  it("전체 2,261 / F101 435 / F103 52.8 / 냉난방 90", () => {
    const readings: FactoryReadings = { MAIN: 2261, F101: 435, F103: 52.8, HVAC: 90 }
    const prev: FactoryReadings = { MAIN: 0, F101: 0, F103: 0, HVAC: 0 }
    const r = calcFactoryElec(readings, prev, 102)
    expect(r.F101).toBe(48000) // ROUNDDOWN(102×480, -3)
    expect(r.F103).toBe(9000) // ROUNDDOWN(102×97.8, -3)
    expect(r.F102).toBe(177000) // ROUNDDOWN(230,622 − 53,550, -3)
    expect(r.totalA).toBe(234000)
  })
})

describe("calcElecAllocation — 전기료 3단 배분", () => {
  it("총액 1,102,890 / A=234,000 / ratio 0.7 / 사무실 311평", () => {
    const a = calcElecAllocation({ elec_total: 1102890, area_ratio: 0.7 }, 311, 234000)
    expect(a.per10Calc).toBeCloseTo(19557.01, 2)
    expect(a.per10Suggested).toBe(19560)

    // 관리자가 19,560으로 확정한 경우
    const b = calcElecAllocation({ elec_total: 1102890, area_ratio: 0.7, per10_billed: 19560 }, 311, 234000)
    expect(b.officeB).toBe(608316)
    expect(b.centerC).toBe(260574)
    expect(234000 + b.officeB + b.centerC).toBe(1102890) // 검산
    expect(b.checkOk).toBe(true)
  })
})

describe("prorate — 일할 계산", () => {
  it("월액 415,000, 6월(30일) 중 15일", () => {
    expect(prorate(415000, 15, 30)).toBe(207500)
  })
})

// 2026-08 사고 회귀 방지 — 전기 파라미터를 발행 뒤에 입력했을 때, 재생성이 발행분을 건너뛰어
// 전기료 0원 청구서가 영구히 고정된 사건. 복구 경로(regenerate_issued)와 그 안전장치를 고정한다.
describe("decideBillRegen — 청구서 재생성 정책", () => {
  it("기존 청구서가 없으면 새로 만든다", () => {
    expect(decideBillRegen(undefined, false)).toEqual({ action: "create" })
    expect(decideBillRegen(undefined, true)).toEqual({ action: "create" })
  })

  it("초안은 항상 재생성하고, paid로는 절대 번지지 않는다", () => {
    for (const flag of [false, true]) {
      const d = decideBillRegen({ status: "draft", is_manual: false }, flag)
      expect(d).toEqual({ action: "regenerate", allowedStatuses: ["draft"] })
    }
  })

  it("발행됨·연체는 기본 스킵이지만 재생성 가능(reissuable)으로 보고한다", () => {
    for (const status of ["issued", "overdue"]) {
      const d = decideBillRegen({ status, is_manual: false }, false)
      expect(d.action).toBe("skip")
      if (d.action === "skip") expect(d.reissuable).toBe(true)
    }
  })

  it("regenerate_issued=true면 발행됨·연체를 초안으로 되돌려 재생성한다", () => {
    for (const status of ["issued", "overdue"]) {
      const d = decideBillRegen({ status, is_manual: false }, true)
      expect(d).toEqual({ action: "regenerate", allowedStatuses: ["draft", "issued", "overdue"] })
      // 허용 목록에 paid가 새어 들어가면 납부 완료 건이 덮어써진다
      if (d.action === "regenerate") expect(d.allowedStatuses).not.toContain("paid")
    }
  })

  it("납부 완료는 강제 재생성으로도 건드리지 않는다", () => {
    const d = decideBillRegen({ status: "paid", is_manual: false }, true)
    expect(d.action).toBe("skip")
    if (d.action === "skip") expect(d.reissuable).toBe(false)
  })

  it("수기 청구서는 상태와 무관하게 자동 생성이 덮어쓰지 않는다", () => {
    for (const status of ["draft", "issued", "overdue", "paid"]) {
      const d = decideBillRegen({ status, is_manual: true }, true)
      expect(d.action).toBe("skip")
      if (d.action === "skip") expect(d.reissuable).toBe(false)
    }
  })

  it("알 수 없는 상태는 스킵한다", () => {
    const d = decideBillRegen({ status: "voided", is_manual: false }, true)
    expect(d.action).toBe("skip")
  })
})
