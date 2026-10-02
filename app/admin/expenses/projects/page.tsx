import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { PageHeader } from "@/components/saas"
import { ExpensesNav } from "@/components/admin/expenses/expenses-nav"
import { ProjectManager } from "@/components/admin/expenses/project-manager"
import { EXPENSES_PROJECTS_HELP } from "@/lib/help/expenses-ledger"
import { getSupportContact } from "@/lib/runtime-flags"

// 증빙 처리 > 사업·프로젝트. ?onboarding=1이면 등록 화면을 먼저 연다(증빙 올리기에서 진행 중 프로젝트가 없을 때 보낸다).

export const metadata = { title: "사업·프로젝트" }

export default async function AdminExpenseProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getSession()
  if (!session) redirect("/admin/login")
  const sp = await searchParams
  const onboarding = sp.onboarding === "1"

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="사업·프로젝트"
        breadcrumbs={[{ label: "증빙 처리", href: "/admin/expenses" }, { label: "사업·프로젝트" }]}
        description="사업(정부지원사업 과제)을 등록하고 예산 대비 집행을 확인해요"
        help={EXPENSES_PROJECTS_HELP}
        helpContact={getSupportContact()}
      />
      <ExpensesNav />
      <div className="mt-4">
        <ProjectManager initialOnboarding={onboarding} />
      </div>
    </div>
  )
}
