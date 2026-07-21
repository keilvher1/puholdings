import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { Mail, MailOpen } from "lucide-react"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { InquiryActions } from "@/components/admin/inquiry-actions"

async function getInquiries() {
  const sql = getDb()
  if (!sql) return []
  try {
    const rows = await sql`SELECT * FROM inquiries ORDER BY created_at DESC`
    return rows
  } catch {
    return []
  }
}

export default async function AdminInquiriesPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const inquiries = await getInquiries()

  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader title="문의 관리" description="고객 문의를 확인하고 관리합니다" />

      {(inquiries as any[]).length === 0 ? (
        <div className="rounded-lg border border-warm-tan bg-card p-12 text-center">
          <Mail className="mx-auto h-12 w-12 text-warm-tan" />
          <p className="mt-4 text-sm text-text-secondary">아직 접수된 문의가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(inquiries as any[]).map((inquiry) => (
            <div
              key={inquiry.id}
              className={`rounded-lg border bg-card p-5 transition-colors ${
                inquiry.is_read ? "border-warm-tan" : "border-gold bg-gold/5"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {inquiry.is_read ? (
                      <MailOpen className="h-4 w-4 text-text-secondary" />
                    ) : (
                      <Mail className="h-4 w-4 text-gold" />
                    )}
                    <span className="font-medium text-dark">{inquiry.name}</span>
                    {inquiry.company && (
                      <span className="text-sm text-text-secondary">({inquiry.company})</span>
                    )}
                    {!inquiry.is_read && (
                      <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-medium text-dark">
                        NEW
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-sm text-text-secondary">
                    <span>{inquiry.email}</span>
                    {inquiry.phone && <span>{inquiry.phone}</span>}
                  </div>
                  <p className="mt-3 text-sm text-dark leading-relaxed">{inquiry.message}</p>
                  <p className="mt-2 text-xs text-text-secondary">
                    {new Date(inquiry.created_at).toLocaleString("ko-KR")}
                  </p>
                </div>
                <InquiryActions id={inquiry.id} isRead={inquiry.is_read} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
