import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { ExpensesNav } from "@/components/admin/expenses/expenses-nav"
import { ReceiptLedger } from "@/components/admin/expenses/receipt-ledger"

export default async function AdminExpenseReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getSession()
  if (!session) redirect("/admin/login")
  const sp = await searchParams
  const raw = typeof sp.project_id === "string" ? Number(sp.project_id) : NaN
  const initialProjectId = Number.isInteger(raw) && raw > 0 ? raw : null

  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader
        title="사업비 정산"
        description="저장된 증빙을 찾아보고 고치며, 엑셀·원본 파일로 내려받습니다"
      />
      <ExpensesNav />
      <ReceiptLedger initialProjectId={initialProjectId} />
    </div>
  )
}
