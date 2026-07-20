import { NextResponse } from "next/server"
import { createAdmin, initAdminTable, getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

// 관리자 계정 생성.
// 보안: 관리자가 하나도 없을 때(최초 설치)만 무인증 생성을 허용하고,
// 이미 관리자가 존재하면 로그인된 관리자만 추가 계정을 만들 수 있다.
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

    const sql = getDb()
    if (sql) {
      const existing = await sql`SELECT COUNT(*)::int AS c FROM admins`
      if (Number(existing[0]?.c) > 0) {
        const session = await getSession()
        if (!session) {
          return NextResponse.json(
            { success: false, error: "이미 관리자가 존재합니다. 기존 관리자로 로그인 후 추가할 수 있습니다" },
            { status: 403 }
          )
        }
      }
    }

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
