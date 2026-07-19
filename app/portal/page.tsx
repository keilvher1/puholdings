import Link from "next/link"
import { getPortalSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { formatWon } from "@/lib/billing"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Receipt, CalendarRange, ChevronRight } from "lucide-react"

interface DashboardBill {
  id: number
  period: string
  total_amount: string
  status: "issued" | "paid" | "overdue"
  due_date: string | null
}

interface DashboardProgram {
  id: number
  title: string
  application_status: string
  submission_status: string | null
  submit_deadline: string | null
}

async function getProgramSummary(tenantId: number): Promise<DashboardProgram[]> {
  const sql = getDb()
  if (!sql) return []
  try {
    const rows = await sql`
      SELECT p.id, p.title, a.status AS application_status,
             s.status AS submission_status, p.submit_deadline::text AS submit_deadline
      FROM program_applications a
      JOIN programs p ON p.id = a.program_id AND p.status IN ('open', 'closed')
      LEFT JOIN submissions s ON s.program_id = p.id AND s.tenant_id = a.tenant_id
      WHERE a.tenant_id = ${tenantId}
        AND a.status IN ('applied', 'accepted')
      ORDER BY p.submit_deadline NULLS LAST, p.id DESC
      LIMIT 3
    `
    return rows as unknown as DashboardProgram[]
  } catch (error) {
    console.error("Dashboard program summary error:", error)
    return []
  }
}

async function getBillSummary(tenantId: number): Promise<{ latest: DashboardBill | null; unpaid: number }> {
  const sql = getDb()
  if (!sql) return { latest: null, unpaid: 0 }
  try {
    const [latestRows, unpaidRows] = await Promise.all([
      sql`
        SELECT id, period, total_amount, status, due_date::text AS due_date
        FROM bills
        WHERE tenant_id = ${tenantId} AND status IN ('issued', 'paid', 'overdue')
        ORDER BY period DESC
        LIMIT 1
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM bills
        WHERE tenant_id = ${tenantId} AND status IN ('issued', 'overdue')
      `,
    ])
    return {
      latest: (latestRows[0] as DashboardBill | undefined) ?? null,
      unpaid: unpaidRows[0]?.count ?? 0,
    }
  } catch (error) {
    console.error("Dashboard bill summary error:", error)
    return { latest: null, unpaid: 0 }
  }
}

function statusBadge(status: DashboardBill["status"]) {
  if (status === "paid") return <Badge className="bg-green-700 text-white">납부 완료</Badge>
  if (status === "overdue") return <Badge variant="destructive">연체</Badge>
  return <Badge>납부 대기</Badge>
}

export default async function PortalDashboardPage() {
  const session = await getPortalSession()
  const [summary, programs] = session
    ? await Promise.all([getBillSummary(session.tenant_id), getProgramSummary(session.tenant_id)])
    : [{ latest: null, unpaid: 0 }, []]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">대시보드</h1>
        <p className="mt-1 text-sm text-text-secondary">입주기업 포털에 오신 것을 환영합니다</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-gold" />
                청구서
              </span>
              <Link
                href="/portal/bills"
                className="flex items-center gap-0.5 text-xs font-normal text-text-secondary hover:text-dark"
              >
                전체 보기
                <ChevronRight className="h-3 w-3" />
              </Link>
            </CardTitle>
            <CardDescription>관리비 청구 내역</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.latest ? (
              <div className="grid gap-3">
                <Link
                  href={`/portal/bills/${summary.latest.id}`}
                  className="flex items-center justify-between rounded-md border border-warm-tan px-4 py-3 transition-colors hover:bg-warm-beige"
                >
                  <div>
                    <p className="text-sm font-medium text-dark">{summary.latest.period}</p>
                    <p className="text-xs text-text-secondary">
                      납기 {summary.latest.due_date || "-"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-dark">
                      {formatWon(summary.latest.total_amount)}원
                    </span>
                    {statusBadge(summary.latest.status)}
                  </div>
                </Link>
                {summary.unpaid > 0 ? (
                  <p className="text-xs text-destructive">미납 청구서가 {summary.unpaid}건 있습니다</p>
                ) : (
                  <p className="text-xs text-text-secondary">미납 청구서가 없습니다</p>
                )}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-text-secondary">청구 내역이 없습니다</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-gold" />
                프로그램
              </span>
              <Link
                href="/portal/programs"
                className="flex items-center gap-0.5 text-xs font-normal text-text-secondary hover:text-dark"
              >
                전체 보기
                <ChevronRight className="h-3 w-3" />
              </Link>
            </CardTitle>
            <CardDescription>진행 중인 신청과 제출 일정</CardDescription>
          </CardHeader>
          <CardContent>
            {programs.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-secondary">진행 중인 신청이 없습니다</p>
            ) : (
              <div className="grid gap-2">
                {programs.map((p) => {
                  const needsSubmission =
                    p.application_status === "accepted" &&
                    (!p.submission_status || p.submission_status === "resubmit_requested")
                  return (
                    <Link
                      key={p.id}
                      href={`/portal/programs/${p.id}`}
                      className="flex items-center justify-between rounded-md border border-warm-tan px-4 py-3 transition-colors hover:bg-warm-beige"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-dark">{p.title}</p>
                        <p className="text-xs text-text-secondary">
                          {p.application_status === "applied"
                            ? "선정 결과 대기 중"
                            : needsSubmission
                              ? p.submit_deadline
                                ? `제출 마감 ${p.submit_deadline}`
                                : "자료 제출 필요"
                              : "제출 완료"}
                        </p>
                      </div>
                      {needsSubmission ? (
                        <Badge variant="destructive">제출 필요</Badge>
                      ) : p.application_status === "applied" ? (
                        <Badge variant="secondary">신청됨</Badge>
                      ) : (
                        <Badge variant="outline">진행 중</Badge>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
