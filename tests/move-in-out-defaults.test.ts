import { describe, expect, it } from "vitest"
import {
  canOpenAction,
  findSameNameTenants,
  firstBillNotice,
  groupByFloor,
  isAfterThisMonth,
  isMonthIssued,
  lastMonthBillingLine,
  lastMonthIssuedWarning,
  lastMonthText,
  leavingText,
  legendCounts,
  mapTenantFieldErrors,
  matchRoom,
  monthlyCharge,
  monthlyText,
  moveInDefaults,
  moveInPayload,
  moveOutDefaults,
  moveOutNoteTitle,
  moveOutPayload,
  newTenantPayload,
  occupancy,
  parseLegend,
  proratedEstimate,
  settlement,
  standardDeposit,
  validateMoveIn,
  validateMoveOut,
  visibleLegendKeys,
  type BoardRoom,
} from "@/components/admin/rooms/move-model"

// 호실 현황·입주·퇴실 폼 모델(계획서 4.3.1·4.3.3·4.3.4). 핵심: 첫 달·마지막 달 기본값이 지금과 같은 'full'(가드 #26),
// 발행된 달 안내 조건, 보증금 없음·음수 처리, 주소로 여는 흐름의 안전 조건, 운영형(퇴실 예정 0) 범례.

const T = "2026-10-02"

describe("입주 폼 기본값", () => {
  it("첫 달 기본은 '한 달 전액'(full), 계약 구분은 'new'(신규 입주), 본관은 21,000원/평·15,000원/월·면적 배분", () => {
    const f = moveInDefaults({ building: "본관", pyeong: "12.6" })
    expect(f.first_month_billing).toBe("full")
    expect(f.renewal_type).toBe("new")
    expect(f).toMatchObject({ pyeong_billed: "12.6", rent_unit_price: "21000", mgmt_fee: "15000", elec_method: "area", deposit_actual: null, start_date: "" })
  })
  it("공장동은 15,000원/평·30,000원/월·계량기 사용량", () => {
    const f = moveInDefaults({ building: "공장동", pyeong: 42 })
    expect(f).toMatchObject({ rent_unit_price: "15000", mgmt_fee: "30000", elec_method: "metered", first_month_billing: "full", pyeong_billed: "42" })
  })
  it("면적이 없으면 빈칸(null) — 0으로 채우지 않는다", () => {
    expect(moveInDefaults({ building: "본관", pyeong: null }).pyeong_billed).toBeNull()
  })
  it("보낼 본문은 기존 API 필드 그대로, 받은 보증금 빈칸은 null", () => {
    const f = { ...moveInDefaults({ building: "본관", pyeong: "12.6" }), start_date: "2026-10-15" }
    expect(moveInPayload(f, 9, 3)).toEqual({
      tenant_id: 3, room_id: 9, start_date: "2026-10-15", pyeong_billed: "12.6", rent_unit_price: "21000", mgmt_fee: "15000",
      deposit_actual: null, elec_method: "area", first_month_billing: "full", renewal_type: "new",
    })
  })
})

