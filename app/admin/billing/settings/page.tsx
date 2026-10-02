import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { PageHeader } from "@/components/saas"
import { BillingNav } from "@/components/admin/billing-nav"
import { BillingSettings } from "@/components/admin/billing-settings"
import { loadRatesSummary, type RatesSummary } from "@/components/admin/billing/settings/rates-data"
import { getBillingBankInfo } from "@/lib/bank-info"
import { getSupportContact } from "@/lib/runtime-flags"
import { getAdminTodo } from "@/lib/admin-todo"
import { thisMonthKST } from "@/lib/format"
import { BILLING_SETTINGS_HELP } from "@/lib/help/billing-settings"

// 관리비 정산 > 기준 정보(계획서 4.3.9). 안 탭: 단가·기본값(기본) · 계약 · 호실 · 가져오기·내보내기(?tab=).
// 단가 요약·입금 계좌·작성 중 청구서 여부는 서버에서 읽어 넘긴다(읽기만). 계약·호실 목록은 화면이 API로 읽는다.

export const metadata = { title: "기준 정보" }

export default async function AdminBillingSettingsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")
  const sql = getDb()

  let rates: RatesSummary | null = null
  let draftBills: { billMonth: string; usageMonth: string; count: number } | null = null
  if (sql) {
    try {
      rates = await loadRatesSummary(sql)
    } catch (e) {
      console.error("Billing settings rates error:", e)
    }
    try {
      const todo = await getAdminTodo(sql)
      draftBills = todo.draftBills ? { billMonth: todo.draftBills.billMonth, usageMonth: todo.draftBills.usageMonth, count: todo.draftBills.count } : null
    } catch (e) {
      // 저장 뒤 안내 한 줄에만 쓰므로 실패하면 안내를 빼고 화면은 그대로 그린다
      console.error("Billing settings todo error:", e)
    }
  }
  const supportContact = getSupportContact()

  return (
    <div className="px-4 py-5 sm:p-6 lg:p-8">
      <PageHeader
        title="기준 정보"
        breadcrumbs={[{ label: "관리비 정산", href: "/admin/billing" }, { label: "기준 정보" }]}
        description="단가·계약·호실처럼 매달 관리비 계산에 쓰는 기준 값을 보고 고쳐요"
        help={BILLING_SETTINGS_HELP}
        helpContact={supportContact}
        className="mb-4"
      />
      <BillingNav />
      <BillingSettings
        rates={rates}
        bankText={getBillingBankInfo().text}
        supportContact={supportContact}
        draftBills={draftBills}
        defaultExportMonth={thisMonthKST()}
      />
    </div>
  )
}
