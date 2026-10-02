import { beforeEach, describe, expect, it, vi } from "vitest"

// 관리자 로그인 라우트 응답 코드(통합 정리, WP1 검토 S17):
//   자격 증명이 틀리면 401(화면: "이메일이나 비밀번호가 맞지 않아요"),
//   DB 없음·조회 오류(lib/auth login의 unavailable)는 500(화면: "지금 로그인할 수 없어요") — 비밀번호 칸을 비우지 않게.

type LoginResult = { success: boolean; error?: string; user?: { id: number; email: string; name: string }; unavailable?: boolean }
let loginResult: LoginResult = { success: false }
const cookieSet = vi.fn()

vi.mock("@/lib/auth", () => ({
  login: async () => loginResult,
  createToken: async () => "token",
}))
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet }),
}))

import { POST } from "@/app/api/admin/login/route"

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))

describe("POST /api/admin/login 응답 코드", () => {
  beforeEach(() => {
    cookieSet.mockClear()
  })

  it("이메일·비밀번호가 비면 400", async () => {
    expect((await post({ email: "", password: "" })).status).toBe(400)
  })

  it("자격 증명이 틀리면 401, 쿠키를 굽지 않는다", async () => {
    loginResult = { success: false, error: "이메일 또는 비밀번호가 올바르지 않습니다" }
    const res = await post({ email: "a@b.c", password: "x" })
    expect(res.status).toBe(401)
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it("DB 없음·조회 오류는 401이 아니라 500", async () => {
    loginResult = { success: false, error: "로그인 중 오류가 발생했습니다", unavailable: true }
    const res = await post({ email: "a@b.c", password: "x" })
    expect(res.status).toBe(500)
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it("성공하면 200 + admin_token 쿠키", async () => {
    loginResult = { success: true, user: { id: 1, email: "a@b.c", name: "관리자" } }
    const res = await post({ email: "a@b.c", password: "x" })
    expect(res.status).toBe(200)
    expect(cookieSet).toHaveBeenCalledWith("admin_token", "token", expect.objectContaining({ httpOnly: true }))
  })
})
