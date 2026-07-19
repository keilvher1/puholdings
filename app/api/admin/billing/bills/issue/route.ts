import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { sendBatch, type BatchRecipient } from "@/lib/mail"
import { isValidPeriod, formatWon } from "@/lib/billing"

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

interface BillLineRow {
  label: string
  quantity: string | null
  unit_price: string | null
  amount: string
}

// 청구 항목 내역 HTML 표 (bill_issued 템플릿의 {{lines_html}}에 raw 삽입)
function buildLinesHtml(lines: BillLineRow[], unitByItem: Map<number | null, string | null>, itemIds: (number | null)[]): string {
  const tdLabel = 'style="padding:8px 14px;border:1px solid #e8e2d6;"'
  const tdNum = 'style="padding:8px 14px;border:1px solid #e8e2d6;text-align:right;"'
  const th = 'style="padding:8px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;"'
  const rows = lines
    .map((line, i) => {
      const unit = unitByItem.get(itemIds[i]) || ""
      const detail =
        line.quantity !== null && line.unit_price !== null
          ? `${Number(line.quantity)}${escapeHtml(unit)} × ${formatWon(line.unit_price)}원`
          : "정액"
      return `<tr><td ${tdLabel}>${escapeHtml(line.label)}</td><td ${tdNum}>${detail}</td><td ${tdNum}>${formatWon(line.amount)}원</td></tr>`
    })
    .join("")
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;"><tr><th ${th}>항목</th><th ${th}>산출 내역</th><th ${th}>금액</th></tr>${rows}</table>`
}

// POST /api/admin/billing/bills/issue — { period } 또는 { bill_ids }
// draft 청구서를 issued로 전환하고 각 기업 contact_email로 bill_issued 메일 발송.
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const { period, bill_ids } = await request.json()

    let issued
    if (Array.isArray(bill_ids) && bill_ids.length > 0) {
      const ids = bill_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
      issued = await sql`
        UPDATE bills SET status = 'issued', issued_at = NOW(), updated_at = NOW()
        WHERE id = ANY(${ids}) AND status = 'draft'
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

    // 메일 데이터 준비
    const billIds = issued.map((b) => b.id)
    const tenantIds = issued.map((b) => b.tenant_id)
    const [allLines, tenants, items] = await Promise.all([
      sql`SELECT bill_id, item_id, label, quantity, unit_price, amount FROM bill_lines WHERE bill_id = ANY(${billIds}) ORDER BY id`,
      sql`SELECT id, name, contact_email FROM tenants WHERE id = ANY(${tenantIds})`,
      sql`SELECT id, unit FROM billing_items`,
    ])
    const linesByBill = new Map<number, typeof allLines>()
    for (const line of allLines) {
      const arr = linesByBill.get(line.bill_id) ?? []
      arr.push(line)
      linesByBill.set(line.bill_id, arr)
    }
    const tenantById = new Map(tenants.map((t) => [t.id, t]))
    const unitByItem = new Map<number | null, string | null>(items.map((i) => [i.id as number, i.unit as string | null]))

    const portalUrl = `${new URL(request.url).origin}/portal/login`
    const noEmail: string[] = []
    const recipients: BatchRecipient[] = []

    for (const bill of issued) {
      const tenant = tenantById.get(bill.tenant_id)
      if (!tenant) continue
      if (!tenant.contact_email) {
        noEmail.push(tenant.name)
        continue
      }
      const lines = linesByBill.get(bill.id) ?? []
      recipients.push({
        to: tenant.contact_email,
        tenantId: tenant.id,
        related: { type: "bill", id: bill.id },
        vars: {
          tenant_name: tenant.name,
          bill_month: bill.period,
          amount: formatWon(bill.total_amount),
          due_date: bill.due_date || "-",
          portal_url: portalUrl,
          lines_html: buildLinesHtml(lines as unknown as BillLineRow[], unitByItem, lines.map((l) => l.item_id)),
        },
      })
    }

    const mail = await sendBatch(recipients, "bill_issued", undefined, { rawHtmlVars: ["lines_html"] })

    return NextResponse.json({
      success: true,
      issued: issued.length,
      mail: { sent: mail.sent, failed: mail.failed },
      no_email: noEmail,
    })
  } catch (error) {
    console.error("Issue bills error:", error)
    return NextResponse.json({ success: false, error: "발행에 실패했습니다" }, { status: 500 })
  }
}
