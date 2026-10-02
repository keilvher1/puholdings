import type { Metadata } from "next"
import { getPortalSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { getBillingBankInfo } from "@/lib/bank-info"
import { todayKST } from "@/lib/format"
import { PORTAL_BILLS_HELP } from "@/lib/help/portal"
import { EmptyState, PageHeader } from "@/components/saas"
import { PortalBills } from "@/components/portal/screens/bills"
import { getPortalContactPhone, listPortalBills, type PortalBillListRow } from "@/components/portal/screens/portal-data"

// 포털 청구서 목록(WP8, 계획서 4.5.4). 서버에서 세션 tenant_id로 읽고(발행 이후만), 보기 탭·시트는 클라이언트 본문이 맡는다.
export const metadata: Metadata = { title: "청구서" }

export default async function PortalBillsPage() {
  const session = await getPortalSession()
  if (!session) return null
  const sql = getDb()
  let bills: PortalBillListRow[] | null = null
  if (sql) {
    try {
      bills = await listPortalBills(sql, session.tenant_id)
    } catch (error) {
      console.error("Portal bills page error:", error)
    }
  }
  const phone = await getPortalContactPhone()
  return (
    <div>
      <PageHeader title="청구서" description="달마다 받은 관리비 청구서예요" help={PORTAL_BILLS_HELP} helpContact={`창업보육센터 ${phone}`} />
      {bills === null ? (
        <EmptyState kind="error" bordered title="청구서를 불러오지 못했어요" description="잠시 뒤 새로고침해 주세요." retryHref="/portal/bills" />
      ) : (
        <PortalBills bills={bills} bank={getBillingBankInfo()} today={todayKST()} />
      )}
    </div>
  )
}
