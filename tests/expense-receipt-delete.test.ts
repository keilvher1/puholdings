import { beforeEach, describe, expect, it, vi } from "vitest"

// DELETE /api/admin/expenses/receipts — 원본 Blob 정리 조건.
// 같은 원본을 다른 증빙이나 확인 대기함(pending)이 아직 쓰면 지우지 않는다.

vi.mock("@/lib/auth", () => ({ getSession: async () => ({ id: 7, email: "admin@test", name: "관리자" }) }))

const PATH = "expenses/receipts/2026-09/1-a.pdf"
let queries: string[] = []
let otherReceipts = false
let inboxPending: boolean | { code: string } = false

function fakeSql(strings: TemplateStringsArray) {
  const text = strings.join("?").replace(/\s+/g, " ").trim()
  queries.push(text)
  if (text.startsWith("DELETE FROM expense_receipts")) return Promise.resolve([{ file_pathname: PATH }])
  if (text.startsWith("SELECT 1 FROM expense_receipts WHERE file_pathname")) return Promise.resolve(otherReceipts ? [{}] : [])
  if (text.startsWith("SELECT 1 FROM expense_inbox WHERE file_pathname")) {
    if (typeof inboxPending === "object") return Promise.reject(Object.assign(new Error("relation does not exist"), inboxPending))
    return Promise.resolve(inboxPending ? [{}] : [])
  }
  throw new Error(`예상하지 못한 쿼리: ${text}`)
}
vi.mock("@/lib/db", () => ({ getDb: () => fakeSql }))

const del = vi.fn(async (_pathname: string) => undefined)
vi.mock("@vercel/blob", () => ({
  del: (p: string) => del(p),
  head: async () => ({}),
  BlobNotFoundError: class extends Error {},
}))

import { DELETE } from "@/app/api/admin/expenses/receipts/route"

function deleteRequest() {
  return new Request("http://localhost/api/admin/expenses/receipts", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: 12 }),
  })
}

beforeEach(() => {
  queries = []
  otherReceipts = false
  inboxPending = false
  del.mockClear()
  process.env.DATABASE_URL = "postgres://fake"
})

describe("DELETE — 원본 정리", () => {
  it("다른 증빙도 대기함도 안 쓰면 원본을 지운다", async () => {
    const res = await DELETE(deleteRequest())
    expect(await res.json()).toEqual({ success: true })
    expect(del).toHaveBeenCalledWith(PATH)
  })

  it("확인 대기함(pending)이 같은 원본을 쓰면 남긴다", async () => {
    inboxPending = true
    const res = await DELETE(deleteRequest())
    expect(await res.json()).toEqual({ success: true })
    expect(del).not.toHaveBeenCalled()
  })

  it("다른 증빙이 같은 원본을 쓰면 남긴다", async () => {
    otherReceipts = true
    await DELETE(deleteRequest())
    expect(del).not.toHaveBeenCalled()
  })

  it("대기함 테이블이 없으면(마이그레이션 전) 참조 없음으로 보고 지운다", async () => {
    inboxPending = { code: "42P01" }
    const res = await DELETE(deleteRequest())
    expect(await res.json()).toEqual({ success: true })
    expect(del).toHaveBeenCalledWith(PATH)
  })

  it("대기함 조회가 다른 이유로 실패하면 원본을 남기고 삭제는 성공으로 답한다", async () => {
    inboxPending = { code: "57P01" }
    const res = await DELETE(deleteRequest())
    expect(await res.json()).toEqual({ success: true })
    expect(del).not.toHaveBeenCalled()
  })
})