describe("입주 폼 검증(제출 때 한 번에)", () => {
  it("빈칸이 여러 개면 모두 동시에 오류", () => {
    const f = { ...moveInDefaults({ building: "본관", pyeong: null }) }
    const e = validateMoveIn(f, { tenantId: null, newTenant: null })
    expect(Object.keys(e).sort()).toEqual(["pyeong", "start", "tenant"])
    expect(e.tenant).toBe("입주 기업을 골라 주세요")
    expect(e.start).toBe("입주일을 골라 주세요")
  })
  it("새 기업은 이름 필수, 사업자번호·메일은 형식만", () => {
    const f = { ...moveInDefaults({ building: "본관", pyeong: "12.6" }), start_date: "2026-10-15" }
    expect(validateMoveIn(f, { tenantId: null, newTenant: { name: " ", businessNo: "", email: "" } })).toEqual({ newName: "기업 이름을 입력해 주세요" })
    expect(validateMoveIn(f, { tenantId: null, newTenant: { name: "새벽빛랩", businessNo: "123-45-678", email: "a@b" } })).toEqual({
      businessNo: "사업자번호는 숫자 10자리예요",
      billEmail: "메일 주소 형식을 확인해 주세요",
    })
    expect(validateMoveIn(f, { tenantId: null, newTenant: { name: "새벽빛랩", businessNo: "123-45-67890", email: "bill@x.co" } })).toEqual({})
  })
  it("새 기업 본문: 청구서 받을 메일을 tax_email·contact_email에 같이", () => {
    expect(newTenantPayload({ name: " (주)새벽빛랩 ", businessNo: "", email: "bill@x.co" }, "2026-10-15", "305")).toEqual({
      name: "(주)새벽빛랩", business_no: null, tax_email: "bill@x.co", contact_email: "bill@x.co", move_in_date: "2026-10-15", room_no: "305",
    })
    expect(newTenantPayload({ name: "a", businessNo: "", email: "" }, "", "305")).toMatchObject({ tax_email: null, contact_email: null, move_in_date: null })
  })
  it("서버 field_errors를 칸에 붙인다", () => {
    expect(mapTenantFieldErrors({ business_no: "사업자번호 형식", tax_email: "메일 형식" })).toEqual({ businessNo: "사업자번호 형식", billEmail: "메일 형식" })
    expect(mapTenantFieldErrors({ contact_email: "메일 형식" })).toEqual({ billEmail: "메일 형식" })
    expect(mapTenantFieldErrors(undefined)).toEqual({})
  })
})

describe("자동 계산(표시용)", () => {
  it("매달 청구 = 면적 × 단가 + 관리비(부가세 포함), 소수 오차 없이", () => {
    expect(monthlyCharge("12.6", "21000", "15000")).toEqual({ rent: 264600, mgmt: 15000, gross: 279600 })
    expect(monthlyCharge("10.2", "21000", "15000")).toEqual({ rent: 214200, mgmt: 15000, gross: 229200 })
    expect(monthlyText(monthlyCharge("12.6", "21000", "15000"))).toBe("264,600원 + 관리비 15,000원 = 279,600원")
    expect(monthlyCharge(null, "21000", "15000")).toBeNull()
  })
  it("첫 달 일할 = 입주일~말일, 마지막 달 일할 = 1일~퇴실일 (calcContractCharge 그대로)", () => {
    expect(proratedEstimate("first", "2026-10-15", { pyeong: "12.6", rent: "21000", mgmt: "15000" })).toEqual({ ym: "2026-10", usedDays: 17, daysInMonth: 31, amount: 153329 })
    expect(proratedEstimate("last", "2026-10-31", { pyeong: "12.6", rent: "21000", mgmt: "15000" })).toMatchObject({ usedDays: 31, amount: 279600 })
    expect(proratedEstimate("first", "", { pyeong: "12.6", rent: "21000", mgmt: "15000" })).toBeNull()
  })
  it("기준 보증금 = 면적 × 200,000원", () => {
    expect(standardDeposit("12.6")).toBe(2520000)
    expect(standardDeposit(null)).toBeNull()
  })
  it("이번 달보다 뒤의 달이면 미래 경고", () => {
    expect(isAfterThisMonth("2026-10-31", T)).toBe(false)
    expect(isAfterThisMonth("2026-11-01", T)).toBe(true)
    expect(isAfterThisMonth("2026-09-30", T)).toBe(false)
    expect(isAfterThisMonth("", T)).toBe(false)
  })
})

