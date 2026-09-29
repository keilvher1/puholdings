import { beforeEach, describe, expect, it, vi } from "vitest"

// POST/PUT /api/admin/expenses/receipts — 인건비 수기 등록(파일 없음)·외화 증빙 저장 검증.
// DB CHECK(파일 없는 행은 payroll만, 외화는 금액·환율 필수)에 걸릴 요청은 API 검증에서 먼저 막혀야 한다.

vi.mock("@/lib/auth", () => ({ getSession: async () => ({ id: 7, email: "admin@test", name: "관리자" }) }))

type Query = { text: string; values: unknown[] }
let queries: Query[] = []
let savedManual: Record<string, unknown>[] = []
let savedFiles: Record<string, unknown>[] = []
let existingRow: Record<string, unknown> | null = null
let nextId = 100

function fakeSql(strings: TemplateStringsArray, ...values: unknown[]) {
  const text = strings.join("?").replace(/\s+/g, " ").trim()
  queries.push({ text, values })
  if (text.startsWith("SELECT id, name, status FROM expense_projects")) {
    return Promise.resolve([{ id: 3, name: "스마트팜 실증", status: "active" }])
  }
  if (text.startsWith("SELECT project_id, to_char(issue_date")) return Promise.resolve(savedManual)
  if (text.startsWith("SELECT file_pathname, file_hash")) return Promise.resolve(savedFiles)
  if (text.startsWith("SELECT pg_advisory_xact_lock")) return Promise.resolve([{}])
  if (text.startsWith("INSERT INTO expense_receipts")) return Promise.resolve([{ id: nextId++ }])
  if (text.startsWith("SELECT r.id, r.project_id")) return Promise.resolve(existingRow ? [existingRow] : [])
  if (text.startsWith("UPDATE expense_receipts SET")) return Promise.resolve([])
  throw new Error(`예상하지 못한 쿼리: ${text}`)
}
fakeSql.transaction = async (qs: Promise<unknown>[]) => Promise.all(qs)
vi.mock("@/lib/db", () => ({ getDb: () => fakeSql }))

vi.mock("@vercel/blob", () => ({
  del: async () => undefined,
  head: async () => ({}),
  BlobNotFoundError: class extends Error {},
}))

import { POST, PUT } from "@/app/api/admin/expenses/receipts/route"

const FILE = { pathname: "expenses/receipts/2026-09/1-a.pdf", name: "a.pdf", type: "application/pdf", size: 10, hash: "b".repeat(64) }

function payroll(over: Record<string, unknown> = {}) {
  return {
    doc_type: "payroll",
    issue_date: "2026-09-25",
    vendor_name: "홍길동",
    vendor_biz_no: "",
    supply_amount: null,
    vat_amount: null,
    total_amount: 3000000,
    payment_method: "transfer",
    approval_no: "",
    items: [],
    budget_item: "인건비",
    purpose: "2026-09 인건비",
    memo: "",
    currency: "KRW",
    foreign_amount: null,
    exchange_rate: null,
    exchange_rate_date: "",
    exchange_rate_source: "",
    payroll_month: "2026-09",
    project_id: 3,
    file: null,
    ai_confidence: null,
    ai_raw: null,
    ...over,
  }
}

function usd(over: Record<string, unknown> = {}) {
  return payroll({
    doc_type: "card_slip",
    vendor_name: "OpenAI, LLC",
    payment_method: "card",
    budget_item: "지급수수료",
    payroll_month: "",
    currency: "USD",
    foreign_amount: 20,
    exchange_rate: 1388.1,
    exchange_rate_date: "2026-09-18",
    exchange_rate_source: "ecb",
    total_amount: 27762,
    file: FILE,
    ...over,
  })
}

function post(receipts: unknown[]) {
  return POST(
    new Request("http://localhost/api/admin/expenses/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipts }),
    }),
  )
}

function put(body: unknown) {
  return PUT(
    new Request("http://localhost/api/admin/expenses/receipts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
}

const inserts = () => queries.filter((q) => q.text.startsWith("INSERT INTO expense_receipts"))

beforeEach(() => {
  queries = []
  savedManual = []
  savedFiles = []
  existingRow = null
  nextId = 100
  process.env.DATABASE_URL = "postgres://fake"
})

describe("POST — 인건비 수기 등록", () => {
  it("파일 없는 인건비 여러 명을 한 번에 저장한다(파일 칸은 NULL)", async () => {
    const res = await post([payroll(), payroll({ vendor_name: "김철수", total_amount: 2500000 })])
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, ids: [100, 101], skipped: [] })
    const ins = inserts()
    expect(ins).toHaveLength(2)
    expect(ins[0].text).toContain("NULL, '', '', 0, ''")
    expect(ins[0].text).toContain("e.file_pathname IS NULL")
    expect(ins[0].values).toContain("2026-09") // payroll_month
    // 원본 파일 확인·파일 중복 조회는 하지 않는다
    expect(queries.some((q) => q.text.startsWith("SELECT file_pathname, file_hash"))).toBe(false)
  })

  it("인건비가 아닌데 파일이 없으면 막는다(CHECK 위반 방지)", async () => {
    const res = await post([payroll({ doc_type: "transfer" })])
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.row_errors[0].errors.join(" ")).toContain("인건비 지급")
    expect(inserts()).toHaveLength(0)
  })

  it("귀속월 형식이 틀리면 막는다", async () => {
    const res = await post([payroll({ payroll_month: "2026-13" })])
    expect(res.status).toBe(400)
    expect((await res.json()).row_errors[0].errors).toContain("귀속월은 YYYY-MM 형식이어야 합니다")
  })

  it("같은 프로젝트·지급일·대상자·금액이 묶음 안에 두 번 있으면 막는다", async () => {
    const res = await post([payroll(), payroll()])
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.row_errors).toEqual([{ index: 1, errors: [expect.stringContaining("두 번")] }])
  })

  it("이미 등록된 같은 인건비가 있으면 막는다(대상자가 다르면 통과)", async () => {
    savedManual = [{ project_id: 3, issue_date: "2026-09-25", vendor_name: "홍길동", total_amount: "3000000" }]
    const res = await post([payroll(), payroll({ vendor_name: "김철수" })])
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.row_errors).toEqual([{ index: 0, errors: [expect.stringContaining("이미 등록된 인건비")] }])
  })

  it("첨부(이체확인증)가 있는 인건비는 파일과 함께 저장한다", async () => {
    const res = await post([payroll({ file: FILE })])
    expect(res.status).toBe(200)
    expect(inserts()[0].values).toContain(FILE.pathname)
  })
})

