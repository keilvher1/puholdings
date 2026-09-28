import Link from "next/link"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { dbErrorMessage, listProjects } from "@/lib/expense-db"
import { hasExpenseAiKey } from "@/lib/expense-ai"
import { listInbox } from "@/lib/expense-inbox"
import type { InboxItem } from "@/lib/expenses"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { ExpensesNav } from "@/components/admin/expenses/expenses-nav"
import { ReceiptUploader, type UploaderProject } from "@/components/admin/expenses/receipt-uploader"
import { EmptyState, Panel } from "@/components/admin/expenses/ui"

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
      reason: dbErrorMessage(error, "사업비 정산 프로젝트 목록을 불러오는 중 오류가 발생했습니다. 잠시 후 새로고침하세요."),
    }
  }
}

// 데스크톱 앱이 올린 확인 대기 증빙. 테이블이 아직 없거나(마이그레이션 전) 조회에 실패하면 빈 목록으로 화면은 그대로 연다.
async function loadInbox(): Promise<InboxItem[]> {
  const sql = getDb()
  if (!sql) return []
  try {
    return await listInbox(sql, "pending")
  } catch (error) {
    const code = (error as { code?: string } | null)?.code
    if (code !== "42P01") console.error("expenses page: load inbox failed", error)
    return []
  }
}

export default async function AdminExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const [result, inbox] = await Promise.all([loadActiveProjects(), loadInbox()])
  // redirect()는 예외로 동작하므로 try/catch 밖에서 호출한다.
  if (result.ok && result.projects.length === 0) redirect("/admin/expenses/projects?onboarding=1")

  const sp = await searchParams
  const rawProject = Array.isArray(sp.project_id) ? sp.project_id[0] : sp.project_id
  const defaultProjectId = rawProject && /^\d+$/.test(rawProject) ? Number(rawProject) : null

  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader title="사업비 정산" />
      <ExpensesNav />
      {result.ok ? (
        <ReceiptUploader
          projects={result.projects}
          aiReady={hasExpenseAiKey()}
          defaultProjectId={defaultProjectId}
          inbox={inbox}
        />
      ) : (
        <Panel>
          <EmptyState
            title="증빙 올리기 화면을 열 수 없습니다"
            description={
              <>
                {result.reason}
                <span className="mt-1 block text-xs text-text-secondary">
                  DB 마이그레이션(2026-expense-01.sql) 적용 여부를 시스템 관리자에게 확인하세요.
                </span>
              </>
            }
            action={
              <Link
                href="/admin/expenses/projects"
                className="inline-flex h-9 items-center rounded-md border border-warm-tan bg-card px-4 text-sm font-medium text-dark hover:bg-warm-beige"
              >
                사업·프로젝트로 이동
              </Link>
            }
          />
        </Panel>
      )}
    </div>
  )
}
