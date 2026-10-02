import { describe, expect, it } from "vitest"
import {
  baselineAlert,
  buildStep2Payload,
  factoryMetersReady,
  initialStep2Form,
  isMonthFinished,
  isStep2Dirty,
  issueOutcome,
  kwhFromNotice,
  monthBaselinePct,
  mailErrorText,
  meterRowState,
  metersBlockText,
  needsReview,
  previewAllocation,
  reviewReasonLabel,
  reviewReasons,
  sortByChange,
  step2Primary,
  suggestDueDate,
  validateDueDate,
  validateStep2,
  type Step2Context,
  type Step2Saved,
} from "@/components/admin/billing/close/close-model"
import type { ReviewRow } from "@/components/admin/billing/close/types"
import { parseUnitValue, sanitizeUnitText } from "@/components/saas/unit-input-model"

// 월 마감 2단계 규칙(계획서 4.4.3, 가드 #5·#18) — 순수 함수. 빈칸은 저장 요청을 만들지 않고, 이동은 저장을 겸하지 않으며,
// 저장된 확정단가는 사람이 고르기 전에는 바뀌지 않는다. ×1.1 반올림은 Math.round(138 → 152).

const savedSep: Step2Saved = { exists: true, elecTotal: 4020000, unitPrice: 102, areaRatio: 0.7, per10: 86110, dueDate: "2026-11-10" }
const empty: Step2Saved = { exists: false, elecTotal: null, unitPrice: null, areaRatio: null, per10: null, dueDate: null }
const ctx: Step2Context = {
  readings: { MAIN: 2000, F101: 300, F103: 200, HVAC: 100 },
  prevReadings: { MAIN: 1000, F101: 100, F103: 100, HVAC: 50 },
  pyeongSum: 244.7,
}

describe("×1.1 반올림 도우미", () => {
  it("138 → 151.8 → 152(원 단위 반올림)", () => {
    expect(kwhFromNotice(138)).toEqual({ raw: 151.8, rounded: 152 })
  })
  it("지난 단가 규칙과 같은 반올림(Math.round): 117.3 → 129, 92.7 → 102, .5는 올림", () => {
    expect(kwhFromNotice(117.3).rounded).toBe(129)
    expect(kwhFromNotice(92.7).rounded).toBe(102)
    expect(kwhFromNotice(105).raw).toBe(115.5)
    expect(kwhFromNotice(105).rounded).toBe(116)
  })
})

describe("처음 폼", () => {
  it("저장값이 없는 달은 kWh 단가를 비워 두고(102를 미리 넣지 않음), 확정 체크를 켠다", () => {
    const f = initialStep2Form(empty)
    expect(f.unitPrice).toBeNull()
    expect(f.elecTotal).toBeNull()
    expect(f.areaPct).toBe("70")
    expect(f.per10Choice).toBe("suggested")
  })
  it("저장된 확정단가가 있으면 체크 기본은 꺼짐(저장값 유지)", () => {
    const f = initialStep2Form(savedSep)
    expect(f.per10Choice).toBe("keep")
    expect(f.unitPrice).toBe("102")
    expect(f.elecTotal).toBe("4020000")
  })
})

