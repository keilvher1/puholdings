import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { getAdminTodo, sidebarBadges } from "@/lib/admin-todo"
import { getBillingBankInfo } from "@/lib/bank-info"
import { getSupportContact, isMailEnabled } from "@/lib/runtime-flags"
import { getSiteContent } from "@/lib/site-content"
import { BILLING_BILLS_HELP } from "@/lib/help/billing-bills"
import { PageHeader, TableSkeleton } from "@/components/saas"
import { BillingNav } from "@/components/admin/billing-nav"
import { AddChargeButton, BillsScreen } from "@/components/admin/billing/bills"
import { DEFAULT_CONTACT, type ContactInfo } from "@/components/sections/footer"

export const metadata = { title: "청구서 · 관리비 정산" }

// 관리비 정산 > 청구서(WP7). 받을 돈(기본)·월별 청구서·작성 중 보기와 상세 시트·일괄 납부·추가 청구는 BillsScreen(클라이언트).
// 서버에서는 세션 확인과 화면이 쓸 설정값(입금 계좌 원문·메일 켜짐·문의처)만 읽어 prop으로 넘긴다.
export default async function AdminBillingBillsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  // 하위 탭 "청구서" 건수 = 사이드바 배지와 같은 값(기한 지남 + 정정 중). 레이아웃이 같은 요청에서 이미 읽어 캐시돼 있다.
  let billsCount: number | null = null
  const sql = getDb()
  if (sql) {
    try {
      billsCount = sidebarBadges(await getAdminTodo(sql)).billing
    } catch {
      billsCount = null
    }
  }
  const bank = getBillingBankInfo()
  const contact = await getSiteContent<ContactInfo>("contact").catch(() => null)
  const phone = contact?.phone || DEFAULT_CONTACT.phone

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="청구서"
        breadcrumbs={[{ label: "관리비 정산", href: "/admin/billing" }, { label: "청구서" }]}
        description="받을 돈을 확인하고, 입금되면 납부 처리해요"
        help={BILLING_BILLS_HELP}
        helpContact={getSupportContact()}
        primary={<AddChargeButton />}
        className="mb-4"
      />
      <BillingNav billsCount={billsCount} />
      <div className="mt-4">
        <Suspense fallback={<TableSkeleton rows={8} columns={6} label="청구서를 불러오는 중…" />}>
          <BillsScreen bank={bank} phone={phone} mailEnabled={isMailEnabled()} />
        </Suspense>
      </div>
    </div>
  )
}
