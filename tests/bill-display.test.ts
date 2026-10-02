import { describe, expect, it } from "vitest"
import { appendBillMemo, billMonthOf, describeBillLine, usageMonthOf, type BillLineInput } from "@/lib/bill-display"

// 청구서 라인 설명은 저장된 값(NUMERIC 문자열, NULL 가능)으로만 만든다.

describe("describeBillLine", () => {
  it("면적 배분 전기료: 132,550원 × 8.4 ÷ 10 = 111,342원", () => {
    const line: BillLineInput = { contract_id: 1, room_code: "204", line_type: "elec_area", label: "9월 전기사용료 (204, 면적별)", quantity: "8.40", unit_price: "132550.00", amount: "111342" }
    const d = describeBillLine(line, [line])
    expect(d.description).toBe("면적 배분 · 10평당 132,550원 기준 8.4평")
    expect(d.formula).toBe("공용 전기료를 면적으로 나눴어요: 132,550원 × 8.4 ÷ 10 = 111,342원")
    expect(d.label).toBe("9월 전기사용료 (204, 면적별)")
  })

  it("임대료: 평 × 평당 단가, 금액이 다르면 일할 표시", () => {
    const full: BillLineInput = { contract_id: 1, room_code: "204", line_type: "rent", label: "10월 임대료 (204)", quantity: "8.40", unit_price: "21000.00", amount: "176400" }
    expect(describeBillLine(full).description).toBe("8.4평 × 평당 21,000원")
    expect(describeBillLine(full).prorated).toBe(false)
    const part: BillLineInput = { ...full, amount: "96774" }
    expect(describeBillLine(part).description).toBe("8.4평 × 평당 21,000원 · 사용한 날만큼 일할 계산")
    expect(describeBillLine(part).prorated).toBe(true)
  })

  it("일할 달의 관리비는 '월 정액'이 아니라 날짜만큼(일할)", () => {
    const rent: BillLineInput = { contract_id: 7, room_code: "305", line_type: "rent", label: "10월 임대료 (305)", quantity: "10.0", unit_price: "21000", amount: "115161" }
    const mgmt: BillLineInput = { contract_id: 7, room_code: "305", line_type: "mgmt", label: "10월 관리비 (305)", quantity: null, unit_price: null, amount: "8226" }
    const otherRent: BillLineInput = { contract_id: 8, room_code: "306", line_type: "rent", label: "10월 임대료 (306)", quantity: "10.0", unit_price: "21000", amount: "210000" }
    const otherMgmt: BillLineInput = { contract_id: 8, room_code: "306", line_type: "mgmt", label: "10월 관리비 (306)", quantity: null, unit_price: null, amount: "15000" }
    const lines = [rent, mgmt, otherRent, otherMgmt]
    expect(describeBillLine(mgmt, lines)).toMatchObject({ description: "날짜만큼(일할)", prorated: true })
    expect(describeBillLine(otherMgmt, lines)).toMatchObject({ description: "월 정액", prorated: false })
  })

  it("수량·단가가 NULL(과거 이관 청구서)이면 라벨만", () => {
    const rent: BillLineInput = { contract_id: null, room_code: null, line_type: "rent", label: "5월 임대료", quantity: null, unit_price: null, amount: "300000" }
    expect(describeBillLine(rent)).toMatchObject({ label: "5월 임대료", description: null, formula: null, prorated: false })
    const elec: BillLineInput = { line_type: "elec_area", label: null, quantity: null, unit_price: null, amount: "5000" }
    expect(describeBillLine(elec)).toMatchObject({ label: "전기료", description: "면적 배분", formula: null })
    const mgmt: BillLineInput = { contract_id: null, room_code: null, line_type: "mgmt", label: "관리비", amount: "15000" }
    expect(describeBillLine(mgmt, [rent, mgmt]).description).toBe("월 정액")
  })

  it("계량기 전기료·조정", () => {
    expect(describeBillLine({ line_type: "elec_metered", label: "9월 전기사용료 (F101, 실사용)", amount: "120000" }).description).toBe("계량기 사용량 기준")
    expect(describeBillLine({ line_type: "manual", label: "8월 오입금 차감", amount: "-5000" })).toMatchObject({ label: "8월 오입금 차감", description: "조정" })
  })
})

describe("월 변환", () => {
  it("청구월 ↔ 사용월", () => {
    expect(usageMonthOf("2026-10")).toBe("2026-09")
    expect(usageMonthOf("2026-01")).toBe("2025-12")
    expect(billMonthOf("2026-12")).toBe("2027-01")
  })
})

describe("appendBillMemo", () => {
  it("기존 메모 뒤에 한 줄을 덧붙인다(통째 교체 PUT에서 기존 메모가 사라지지 않게)", () => {
    expect(appendBillMemo("입금자 솔바람", "10월 2일 납부 확인")).toBe("입금자 솔바람\n10월 2일 납부 확인")
    expect(appendBillMemo("첫 줄\n", "둘째 줄")).toBe("첫 줄\n둘째 줄")
    expect(appendBillMemo(null, "정정 사유: 전기료 재계산")).toBe("정정 사유: 전기료 재계산")
    expect(appendBillMemo("", "새 줄")).toBe("새 줄")
    expect(appendBillMemo("기존", "  ")).toBe("기존")
    expect(appendBillMemo(undefined, null)).toBe("")
  })
})
