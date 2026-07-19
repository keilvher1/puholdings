import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { sendBatch, type BatchRecipient } from "@/lib/mail"
import { formatWon } from "@/lib/billing"
import { todayKST } from "@/lib/programs"

// GET /api/cron/reminders — 매일 00:00 UTC (09:00 KST) 실행 (vercel.json crons)
// ① submit_deadline 3일/1일 전인 open 프로그램에서 accepted인데 미제출(또는 재제출 요청 상태)인
//    기업에 submission_reminder
// ② due_date 3일 전인 issued 청구서에 bill_reminder,
//    due_date가 지난 issued 청구서는 overdue로 전환 + bill_reminder
// 같은 날 같은 대상 중복 발송은 email_logs 조회로 방지한다.

function addDaysKST(days: number): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  // CRON_SECRET 검증 — 미설정이면 항상 401 (안전한 기본값)
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }

  const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin}/portal/login`
  const today = todayKST()
  const in3days = addDaysKST(3)
  const in1day = addDaysKST(1)

  try {
    // 최근 20시간 내 발송 성공 이력 (같은 날 중복 발송 방지 — 매일 1회 실행 기준)
    const recentLogs = await sql`
      SELECT to_email, template_code, related_type, related_id
      FROM email_logs
      WHERE status = 'sent'
        AND template_code IN ('submission_reminder', 'bill_reminder')
        AND created_at > NOW() - INTERVAL '20 hours'
    `
    const alreadySent = new Set(
      recentLogs.map((l) => `${l.template_code}:${l.to_email}:${l.related_type}:${l.related_id}`)
    )

    // ① 제출 마감 리마인더
    const pendingSubmissions = await sql`
      SELECT p.id AS program_id, p.title, p.submit_deadline::text AS submit_deadline,
             t.id AS tenant_id, t.name AS tenant_name,
             COALESCE(u.email, t.contact_email) AS email
      FROM programs p
      JOIN program_applications a ON a.program_id = p.id AND a.status = 'accepted'
      JOIN tenants t ON t.id = a.tenant_id AND t.status = 'active'
      LEFT JOIN tenant_users u ON u.tenant_id = t.id
      LEFT JOIN submissions s ON s.program_id = p.id AND s.tenant_id = t.id
      WHERE p.status = 'open'
        AND p.submit_deadline::text IN (${in3days}, ${in1day})
        AND (s.id IS NULL OR s.status = 'resubmit_requested')
    `
    const submissionRecipients: BatchRecipient[] = []
    for (const row of pendingSubmissions) {
      if (!row.email) continue
      const key = `submission_reminder:${row.email}:program:${row.program_id}`
      if (alreadySent.has(key)) continue
      submissionRecipients.push({
        to: row.email,
        tenantId: row.tenant_id,
        related: { type: "program", id: row.program_id },
        vars: {
          tenant_name: row.tenant_name,
          submission_name: row.title,
          due_date: row.submit_deadline,
          portal_url: portalUrl,
        },
      })
    }
    const submissionMail = await sendBatch(submissionRecipients, "submission_reminder")

    // ② 청구서: 납기 지난 issued → overdue 전환
    const overdueBills = await sql`
      UPDATE bills SET status = 'overdue', updated_at = NOW()
      WHERE status = 'issued' AND due_date IS NOT NULL AND due_date::text < ${today}
      RETURNING id
    `

    // 납기 3일 전 issued + 이번에 overdue로 전환된 청구서에만 리마인더
    // (기존 overdue에 매일 반복 발송하지 않는다)
    const overdueIds = overdueBills.map((b) => b.id)
    const reminderBills = await sql`
      SELECT b.id, b.period, b.total_amount, b.due_date::text AS due_date, b.status,
             t.id AS tenant_id, t.name AS tenant_name, t.contact_email
      FROM bills b
      JOIN tenants t ON t.id = b.tenant_id AND t.status = 'active'
      WHERE (b.status = 'issued' AND b.due_date::text = ${in3days})
         OR (b.id = ANY(${overdueIds}::int[]))
    `
    const billRecipients: BatchRecipient[] = []
    for (const bill of reminderBills) {
      if (!bill.contact_email) continue
      const key = `bill_reminder:${bill.contact_email}:bill:${bill.id}`
      if (alreadySent.has(key)) continue
      billRecipients.push({
        to: bill.contact_email,
        tenantId: bill.tenant_id,
        related: { type: "bill", id: bill.id },
        vars: {
          tenant_name: bill.tenant_name,
          bill_month: bill.period,
          amount: formatWon(bill.total_amount),
          due_date: bill.due_date ?? "-",
          portal_url: portalUrl,
        },
      })
    }
    const billMail = await sendBatch(billRecipients, "bill_reminder")

    return NextResponse.json({
      success: true,
      submission_reminders: { candidates: pendingSubmissions.length, sent: submissionMail.sent, failed: submissionMail.failed },
      marked_overdue: overdueBills.length,
      bill_reminders: { candidates: reminderBills.length, sent: billMail.sent, failed: billMail.failed },
    })
  } catch (error) {
    console.error("Cron reminders error:", error)
    return NextResponse.json({ success: false, error: "리마인더 처리에 실패했습니다" }, { status: 500 })
  }
}
