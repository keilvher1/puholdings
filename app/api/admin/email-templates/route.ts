import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"

// GET /api/admin/email-templates — 템플릿 목록
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }

  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }

  try {
    const rows = await sql`
      SELECT id, code, name, subject, body_html, updated_at
      FROM email_templates
      ORDER BY id
    `
    return NextResponse.json({ success: true, templates: rows })
  } catch (error) {
    console.error("List email templates error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// PUT /api/admin/email-templates — 템플릿 수정 (code 기준)
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }

  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }

  try {
    const { code, subject, body_html } = await request.json()

    if (!code || !subject || !body_html) {
      return NextResponse.json(
        { success: false, error: "code, 제목, 본문은 필수입니다" },
        { status: 400 }
      )
    }

    const rows = await sql`
      UPDATE email_templates
      SET subject = ${subject}, body_html = ${body_html}, updated_at = NOW()
      WHERE code = ${code}
      RETURNING id, code, name, subject, body_html, updated_at
    `
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "존재하지 않는 템플릿입니다" }, { status: 404 })
    }
    return NextResponse.json({ success: true, template: rows[0] })
  } catch (error) {
    console.error("Update email template error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}
