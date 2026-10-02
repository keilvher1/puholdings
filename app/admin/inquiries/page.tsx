import { redirect } from "next/navigation"
import Link from "next/link"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { InquiryActions } from "@/components/admin/inquiry-actions"
import { EmptyState, StatusBadge } from "@/components/saas"
import { dateTime, relative } from "@/lib/format"
import { inquiriesHref } from "@/lib/links"

// 문의(계획서 3.4·4.1.7). ?status=new면 새 문의만 보여 준다(그 밖의 값은 전체). 상태 배지는 StatusBadge domain="inquiry".
// 조회에 실패하면 빈 목록이 아니라 "불러오지 못했어요"를 보인다.

export const metadata = { title: "문의" }

interface InquiryRow {
  id: number
  name: string
  company: string | null
  email: string
  phone: string | null
  message: string
  created_at: string
  status: string
  is_read: boolean
}

async function getInquiries(onlyNew: boolean): Promise<InquiryRow[] | null> {
  const sql = getDb()
  if (!sql) return null
  try {
    // 운영 스키마(contact_person·company_name·status)를 화면이 쓰는 이름으로 맞춘다.
    const rows = await sql`
      SELECT id,
             contact_person AS name,
             NULLIF(company_name, '') AS company,
             email, phone, message, created_at,
             COALESCE(status, 'new') AS status,
             COALESCE(status, 'new') <> 'new' AS is_read
      FROM inquiries
      WHERE (${onlyNew}::boolean = FALSE OR COALESCE(status, 'new') = 'new')
      ORDER BY created_at DESC
    `
    return rows as InquiryRow[]
  } catch (error) {
    console.error("[admin inquiries] 목록 조회 실패:", error)
    return null
  }
}

export default async function AdminInquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const sp = await searchParams
  const onlyNew = sp.status === "new"
  const inquiries = await getInquiries(onlyNew)

  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-9 items-center rounded-md border px-3 text-[15px] ${
        active ? "border-dark bg-dark font-semibold text-primary-foreground" : "border-warm-tan bg-card text-dark hover:bg-warm-beige"
      }`}
    >
      {label}
    </Link>
  )

  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader title="문의" description="홈페이지로 들어온 문의를 확인해요" />

      <nav aria-label="문의 보기" className="mb-4 flex gap-2">
        {tab(inquiriesHref(), "전체", !onlyNew)}
        {tab(inquiriesHref({ status: "new" }), "새 문의만", onlyNew)}
      </nav>

      {inquiries === null ? (
        <EmptyState kind="error" bordered title="문의를 불러오지 못했어요" description="잠시 뒤 다시 시도해 주세요." retryHref={onlyNew ? inquiriesHref({ status: "new" }) : inquiriesHref()} />
      ) : inquiries.length === 0 ? (
        onlyNew ? (
          <EmptyState kind="no-results" bordered title="새 문의가 없어요" clearHref={inquiriesHref()} clearLabel="전체 문의 보기" />
        ) : (
          <EmptyState bordered title="아직 들어온 문의가 없어요" description="홈페이지 문의하기로 들어오면 여기에 모여요" />
        )
      ) : (
        <ul className="space-y-3">
          {inquiries.map((inquiry) => (
            <li
              key={inquiry.id}
              className={`rounded-md border bg-card p-5 ${inquiry.is_read ? "border-warm-tan" : "border-amber-300"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge domain="inquiry" status={inquiry.status} />
                    <span className="font-medium text-dark">{inquiry.name}</span>
                    {inquiry.company && <span className="text-sm text-text-secondary">({inquiry.company})</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-text-secondary">
                    <span className="break-all">{inquiry.email}</span>
                    {inquiry.phone && <span>{inquiry.phone}</span>}
                  </div>
                  <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-dark [word-break:keep-all]">{inquiry.message}</p>
                  <p className="mt-2 text-sm text-text-secondary" title={dateTime(inquiry.created_at)}>
                    {relative(inquiry.created_at)} · {dateTime(inquiry.created_at)}
                  </p>
                </div>
                <InquiryActions id={inquiry.id} isRead={inquiry.is_read} label={inquiry.company ?? inquiry.name} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