describe("POST — 외화 증빙", () => {
  it("통화·외화 금액·환율·기준일·출처를 저장한다", async () => {
    const res = await post([usd()])
    expect(res.status).toBe(200)
    const v = inserts()[0].values
    expect(v).toEqual(expect.arrayContaining(["USD", 20, 1388.1, "2026-09-18", "ecb"]))
  })

  it("외화인데 환율이 없으면 막는다(CHECK 위반 방지)", async () => {
    const res = await post([usd({ exchange_rate: null })])
    expect(res.status).toBe(400)
    expect((await res.json()).row_errors[0].errors).toContain("적용 환율을 입력하세요")
  })

  it("외화 금액이 없거나 0이면 막는다", async () => {
    const res = await post([usd({ foreign_amount: 0 })])
    expect(res.status).toBe(400)
    expect((await res.json()).row_errors[0].errors).toContain("USD 금액을 입력하세요")
  })

  it("원화 합계가 외화 × 환율과 크게 다르면 막는다", async () => {
    const res = await post([usd({ total_amount: 30000 })])
    expect(res.status).toBe(400)
    expect((await res.json()).row_errors[0].errors.join(" ")).toContain("맞지 않습니다")
  })

  it("원화를 직접 고쳐 환율을 역산(소수 4자리)한 경우는 통과한다", async () => {
    // 27,900원 / USD 20 = 1395 → 직접 입력
    const res = await post([usd({ total_amount: 27900, exchange_rate: 1395, exchange_rate_source: "manual", exchange_rate_date: "" })])
    expect(res.status).toBe(200)
    // 1,234,567원 / USD 889.13 → 소수 4자리로 역산한 환율(반올림 오차 허용)
    const rate = Math.round((1234567 / 889.13) * 10000) / 10000
    const res2 = await post([usd({ foreign_amount: 889.13, total_amount: 1234567, exchange_rate: rate, exchange_rate_source: "manual" })])
    expect(res2.status).toBe(200)
  })

  it("원화로 저장하면 외화 필드는 비운다", async () => {
    const res = await post([usd({ currency: "KRW", total_amount: 27900 })])
    expect(res.status).toBe(200)
    const v = inserts()[0].values
    expect(v).not.toContain(1388.1)
    expect(v).not.toContain("ecb")
  })
})

describe("PUT — 파일 없는 행", () => {
  const row = {
    id: 55, project_id: 3, project_name: "스마트팜 실증", doc_type: "payroll", issue_date: "2026-09-25",
    vendor_name: "홍길동", vendor_biz_no: "", supply_amount: null, vat_amount: null, total_amount: "3000000",
    payment_method: "transfer", approval_no: "", items: [], budget_item: "인건비", purpose: "", memo: "",
    currency: "KRW", foreign_amount: null, exchange_rate: null, exchange_rate_date: null, exchange_rate_source: "",
    payroll_month: "2026-09", file_pathname: null, file_name: "", file_type: "", file_size: 0, file_hash: "",
    ai_confidence: null, created_at: "", updated_at: "",
  }

  it("조회 결과의 file_pathname은 null, 귀속월은 그대로", async () => {
    existingRow = row
    const res = await put({ id: 55, memo: "9월분" })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.receipt.file_pathname).toBeNull()
    expect(body.receipt.payroll_month).toBe("2026-09")
  })

  it("문서 종류를 인건비가 아닌 것으로 바꾸려면 첨부가 있어야 한다", async () => {
    existingRow = row
    const res = await put({ id: 55, doc_type: "transfer" })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("인건비 지급")
  })

  it("첨부를 붙일 수 있다", async () => {
    existingRow = row
    const res = await put({ id: 55, file: FILE })
    expect(res.status).toBe(200)
    const upd = queries.find((q) => q.text.startsWith("UPDATE expense_receipts SET"))!
    expect(upd.values).toContain(FILE.pathname)
    expect(upd.values).toContain(true)
  })

  it("이미 원본이 있는 행의 파일은 바꿀 수 없다", async () => {
    existingRow = { ...row, doc_type: "receipt", file_pathname: FILE.pathname, file_name: "a.pdf" }
    const res = await put({ id: 55, file: { ...FILE, pathname: "expenses/receipts/2026-09/2-b.pdf" } })
    expect(res.status).toBe(400)
  })
})
