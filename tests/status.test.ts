import { describe, expect, it } from "vitest"
import { billBadge, STATUS, statusMeta, TONE_CLASS, type StatusDomain } from "@/lib/status"

// 상태 사전(계획서 2.3): 같은 상태는 같은 말·같은 톤. 청구서 배지는 DB 상태가 아니라 날짜로 고른다.

const TODAY = "2026-10-01"
const DOMAINS: StatusDomain[] = [
  "bill", "room", "tenant", "contract", "program", "application", "submission", "portalProgram",
  "expenseRow", "expenseCheck", "email", "inquiry", "note", "inbox", "closeStep",
]

describe("사전 모양", () => {
  it("계획서의 도메인이 모두 있다", () => {
    for (const d of DOMAINS) expect(STATUS[d], d).toBeDefined()
    expect(Object.keys(STATUS).sort()).toEqual([...DOMAINS].sort())
  })
  it("톤은 5가지뿐이고 남색 채움(primary)을 쓰지 않는다", () => {
    expect(Object.keys(TONE_CLASS).sort()).toEqual(["danger", "info", "neutral", "success", "warning"])
    for (const cls of Object.values(TONE_CLASS)) expect(cls).not.toMatch(/bg-(primary|dark)\b/)
    for (const dict of Object.values(STATUS)) for (const m of Object.values(dict)) expect(Object.keys(TONE_CLASS)).toContain(m.tone)
  })
  it("관리자와 포털이 같은 말: issued = 납부 대기, 화면 문구 금지어 없음", () => {
    expect(statusMeta("bill", "issued")).toMatchObject({ label: "납부 대기", tone: "info" })
    expect(statusMeta("bill", "overdue")).toMatchObject({ label: "기한 지남", tone: "danger" })
    expect(statusMeta("bill", "draft").label).toBe("작성 중")
    const labels = Object.values(STATUS).flatMap((d) => Object.values(d).map((m) => m.label))
    for (const bad of ["발행됨", "입주중", "퇴실예정", "퇴거", "초안", "확인 대기", "확인 전"]) expect(labels).not.toContain(bad)
  })
  it("흔한 정상 상태는 neutral, 빨강은 문제에만", () => {
    expect(statusMeta("room", "occupied").tone).toBe("neutral")
    expect(statusMeta("tenant", "active").tone).toBe("neutral")
    expect(statusMeta("contract", "active").tone).toBe("neutral")
    expect(statusMeta("room", "leaving")).toMatchObject({ label: "퇴실 예정", tone: "warning" })
    expect(statusMeta("room", "maintenance").label).toBe("사용 불가")
    expect(statusMeta("expenseRow", "needs_review")).toMatchObject({ label: "확인 필요", tone: "warning" })
    expect(statusMeta("expenseCheck", "ok").hidden).toBe(true)
  })
  it("모르는 값은 원문 그대로 neutral, 문의는 new 말고 모두 확인함", () => {
    expect(statusMeta("bill", "weird")).toEqual({ label: "weird", tone: "neutral" })
    expect(statusMeta("inquiry", "new")).toMatchObject({ label: "새 문의", tone: "warning" })
    expect(statusMeta("inquiry", "read").label).toBe("확인함")
    expect(statusMeta("inquiry", null).label).toBe("확인함")
  })
})

describe("billBadge", () => {
  it("issued인데 기한이 지났으면 기한 지남(n일 지남)", () => {
    expect(billBadge({ status: "issued", due_date: "2026-09-10", issued_at: "2026-09-01T00:00:00Z" }, TODAY)).toEqual({ status: "late", detail: "21일 지남" })
  })
  it("DB overdue도 같은 배지", () => {
    expect(billBadge({ status: "overdue", due_date: "2026-08-10", issued_at: "2026-08-01T00:00:00Z" }, TODAY)).toEqual({ status: "late", detail: "52일 지남" })
  })
  it("기한 전·당일·기한 없음", () => {
    expect(billBadge({ status: "issued", due_date: "2026-10-10", issued_at: "2026-10-01T00:00:00Z" }, TODAY)).toEqual({ status: "issued", detail: "9일 남음" })
    expect(billBadge({ status: "issued", due_date: "2026-10-01", issued_at: "2026-09-25T00:00:00Z" }, TODAY)).toEqual({ status: "issued", detail: "오늘까지" })
    expect(billBadge({ status: "issued", due_date: null, issued_at: "2026-08-10T03:00:00Z" }, TODAY)).toEqual({ status: "issued", detail: "발행 후 52일" })
  })
  it("정정 중(draft + issued_at)과 작성 중·납부 완료", () => {
    expect(billBadge({ status: "draft", due_date: null, issued_at: "2026-08-10T03:00:00Z" }, TODAY)).toEqual({ status: "correcting", detail: "다시 발행해야 포털에 보여요" })
    expect(billBadge({ status: "draft", due_date: null, issued_at: null }, TODAY)).toEqual({ status: "draft", detail: null })
    expect(billBadge({ status: "paid", due_date: null, issued_at: "2026-09-01T00:00:00Z", paid_at: "2026-09-19T16:00:00Z" }, TODAY)).toEqual({ status: "paid", detail: "9월 20일" })
  })
})
