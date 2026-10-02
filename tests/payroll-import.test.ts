import { describe, expect, it } from "vitest"
import {
  planPayrollImport,
  shiftDateOneMonth,
  shiftPurposeMonth,
  type PayrollSourceReceipt,
} from "@/components/admin/expenses/upload-model"

// 인건비 등록 — [지난달 내역 불러오기](계획서 4.2.4 P-1). 저장하지 않고 행만 만든다.

function pay(over: Partial<PayrollSourceReceipt>): PayrollSourceReceipt {
  return {
    project_id: 1,
    doc_type: "payroll",
    issue_date: "2026-08-25",
    vendor_name: "연구원 김나래",
    total_amount: 3_850_000,
    payroll_month: "2026-08",
    payment_method: "transfer",
    budget_item: "인건비",
    purpose: "2026년 8월 급여 (참여율 50%)",
    ...over,
  }
}

const AUG = [
  pay({}),
  pay({ vendor_name: "연구원 박지운", total_amount: 3_420_000 }),
  pay({ project_id: 2, vendor_name: "센터 매니저 이소담", total_amount: 2_900_000 }),
  pay({ doc_type: "receipt", vendor_name: "윤슬카페", total_amount: 54_000 }),
]

const SEP = AUG.map((r) => ({ ...r, issue_date: "2026-09-25", payroll_month: "2026-09", purpose: r.purpose.replace("8월", "9월") }))

