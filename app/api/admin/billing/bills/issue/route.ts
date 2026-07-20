import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { sendMail } from "@/lib/mail"
import { generateAndStoreInvoice } from "@/lib/invoice-gen"
import { isValidPeriod, prevPeriod, formatWon } from "@/lib/billing"

function esc(v: string): string {
  return v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

// 청구 내역 HTML 표 (bill_issued 템플릿의 {{lines_html}})
function linesHtml(lines: { label: string; amount: string | number }[]): string {
  const td = 'style="padding:8px 14px;border:1px solid #e8e2d6;"'
  const tdR = 'style="padding:8px 14px;border:1px solid #e8e2d6;text-align:right;"'
  const rows = lines
    .map((l) => `<tr><td ${td}>${esc(l.label)}</td><td ${tdR}>${formatWon(l.amount)}원</td></tr>`)
    .join("")
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">${rows}</table>`
}

// POST /api/admin/billing/bills/issue — { period } 또는 { bill_ids }
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const { period, bill_ids } = await request.json()

    let issued
    if (Array.isArray(bill_ids) && bill_ids.length > 0) {
      const ids = bill_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
      issued = await sql`
        UPDATE bills SET status = 'issued', issued_at = NOW(), updated_at = NOW()
        WHERE id = ANY(${ids}::int[]) AND status = 'draft'
        RETURNING id, tenant_id, period, total_amount, due_date::text AS due_date
      `
    } else if (isValidPeriod(period)) {
      issued = await sql`
        UPDATE bills SET status = 'issued', issued_at = NOW(), updated_at = NOW()
        WHERE period = ${period} AND status = 'draft'
        RETURNING id, tenant_id, period, total_amount, due_date::text AS due_date
      `
    } else {
      return NextResponse.json({ success: false, error: "period 또는 bill_ids가 필요합니다" }, { status: 400 })
    }

    if (issued.length === 0) {
      return NextResponse.json({ success: true, issued: 0, mail: { sent: 0, failed: 0 }, no_email: [] })
    }

    const billIds = issued.map((b) => b.id)
    const tenantIds = issued.map((b) => b.tenant_id)
    const [allLines, tenants] = await Promise.all([
      sql`SELECT bill_id, label, amount FROM bill_lines WHERE bill_id = ANY(${billIds}::int[]) ORDER BY id`,
      sql`SELECT id, name, tax_email, contact_email FROM tenants WHERE id = ANY(${tenantIds}::int[])`,
    ])
    const linesByBill = new Map<number, { label: string; amount: string }[]>()
    for (const l of allLines) {
      const arr = linesByBill.get(l.bill_id) ?? []
      arr.push({ label: l.label, amount: l.amount })
      linesByBill.set(l.bill_id, arr)
    }
    const tenantById = new Map(tenants.map((t) => [t.id, t]))
    const portalUrl = `${new URL(request.url).origin}/portal/login`
    const noEmail: string[] = []
    let sent = 0
    let failed = 0

    // 청구서 PDF는 batch API가 첨부를 지원하지 않아 기업별 개별 발송한다.
    for (const bill of issued) {
      const tenant = tenantById.get(bill.tenant_id)
      if (!tenant) continue
      // 발행 시점에 PDF 생성·저장 (실패해도 발행/메일은 진행)
      const pdf = await generateAndStoreInvoice(sql, bill.id)
      const email = tenant.tax_email || tenant.contact_email
      if (!email) {
        noEmail.push(tenant.name)
        continue
      }
      const result = await sendMail({
        to: email,
        templateCode: "bill_issued",
        tenantId: tenant.id,
        related: { type: "bill", id: bill.id },
        vars: {
          tenant_name: tenant.name,
          bill_month: bill.period,
          amount: formatWon(bill.total_amount),
          due_date: bill.due_date || "-",
          portal_url: portalUrl,
          lines_html: linesHtml(linesByBill.get(bill.id) ?? []),
        },
        rawHtmlVars: ["lines_html"],
        attachments: pdf ? [{ filename: `청구서_${bill.period}_${tenant.name}.pdf`, content: pdf.buffer }] : undefined,
      })
      if (result.success) sent++
      else failed++
    }

    return NextResponse.json({ success: true, issued: issued.length, mail: { sent, failed }, no_email: noEmail, elec_month: prevPeriod(issued[0].period) })
  } catch (error) {
    console.error("Issue bills error:", error)
    return NextResponse.json({ success: false, error: "발행에 실패했습니다" }, { status: 500 })
  }
}