describe("저장 전 검증 — 빈칸은 0이 아니라 칸 오류", () => {
  it("빈칸이면 저장 요청을 만들지 않는다", () => {
    const f = initialStep2Form(empty)
    const check = validateStep2(f, null)
    expect(check.errors.elecTotal).toBeTruthy()
    expect(check.errors.unitPrice).toBeTruthy()
    expect(buildStep2Payload("2026-10", f, empty, null)).toBeNull()
  })
  it("0원·음수도 칸 오류", () => {
    const f = { ...initialStep2Form(empty), elecTotal: "0", unitPrice: "-1" }
    const check = validateStep2(f, null)
    expect(check.errors.elecTotal).toMatch(/0원보다/)
    expect(check.errors.unitPrice).toMatch(/0원보다/)
  })
  it("배분율은 0~100%", () => {
    const f = { ...initialStep2Form(savedSep), areaPct: "120" }
    expect(validateStep2(f, 86110).errors.areaPct).toBeTruthy()
  })
  it("직접 입력을 골랐는데 칸이 비면 3버튼 확인창이 필요하고, 결정 전에는 요청을 만들지 않는다", () => {
    const f = { ...initialStep2Form(empty), elecTotal: "4020000", unitPrice: "102", per10Choice: "manual" as const, per10Manual: null }
    expect(validateStep2(f, 86110).needsPer10Decision).toBe(true)
    expect(buildStep2Payload("2026-09", f, empty, 86110)).toBeNull()
    // [제안값으로 확정하고 저장]
    expect(buildStep2Payload("2026-09", f, empty, 86110, "suggested")?.per10_billed).toBe(86110)
    // [확정하지 않고 저장]
    expect(buildStep2Payload("2026-09", f, empty, 86110, null)?.per10_billed).toBeNull()
  })
  it("저장 요청 본문: 쉼표 없는 수, 배분율은 비율, 저장된 납부 기한은 그대로 돌려보냄", () => {
    const f = { ...initialStep2Form(savedSep), elecTotal: "4100000" }
    expect(buildStep2Payload("2026-09", f, savedSep, 87000)).toEqual({
      period: "2026-09",
      elec_total: 4100000,
      elec_unit_price: 102,
      area_ratio: 0.7,
      per10_billed: 86110, // keep: 저장된 확정단가를 화면이 바꾸지 않는다
      due_date: "2026-11-10",
    })
  })
})

describe("이동과 저장 분리", () => {
  it("값을 바꾸지 않으면 주 버튼은 '다음: 청구서 만들기'(저장 요청 없음)", () => {
    const f = initialStep2Form(savedSep)
    const suggested = previewAllocation(f, ctx)!.alloc.per10Suggested
    expect(isStep2Dirty(f, savedSep, suggested)).toBe(false)
    expect(step2Primary(false, false)).toEqual({ label: "다음: 청구서 만들기", action: "next" })
  })
  it("저장된 확정단가와 지금 제안값이 달라도 그대로 두면 바뀐 것이 아니다", () => {
    const f = initialStep2Form({ ...savedSep, per10: 28300 })
    expect(isStep2Dirty(f, { ...savedSep, per10: 28300 }, 30520)).toBe(false)
  })
  it("값을 바꾸면 '배분 저장하고 다음', 발행된 달(잠금)에서는 이동만", () => {
    const f = { ...initialStep2Form(savedSep), elecTotal: "4100000" }
    expect(isStep2Dirty(f, savedSep, 86110)).toBe(true)
    expect(step2Primary(true, false).action).toBe("save_and_next")
    expect(step2Primary(true, true).action).toBe("next")
  })
  it("저장값 없는 달에 아무것도 넣지 않았으면 바뀐 것이 없다(빈 값을 저장하지 않는다)", () => {
    expect(isStep2Dirty(initialStep2Form(empty), empty, null)).toBe(false)
  })
  it("제안값으로 확정하는 새 달은 바뀐 것으로 본다", () => {
    const f = { ...initialStep2Form(empty), elecTotal: "4020000", unitPrice: "102" }
    expect(isStep2Dirty(f, empty, 86110)).toBe(true)
  })
})

describe("미리보기(표시용)", () => {
  it("한전 금액·kWh 단가가 없으면 계산 전(null) — 검침 전 달에 음수·'배분 정상'을 보이지 않는다", () => {
    expect(previewAllocation(initialStep2Form(empty), ctx)).toBeNull()
  })
  it("값이 있으면 엔진 계산을 그대로 보인다", () => {
    const p = previewAllocation(initialStep2Form(savedSep), ctx)!
    expect(p.factoryA).toBeGreaterThan(0)
    expect(p.alloc.per10Suggested % 10).toBe(0)
  })
})

