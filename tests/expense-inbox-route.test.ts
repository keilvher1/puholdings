import { beforeEach, describe, expect, it, vi } from "vitest"

// /api/admin/expenses/inbox(데스크톱 앱 확인 대기함) 라우트 검사.
// 세션·DB(neon tagged template)·Blob·OpenAI를 모두 가짜로 바꿔 네트워크 없이 요청 → 응답·쿼리를 본다.

// ── 가짜 세션 ──────────────────────────────────────────────────────────────────
let session: { id: number; email: string; name: string } | null = { id: 7, email: "admin@test", name: "관리자" }
vi.mock("@/lib/auth", () => ({ getSession: async () => session }))

// ── 가짜 DB: 실행한 쿼리를 기록하고, 쿼리 글자에 따라 정해 둔 행을 돌려준다 ─────────────
type Query = { text: string; values: unknown[] }
let queries: Query[] = []
let inboxRows: Record<string, unknown>[] = []
let receiptsUsingFile = false
let otherPendingUsingFile = false
let savedReceipts: Record<string, unknown>[] = []
let insertFails: { code?: string } | null = null
const PROJECTS = [
  { id: 3, name: "스마트팜 실증", program_name: "지역혁신", agency: "", description: "", start_date: "2026-01-01", end_date: "2026-12-31", total_budget: null, budget_items: [{ name: "재료비", amount: null }], source_files: [], status: "active", created_at: "", updated_at: "", receipt_count: 0, spent_total: 0 },
]

function fakeSql(strings: TemplateStringsArray, ...values: unknown[]) {
  const text = strings.join("?").replace(/\s+/g, " ").trim()
  queries.push({ text, values })
  if (text.startsWith("INSERT INTO expense_inbox")) {
    if (insertFails) return Promise.reject(Object.assign(new Error("insert failed"), insertFails))
    return Promise.resolve([{ id: 41 }])
  }
  if (text.includes("count(*)::int AS n FROM expense_inbox")) return Promise.resolve([{ n: 5 }])
  if (text.includes("FROM expense_projects")) return Promise.resolve(PROJECTS)
  if (text.includes("r.file_pathname, r.file_hash FROM expense_receipts r")) return Promise.resolve(savedReceipts)
  if (text.includes("FROM expense_receipts r")) return Promise.resolve([])
  if (text.startsWith("UPDATE expense_inbox SET status = 'done'")) return Promise.resolve([])
  if (text.startsWith("SELECT id, source, file_pathname")) return Promise.resolve(inboxRows)
  if (text.startsWith("UPDATE expense_inbox SET status = ? , updated_at") || text.startsWith("UPDATE expense_inbox SET status = ?, updated_at")) {
    return Promise.resolve((values[1] as number[]).filter((id) => id !== 999).map((id) => ({ id })))
  }
  if (text.startsWith("UPDATE expense_inbox SET status = 'dismissed'")) {
    return Promise.resolve(values[0] === 404 ? [] : [{ file_pathname: "expenses/receipts/2026-09/1-a.pdf" }])
  }
  if (text.startsWith("SELECT 1 FROM expense_inbox WHERE id =")) return Promise.resolve([])
  if (text.startsWith("SELECT 1 FROM expense_receipts WHERE file_pathname")) return Promise.resolve(receiptsUsingFile ? [{ "?column?": 1 }] : [])
  if (text.startsWith("SELECT 1 FROM expense_inbox WHERE file_pathname")) return Promise.resolve(otherPendingUsingFile ? [{ "?column?": 1 }] : [])
  throw new Error(`예상하지 못한 쿼리: ${text}`)
}
vi.mock("@/lib/db", () => ({ getDb: () => fakeSql }))

// ── 가짜 Blob ─────────────────────────────────────────────────────────────────
const put = vi.fn(async (pathname: string) => ({ pathname }))
const del = vi.fn(async (_pathname: string) => undefined)
vi.mock("@vercel/blob", () => ({ put: (p: string) => put(p), del: (p: string) => del(p) }))

