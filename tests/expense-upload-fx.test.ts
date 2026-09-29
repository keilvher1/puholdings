import { describe, expect, it } from "vitest"
import { emptyReceiptFields, type ReceiptFields } from "@/lib/expenses"
import {
  applyFieldPatch,
  applyFxRate,
  fxFormula,
  fxRequestKey,
  fxSourceText,
  invalidFields,
  isFxFailureWarning,
  isFxFormulaWarning,
  parseFxResponse,
  resetFxRate,
  rowsFromScan,
  sanitizeFields,
  toCreateInput,
  type UploaderProject,
} from "@/components/admin/expenses/upload-model"
import { parseDecimalText } from "@/components/admin/expenses/upload-fields"

// 증빙 올리기 화면: 외화(결제일 환율) 편집 규칙

const usd = (over: Partial<ReceiptFields> = {}): ReceiptFields => ({
  ...emptyReceiptFields(),
  issue_date: "2026-09-19",
  vendor_name: "OpenAI",
  currency: "USD",
  foreign_amount: 20,
  exchange_rate: 1388.1,
  exchange_rate_date: "2026-09-18",
  exchange_rate_source: "ecb",
  total_amount: 27762,
  ...over,
})

const ok = { success: true as const, currency: "USD" as const, requested_date: "2026-09-19", rate_date: "2026-09-18", rate: 1388.1, source: "ecb" as const }

describe("sanitizeFields — 통화·환율", () => {
  it("원화면 환율 칸을 비우고, 모르는 통화는 원화로", () => {
    const f = sanitizeFields({ currency: "KRW", foreign_amount: 3, exchange_rate: 2, exchange_rate_source: "ecb" })
    expect(f).toMatchObject({ currency: "KRW", foreign_amount: null, exchange_rate: null, exchange_rate_source: "" })
    expect(sanitizeFields({ currency: "XYZ" as never }).currency).toBe("KRW")
    expect(sanitizeFields({}).payroll_month).toBe("")
  })

  it("외화 초안: 외화 금액 소수 2자리, 환율·기준일·출처 유지", () => {
    const f = sanitizeFields(usd({ foreign_amount: 20.004 }))
    expect(f).toMatchObject({ currency: "USD", foreign_amount: 20, exchange_rate: 1388.1, exchange_rate_date: "2026-09-18", exchange_rate_source: "ecb" })
  })

  it("scan 초안의 외화 칸이 행에 들어가고 low_confidence_fields도 유지", () => {
    const projects: UploaderProject[] = [{ id: 1, name: "A", program_name: "", agency: "", start_date: null, end_date: null, budget_items: [] }]
    const draft = { ...usd(), suggested_project_id: 1, project_reason: "", confidence: "medium" as const, low_confidence_fields: ["foreign_amount" as const], warnings: [] }
    const [row] = rowsFromScan("k", { pathname: "p", name: "a.jpg", type: "image/jpeg", size: 1, hash: "h" }, [draft], [], projects, null)
    expect(row.fields.currency).toBe("USD")
    expect(row.lowFields).toEqual(["foreign_amount"])
  })
})

