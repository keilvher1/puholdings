import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { PageHeader } from "@/components/saas"
import { ExpensesNav } from "@/components/admin/expenses/expenses-nav"
import { ReceiptLedger } from "@/components/admin/expenses/receipt-ledger"
import { EXPENSES_LEDGER_HELP } from "@/lib/help/expenses-ledger"
import { getSupportContact } from "@/lib/runtime-flags"

// 증빙 처리 > 증빙 내역(장부). 조회 조건(project_id·from·to·q·doc_type·item·view·receipt)은 화면이 주소에서 직접 읽는다(lib/links receiptsHref).

export const metadata = { title: "증빙 내역" }

export default async function AdminExpenseReceiptsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="증빙 내역"
        breadcrumbs={[{ label: "증빙 처리", href: "/admin/expenses" }, { label: "증빙 내역" }]}
        description="저장한 증빙을 찾아보고, 정산 전에 점검하고, 엑셀·원본으로 내려받아요"
        help={EXPENSES_LEDGER_HELP}
        helpContact={getSupportContact()}
        // 낮은 화면(1280×600 등)에서는 설명 줄을 숨겨 장부 첫 행이 첫 화면에 들어오게(계획서 4.0 #4, 월 마감 화면과 같은 규칙)
        className="lg:[@media(max-height:760px)]:[&>nav]:hidden lg:[@media(max-height:760px)]:[&>p]:hidden"
      />
      <ExpensesNav />
      <div className="mt-4">
        <ReceiptLedger />
      </div>
    </div>
  )
}
