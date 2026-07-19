import { NextResponse } from "next/server"
import { getSession, createTenantUser } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { sendMail } from "@/lib/mail"

// POST /api/admin/tenants/[id]/account — 포털 계정 발급 (이미 있으면 비밀번호 초기화)
// 임시 비밀번호는 이 응답에서만 노출된다(DB에는 해시만 저장).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }

  try {
    const { id } = await params
    const tenantId = Number(id)
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return NextResponse.json({ success: false, error: "잘못된 기업 id입니다" }, { status: 400 })
    }

    const { email, name } = await request.json()
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ success: false, error: "올바른 이메일을 입력해주세요" }, { status: 400 })
    }

    const result = await createTenantUser(
      tenantId,
      email.trim(),
      typeof name === "string" ? name.trim() || null : null
    )
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    // 계정 안내 메일 발송 (실패해도 발급 자체는 성공으로 처리)
    let mailSent = false
    const sql = getDb()
    if (sql && result.email && result.tempPassword) {
      let tenantName = ""
      try {
        const rows = await sql`SELECT name FROM tenants WHERE id = ${tenantId}`
        tenantName = rows[0]?.name ?? ""
      } catch (error) {
        console.error("Tenant name lookup error:", error)
      }
      const mailResult = await sendMail({
        to: result.email,
        templateCode: "tenant_welcome",
        tenantId,
        related: { type: "tenant_account", id: tenantId },
        vars: {
          tenant_name: tenantName,
          email: result.email,
          temp_password: result.tempPassword,
          portal_url: `${new URL(request.url).origin}/portal/login`,
        },
        // 임시 비밀번호가 email_logs에 평문으로 남지 않도록 마스킹
        redactVarsInLog: ["temp_password"],
      })
      mailSent = mailResult.success
    }

    return NextResponse.json({
      success: true,
      email: result.email,
      temp_password: result.tempPassword,
      mail_sent: mailSent,
    })
  } catch (error) {
    console.error("Issue tenant account error:", error)
    return NextResponse.json({ success: false, error: "계정 발급에 실패했습니다" }, { status: 500 })
  }
}