describe("applyFieldPatch", () => {
  it("외화 금액을 바꾸면 같은 환율로 원화 재계산", () => {
    expect(applyFieldPatch(usd(), { foreign_amount: 30 }).total_amount).toBe(41643)
  })

  it("거래일자를 바꾸면 환율을 비워 다시 받게 한다", () => {
    const f = applyFieldPatch(usd(), { issue_date: "2026-09-25" })
    expect(f).toMatchObject({ exchange_rate: null, exchange_rate_source: "", total_amount: null })
    expect(fxRequestKey(f)).toBe("USD|2026-09-25")
  })

  it("환율을 직접 고치면 manual — 이후 날짜를 바꿔도 환율 유지", () => {
    const m = applyFieldPatch(usd(), { exchange_rate: 1400 })
    expect(m).toMatchObject({ exchange_rate_source: "manual", total_amount: 28000 })
    const moved = applyFieldPatch(m, { issue_date: "2026-09-25" })
    expect(moved).toMatchObject({ exchange_rate: 1400, exchange_rate_source: "manual", total_amount: 28000, exchange_rate_date: "2026-09-25" })
    expect(fxRequestKey(moved)).toBeNull()
    // 환율을 지우는 중에도 조회 환율로 덮어쓰지 않는다
    expect(fxRequestKey(applyFieldPatch(m, { exchange_rate: null }))).toBeNull()
  })

  it("원화 합계를 직접 고치면 manual, 환율 = 합계 ÷ 외화(소수 4자리)", () => {
    const f = applyFieldPatch(usd(), { total_amount: 27000 })
    expect(f).toMatchObject({ exchange_rate: 1350, exchange_rate_source: "manual", total_amount: 27000 })
    expect(applyFieldPatch(usd({ foreign_amount: 3 }), { total_amount: 4000 }).exchange_rate).toBe(1333.3333)
  })

  it("원화 → 외화: 부가세 칸을 비우고 환율 요청 대상이 된다", () => {
    const krw = { ...emptyReceiptFields(), issue_date: "2026-09-19", total_amount: 11000, supply_amount: 10000, vat_amount: 1000 }
    const f = applyFieldPatch(krw, { currency: "USD" })
    expect(f).toMatchObject({ currency: "USD", supply_amount: null, vat_amount: null, total_amount: 11000, exchange_rate: null })
    expect(fxRequestKey(f)).toBe("USD|2026-09-19")
    expect(fxRequestKey({ ...f, issue_date: "" })).toBeNull()
  })

  it("외화 → 원화: 환율 칸을 비우고 원화 합계는 유지", () => {
    const f = applyFieldPatch(usd(), { currency: "KRW" })
    expect(f).toMatchObject({ currency: "KRW", foreign_amount: null, exchange_rate: null, exchange_rate_date: "", exchange_rate_source: "", total_amount: 27762 })
  })
})

describe("applyFxRate · resetFxRate", () => {
  it("받은 환율을 적용해 원화 계산", () => {
    const pending = applyFieldPatch(usd(), { issue_date: "2026-09-19" }) // 그대로(변경 없음)
    const cleared = resetFxRate(pending)
    const f = applyFxRate(cleared, ok, "2026-09-19")
    expect(f).toMatchObject({ exchange_rate: 1388.1, exchange_rate_date: "2026-09-18", exchange_rate_source: "ecb", total_amount: 27762 })
  })

  it("요청 뒤 날짜가 바뀌었거나 직접 입력이면 적용하지 않는다", () => {
    const cleared = resetFxRate(usd())
    expect(applyFxRate({ ...cleared, issue_date: "2026-09-20" }, ok, "2026-09-19")).toEqual({ ...cleared, issue_date: "2026-09-20" })
    const manual = usd({ exchange_rate_source: "manual", exchange_rate: 1400 })
    expect(applyFxRate(manual, ok, "2026-09-19")).toBe(manual)
  })

  it("parseFxResponse는 실패 응답을 오류로", () => {
    expect(parseFxResponse({ success: false, error: "고시 없음" })).toEqual({ success: false, error: "고시 없음" })
    expect(parseFxResponse(null).success).toBe(false)
    expect(parseFxResponse(ok)).toEqual(ok)
  })
})