describe("발행된 달 안내 조건", () => {
  it("정기 청구서 중 납부 대기·기한 지남·납부 완료가 있으면 발행된 달(작성 중·수기는 아님)", () => {
    expect(isMonthIssued([])).toBe(false)
    expect(isMonthIssued([{ status: "draft", is_manual: false }])).toBe(false)
    expect(isMonthIssued([{ status: "issued", is_manual: true }])).toBe(false)
    expect(isMonthIssued([{ status: "draft" }, { status: "issued", is_manual: false }])).toBe(true)
    expect(isMonthIssued([{ status: "overdue", is_manual: false }])).toBe(true)
    expect(isMonthIssued([{ status: "paid", is_manual: null }])).toBe(true)
  })
  it("입주 완료 카드의 첫 청구 안내는 발행 여부대로", () => {
    expect(firstBillNotice({ startDate: "2026-10-15", monthIssued: false, firstMonth: "full", today: T })).toEqual({ kind: "pending", text: "첫 청구서는 10월분 월 마감 3단계에서 들어가요" })
    const issued = firstBillNotice({ startDate: "2026-10-15", monthIssued: true, firstMonth: "prorated", estimate: 153329, today: T })
    expect(issued.kind).toBe("issued")
    expect(issued.text).toBe(
      "10월분은 이미 발행됐어요. 월 마감에서 [정정 시작]을 누른 뒤 3단계 [청구서 다시 만들기]를 하면 이 기업 10월분 청구서(약 153,329원)가 새로 생겨요. 발행한 청구서를 되돌릴지 물으면 ‘그대로 두기’를 고르고 4단계에서 발행해 주세요",
    )
    expect(firstBillNotice({ startDate: "2026-10-15", monthIssued: null, firstMonth: "full", today: T }).kind).toBe("unknown")
    expect(firstBillNotice({ startDate: "2026-10-15", monthIssued: true, firstMonth: "none", today: T }).kind).toBe("none")
  })
  it("퇴실 달이 이미 발행됐는데 한 달 전액이 아닌 것을 고르면 정정 필요 안내, 전액이면 없음", () => {
    expect(lastMonthIssuedWarning({ endMonthIssued: true, endMonth: "2026-10", lastMonth: "prorated", today: T })).toBe(
      "10월분이 한 달 전액으로 이미 발행됐어요. 일할로 바꾸려면 월 마감에서 정정이 필요해요",
    )
    expect(lastMonthIssuedWarning({ endMonthIssued: true, endMonth: "2026-10", lastMonth: "full", today: T })).toBeNull()
    expect(lastMonthIssuedWarning({ endMonthIssued: false, endMonth: "2026-10", lastMonth: "prorated", today: T })).toBeNull()
    expect(lastMonthIssuedWarning({ endMonthIssued: true, endMonth: "2026-10", lastMonth: "none", today: T })).toContain("청구 안 함으로")
  })
})

describe("퇴실 폼", () => {
  it("마지막 달 기본은 '한 달 전액'(full), 보증금은 '아직 돌려주지 않았어요', 종료 예정일은 미리 채움", () => {
    expect(moveOutDefaults("2026-10-31")).toEqual({ ended_at: "2026-10-31", last_month_billing: "full", deposit: "not_yet", returned_at: "", returned_amount: null })
    expect(moveOutDefaults(null).ended_at).toBe("")
    expect(moveOutDefaults(null).last_month_billing).toBe("full")
  })
  it("'아직 돌려주지 않았어요'면 반환액을 빈값으로 보낸다(서버가 NULL, 0원 기록 안 함)", () => {
    expect(moveOutPayload(moveOutDefaults("2026-10-31"))).toEqual({ ended_at: "2026-10-31", last_month_billing: "full", deposit_returned_amount: "" })
    expect(moveOutPayload({ ...moveOutDefaults("2026-10-31"), deposit: "returned", returned_at: "2026-11-05", returned_amount: "2520000" })).toEqual({
      ended_at: "2026-10-31", last_month_billing: "full", deposit_returned_amount: "2520000", deposit_returned_at: "2026-11-05",
    })
  })
  it("검증: 퇴실일 필수, 돌려줬어요면 반환일·금액 필수", () => {
    expect(validateMoveOut(moveOutDefaults(null))).toEqual({ endedAt: "퇴실일을 골라 주세요" })
    expect(Object.keys(validateMoveOut({ ...moveOutDefaults("2026-10-31"), deposit: "returned" })).sort()).toEqual(["returnedAmount", "returnedAt"])
  })
  it("정산: 보증금 − 받을 돈 ≥ 0이면 돌려줄 금액, 음수면 받을 돈이 남음, 보증금 기록이 없으면 음수를 돌려줄 금액으로 보이지 않음", () => {
    expect(settlement({ deposit: 2520000, unpaid: 0, depositRecorded: true })).toMatchObject({ kind: "return", amount: 2520000 })
    expect(settlement({ deposit: 2520000, unpaid: 3000000, depositRecorded: true })).toMatchObject({ kind: "owed", amount: 480000, text: "보증금을 빼고도 받을 돈이 480,000원 남아요" })
    expect(settlement({ deposit: 0, unpaid: 279600, depositRecorded: false })).toMatchObject({ kind: "owed", amount: 279600, text: "보증금 기록이 없어요. 받을 돈이 279,600원 남아요" })
    expect(settlement({ deposit: 0, unpaid: 0, depositRecorded: false }).kind).toBe("even")
  })
  it("메모 제목", () => {
    expect(moveOutNoteTitle({ tenantName: "(주)은하수랩스", roomCode: "206", deposit: 2520000, unpaid: 0, depositRecorded: true })).toBe(
      "(주)은하수랩스 206호 퇴실 정산 — 보증금 2,520,000원 − 받을 돈 0원 = 돌려줄 금액 2,520,000원",
    )
    expect(moveOutNoteTitle({ tenantName: "A", roomCode: "305", deposit: 0, unpaid: 100, depositRecorded: false })).toBe("A 305호 퇴실 정산 — 보증금 기록 없음 · 받을 돈 100원 남음")
  })
})

