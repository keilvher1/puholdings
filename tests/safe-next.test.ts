import { describe, expect, it } from "vitest"
import { safeNext } from "@/lib/safe-next"

// 로그인 뒤 돌아갈 경로 검사 — 다른 사이트·경로 조작은 null(로그인 화면은 기본 경로로 보낸다).

describe("safeNext", () => {
  it("같은 영역의 정상 경로는 경로 + 쿼리를 돌려준다", () => {
    expect(safeNext("/admin/billing/bills?view=receivable", "/admin/")).toBe("/admin/billing/bills?view=receivable")
    expect(safeNext("/portal/bills/87", "/portal/")).toBe("/portal/bills/87")
    expect(safeNext("/admin", "/admin/")).toBe("/admin")
    expect(safeNext("/admin/rooms?room=305&action=movein#x", "/admin/")).toBe("/admin/rooms?room=305&action=movein")
  })
  it("다른 사이트는 막는다", () => {
    expect(safeNext("https://evil.example", "/admin/")).toBeNull()
    expect(safeNext("https://evil.example/admin/x", "/admin/")).toBeNull()
    expect(safeNext("//evil.example", "/admin/")).toBeNull()
    expect(safeNext("//evil.example/admin/", "/admin/")).toBeNull()
    expect(safeNext("/\\evil.example", "/admin/")).toBeNull()
    expect(safeNext("/\\/evil.example", "/portal/")).toBeNull()
    expect(safeNext("%2F%2Fevil.example", "/admin/")).toBeNull()
    expect(safeNext("/%2F%2Fevil.example", "/admin/")).toBeNull()
    expect(safeNext("javascript:alert(1)", "/admin/")).toBeNull()
    expect(safeNext(" /admin/\tx", "/admin/")).toBeNull()
  })
  it("경로 조작·다른 영역·로그인 화면은 막는다", () => {
    expect(safeNext("/admin/../portal", "/admin/")).toBeNull()
    expect(safeNext("/admin/%2e%2e/portal", "/admin/")).toBeNull()
    expect(safeNext("/portal/bills", "/admin/")).toBeNull()
    expect(safeNext("/administrator", "/admin/")).toBeNull()
    expect(safeNext("/admin/login", "/admin/")).toBeNull()
    expect(safeNext("/portal/login?next=/portal", "/portal/")).toBeNull()
  })
  it("빈 값·문자열 아님은 null", () => {
    expect(safeNext(null, "/admin/")).toBeNull()
    expect(safeNext(undefined, "/admin/")).toBeNull()
    expect(safeNext("", "/admin/")).toBeNull()
  })
})