describe("표시·저장", () => {
  it("계산식과 근거 문구", () => {
    expect(fxFormula(usd())).toBe("USD 20.00 × 1,388.10 = 27,762원")
    expect(fxSourceText(usd())).toBe("2026-09-18 기준 · 유럽중앙은행")
    expect(fxSourceText(usd({ exchange_rate_source: "koreaexim" }))).toBe("2026-09-18 기준 · 매매기준율")
    expect(fxSourceText(usd({ exchange_rate_source: "manual", exchange_rate_date: "" }))).toBe("직접 입력")
  })

  it("외화 행은 외화 금액·환율이 없으면 빨간 칸", () => {
    const base = {
      key: "k", fileKey: null, file: { pathname: "p", name: "a", type: "", size: 0, hash: "" }, project_id: 1, projectSource: null,
      projectReason: "", selected: true, confidence: null, lowFields: [], checkedFields: [], warnings: [], duplicates: [], similar: [],
      aiRaw: null, manual: true, showErrors: false, serverErrors: [],
    } as const
    const inv = invalidFields({ ...base, fields: usd({ foreign_amount: null, exchange_rate: null }) } as never)
    expect(inv).toMatchObject({ foreign_amount: true, exchange_rate: true })
    const input = toCreateInput({ ...base, fields: usd() } as never)
    expect(input).toMatchObject({ currency: "USD", foreign_amount: 20, exchange_rate: 1388.1, exchange_rate_date: "2026-09-18", exchange_rate_source: "ecb", total_amount: 27762 })
    // 원화 행은 환율 칸을 비워 보낸다
    const k = toCreateInput({ ...base, fields: { ...usd(), currency: "KRW" } } as never)
    expect(k).toMatchObject({ foreign_amount: null, exchange_rate: null, exchange_rate_date: "", exchange_rate_source: "" })
  })

  it("parseDecimalText: 콤마·소수, 잘못된 글자는 undefined", () => {
    expect(parseDecimalText("1,388.10", 4)).toBe(1388.1)
    expect(parseDecimalText("", 2)).toBeNull()
    expect(parseDecimalText("12.", 2)).toBe(12)
    expect(parseDecimalText("1a", 2)).toBeUndefined()
    expect(parseDecimalText("-3", 2)).toBeUndefined()
  })
})

describe("isFxFormulaWarning", () => {
  it("판독 환산 안내만 걸러 낸다", () => {
    expect(isFxFormulaWarning("USD 20.00 × 1,388.10원(2026-09-18 기준, 유럽중앙은행) = 27,762원")).toBe(true)
    expect(isFxFormulaWarning("JPY 1,500 × 9.3712원(2026-09-18 기준, 매매기준율) = 14,057원")).toBe(true)
    expect(isFxFormulaWarning("USD 환율을 받지 못해 원화 합계를 비워 두었습니다")).toBe(false)
    expect(isFxFormulaWarning("사진 한 장에 증빙이 2건 있어 나눠서 읽었습니다")).toBe(false)
  })
})

describe("isFxFailureWarning", () => {
  it("판독 때 환율을 못 붙였다는 경고(lib/expense-scan 문구)만 고른다", () => {
    expect(isFxFailureWarning("USD 20.00 — 환율을 가져오지 못했습니다. 환율 또는 원화 금액을 직접 입력하세요.")).toBe(true)
    expect(isFxFailureWarning("거래일자가 없어 환율을 적용하지 못했습니다(USD 20.00). 거래일자를 입력하면 결제일 환율로 계산합니다.")).toBe(true)
    expect(isFxFailureWarning("USD 20.00 × 1,388.10원(2026-09-18 기준, 유럽중앙은행) = 27,762원")).toBe(false)
    expect(isFxFailureWarning("사진 한 장에 증빙이 2건 있어 나눠서 읽었습니다")).toBe(false)
  })
})

describe("applyFieldPatch — 편집 시트 거래일자 변경", () => {
  it("조회 환율 행에서 날짜를 바꾸면 옛 환율·기준일·출처·원화 합계를 모두 비운다", () => {
    const next = applyFieldPatch(usd(), { issue_date: "2026-09-20" })
    expect(next.exchange_rate).toBeNull()
    expect(next.exchange_rate_date).toBe("")
    expect(next.exchange_rate_source).toBe("")
    expect(next.total_amount).toBeNull()
    expect(fxRequestKey(next)).toBe("USD|2026-09-20")
  })
})
