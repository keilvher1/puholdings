import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getPortalSession, changeTenantPassword, createPortalToken } from "@/lib/auth"

export async function POST(request: Request) {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }

  try {
    const { current_password, new_password } = await request.json()

    if (!current_password || !new_password) {
      return NextResponse.json(
        { success: false, error: "현재 비밀번호와 새 비밀번호를 입력해주세요" },
        { status: 400 }
      )
    }
    if (typeof new_password !== "string" || new_password.length < 8) {
      return NextResponse.json(
        { success: false, error: "새 비밀번호는 8자 이상이어야 합니다" },
        { status: 400 }
      )
    }

    const result = await changeTenantPassword(session.user_id, current_password, new_password)
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    // must_change_password가 해제된 세션으로 토큰 재발급
    const token = await createPortalToken({ ...session, must_change_password: false })
    const cookieStore = await cookies()
    cookieStore.set("portal_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Portal change password API error:", error)
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다" }, { status: 500 })
  }
}
