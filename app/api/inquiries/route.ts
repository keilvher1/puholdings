import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, email, phone, company, message } = body

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "필수 항목을 입력해 주세요." },
        { status: 400 }
      )
    }

    const sql = getDb()
    if (!sql) {
      return NextResponse.json(
        { error: "데이터베이스 연결에 실패했습니다." },
        { status: 500 }
      )
    }
    await sql`
      INSERT INTO inquiries (name, email, phone, company, message)
      VALUES (${name}, ${email}, ${phone || null}, ${company || null}, ${message})
    `

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    )
  }
}
