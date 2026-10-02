// WP0b: middleware.ts (WP0b 검토 반영으로 스크래치에서 tests/로 옮김) — /admin·/portal 경로 분리, next 파라미터, must_change_password 우선, /api 제외
import { beforeAll, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { SignJWT } from "jose"

process.env.JWT_SECRET = "wp0b-test-secret"
// JWT_SECRET을 정한 뒤에 불러온다(top-level await 없이)
let middleware: typeof import("@/middleware").middleware
let config: typeof import("@/middleware").config
const key = new TextEncoder().encode("puholdings-auth::wp0b-test-secret")
const sign = (p: Record<string, unknown>, k = key) => new SignJWT(p).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(k)

let admin = "", legacyAdmin = "", tenant = "", mustChange = "", forged = ""
beforeAll(async () => {
  ;({ middleware, config } = await import("@/middleware"))
  admin = await sign({ role: "admin", id: 1, email: "a@example.com", name: "관리자" })
  legacyAdmin = await sign({ id: 1, email: "a@example.com", name: "관리자" })
  tenant = await sign({ role: "tenant", tenant_id: 1, user_id: 1, must_change_password: false })
  mustChange = await sign({ role: "tenant", tenant_id: 5, user_id: 4, must_change_password: true })
  forged = await sign({ role: "admin", id: 1 }, new TextEncoder().encode("other"))
})

async function run(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(path, "http://lab.test"), {
    headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") },
  })
  const res = await middleware(req)
  const loc = res.headers.get("location")
  return { status: res.status, location: loc ? loc.replace("http://lab.test", "") : null }
}

describe("관리자 영역", () => {
  it("쿠키 없이 → /admin/login?next=경로+쿼리", async () => {
    expect(await run("/admin/billing/bills?view=receivable")).toEqual({
      status: 307,
      location: "/admin/login?next=%2Fadmin%2Fbilling%2Fbills%3Fview%3Dreceivable",
    })
  })
  it("/admin 자체는 next 없이", async () => {
    expect((await run("/admin")).location).toBe("/admin/login")
  })
  it("_rsc 내부 파라미터는 next에 넣지 않는다", async () => {
    expect((await run("/admin/rooms?_rsc=abc&room=305")).location).toBe("/admin/login?next=%2Fadmin%2Frooms%3Froom%3D305")
  })
  it("로그인·최초 설정 화면은 통과", async () => {
    expect((await run("/admin/login")).location).toBeNull()
    expect((await run("/admin/login?next=%2Fadmin%2Frooms")).location).toBeNull()
    expect((await run("/admin/setup")).location).toBeNull()
  })
  it("포털 쿠키만 있으면 관리자 로그인으로", async () => {
    expect((await run("/admin", { portal_token: tenant })).location).toBe("/admin/login")
    expect((await run("/admin/rooms", { admin_token: tenant })).location).toBe("/admin/login?next=%2Fadmin%2Frooms")
  })
  it("관리자 토큰(구버전 role 없음 포함)은 통과, 위조는 로그인으로", async () => {
    expect((await run("/admin/rooms", { admin_token: admin })).location).toBeNull()
    expect((await run("/admin/rooms", { admin_token: legacyAdmin })).location).toBeNull()
    expect((await run("/admin/rooms", { admin_token: forged })).location).toBe("/admin/login?next=%2Fadmin%2Frooms")
  })
})

describe("포털 영역", () => {
  it("쿠키 없이 → /portal/login?next=", async () => {
    expect(await run("/portal/bills/87")).toEqual({ status: 307, location: "/portal/login?next=%2Fportal%2Fbills%2F87" })
    expect((await run("/portal")).location).toBe("/portal/login")
  })
  it("관리자 쿠키만 있으면 포털 로그인으로", async () => {
    expect((await run("/portal/bills", { admin_token: admin })).location).toBe("/portal/login?next=%2Fportal%2Fbills")
  })
  it("로그인 상태로 로그인 화면 → 홈(기존 동작) 또는 안전한 next", async () => {
    expect((await run("/portal/login", { portal_token: tenant })).location).toBe("/portal")
    expect((await run("/portal/login?next=%2Fportal%2Fbills%2F87", { portal_token: tenant })).location).toBe("/portal/bills/87")
    expect((await run("/portal/login?next=https%3A%2F%2Fevil.example", { portal_token: tenant })).location).toBe("/portal")
    expect((await run("/portal/login?next=%2F%2Fevil.example", { portal_token: tenant })).location).toBe("/portal")
    expect((await run("/portal/login?next=%2Fadmin", { portal_token: tenant })).location).toBe("/portal")
  })
  it("로그인 화면은 토큰이 없거나 무효면 그대로", async () => {
    expect((await run("/portal/login")).location).toBeNull()
    expect((await run("/portal/login", { portal_token: forged })).location).toBeNull()
  })
  it("must_change_password가 next보다 우선", async () => {
    expect((await run("/portal/bills", { portal_token: mustChange })).location).toBe("/portal/settings")
    expect((await run("/portal/login?next=%2Fportal%2Fbills", { portal_token: mustChange })).location).toBe("/portal/settings")
    expect((await run("/portal/settings", { portal_token: mustChange })).location).toBeNull()
  })
  it("정상 세션은 통과", async () => {
    expect((await run("/portal/bills/87", { portal_token: tenant })).location).toBeNull()
  })
})

describe("matcher", () => {
  it("/api는 포함하지 않는다", () => {
    expect(config.matcher.some((m: string) => m.startsWith("/api"))).toBe(false)
    expect(config.matcher).toEqual(["/admin", "/admin/:path*", "/portal", "/portal/:path*"])
  })
})
