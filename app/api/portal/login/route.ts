import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { tenantLogin, createPortalToken } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "이메일과 비밀번호를 입력해주세요" }, { status: 400 })
    }

    const result = await tenantLogin(email, password)

    if (!result.success || !result.session) {
      return NextResponse.json({ success: false, error: result.error }, { status: 401 })
    }

    const token = await createPortalToken(result.session)
    const cookieStore = await cookies()

    cookieStore.set("portal_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    })

    return NextResponse.json({
      success: true,
      must_change_password: result.session.must_change_password,
    })
  } catch (error) {
    console.error("Portal login API error:", error)
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다" }, { status: 500 })
  }
}
