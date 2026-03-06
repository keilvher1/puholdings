import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { login, createToken } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "이메일과 비밀번호를 입력해주세요" }, { status: 400 })
    }

    const result = await login(email, password)

    if (!result.success || !result.user) {
      return NextResponse.json({ success: false, error: result.error }, { status: 401 })
    }

    const token = await createToken(result.user)
    const cookieStore = await cookies()
    
    cookieStore.set("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    })

    return NextResponse.json({ success: true, user: result.user })
  } catch (error) {
    console.error("Login API error:", error)
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다" }, { status: 500 })
  }
}
