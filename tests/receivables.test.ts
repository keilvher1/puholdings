import { describe, expect, it } from "vitest"
import { isLate, RECEIVABLE_SQL, receivableState, type ReceivableInput } from "@/lib/receivables"

// 받을 돈 판정: 기한 지남은 DB 상태가 아니라 날짜로, 기한이 없으면 "기한 없음 · 발행 후 n일".
// 운영형(기한 NULL·overdue 0)과 랩형(7·8월 연체 4건) 픽스처로 같은 규칙을 확인한다.

const TODAY = "2026-10-01"

function summarize(bills: (ReceivableInput & { total: number })[], today = TODAY) {
  let count = 0
  let total = 0
  let late = 0
  let lateTotal = 0
  for (const b of bills) {
    const st = receivableState(b, today)
    if (st.kind !== "receivable") continue
    count++
    total += b.total
    if (isLate(st)) {
      late++
      lateTotal += b.total
    }
  }
  return { count, total, late, lateTotal }
}

describe("receivableState 기본 규칙", () => {
  it("미수 = issued·overdue, 정정 중 = draft + issued_at, 나머지는 none", () => {
    expect(receivableState({ status: "issued", due_date: "2026-10-10", issued_at: "2026-10-01T00:00:00Z" }, TODAY)).toEqual({ kind: "receivable", bucket: "not_due", days: 9 })
    expect(receivableState({ status: "draft", due_date: null, issued_at: "2026-08-01T00:00:00Z" }, TODAY)).toEqual({ kind: "correcting", bucket: null, days: null })
    expect(receivableState({ status: "draft", due_date: null, issued_at: null }, TODAY).kind).toBe("none")
    expect(receivableState({ status: "paid", due_date: "2026-08-10", issued_at: "2026-08-01T00:00:00Z" }, TODAY).kind).toBe("none")
  })
  it("기한 당일은 기한 전(0일), 하루 지나면 d1_30", () => {
    expect(receivableState({ status: "issued", due_date: TODAY, issued_at: null }, TODAY)).toEqual({ kind: "receivable", bucket: "not_due", days: 0 })
    expect(receivableState({ status: "issued", due_date: "2026-09-30", issued_at: null }, TODAY)).toEqual({ kind: "receivable", bucket: "d1_30", days: 1 })
  })
  it("구간 경계 30·31·60·61일", () => {
    const at = (d: string) => receivableState({ status: "issued", due_date: d, issued_at: null }, TODAY)
    expect(at("2026-09-01").bucket).toBe("d1_30") // 30일
    expect(at("2026-08-31").bucket).toBe("d31_60") // 31일
    expect(at("2026-08-02").bucket).toBe("d31_60") // 60일
    expect(at("2026-08-01").bucket).toBe("d60_plus") // 61일
  })
  it("DB overdue는 기한 날짜와 상관없이 기한 지남", () => {
    const st = receivableState({ status: "overdue", due_date: null, issued_at: "2026-09-21T00:00:00Z" }, TODAY)
    expect(st.kind).toBe("receivable")
    expect(isLate(st)).toBe(true)
  })
  it("기한 없음은 '기한 전'에 넣지 않고 발행 후 일수로, 31일부터 늦음", () => {
    const d30 = receivableState({ status: "issued", due_date: null, issued_at: "2026-09-01T00:00:00Z" }, TODAY)
    expect(d30).toEqual({ kind: "receivable", bucket: "no_due", days: 30 })
    expect(isLate(d30)).toBe(false)
    const d31 = receivableState({ status: "issued", due_date: null, issued_at: "2026-08-31T00:00:00Z" }, TODAY)
    expect(d31.days).toBe(31)
    expect(isLate(d31)).toBe(true)
  })
})

describe("운영형 픽스처(기한 NULL 전부·overdue 0·3개월 전 발행 1건)", () => {
  const bills = [
    { status: "issued", due_date: null, issued_at: "2026-07-01T02:00:00Z", total: 330000 }, // 3개월 전
    { status: "issued", due_date: null, issued_at: "2026-09-21T02:00:00Z", total: 220000 },
    { status: "issued", due_date: null, issued_at: "2026-09-21T02:00:00Z", total: 110000 },
    { status: "paid", due_date: null, issued_at: "2026-08-21T02:00:00Z", total: 500000 },
    { status: "draft", due_date: null, issued_at: null, total: 999999 },
  ]
  it("3개월 전 건이 '기한 없음 · 발행 후 n일'과 isLate로 잡힌다", () => {
    const st = receivableState(bills[0], TODAY)
    expect(st).toEqual({ kind: "receivable", bucket: "no_due", days: 92 })
    expect(isLate(st)).toBe(true)
  })
  it("받을 돈 3건 660,000원 중 늦음 1건 330,000원(overdue 상태 없이도)", () => {
    expect(summarize(bills)).toEqual({ count: 3, total: 660000, late: 1, lateTotal: 330000 })
  })
})

describe("랩형 픽스처(7월·8월 연체 4건 + 9월분 기한 전 11건)", () => {
  const bills = [
    { status: "overdue", due_date: "2026-07-10", issued_at: "2026-07-01T00:00:00Z", total: 300000 },
    { status: "overdue", due_date: "2026-07-10", issued_at: "2026-07-01T00:00:00Z", total: 260831 },
    { status: "overdue", due_date: "2026-08-10", issued_at: "2026-08-01T00:00:00Z", total: 400000 },
    { status: "issued", due_date: "2026-08-10", issued_at: "2026-08-01T00:00:00Z", total: 300000 }, // DB는 issued지만 날짜로 늦음
    ...Array.from({ length: 11 }, () => ({ status: "issued", due_date: "2026-10-10", issued_at: "2026-09-01T00:00:00Z", total: 100000 })),
    { status: "paid", due_date: "2026-09-10", issued_at: "2026-09-01T00:00:00Z", total: 777777 },
  ]
  it("기한 지남 4건 1,260,831원, 받을 돈 15건", () => {
    expect(summarize(bills)).toEqual({ count: 15, total: 2360831, late: 4, lateTotal: 1260831 })
  })
  it("구간: 7월분 d60_plus, 8월분 d31_60", () => {
    expect(receivableState(bills[0], TODAY)).toEqual({ kind: "receivable", bucket: "d60_plus", days: 83 })
    expect(receivableState(bills[3], TODAY)).toEqual({ kind: "receivable", bucket: "d31_60", days: 52 })
  })
})

describe("RECEIVABLE_SQL", () => {
  it("별칭·날짜를 넣은 조각을 만들고, 형식이 틀리면 거절한다", () => {
    const R = RECEIVABLE_SQL("b", TODAY)
    expect(R.isReceivable).toBe("(b.status IN ('issued','overdue'))")
    expect(R.isCorrecting).toBe("(b.status = 'draft' AND b.issued_at IS NOT NULL)")
    expect(R.isLate).toContain("DATE '2026-10-01'")
    expect(() => RECEIVABLE_SQL("b; DROP TABLE bills", TODAY)).toThrow()
    expect(() => RECEIVABLE_SQL("b", "2026-10-01'; --")).toThrow()
  })
})
