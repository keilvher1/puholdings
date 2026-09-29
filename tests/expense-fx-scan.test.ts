import { describe, expect, it, vi } from "vitest"

// 외화 증빙 판독 → 결제일 환율 환산(lib/expense-ai.ts 정규화 + lib/expense-scan.ts applyFxToDrafts)

let fakeOutput: unknown = null
vi.mock("openai", () => {
  class APIError extends Error {}
  class FakeOpenAI {
    static APIError = APIError
    static APIConnectionError = class extends APIError {}
    static APIConnectionTimeoutError = class extends APIError {}
    responses = {
      create: async () => ({ status: "completed", output: [], output_text: JSON.stringify(fakeOutput) }),
    }
  }
  return { default: FakeOpenAI }
})
vi.mock("@/lib/db", () => ({ getDb: () => null }))

import { scanReceipt } from "@/lib/expense-ai"
import { applyFxToDrafts, manualDraft } from "@/lib/expense-scan"
import type { ReceiptDraft } from "@/lib/expenses"

function doc(over: Record<string, unknown> = {}) {
  return {
    location: "",
    doc_type: "other",
    issue_date: "2026-09-19",
    vendor_name: "OpenAI, LLC",
    vendor_biz_no: null,
    supply_amount: null,
    vat_amount: null,
    tax_free_amount: null,
    service_charge: null,
    total_amount: null,
    currency: "USD",
    foreign_total: 20,
    payment_method: "card",
    approval_no: null,
    card_info: null,
    items: [{ name: "ChatGPT Plus", quantity: 1, unit_price: 20, amount: 20 }],
    budget_item: "지급수수료",
    purpose: "SW 구독",
    suggested_project_id: null,
    project_reason: "",
    confidence: "high",
    low_confidence_fields: [],
    warnings: [],
    ...over,
  }
}

const ecb = (rate: number, date: string) =>
  (async () => new Response(JSON.stringify({ date, rates: { KRW: rate } }), { status: 200 })) as unknown as typeof fetch
const fxOpts = (f: typeof globalThis.fetch) => ({ fetch: f, today: "2026-09-29", sql: null, koreaeximKey: "" })

describe("scanReceipt — 외화 증빙 정규화", () => {
  it("외화면 원화 칸(total·supply·vat·품목 금액)을 비우고 foreign_amount에 원래 금액을 넘긴다", async () => {
    fakeOutput = { documents: [doc({ total_amount: 27900, supply_amount: 25000, vat_amount: 2900 })], file_warnings: [] }
    const { drafts } = await scanReceipt({ kind: "pdf", filename: "invoice.pdf", data: "JVBERi0=" }, { projects: [] })
    const d = drafts[0]
    expect(d.currency).toBe("USD")
    expect(d.foreign_amount).toBe(20)
    expect(d.total_amount).toBeNull()
    expect(d.supply_amount).toBeNull()
    expect(d.vat_amount).toBeNull()
    expect(d.items[0]).toMatchObject({ name: "ChatGPT Plus", unit_price: null, amount: null })
    expect(d.exchange_rate).toBeNull()
    expect(d.low_confidence_fields).not.toContain("total_amount")
  })

  it("카드사 원화 청구액 경고는 메모에도 남긴다", async () => {
    fakeOutput = { documents: [doc({ warnings: ["원화 청구액 27,900원"], card_info: "신한카드 ****1234" })], file_warnings: [] }
    const { drafts } = await scanReceipt({ kind: "pdf", filename: "slip.pdf", data: "JVBERi0=" }, { projects: [] })
    expect(drafts[0].memo).toBe("결제 카드: 신한카드 ****1234 · 카드사 원화 청구액 27,900원")
  })

  it("원화 증빙은 지금까지와 같고 통화 기본값이 채워진다", async () => {
    fakeOutput = { documents: [doc({ currency: "KRW", foreign_total: null, total_amount: 11000, doc_type: "receipt" })], file_warnings: [] }
    const { drafts } = await scanReceipt({ kind: "pdf", filename: "r.pdf", data: "JVBERi0=" }, { projects: [] })
    expect(drafts[0]).toMatchObject({
      currency: "KRW",
      foreign_amount: null,
      total_amount: 11000,
      exchange_rate: null,
      exchange_rate_date: "",
      exchange_rate_source: "",
      payroll_month: "",
    })
  })
})

describe("applyFxToDrafts — 결제일 환율로 원화 환산", () => {
  async function usdDraft(over: Record<string, unknown> = {}): Promise<ReceiptDraft> {
    fakeOutput = { documents: [doc(over)], file_warnings: [] }
    return (await scanReceipt({ kind: "pdf", filename: "a.pdf", data: "JVBERi0=" }, { projects: [] })).drafts[0]
  }

  it("환율을 채우고 total = 외화 × 환율(반올림), 경고 첫 줄에 계산식", async () => {
    const [d] = await applyFxToDrafts([await usdDraft()], fxOpts(ecb(1388.1, "2026-09-18")))
    expect(d).toMatchObject({
      currency: "USD",
      foreign_amount: 20,
      exchange_rate: 1388.1,
      exchange_rate_date: "2026-09-18",
      exchange_rate_source: "ecb",
      total_amount: 27762,
      supply_amount: null,
      vat_amount: null,
    })
    expect(d.warnings[0]).toBe("USD 20.00 × 1,388.10원(2026-09-18 기준, 유럽중앙은행) = 27,762원")
  })

  it("환율 조회 실패: total null + 경고 + total_amount 확인 필요", async () => {
    const fail = (async () => new Response("x", { status: 503 })) as unknown as typeof fetch
    const [d] = await applyFxToDrafts([await usdDraft()], fxOpts(fail))
    expect(d.total_amount).toBeNull()
    expect(d.exchange_rate).toBeNull()
    expect(d.low_confidence_fields).toContain("total_amount")
    expect(d.warnings.some((w) => w.includes("환율을 가져오지 못했습니다"))).toBe(true)
  })

  it("거래일자가 없으면 환산하지 않고 경고", async () => {
    const fetch = vi.fn(ecb(1388.1, "2026-09-18"))
    const [d] = await applyFxToDrafts([await usdDraft({ issue_date: null })], fxOpts(fetch))
    expect(fetch).not.toHaveBeenCalled()
    expect(d.total_amount).toBeNull()
    expect(d.warnings.some((w) => w.includes("거래일자가 없어"))).toBe(true)
    expect(d.low_confidence_fields).toContain("total_amount")
  })

  it("같은 통화·같은 날짜는 한 번만 조회한다", async () => {
    const fetch = vi.fn(ecb(1388.1, "2026-09-18"))
    const d = await usdDraft()
    const out = await applyFxToDrafts([d, { ...d, foreign_amount: 5.5 }], fxOpts(fetch))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(out[1].total_amount).toBe(7635) // 5.5 × 1388.1 = 7634.55
  })

  it("원화 초안·예전 초안(통화 필드 없음)은 원화 기본값만 채운다", async () => {
    const legacy = { ...manualDraft([]), total_amount: 5000 } as Partial<ReceiptDraft>
    delete legacy.currency
    delete legacy.foreign_amount
    const [d] = await applyFxToDrafts([legacy as ReceiptDraft], fxOpts(ecb(1, "2026-09-18")))
    expect(d).toMatchObject({ currency: "KRW", foreign_amount: null, exchange_rate: null, exchange_rate_source: "", total_amount: 5000 })
  })
})