describe("보드·주소", () => {
  const room = (code: string, state: BoardRoom["state"], o: Partial<BoardRoom> = {}): BoardRoom => ({
    id: Number(code.replace(/\D/g, "")) || 1, code, building: "본관", floor: Number(code[0]) || 1, pyeong: "10", tenant_id: state === "vacant" || state === "maintenance" ? null : 1,
    tenant_name: state === "vacant" || state === "maintenance" ? null : "(주)은하수랩스", contract_id: state === "vacant" || state === "maintenance" ? null : 5,
    ended_at: null, state, dday: null, ...o,
  })
  it("칩 숫자 = 누르면 보이는 칸 수, 입주 중은 퇴실 예정을 뺀다(랩: 23·2·4·1 = 30)", () => {
    const rooms = [
      ...Array.from({ length: 23 }, (_, i) => room(`1${i}`, "occupied")),
      room("206", "leaving"), room("304", "leaving"),
      room("305", "vacant"), room("308", "vacant"), room("407", "vacant"), room("408", "vacant"),
      room("103", "maintenance"),
    ]
    const c = legendCounts(rooms)
    expect(c).toEqual({ all: 30, occupied: 23, leaving: 2, vacant: 4, unavailable: 1 })
    expect(c.occupied + c.leaving + c.vacant + c.unavailable).toBe(30)
    expect(occupancy(rooms)).toEqual({ total: 30, occupied: 25, rate: 83 })
  })
  it("운영형: 퇴실 예정이 0이면 칩을 숨기고, ?state=leaving으로 열었을 때만 남긴다", () => {
    const c = legendCounts([room("101", "occupied"), room("305", "vacant")])
    expect(visibleLegendKeys(c, "all")).toEqual(["all", "occupied", "vacant", "unavailable"])
    expect(visibleLegendKeys(c, "leaving")).toContain("leaving")
    expect(parseLegend("leaving")).toBe("leaving")
    expect(parseLegend("maintenance")).toBe("all")
    expect(parseLegend(null)).toBe("all")
  })
  it("검색: 기업명(‘(주)’·띄어쓰기 무시)·호실 코드", () => {
    expect(matchRoom({ code: "206", tenant_name: "(주)은하수랩스" }, "은하수")).toBe(true)
    expect(matchRoom({ code: "207", tenant_name: "(주)청솔에너지랩" }, "은하수")).toBe(false)
    expect(matchRoom({ code: "305", tenant_name: null }, "305")).toBe(true)
    expect(matchRoom({ code: "305", tenant_name: null }, "  ")).toBeNull()
    expect(matchRoom({ code: "F101", tenant_name: "(주)무쇠공작소" }, "f10")).toBe(true)
  })
  it("퇴실 예정 타일 글자", () => {
    expect(leavingText("2026-10-31", 29)).toBe("10월 31일 퇴실 · 29일 남음")
    expect(leavingText("2026-10-02", 0)).toBe("10월 2일 퇴실 · 오늘")
    expect(leavingText(null, null)).toBeNull()
  })
  it("건물(본관 먼저) > 층 순서", () => {
    const g = groupByFloor([room("F101", "occupied", { building: "공장동", floor: 1 }), room("305", "vacant"), room("101", "occupied")])
    expect(g.map((b) => b.building)).toEqual(["본관", "공장동"])
    expect(g[0].floors.map((f) => f.floor)).toEqual([1, 3])
  })
  it("?action=은 지금 상태에서만: movein은 공실만, moveout은 진행 중 계약이 있을 때만", () => {
    expect(canOpenAction(room("305", "vacant"), "movein").ok).toBe(true)
    expect(canOpenAction(room("305", "vacant"), "moveout")).toEqual({ ok: false, reason: "진행 중인 계약이 없어서 퇴실 처리를 열지 않았어요" })
    expect(canOpenAction(room("206", "leaving"), "moveout").ok).toBe(true)
    expect(canOpenAction(room("206", "leaving"), "movein").ok).toBe(false)
    expect(canOpenAction(room("103", "maintenance"), "movein").ok).toBe(false)
    expect(canOpenAction(room("206", "occupied"), "delete").ok).toBe(false)
  })
})

