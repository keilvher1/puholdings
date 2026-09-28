import { describe, it, expect, vi } from "vitest"

// OpenAI 호출은 가짜 응답으로 바꾼다(네트워크·비용 없이 후처리만 검사).
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

import { MAX_RECEIPTS_PER_FILE, scanReceipt } from "@/lib/expense-ai"

function doc(i: number) {
  return {
    location: `${i + 1}페이지`,
    doc_type: "receipt",
    issue_date: "2026-09-01",
    vendor_name: `가게${i + 1}`,
    vendor_biz_no: null,
    supply_amount: null,
    vat_amount: null,
    tax_free_amount: null,
    service_charge: null,
    total_amount: 1000 + i,
    payment_method: "cash",
    approval_no: null,
    card_info: null,
    items: [],
    budget_item: "회의비",
    purpose: "다과",
    suggested_project_id: null,
    project_reason: "",
    confidence: "high",
    low_confidence_fields: [],
    warnings: [],
  }
}

describe("scanReceipt — 한 파일에서 찾은 증빙이 한도를 넘으면 알린다", () => {
  it(`${MAX_RECEIPTS_PER_FILE}건을 넘으면 앞의 ${MAX_RECEIPTS_PER_FILE}건만 돌려주고 파일 경고로 총 건수를 알린다`, async () => {
    fakeOutput = { documents: Array.from({ length: 35 }, (_, i) => doc(i)), file_warnings: [] }
    const r = await scanReceipt({ kind: "pdf", filename: "첩부대지.pdf", data: "JVBERi0=" }, { projects: [] })
    expect(r.drafts).toHaveLength(MAX_RECEIPTS_PER_FILE)
    expect(r.warnings[0]).toContain("35건")
    expect(r.warnings[0]).toContain(`${MAX_RECEIPTS_PER_FILE}건만`)
    // 위치 표시는 실제 총 건수 기준
    expect(r.drafts[0].warnings[0]).toContain("1/35")
  })

  it("한도 안이면 경고 없음", async () => {
    fakeOutput = { documents: [doc(0), doc(1)], file_warnings: [] }
    const r = await scanReceipt({ kind: "pdf", filename: "a.pdf", data: "JVBERi0=" }, { projects: [] })
    expect(r.drafts).toHaveLength(2)
    expect(r.warnings).toHaveLength(0)
    expect(r.drafts[1].warnings[0]).toContain("2/2")
  })
})
