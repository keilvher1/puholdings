import Link from "next/link"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { dbErrorMessage, listProjects } from "@/lib/expense-db"
import { hasExpenseAiKey } from "@/lib/expense-ai"
import { AdminCard, AdminPageHeader } from "@/components/admin/admin-ui"
import { ExpensesNav } from "@/components/admin/expenses/expenses-nav"
import { ReceiptUploader, type UploaderProject } from "@/components/admin/expenses/receipt-uploader"

// 사업비 정산 기본 화면 = 증빙 올리기.
// 활성 프로젝트가 하나도 없으면 먼저 사업·프로젝트 등록(온보딩)으로 보낸다.

async function loadActiveProjects(): Promise<{ ok: true; projects: UploaderProject[] } | { ok: false; reason: string }> {
  const sql = getDb()
  if (!sql) return { ok: false, reason: "데이터베이스 연결 정보(DATABASE_URL)가 설정되지 않았습니다." }
  try {
    const projects = await listProjects(sql, { activeOnly: true })
    return {
      ok: true,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        program_name: p.program_name,
        agency: p.agency,
        start_date: p.start_date,
        end_date: p.end_date,
        budget_items: p.budget_items.filter((b) => b.name.trim()),
      })),
    }
  } catch (error) {
    console.error("expenses page: load projects failed", error)
    return {
      ok: false,
      reason: dbErrorMessage(error, "사업비 정산 프로젝트 목록을 불러오는 중 오류가 났습니다. 잠시 후 새로고침해 주세요."),
    }
  }
}

export default async function AdminExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const result = await loadActiveProjects()
  // redirect()는 예외로 동작하므로 try/catch 밖에서 호출한다.
  if (result.ok && result.projects.length === 0) redirect("/admin/expenses/projects?onboarding=1")

  const sp = await searchParams
  const rawProject = Array.isArray(sp.project_id) ? sp.project_id[0] : sp.project_id
  const defaultProjectId = rawProject && /^\d+$/.test(rawProject) ? Number(rawProject) : null

  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader
        title="사업비 정산"
        description="영수증·카드전표·세금계산서를 올리면 AI가 표로 정리합니다. 확인·수정하고 프로젝트를 골라 저장하세요."
      />
      <ExpensesNav />
      {result.ok ? (
        <ReceiptUploader
          projects={result.projects}
          aiReady={hasExpenseAiKey()}
          defaultProjectId={defaultProjectId}
        />
      ) : (
        <AdminCard className="px-6 py-10 text-center">
          <p className="text-base font-semibold text-dark">증빙 올리기 화면을 열 수 없습니다</p>
          <p className="mx-auto mt-2 max-w-lg text-sm text-text-secondary [word-break:keep-all]">{result.reason}</p>
          <p className="mx-auto mt-1 max-w-lg text-xs text-text-tertiary [word-break:keep-all]">
            시스템 관리자에게 사업비 정산 DB 마이그레이션(2026-expense-01.sql) 실행 여부를 확인해 달라고 요청하세요.
          </p>
          <Link
            href="/admin/expenses/projects"
            className="mt-5 inline-flex h-9 items-center rounded-md border border-warm-tan bg-card px-4 text-sm font-medium text-dark hover:bg-warm-beige"
          >
            사업·프로젝트 화면으로 가기
          </Link>
        </AdminCard>
      )}
    </div>
  )
}