// ── 가짜 OpenAI ───────────────────────────────────────────────────────────────
let fakeOutput: unknown = null
let fakeThrow: Error | null = null
vi.mock("openai", () => {
  class APIError extends Error {}
  class FakeOpenAI {
    static APIError = APIError
    static APIConnectionError = class extends APIError {}
    static APIConnectionTimeoutError = class extends APIError {}
    responses = {
      create: async () => {
        if (fakeThrow) throw fakeThrow
        return { status: "completed", output: [], output_text: JSON.stringify(fakeOutput) }
      },
    }
  }
  return { default: FakeOpenAI }
})

import { DELETE, GET, PATCH, POST } from "@/app/api/admin/expenses/inbox/route"
import { GET as COUNT } from "@/app/api/admin/expenses/inbox/count/route"
import { POST as SCAN } from "@/app/api/admin/expenses/scan/route"

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")
const HASH = "a".repeat(64)

function receiptDoc(over: Record<string, unknown> = {}) {
  return {
    location: "1페이지",
    doc_type: "card_slip",
    issue_date: "2026-09-10",
    vendor_name: "포항문구",
    vendor_biz_no: null,
    supply_amount: 10000,
    vat_amount: 1000,
    tax_free_amount: null,
    service_charge: null,
    total_amount: 11000,
    payment_method: "card",
    approval_no: null,
    card_info: null,
    items: [],
    budget_item: "재료비",
    purpose: "소모품",
    suggested_project_id: null,
    project_reason: "",
    confidence: "high",
    low_confidence_fields: [],
    warnings: [],
    ...over,
  }
}

function uploadRequest(fields: Record<string, string> = {}, file: Blob | null = new Blob([PDF], { type: "application/pdf" }), name = "영수증.pdf") {
  const fd = new FormData()
  if (file) fd.append("file", file, name)
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return new Request("http://localhost/api/admin/expenses/inbox", { method: "POST", body: fd })
}

function jsonRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/admin/expenses/inbox", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function insertQuery() {
  return queries.find((q) => q.text.startsWith("INSERT INTO expense_inbox"))
}

beforeEach(() => {
  session = { id: 7, email: "admin@test", name: "관리자" }
  queries = []
  inboxRows = []
  receiptsUsingFile = false
  otherPendingUsingFile = false
  savedReceipts = []
  insertFails = null
  fakeOutput = { documents: [receiptDoc()], file_warnings: [] }
  fakeThrow = null
  put.mockClear()
  del.mockClear()
  process.env.DATABASE_URL = "postgres://fake"
  process.env.OPENAI_API_KEY = "sk-test"
})

describe("인증", () => {
  it("세션이 없으면 모든 메서드가 401", async () => {
    session = null
    for (const res of [
      await POST(uploadRequest()),
      await GET(new Request("http://localhost/api/admin/expenses/inbox")),
      await PATCH(jsonRequest("PATCH", { ids: [1], status: "done" })),
      await DELETE(jsonRequest("DELETE", { id: 1 })),
      await COUNT(),
    ]) {
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ success: false })
    }
    expect(put).not.toHaveBeenCalled()
  })
})