describe("퇴실 2단계 청구 문장(generate 규칙과 같은 말)", () => {
  const line = (lastMonth: "full" | "prorated" | "none", o: { issued?: boolean; future?: boolean; endMonth?: string } = {}) =>
    lastMonthBillingLine({ endMonth: o.endMonth ?? "2026-10", lastMonth, endMonthIssued: o.issued ?? false, futureEnd: o.future ?? false, today: T })
  it("청구 안 함이면 그 달 청구서에 넣지 않는다고 말한다(‘들어가요’ 금지, ‘마지막 달’ 중복 없음)", () => {
    const s = line("none")
    expect(s).toBe("10월분 청구서에는 이 계약을 넣지 않아요(마지막 달 청구 안 함).")
    expect(s).not.toContain("들어가요")
    expect(s.match(/마지막 달/g)?.length).toBe(1)
  })
  it("한 달 전액·일할은 그 달 청구서에 어떻게 들어가는지", () => {
    expect(line("full")).toBe("10월분 청구서에 이 계약이 한 달 전액으로 들어가요.")
    expect(line("prorated")).toBe("10월분 청구서에 이 계약이 퇴실일까지 날짜만큼(일할) 들어가요.")
  })
  it("퇴실일이 다음 달 이후면 위 경고와 같은 말(그 전 달 미생성 청구서에서 빠짐)을 붙이고 ‘까지 들어가요’라고 하지 않는다", () => {
    const s = line("full", { endMonth: "2026-11", future: true })
    expect(s).toBe("11월분 청구서에 이 계약이 한 달 전액으로 들어가요. 그 전 달 청구서 중 아직 만들지 않은 것에는 이 계약이 들어가지 않아요.")
    expect(s).not.toContain("까지 이 계약이 들어가요")
  })
  it("그 달이 이미 발행됐으면 발행된 금액이 그대로 남는다고 말한다", () => {
    expect(line("full", { issued: true })).toBe("10월분 청구서는 이미 발행돼 그대로예요(10월 한 달 전액).")
    expect(line("none", { issued: true })).toContain("이미 한 달 전액으로 발행돼 그대로 남아요")
  })
})

describe("마지막 달 표기", () => {
  it("‘마지막 달’을 두 번 쓰지 않는다", () => {
    expect(lastMonthText("none")).toBe("마지막 달 청구 안 함")
    expect(lastMonthText("full")).toBe("마지막 달 한 달 전액")
    expect(lastMonthText("prorated")).toBe("마지막 달 퇴실일까지 날짜만큼(일할)")
  })
})

describe("새 기업 이름 중복 알림", () => {
  const list = [
    { id: 1, name: "(주)은하수랩스", status: "moved_out" as const },
    { id: 2, name: "모래알 AI", status: "active" as const },
  ]
  it("‘(주)’·띄어쓰기·대소문자를 무시하고 같은 이름을 찾는다(퇴실한 기업 포함)", () => {
    expect(findSameNameTenants("은하수 랩스", list).map((t) => t.id)).toEqual([1])
    expect(findSameNameTenants("주식회사 모래알ai", list).map((t) => t.id)).toEqual([2])
  })
  it("다른 이름·빈 이름·목록 없음은 빈 배열", () => {
    expect(findSameNameTenants("은하수", list)).toEqual([])
    expect(findSameNameTenants("  ", list)).toEqual([])
    expect(findSameNameTenants("은하수랩스", null)).toEqual([])
  })
})
