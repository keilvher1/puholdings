import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { ExpensesNav } from "@/components/admin/expenses/expenses-nav"
import { ProjectManager } from "@/components/admin/expenses/project-manager"

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
    <div className="p-5 md:p-8">
      <AdminPageHeader title="사업비 정산" />
      <ExpensesNav />
      <ProjectManager initialOnboarding={onboarding} />
    </div>
  )
}