describe("POST — 파일 받기 → 보관 → 인식 → 대기함 저장", () => {
  it("인식 성공: 원본 해시·기본 프로젝트·초안을 저장하고 요약을 돌려준다", async () => {
    const res = await POST(uploadRequest({ original_hash: HASH.toUpperCase(), preferred_project_id: "3" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      success: true,
      item: {
        id: 41,
        file_name: "영수증.pdf",
        scan_status: "ok",
        error: "",
        drafts_count: 1,
        first: { vendor_name: "포항문구", total_amount: 11000, issue_date: "2026-09-10" },
      },
      pending_count: 5,
    })
    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0][0]).toMatch(/^expenses\/receipts\/\d{4}-\d{2}\/\d+-영수증\.pdf$/)
    const ins = insertQuery()!
    // source, pathname, name, type, size, hash, preferred, scan_status, drafts, warnings, duplicates, possible, error, created_by
    expect(ins.values[0]).toBe("desktop")
    expect(ins.values[3]).toBe("application/pdf")
    expect(ins.values[5]).toBe(HASH) // 소문자로 맞춘 원본 해시
    expect(ins.values[6]).toBe(3)
    expect(ins.values[7]).toBe("ok")
    expect(JSON.parse(ins.values[8] as string)[0]).toMatchObject({ vendor_name: "포항문구", total_amount: 11000 })
    expect(ins.values[12]).toBe("")
    expect(ins.values[13]).toBe(7)
    // 증빙 장부에는 아무것도 쓰지 않는다
    expect(queries.some((q) => /INSERT INTO expense_receipts|UPDATE expense_receipts/.test(q.text))).toBe(false)
  })

  it("진행 중이 아닌 프로젝트·잘못된 해시는 무시한다(null · 전송본 해시)", async () => {
    const res = await POST(uploadRequest({ original_hash: "xyz", preferred_project_id: "99" }))
    expect(res.status).toBe(200)
    const ins = insertQuery()!
    expect(ins.values[6]).toBeNull()
    expect(ins.values[5]).toMatch(/^[0-9a-f]{64}$/)
    expect(ins.values[5]).not.toBe("xyz")
  })

  it("인식 키가 없으면 not_configured로 보관·저장한다", async () => {
    delete process.env.OPENAI_API_KEY
    const res = await POST(uploadRequest())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.item).toMatchObject({ scan_status: "not_configured", drafts_count: 0, first: null })
    expect(body.item.error).not.toContain("AI")
    expect(insertQuery()!.values[7]).toBe("not_configured")
    expect(put).toHaveBeenCalledTimes(1)
  })

  it("인식 오류여도 파일은 보관하고 failed + 사유로 저장한다", async () => {
    fakeThrow = new Error("upstream exploded")
    const res = await POST(uploadRequest())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.item.scan_status).toBe("failed")
    expect(body.item.error).toContain("파일 보관됨")
    expect(insertQuery()!.values[7]).toBe("failed")
    expect(put).toHaveBeenCalledTimes(1)
  })

  it("인식 내용이 없으면 빈 초안 1개를 저장하고 drafts_count는 0", async () => {
    fakeOutput = { documents: [], file_warnings: [] }
    const body = await (await POST(uploadRequest())).json()
    expect(body.item).toMatchObject({ scan_status: "ok", drafts_count: 0, first: null })
    expect(JSON.parse(insertQuery()!.values[8] as string)).toHaveLength(1)
  })

  it("파일 검사 실패는 400이고 보관하지 않는다", async () => {
    const fake = new Blob(["<html>not a pdf</html>"], { type: "application/pdf" })
    const res = await POST(uploadRequest({}, fake, "가짜.pdf"))
    expect(res.status).toBe(400)
    expect((await res.json()).success).toBe(false)
    const none = await POST(uploadRequest({}, null))
    expect(none.status).toBe(400)
    expect(put).not.toHaveBeenCalled()
    expect(insertQuery()).toBeUndefined()
  })

  it("대기함 테이블이 없으면 500 + 마이그레이션 안내, 보관한 원본은 지운다", async () => {
    insertFails = { code: "42P01" }
    const res = await POST(uploadRequest())
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain("2026-expense-02-inbox.sql")
    expect(del).toHaveBeenCalledTimes(1)
  })
})

