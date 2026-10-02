import type { Metadata } from "next"
import { getPortalSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { todayKST } from "@/lib/format"
import { PORTAL_PROGRAMS_HELP } from "@/lib/help/portal"
import { EmptyState, PageHeader } from "@/components/saas"
import { PortalPrograms } from "@/components/portal/screens/programs"
import { getPortalContactPhone, listPortalPrograms } from "@/components/portal/screens/portal-data"
import type { PortalProgramRow } from "@/components/portal/screens/portal-model"

// 포털 프로그램 목록(WP8, 계획서 4.5.6). /api/portal/programs 목록과 같은 범위를 서버에서 세션 tenant_id로 읽는다.
export const metadata: Metadata = { title: "프로그램" }

export default async function PortalProgramsPage() {
  const session = await getPortalSession()
  if (!session) return null
  const sql = getDb()
  let programs: PortalProgramRow[] | null = null
  if (sql) {
    try {
      programs = await listPortalPrograms(sql, session.tenant_id)
    } catch (error) {
      console.error("Portal programs page error:", error)
    }
  }
  const phone = await getPortalContactPhone()
  return (
    <div>
      <PageHeader title="프로그램" description="지원사업·교육 프로그램을 신청하고 자료를 내는 곳이에요" help={PORTAL_PROGRAMS_HELP} helpContact={`창업보육센터 ${phone}`} />
      {programs === null ? (
        <EmptyState kind="error" bordered title="프로그램을 불러오지 못했어요" description="잠시 뒤 새로고침해 주세요." retryHref="/portal/programs" />
      ) : (
        <PortalPrograms programs={programs} today={todayKST()} />
      )}
    </div>
  )
}