describe("1단계 검침 행 상태", () => {
  it("입력 전 / 정상 / 확인 필요(평소 ±50%) / 오류(음수) / 지난달 없음", () => {
    expect(meterRowState(null, 100, 50).state).toBe("empty")
    expect(meterRowState(160, 100, 50)).toEqual({ state: "ok", usage: 60 })
    expect(meterRowState(200, 100, 50).state).toBe("check")
    expect(meterRowState(6820, 65910, 2100)).toEqual({ state: "error", usage: -59090 })
    expect(meterRowState(100, null, null).state).toBe("noPrev")
  })
})

function row(o: Partial<ReviewRow>): ReviewRow {
  return {
    billId: 1,
    tenantId: 1,
    tenantName: "가",
    status: "draft",
    isManual: false,
    correcting: false,
    total: 100000,
    prevTotal: 100000,
    elecAmount: 10000,
    zeroElec: false,
    hasEmail: true,
    dueDate: null,
    issuedAt: null,
    events: [],
    mail: null,
    ...o,
  }
}

describe("3·4단계 '확인 필요'", () => {
  it("±10% 또는 ±5만 원, 신규, 0원, 전기 0원", () => {
    expect(needsReview(row({}))).toBe(false)
    expect(reviewReasons(row({ total: 111000 }))).toEqual(["변동 큼"])
    expect(reviewReasons(row({ total: 1000000, prevTotal: 940000 }))).toEqual(["변동 큼"])
    expect(needsReview(row({ total: 1000000, prevTotal: 960000 }))).toBe(false)
    expect(reviewReasons(row({ prevTotal: null }))).toEqual(["신규"])
    expect(reviewReasons(row({ total: 0, prevTotal: 0 }))).toEqual(["0원"])
    expect(reviewReasons(row({ zeroElec: true }))).toEqual(["전기 0원"])
  })
  it("한전 금액 변동으로 모두가 같이 내린 달은 그 보통 변동을 빼고 본다(랩 10월분: 22건 중 3건)", () => {
    // 랩 9월→10월: 대부분 −13% 안팎(전기료 감소), 튀는 곳은 +158.7%·+38.3%·무쇠공작소(공장동, −6.3%)
    const rows = [
      row({ billId: 1, tenantName: "너나들이", prevTotal: 108800, total: 281499 }),
      row({ billId: 2, tenantName: "바람개비", prevTotal: 1537000, total: 1377000 }),
      row({ billId: 3, tenantName: "너울", prevTotal: 718602, total: 623864 }),
      row({ billId: 4, tenantName: "초록씨앗", prevTotal: 229200, total: 317032 }),
      row({ billId: 5, tenantName: "무쇠", prevTotal: 1004000, total: 941000 }),
      row({ billId: 6, tenantName: "단비", prevTotal: 874000, total: 807000 }),
      row({ billId: 7, tenantName: "솔바람", prevTotal: 302742, total: 263732 }),
      row({ billId: 8, tenantName: "꽃잎", prevTotal: 294342, total: 255332 }),
      row({ billId: 9, tenantName: "한결", prevTotal: 490802, total: 452748 }),
      row({ billId: 10, tenantName: "모래알", prevTotal: 728802, total: 634064 }),
      row({ billId: 11, tenantName: "햇살", prevTotal: 667143, total: 580764 }),
      row({ billId: 12, tenantName: "청솔", prevTotal: 539102, total: 468048 }),
      row({ billId: 13, tenantName: "별무리", prevTotal: 446613, total: 388099 }),
      row({ billId: 14, tenantName: "들꽃", prevTotal: 426060, total: 370332 }),
    ]
    const base = monthBaselinePct(rows)
    expect(base).toBeCloseTo(-12.9, 0)
    expect(rows.filter((r) => needsReview(r, base)).map((r) => r.tenantName)).toEqual(["너나들이", "초록씨앗", "무쇠"])
    // 기준 없이(0) 보면 거의 다 걸린다 — 그래서 보통 변동을 뺀다
    expect(rows.filter((r) => needsReview(r)).length).toBeGreaterThan(6)
    expect(monthBaselinePct(rows.slice(0, 2))).toBe(0)
  })
  it("증감 절댓값 큰 순(신규는 청구액 전체)", () => {
    const rows = [row({ billId: 1, tenantName: "가", total: 101000 }), row({ billId: 2, tenantName: "나", total: 50000 }), row({ billId: 3, tenantName: "다", prevTotal: null, total: 70000 })]
    expect(sortByChange(rows).map((r) => r.billId)).toEqual([3, 2, 1])
  })
})

