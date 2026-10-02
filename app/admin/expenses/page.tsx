import Link from "next/link"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { listProjects } from "@/lib/expense-db"
import { hasExpenseAiKey } from "@/lib/expense-ai"
import { listInbox } from "@/lib/expense-inbox"
import type { InboxItem } from "@/lib/expenses"
import { getSupportContact } from "@/lib/runtime-flags"
import { EXPENSES_UPLOAD_HELP } from "@/lib/help/expenses-upload"
import { Button } from "@/components/ui/button"
import { EmptyState, Notice, PageHeader } from "@/components/saas"
import { ExpensesNav } from "@/components/admin/expenses/expenses-nav"
import { PayrollEntryHeaderButton } from "@/components/admin/expenses/payroll-entry"
import { ReceiptUploader, type UploaderProject } from "@/components/admin/expenses/receipt-uploader"

// 증빙 처리 기본 화면 = 증빙 올리기(계획서 4.2.2).
// 활성 프로젝트가 하나도 없으면 먼저 사업·프로젝트 등록(온보딩)으로 보낸다.

async function loadActiveProjects(): Promise<{ ok: true; projects: UploaderProject[] } | { ok: false }> {
  const sql = getDb()
  if (!sql) return { ok: false }
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
    return { ok: false }
  }
}

// 데스크톱 앱이 올린 확인 대기 증빙. 테이블이 아직 없으면(마이그레이션 전) 빈 목록으로 연다.
// 조회에 실패하면 화면은 그대로 열되 "불러오지 못했어요 + 다시 시도"를 보인다(실패를 0건처럼 보이지 않게, 4.0 #7).
async function loadInbox(): Promise<{ items: InboxItem[]; failed: boolean }> {
  const sql = getDb()
  if (!sql) return { items: [], failed: false }
  try {
    return { items: await listInbox(sql, "pending"), failed: false }
  } catch (error) {
    const code = (error as { code?: string } | null)?.code
    if (code === "42P01") return { items: [], failed: false }
    console.error("expenses page: load inbox failed", error)
    return { items: [], failed: true }
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
  const supportContact = getSupportContact()

  return (
    <div className="p-5 md:p-8">
      <PageHeader
        title="증빙 올리기"
        breadcrumbs={[{ label: "증빙 처리" }, { label: "증빙 올리기" }]}
        description="사업비(정부지원사업) 증빙을 올리고 정리해요"
        help={EXPENSES_UPLOAD_HELP}
        helpContact={supportContact}
        className="mb-4"
        secondary={result.ok ? <PayrollEntryHeaderButton projects={result.projects} defaultProjectId={defaultProjectId} /> : undefined}
      />
      <ExpensesNav />
      <div>
        {result.ok && inbox.failed && (
          <Notice
            tone="warning"
            className="mb-3 py-2 text-[15px]"
            action={
              // 대기함은 화면을 처음 열 때 한 번만 채우므로 새로 읽으려면 화면을 다시 연다(저장 안 한 행은 임시 보관돼요)
              <Button asChild variant="outline" size="sm" className="hover:bg-warm-beige">
                <a href="/admin/expenses">다시 시도</a>
              </Button>
            }
          >
            데스크톱 앱에서 온 증빙을 불러오지 못했어요. 확인을 기다리는 증빙이 있을 수 있어요.
          </Notice>
        )}
        {result.ok ? (
          <ReceiptUploader
            projects={result.projects}
            aiReady={hasExpenseAiKey()}
            defaultProjectId={defaultProjectId}
            inbox={inbox.items}
            supportContact={supportContact}
          />
        ) : (
          <EmptyState
            kind="error"
            bordered
            title="증빙 올리기 화면을 열지 못했어요"
            description="진행 중인 프로젝트 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요."
            retryHref="/admin/expenses"
            action={
              <Button asChild variant="outline" size="sm" className="hover:bg-warm-beige">
                <Link href="/admin/expenses/projects">사업·프로젝트로 가기</Link>
              </Button>
            }
          />
        )}
      </div>
    </div>
  )
}
