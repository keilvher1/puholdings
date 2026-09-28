import { describe, it, expect, vi, beforeEach } from "vitest"

// lib/upload.ts가 끌고 오는 변환 큐·Blob SDK는 이 테스트와 무관하다.
vi.mock("@/lib/convert", () => ({ needsConversion: () => false, enqueueConversion: async () => ({ success: true }) }))

const getMock = vi.fn()
vi.mock("@vercel/blob", () => ({ get: (...args: unknown[]) => getMock(...args), put: vi.fn() }))

const sessionMock = vi.fn()
const portalMock = vi.fn()
vi.mock("@/lib/auth", () => ({ getSession: () => sessionMock(), getPortalSession: () => portalMock() }))
vi.mock("@/lib/db", () => ({ getDb: () => null }))

import { isSafePathname, safeUploadName } from "@/lib/upload"
import { GET } from "@/app/api/file/route"
import { NextRequest } from "next/server"

// /api/file은 pathname을 그대로 Blob 주소 뒤에 붙여 fetch한다.
// fetch(WHATWG URL)가 dot-segment를 풀면 프리픽스 검사를 우회할 수 있으므로 이런 경로는 모두 거부해야 한다.
const BYPASS = [
  "./expenses/receipts/2026-09/1-a.jpg",
  "news/../expenses/a.jpg",
  "news/%2e%2e/expenses/a.jpg",
  "news/%2E%2e/expenses/a.jpg",
  "x/.%2E/billing/a.jpg",
  "news/%2e/expenses/a.jpg",
  "news/%252e%252e/expenses/a.jpg", // 두 번 인코딩
  "news/.\t./expenses/a.jpg",
  "news/.\n./expenses/a.jpg",
  "news/a%2F..%2Fexpenses/a.jpg",
  "news/%2e%2e%2fexpenses/a.jpg",
  "news/a%5C..%5Cexpenses/a.jpg",
  " expenses/receipts/a.jpg",
  "news/a.jpg?x=1",
  "news/a.jpg#frag",
  "/expenses/a.jpg",
  "news//a.jpg",
  "news\\a.jpg",
  "news/.",
  "",
]

const OK = [
  "news/1716800000000-보고서 최종.docx",
  "expenses/receipts/2026-09/1727500000000-영수증 (1).jpg",
  "expenses/projects/1727500000000-사업계획서[최종].pdf",
  "submissions/12/1727500000000-제출 자료_v2.hwp",
  "portfolio/1727500000000-logo.png",
  "news/1716800000000-100%.jpg", // 잘못된 %-인코딩은 글자 그대로
  "news/1716800000000-a.b.c.pdf",
]

describe("isSafePathname — 경로 정규화 우회 차단", () => {
  it.each(BYPASS)("거부: %j", (p) => {
    expect(isSafePathname(p)).toBe(false)
  })
  it.each(OK)("허용: %j", (p) => {
    expect(isSafePathname(p)).toBe(true)
  })
})

describe("safeUploadName — 새로 올리는 파일 경로는 항상 검사를 통과한다", () => {
  it.each(["보고서#1.pdf", "견적서?.pdf", "a..b.hwp", " 탭\t이름.pdf ", "영수증 (1).jpg", "..", "a\\b.pdf", "50%20할인.pdf"])("%j", (name) => {
    expect(isSafePathname(`submissions/12/1727500000000-${safeUploadName(name)}`)).toBe(true)
  })
  it("한글·공백·괄호는 그대로", () => {
    expect(safeUploadName("영수증 (1).jpg")).toBe("영수증 (1).jpg")
  })
})

function req(pathname: string, raw = false): NextRequest {
  const q = raw ? pathname : encodeURIComponent(pathname)
  return new NextRequest(`https://example.test/api/file?pathname=${q}`)
}

describe("GET /api/file — 비로그인으로 보호된 경로를 우회해 받을 수 없다", () => {
  beforeEach(() => {
    getMock.mockReset()
    sessionMock.mockReset().mockResolvedValue(null)
    portalMock.mockReset().mockResolvedValue(null)
  })

  it.each([
    ["./expenses/receipts/2026-09/1-a.jpg", false],
    ["news/%2e%2e/expenses/receipts/2026-09/1-a.jpg", false],
    ["news/%252e%252e/expenses/receipts/2026-09/1-a.jpg", true], // 쿼리에서 한 번 풀려 '%2e%2e'가 된다
    ["x/.%2E/billing/2026-09/a.jpg", false],
    ["news/.\t./expenses/a.jpg", false],
  ])("404: %s", async (p, raw) => {
    const res = await GET(req(p, raw))
    expect(res.status).toBe(404)
    expect(getMock).not.toHaveBeenCalled()
  })

  it("expenses/ 원본은 관리자 세션이 없으면 404", async () => {
    const res = await GET(req("expenses/receipts/2026-09/1-a.jpg"))
    expect(res.status).toBe(404)
    expect(getMock).not.toHaveBeenCalled()
  })

  it("관리자 세션이면 expenses/ 원본을 private 캐시로 내려준다", async () => {
    sessionMock.mockResolvedValue({ id: 1 })
    getMock.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({ start: (c) => c.close() }),
      blob: { contentType: "image/jpeg", etag: '"e1"' },
    })
    const res = await GET(req("expenses/receipts/2026-09/1-영수증 (1).jpg"))
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("private, no-cache")
    expect(getMock).toHaveBeenCalledWith("expenses/receipts/2026-09/1-영수증 (1).jpg", expect.anything())
  })

  it("공개 프리픽스의 정상 파일은 그대로 내려준다", async () => {
    getMock.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({ start: (c) => c.close() }),
      blob: { contentType: "application/pdf", etag: '"e2"' },
    })
    const res = await GET(req("news/1716800000000-보고서 최종.pdf"))
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toContain("public")
  })
})