describe("4단계 납부 기한", () => {
  it("지난번 규칙(다음 달 10일)을 이번 청구월에 적용", () => {
    expect(suggestDueDate("2026-10", { period: "2026-09", dueDate: "2026-10-10" })).toEqual({ date: "2026-11-10", rule: "지난번 발행과 같은 규칙(다음 달 10일)" })
  })
  it("말일 규칙과 이력 없음(청구월 말일)", () => {
    expect(suggestDueDate("2026-02", { period: "2026-01", dueDate: "2026-01-31" }).date).toBe("2026-02-28")
    expect(suggestDueDate("2026-10", null)).toEqual({ date: "2026-10-31", rule: "청구월 말일(지난 발행에 쓴 기한이 없어요)" })
  })
  it("비었거나 오늘보다 앞이면 칸 오류", () => {
    expect(validateDueDate("", "2026-10-02")).toBeTruthy()
    expect(validateDueDate("2026-10-01", "2026-10-02")).toMatch(/오늘이나 그 뒤/)
    expect(validateDueDate("2026-10-02", "2026-10-02")).toBeNull()
  })
})

describe("4단계 완료 화면 집계", () => {
  it("보냄·보내지 못함·설정 안 됨·이메일 없음·기록 없음을 나눈다", () => {
    const rows = [
      row({ billId: 1, status: "issued", mail: { status: "sent", error: null } }),
      row({ billId: 2, status: "paid", mail: { status: "failed", error: "수신 서버가 메일을 거부했습니다 (mailbox full)" } }),
      row({ billId: 3, status: "issued", mail: { status: "failed", error: "RESEND_API_KEY not set" } }),
      row({ billId: 4, status: "issued", hasEmail: false }),
      row({ billId: 5, status: "overdue", mail: null }),
      row({ billId: 6, status: "draft" }),
    ]
    const o = issueOutcome(rows)
    expect(o.issued).toBe(5)
    expect(o.sent).toBe(1)
    expect(o.failed.map((r) => r.billId)).toEqual([2])
    expect(o.notConfigured).toBe(1)
    expect(o.noEmail.map((r) => r.billId)).toEqual([4])
    expect(o.noLog).toBe(1)
  })
  it("메일 실패 사유는 사용자 문구로", () => {
    expect(mailErrorText("수신 서버가 메일을 거부했습니다 (mailbox full)")).toMatch(/받는 서버가 거부했어요/)
    expect(mailErrorText("Invalid `to` field: 주소 형식 오류")).toMatch(/형식/)
    expect(mailErrorText("MAIL_FROM not set")).toMatch(/설정되지 않아/)
  })
})

