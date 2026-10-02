import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isMailEnabled } from "@/lib/runtime-flags"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { ProgramsManager } from "@/components/admin/programs-manager"

export const metadata = { title: "프로그램" }

// 모집 시작 공지 메일을 받을 곳 수(app/api/admin/programs 공지 발송과 같은 조건: 입주 중 + 이메일 있음).
// 세지 못하면 null — 확인창은 "입주기업 전체"라고 쓴다.
async function countNoticeRecipients(): Promise<number | null> {
  const sql = getDb()
  if (!sql) return null
  try {
    const rows = await sql`
      SELECT COUNT(*)::int AS n FROM tenants t
      LEFT JOIN tenant_users u ON u.tenant_id = t.id
      WHERE t.status = 'active' AND COALESCE(u.email, t.contact_email) IS NOT NULL AND COALESCE(u.email, t.contact_email) <> ''
    `
    return Number(rows[0]?.n) || 0
  } catch (error) {
    console.error("[admin programs] 공지 대상 수 조회 실패:", error)
    return null
  }
}

export default async function AdminProgramsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const recipientCount = await countNoticeRecipients()

  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader title="프로그램" description="지원사업·교육 프로그램 공고와 신청·제출을 관리해요" />
      <ProgramsManager mailEnabled={isMailEnabled()} recipientCount={recipientCount} />
    </div>
  )
}