describe("planPayrollImport", () => {
  it("가장 최근 귀속월(8월) 2명을 9월 귀속·9월 25일로, 적요의 달도 바꾼다", () => {
    const plan = planPayrollImport(AUG, 1, "2026-09-30")
    expect(plan.sourceMonth).toBe("2026-08")
    expect(plan.targetMonth).toBe("2026-09")
    expect(plan.blocked).toBeNull()
    expect(plan.rows.map((r) => r.vendor_name)).toEqual(["연구원 김나래", "연구원 박지운"])
    for (const r of plan.rows) {
      expect(r.issue_date).toBe("2026-09-25")
      expect(r.payroll_month).toBe("2026-09")
      expect(r.purpose).toBe("2026년 9월 급여 (참여율 50%)")
      expect(r.payment_method).toBe("transfer")
      expect(r.existing).toBe(false)
      expect(r.missing).toBe(false)
      expect(r.include).toBe(true)
    }
    expect(plan.rows.map((r) => r.amount)).toEqual([3_850_000, 3_420_000])
  })

  it("8월·9월이 다 있으면 9월을 근거로 10월(이번 달)을 만든다", () => {
    const plan = planPayrollImport([...AUG, ...SEP], 1, "2026-10-02")
    expect(plan.sourceMonth).toBe("2026-09")
    expect(plan.targetMonth).toBe("2026-10")
    expect(plan.rows.map((r) => [r.vendor_name, r.issue_date, r.payroll_month])).toEqual([
      ["연구원 김나래", "2026-10-25", "2026-10"],
      ["연구원 박지운", "2026-10-25", "2026-10"],
    ])
  })

  it("이번 달을 등록하다 만 경우: 이미 있는 대상자는 existing, 지난달에만 있던 사람은 missing — 둘 다 기본 제외", () => {
    // 9월(이번 달)분을 김나래만 등록(지급일 9월 26일)하고 박지운은 아직 없음
    const rows = [...AUG, pay({ vendor_name: "연구원  김나래 ", issue_date: "2026-09-26", payroll_month: "2026-09", purpose: "2026년 9월 급여" })]
    const plan = planPayrollImport(rows, 1, "2026-09-30")
    expect(plan.mode).toBe("fill")
    expect(plan.blocked).toBe("this_month")
    expect(plan.sourceMonth).toBe("2026-08")
    expect(plan.targetMonth).toBe("2026-09")
    const kim = plan.rows.find((r) => r.vendor_name === "연구원 김나래")
    const park = plan.rows.find((r) => r.vendor_name === "연구원 박지운")
    expect(kim).toMatchObject({ existing: true, missing: false, include: false })
    expect(park).toMatchObject({ existing: false, missing: true, include: false, issue_date: "2026-09-25", payroll_month: "2026-09" })
    // 기본으로 넣는 행이 하나도 없다
    expect(plan.rows.filter((r) => r.include)).toEqual([])
  })

  it("인원이 바뀐 다음 달(퇴사): 8월 A·B·C, 9월 A·B → 10월에 A·B만, 퇴사자 C를 지난 달로 채우지 않는다", () => {
    const a = (m: string, d: string, name: string) => pay({ vendor_name: name, payroll_month: m, issue_date: d, purpose: `${m} 인건비` })
    const data = [
      a("2026-08", "2026-08-25", "A"),
      a("2026-08", "2026-08-25", "B"),
      a("2026-08", "2026-08-25", "C"),
      a("2026-09", "2026-09-25", "A"),
      a("2026-09", "2026-09-25", "B"),
    ]
    const plan = planPayrollImport(data, 1, "2026-10-02")
    expect(plan.mode).toBe("next")
    expect(plan.sourceMonth).toBe("2026-09")
    expect(plan.targetMonth).toBe("2026-10")
    expect(plan.rows.map((r) => [r.vendor_name, r.payroll_month, r.issue_date, r.include])).toEqual([
      ["A", "2026-10", "2026-10-25", true],
      ["B", "2026-10", "2026-10-25", true],
    ])
    expect(plan.rows.some((r) => r.vendor_name === "C")).toBe(false)
  })

  it("인원이 바뀐 다음 달(교체): 8월 A·B, 9월 A·D → 10월에 A·D, 교체 전 B를 9월로 채우지 않는다", () => {
    const data = [
      pay({ vendor_name: "A" }),
      pay({ vendor_name: "B" }),
      pay({ vendor_name: "A", payroll_month: "2026-09", issue_date: "2026-09-25" }),
      pay({ vendor_name: "D", payroll_month: "2026-09", issue_date: "2026-09-25" }),
    ]
    const plan = planPayrollImport(data, 1, "2026-10-02")
    expect(plan.targetMonth).toBe("2026-10")
    expect(plan.rows.map((r) => r.vendor_name)).toEqual(["A", "D"])
    expect(plan.rows.every((r) => r.include && !r.existing && !r.missing)).toBe(true)
    // 같은 자료로 이번 달이 9월이면: 다음 달은 만들지 않고, 교체 전 B는 골라 넣을 후보(기본 제외)로만 나온다
    const sep = planPayrollImport(data, 1, "2026-09-28")
    expect(sep.blocked).toBe("this_month")
    expect(sep.mode).toBe("fill")
    expect(sep.rows.filter((r) => r.include)).toEqual([])
    expect(sep.rows.find((r) => r.vendor_name === "B")).toMatchObject({ missing: true, include: false })
  })

  it("이번 달 이후 귀속월은 만들지 않는다(가장 최근 귀속월이 이번 달이면 blocked)", () => {
    const plan = planPayrollImport([...AUG, ...SEP], 1, "2026-09-30")
    expect(plan.blocked).toBe("this_month")
    expect(plan.mode).toBeNull()
    expect(plan.targetMonth).toBeNull()
    expect(plan.rows).toEqual([])
    // 미래 귀속월 기록은 근거로 쓰지 않는다
    const future = planPayrollImport([...AUG, pay({ payroll_month: "2026-11", issue_date: "2026-11-25" })], 1, "2026-09-10")
    expect(future.sourceMonth).toBe("2026-08")
    expect(future.targetMonth).toBe("2026-09")
    // 대상 달은 언제나 이번 달 이하
    for (const today of ["2026-08-01", "2026-09-01", "2026-09-30", "2026-12-31"]) {
      for (const data of [AUG, [...AUG, ...SEP]]) {
        const p = planPayrollImport(data, 1, today)
        if (p.targetMonth) expect(p.targetMonth <= today.slice(0, 7)).toBe(true)
        // 다음 달을 만들 수 없을 때는 기본으로 넣는 행이 없다(골라 넣을 후보만)
        if (p.blocked) expect(p.rows.filter((r) => r.include)).toEqual([])
      }
    }
  })

  it("인건비가 없거나 다른 프로젝트·다른 문서 종류뿐이면 비어 있다(버튼을 보이지 않는다)", () => {
    expect(planPayrollImport([], 1, "2026-10-02")).toEqual({ sourceMonth: null, targetMonth: null, blocked: null, mode: null, rows: [] })
    expect(planPayrollImport(AUG, 9, "2026-10-02").rows).toEqual([])
    expect(planPayrollImport([pay({ doc_type: "receipt" })], 1, "2026-10-02").sourceMonth).toBeNull()
  })

  it("귀속월이 비어 있으면 지급일의 달을 귀속월로 본다", () => {
    const plan = planPayrollImport([pay({ payroll_month: "" })], 1, "2026-10-02")
    expect(plan.sourceMonth).toBe("2026-08")
    expect(plan.rows[0].payroll_month).toBe("2026-09")
  })
})

describe("날짜·적요 옮기기", () => {
  it("한 달 뒤 같은 날, 말일 넘침은 그 달 말일", () => {
    expect(shiftDateOneMonth("2026-08-25")).toBe("2026-09-25")
    expect(shiftDateOneMonth("2026-01-31")).toBe("2026-02-28")
    expect(shiftDateOneMonth("2026-12-10")).toBe("2027-01-10")
    expect(shiftDateOneMonth("")).toBe("")
  })
  it("적요의 'YYYY년 M월'·'YYYY년 0M월'·'YYYY-MM'만 바꾼다", () => {
    expect(shiftPurposeMonth("2026년 8월 급여 (참여율 50%)", "2026-08", "2026-09")).toBe("2026년 9월 급여 (참여율 50%)")
    expect(shiftPurposeMonth("2026년 08월 급여", "2026-08", "2026-09")).toBe("2026년 9월 급여")
    expect(shiftPurposeMonth("2026-08 인건비", "2026-08", "2026-09")).toBe("2026-09 인건비")
    expect(shiftPurposeMonth("2026-12 인건비 · 2026년 12월", "2026-12", "2027-01")).toBe("2027-01 인건비 · 2027년 1월")
    expect(shiftPurposeMonth("8월 회의", "2026-08", "2026-09")).toBe("8월 회의")
  })
})