describe("검토 반영(WP6-fix)", () => {
  it("M2: 검침이 다 저장되지 않은 달은 배분을 계산하지 않는다(음수·거대값·'배분이 맞아요' 없음)", () => {
    const oct = ["MAIN", "F101", "F103", "HVAC"].map((code) => ({ code, prev: 1000, curr: null }))
    const r = factoryMetersReady(oct)
    expect(r).toEqual({ ready: false, missing: 4, noPrev: 0, negative: 0 })
    expect(metersBlockText(r)).toBe("1단계 검침 4개를 먼저 저장해 주세요. 그 전에는 배분을 계산하지 않아요")
    const neg = factoryMetersReady([
      { code: "MAIN", prev: 2000, curr: 1000 },
      { code: "F101", prev: 100, curr: 200 },
      { code: "F103", prev: 100, curr: 200 },
      { code: "HVAC", prev: 50, curr: 60 },
    ])
    expect(neg.ready).toBe(false)
    expect(metersBlockText(neg)).toContain("지난달보다 작아요")
    const ok = factoryMetersReady([
      { code: "MAIN", prev: 1000, curr: 2000 },
      { code: "F101", prev: 100, curr: 300 },
      { code: "F103", prev: 100, curr: 200 },
      { code: "HVAC", prev: 50, curr: 100 },
    ])
    expect(ok.ready).toBe(true)
    expect(metersBlockText(ok)).toBeNull()
    // 계량기 행이 빠져 있어도 계산하지 않는다
    expect(factoryMetersReady([{ code: "MAIN", prev: 1, curr: 2 }]).missing).toBe(3)
  })
  it("M2: 계산 전이면 제안값이 없어 '제안값으로 확정'은 null로 저장된다(엉터리 확정단가 저장 없음)", () => {
    const f = { ...initialStep2Form(empty), elecTotal: "4100000", unitPrice: "152" }
    expect(f.per10Choice).toBe("suggested")
    const body = buildStep2Payload("2026-10", f, empty, null)!
    expect(body.per10_billed).toBeNull()
  })
  it("M3: kWh 단가·도우미 칸은 소수 2자리를 지킨다(138.29가 13,829가 되지 않음)", () => {
    let typed = ""
    for (const ch of "138.29") typed = sanitizeUnitText(typed + ch, { decimals: 2 })
    expect(parseUnitValue(typed, { decimals: 2 })).toBe("138.29")
    expect(kwhFromNotice(Number(parseUnitValue(typed, { decimals: 2 }))).rounded).toBe(152)
    // 예전(소수 0자리)에는 1,173이 됐다
    expect(parseUnitValue("117.3", { decimals: 0 })).toBe("117")
    expect(parseUnitValue("117.3", { decimals: 2 })).toBe("117.3")
  })
  it("확인 필요 사유는 보통 변동을 뺀 근거를 같이 쓰고, 기업 대부분이 ±10% 넘게 바뀌면 따로 알린다", () => {
    const r = row({ prevTotal: 1004000, total: 941000 }) // −6.3%
    expect(reviewReasonLabel("변동 큼", r, -13.1)).toBe("변동 큼 · 다른 기업보다 +6.8%p")
    expect(reviewReasonLabel("변동 큼", r, 0)).toBe("변동 큼")
    expect(reviewReasonLabel("신규", r, -13.1)).toBe("신규")
    expect(baselineAlert(-13.1)).toBe("기업 대부분이 지난달보다 −13.1% 안팎으로 바뀌었어요. 한전 청구금액·10평당 단가가 맞는지 확인해 주세요")
    expect(baselineAlert(-4)).toBeNull()
  })
  it("발행이 끝난 달: 작성 중·정정 중·발행 뒤 바뀐 값이 없을 때만", () => {
    const bills = { draft: 0, correcting: 0, issued: 21, overdue: 0, paid: 1 }
    expect(isMonthFinished({ bills, needsCorrection: false })).toBe(true)
    expect(isMonthFinished({ bills, needsCorrection: true })).toBe(false)
    expect(isMonthFinished({ bills: { ...bills, draft: 1 }, needsCorrection: false })).toBe(false)
    expect(isMonthFinished({ bills: { ...bills, correcting: 2 }, needsCorrection: false })).toBe(false)
    expect(isMonthFinished({ bills: { ...bills, issued: 0, paid: 0 }, needsCorrection: false })).toBe(false)
  })
})
