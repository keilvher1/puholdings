import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { sendMail } from "@/lib/mail"
import { generateAndStoreInvoice } from "@/lib/invoice-gen"
import { computeElecContext, factoryChargeByRoom } from "@/lib/billing-db"
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

type Sql = NonNullable<ReturnType<typeof getDb>>

// 발행 대상 초안 중 "전기료가 0원으로 굳어버린" 청구서의 기업명 목록.
// 판정 근거: 사용월 단가가 0보다 큰데 elec_area 라인이 0원이거나(면적별),
// 해당 호실의 공장동 검침 청구액이 0보다 큰데 elec_metered 라인이 0원인 경우.
// 첫달 전기 제외 계약은 애초에 전기 라인이 생성되지 않으므로 오탐이 나지 않는다.
async function findStaleElecBills(sql: Sql, period: unknown, billIds: unknown): Promise<string[]> {
  let targets
  if (Array.isArray(billIds) && billIds.length > 0) {
    const ids = billIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
    if (ids.length === 0) return []
    targets = await sql`SELECT id, period FROM bills WHERE id = ANY(${ids}::int[]) AND status = 'draft'`
  } else if (isValidPeriod(period)) {
    targets = await sql`SELECT id, period FROM bills WHERE period = ${period} AND status = 'draft'`
  } else {
    return []
  }
  if (targets.length === 0) return []

  const names = new Set<string>()
  for (const p of new Set(targets.map((t) => t.period as string))) {
    const ids = targets.filter((t) => t.period === p).map((t) => t.id as number)
    const ctx = await computeElecContext(sql, prevPeriod(p))
    const byRoom = factoryChargeByRoom(ctx.factory)
    const per10 = ctx.allocation.per10Billed
    const meteredRooms = Object.entries(byRoom).filter(([, v]) => v > 0).map(([k]) => k)
    if (per10 <= 0 && meteredRooms.length === 0) continue
    const rows = await sql`
      SELECT DISTINCT t.name
      FROM bill_lines l JOIN bills b ON b.id = l.bill_id JOIN tenants t ON t.id = b.tenant_id
      WHERE l.bill_id = ANY(${ids}::int[]) AND l.amount = 0
        AND (
          (l.line_type = 'elec_area' AND ${per10}::numeric > 0)
          OR (l.line_type = 'elec_metered' AND l.room_code = ANY(${meteredRooms}::text[]))
        )
    `
    for (const r of rows) names.add(r.name as string)
  }
  return [...names]
}

// POST /api/admin/billing/bills/issue — { period } 또는 { bill_ids }, force로 전기료 0원 경고 무시
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const { period, bill_ids, force } = await request.json()

    // 전기료가 반영되지 않은 초안을 그대로 발행하는 사고 방지.
    // 전기 파라미터를 청구서 생성 뒤에 입력하면 초안에는 전기료 0원 라인이 남는데,
    // 발행해 버리면 되돌릴 방법이 없으므로 발행 직전에 한 번 더 막는다.
    if (force !== true) {
      const stale = await findStaleElecBills(sql, period, bill_ids)
      if (stale.length > 0) {
        return NextResponse.json({
          success: false,
          needs_regenerate: true,
          stale,
          error: `${stale.length}개 기업의 청구서에 전기료가 0원으로 들어가 있습니다(${stale.slice(0, 3).join(", ")}${stale.length > 3 ? " 외" : ""}). 전기 파라미터를 입력한 뒤 청구서를 다시 생성하고 발행하세요.`,
        }, { status: 400 })
      }
    }

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
    const [allLines, tenants, priorSends] = await Promise.all([
      sql`SELECT bill_id, label, amount FROM bill_lines WHERE bill_id = ANY(${billIds}::int[]) ORDER BY id`,
      sql`SELECT id, name, tax_email, contact_email FROM tenants WHERE id = ANY(${tenantIds}::int[])`,
      // 한 번 발행 메일이 나갔던 청구서를 다시 발행하는 경우 = 정정본.
      // 재생성이 bills.id를 유지하므로 related_id로 이전 발송 이력을 찾을 수 있다.
      sql`
        SELECT DISTINCT related_id FROM email_logs
        WHERE related_type = 'bill' AND template_code = 'bill_issued' AND status = 'sent'
          AND related_id = ANY(${billIds}::int[])
      `,
    ])
    const alreadySent = new Set(priorSends.map((r) => Number(r.related_id)))
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
    let corrected = 0

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
      const isCorrection = alreadySent.has(bill.id)
      if (isCorrection) corrected++
      const result = await sendMail({
        to: email,
        templateCode: "bill_issued",
        tenantId: tenant.id,
        related: { type: "bill", id: bill.id },
        // 같은 청구서를 다시 발행하는 경우 수신자가 이전 메일과 구분할 수 있도록 제목에 표시
        subjectPrefix: isCorrection ? "[정정] " : undefined,
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

    return NextResponse.json({ success: true, issued: issued.length, corrected, mail: { sent, failed }, no_email: noEmail, elec_month: prevPeriod(issued[0].period) })
  } catch (error) {
    console.error("Issue bills error:", error)
    return NextResponse.json({ success: false, error: "발행에 실패했습니다" }, { status: 500 })
  }
}