describe("GET — 목록·건수", () => {
  it("pending 목록을 InboxItem 모양으로 돌려준다", async () => {
    inboxRows = [
      {
        id: 1, source: "desktop", file_pathname: "expenses/receipts/2026-09/1-a.pdf", file_name: "a.pdf", file_type: "application/pdf",
        file_size: 1234, file_hash: HASH, preferred_project_id: 3, status: "pending", scan_status: "ok",
        drafts: [{ vendor_name: "포항문구" }], warnings: [], duplicates: [], possible_duplicates: [[]], error: "",
        created_at: new Date("2026-09-28T01:00:00Z"),
      },
    ]
    const res = await GET(new Request("http://localhost/api/admin/expenses/inbox"))
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.pending_count).toBe(5)
    expect(body.items[0]).toEqual({
      id: 1,
      source: "desktop",
      file: { pathname: "expenses/receipts/2026-09/1-a.pdf", name: "a.pdf", type: "application/pdf", size: 1234, hash: HASH },
      preferred_project_id: 3,
      status: "pending",
      scan_status: "ok",
      drafts: [{ vendor_name: "포항문구" }],
      warnings: [],
      duplicates: [],
      possible_duplicates: [[]],
      error: "",
      created_at: "2026-09-28T01:00:00.000Z",
    })
    const q = queries.find((x) => x.text.startsWith("SELECT id, source"))!
    expect(q.text).toContain("ORDER BY created_at ASC")
    expect(q.values).toEqual(["pending", 200])
  })

  it("이미 저장한 초안은 빼고, 중복 정보는 지금 장부 기준으로 다시 채운다", async () => {
    const base = {
      source: "desktop", file_type: "application/pdf", file_size: 1, preferred_project_id: null, status: "pending",
      scan_status: "ok", warnings: [], duplicates: [], error: "", created_at: "2026-09-28T01:00:00Z",
    }
    const d1 = { issue_date: "2026-09-10", vendor_name: "포항문구", total_amount: 11000 }
    const d2 = { issue_date: "2026-09-11", vendor_name: "효자식당", total_amount: 24000 }
    inboxRows = [
      // 2건 중 1건(포항문구)만 저장하고 떠난 파일
      { ...base, id: 1, file_pathname: "expenses/receipts/2026-09/1-a.pdf", file_name: "a.pdf", file_hash: HASH, drafts: [d1, d2], possible_duplicates: [[], [{ id: 9 }]] },
      // 전부 저장했는데 done 처리가 안 된 파일(해시로 일치)
      { ...base, id: 2, file_pathname: "expenses/receipts/2026-09/2-b.pdf", file_name: "b.pdf", file_hash: "b".repeat(64), drafts: [d1], possible_duplicates: [[]] },
      // 저장한 적 없는 파일
      { ...base, id: 3, file_pathname: "expenses/receipts/2026-09/3-c.pdf", file_name: "c.pdf", file_hash: "c".repeat(64), drafts: [d2], possible_duplicates: [[]] },
    ]
    savedReceipts = [
      { id: 50, project_name: "스마트팜 실증", issue_date: "2026-09-10", vendor_name: "포항문구", total_amount: "11000", file_pathname: "expenses/receipts/2026-09/1-a.pdf", file_hash: HASH },
      { id: 51, project_name: "스마트팜 실증", issue_date: "2026-09-10", vendor_name: "포항문구", total_amount: "11000", file_pathname: "expenses/receipts/2026-09/9-other.pdf", file_hash: "b".repeat(64) },
    ]
    const body = await (await GET(new Request("http://localhost/api/admin/expenses/inbox"))).json()
    expect(body.items.map((i: { id: number }) => i.id)).toEqual([1, 3])
    const first = body.items[0]
    expect(first.drafts).toEqual([d2])
    expect(first.possible_duplicates).toEqual([[{ id: 9 }]])
    expect(first.duplicates).toEqual([
      { id: 50, project_name: "스마트팜 실증", issue_date: "2026-09-10", vendor_name: "포항문구", total_amount: 11000 },
    ])
    expect(body.items[1].duplicates).toEqual([])
    const done = queries.find((q) => q.text.startsWith("UPDATE expense_inbox SET status = 'done'"))!
    expect(done.values).toEqual([[2]])
    // 건수는 정리한 뒤에 센다
    const doneAt = queries.indexOf(done)
    const countAt = queries.findIndex((q) => q.text.includes("count(*)::int AS n FROM expense_inbox"))
    expect(countAt).toBeGreaterThan(doneAt)
  })

  it("잘못된 status는 400", async () => {
    const res = await GET(new Request("http://localhost/api/admin/expenses/inbox?status=all"))
    expect(res.status).toBe(400)
  })

  it("count는 pending 건수만", async () => {
    const res = await COUNT()
    expect(await res.json()).toEqual({ success: true, pending_count: 5 })
  })
})

