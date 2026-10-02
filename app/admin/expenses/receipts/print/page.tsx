import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { dbErrorMessage, getProject, listReceipts } from "@/lib/expense-db"
import { EmptyState } from "@/components/saas"
import { ReceiptPrint } from "@/components/admin/expenses/receipt-print"
import { todayKST } from "@/lib/format"
import { receiptsHref } from "@/lib/links"
import { isValidDate, type ExpenseProject, type ExpenseReceipt } from "@/lib/expenses"

// 증빙 인쇄 화면 /admin/expenses/receipts/print?project_id=&from=&to=&layout=1|2|4 (계획서 3.4·4.2.6 L-7).
// 조회 전용. 잘못된 값은 무시하고 기본값으로 연다.

export const metadata = { title: "증빙 인쇄" }

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? ""
}

export default async function ReceiptPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getSession()
  if (!session) redirect("/admin/login")
  const sp = await searchParams
  const rawProject = one(sp.project_id)
  const projectId = /^\d+$/.test(rawProject) ? Number(rawProject) : null
  const from = isValidDate(one(sp.from)) ? one(sp.from) : null
  const to = isValidDate(one(sp.to)) ? one(sp.to) : null

  let project: ExpenseProject | null = null
  let receipts: ExpenseReceipt[] = []
  let error = ""
  const sql = getDb()
  if (!sql) error = "데이터베이스에 연결하지 못했어요. 잠시 뒤 다시 열어 주세요."
  else {
    try {
      project = projectId ? await getProject(sql, projectId) : null
      receipts = await listReceipts(sql, { projectId: project ? project.id : null, from, to })
    } catch (e) {
      console.error("receipt print: load failed", e)
      error = dbErrorMessage(e, "증빙을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.")
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 print:p-0">
      {error ? (
        <EmptyState kind="error" bordered title="인쇄할 증빙을 불러오지 못했어요" description={error} retryHref={receiptsHref({ project_id: projectId, from, to })} retryLabel="증빙 내역으로" />
      ) : receipts.length === 0 ? (
        <EmptyState
          kind="no-results"
          bordered
          title="인쇄할 증빙이 없어요"
          description="프로젝트·기간 조건에 맞는 증빙이 없어요."
          clearHref={receiptsHref({ project_id: projectId })}
          clearLabel="증빙 내역으로"
        />
      ) : (
        <ReceiptPrint project={project} receipts={receipts} from={from} to={to} printedOn={todayKST()} />
      )}
    </div>
  )
}
