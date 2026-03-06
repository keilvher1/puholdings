import { NextResponse } from "next/server"
import { createAdmin, initAdminTable } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json()

    if (!name || !email || !password) {
      return NextResponse.json({ success: false, error: "모든 필드를 입력해주세요" }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ success: false, error: "비밀번호는 8자 이상이어야 합니다" }, { status: 400 })
    }

    // Ensure table exists
    await initAdminTable()

    const result = await createAdmin(email, password, name)

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Setup API error:", error)
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다" }, { status: 500 })
  }
}