describe("PATCH — 저장 완료·제외 표시", () => {
  it("pending인 항목만 바꾸고 바뀐 수를 돌려준다", async () => {
    const res = await PATCH(jsonRequest("PATCH", { ids: [1, 2, 999], status: "done" }))
    expect(await res.json()).toEqual({ success: true, updated: 2 })
    const q = queries.find((x) => x.text.startsWith("UPDATE expense_inbox"))!
    expect(q.text).toContain("status = 'pending'")
    expect(q.values).toEqual(["done", [1, 2, 999]])
  })

  it("status·ids가 잘못되면 400", async () => {
    expect((await PATCH(jsonRequest("PATCH", { ids: [1], status: "pending" }))).status).toBe(400)
    expect((await PATCH(jsonRequest("PATCH", { ids: [], status: "done" }))).status).toBe(400)
    expect((await PATCH(jsonRequest("PATCH", { ids: ["x"], status: "done" }))).status).toBe(400)
  })
})

describe("DELETE — 대기함에서 제외", () => {
  it("다른 곳에서 쓰지 않는 원본은 Blob에서 지운다", async () => {
    const res = await DELETE(jsonRequest("DELETE", { id: 1 }))
    expect(await res.json()).toEqual({ success: true })
    expect(del).toHaveBeenCalledWith("expenses/receipts/2026-09/1-a.pdf")
  })

  it("저장된 증빙이나 다른 대기 항목이 같은 원본을 쓰면 지우지 않는다", async () => {
    receiptsUsingFile = true
    await DELETE(jsonRequest("DELETE", { id: 1 }))
    receiptsUsingFile = false
    otherPendingUsingFile = true
    await DELETE(jsonRequest("DELETE", { id: 1 }))
    expect(del).not.toHaveBeenCalled()
  })

  it("Blob 삭제가 실패해도 성공으로 응답한다", async () => {
    del.mockRejectedValueOnce(new Error("blob down"))
    const res = await DELETE(jsonRequest("DELETE", { id: 1 }))
    expect(res.status).toBe(200)
  })

  it("없는 항목은 404, id 없으면 400", async () => {
    expect((await DELETE(jsonRequest("DELETE", { id: 404 }))).status).toBe(404)
    expect((await DELETE(jsonRequest("DELETE", {}))).status).toBe(400)
  })
})

describe("/scan 응답은 공용 로직으로 옮긴 뒤에도 같다", () => {
  function scanRequest() {
    const fd = new FormData()
    fd.append("file", new Blob([PDF], { type: "application/pdf" }), "영수증.pdf")
    return new Request("http://localhost/api/admin/expenses/scan", { method: "POST", body: fd })
  }

  it("성공: file·drafts·duplicates·warnings·possible_duplicates, DB에 쓰지 않음", async () => {
    const res = await SCAN(scanRequest())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(Object.keys(body).sort()).toEqual(["drafts", "duplicates", "file", "possible_duplicates", "success", "warnings"])
    expect(body.drafts[0]).toMatchObject({ vendor_name: "포항문구", total_amount: 11000 })
    expect(queries.some((q) => /^(INSERT|UPDATE|DELETE)/.test(q.text))).toBe(false)
  })

  it("키 없음: 503 + needs_setup + file·duplicates", async () => {
    delete process.env.OPENAI_API_KEY
    const res = await SCAN(scanRequest())
    const body = await res.json()
    expect(res.status).toBe(503)
    expect(body).toMatchObject({ success: false, needs_setup: true, duplicates: [] })
    expect(body.file.name).toBe("영수증.pdf")
  })

  it("인식 오류: file을 함께 돌려주고 '파일 보관됨' 안내", async () => {
    fakeThrow = new Error("boom")
    const res = await SCAN(scanRequest())
    const body = await res.json()
    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(body.success).toBe(false)
    expect(body.error).toContain("파일 보관됨")
    expect(body.file).toBeTruthy()
  })
})
