import { put } from "@vercel/blob"
import type { NeonQueryFunction } from "@neondatabase/serverless"
import { prevPeriod } from "./billing"
import { computeElecContext } from "./billing-db"
import { renderInvoicePdf, type InvoicePdfInput, type FactoryDetail } from "./invoice-pdf"

type Sql = NeonQueryFunction<false, false>

const DEFAULT_BANK = "예금주: ㈜포항연합기술지주 / 하나은행 910-910009-44304"

interface LineRow { room_code: string | null; line_type: string; amount: string; unit_price: string | null }

// 청구서 PDF 입력 데이터 구성 (bill → InvoicePdfInput). 미리보기·발행 공용.
export async function buildInvoiceInput(sql: Sql, billId: number): Promise<InvoicePdfInput | null> {
  const bills = await sql`
    SELECT b.id, b.tenant_id, b.period, b.rent_total, b.mgmt_total, b.elec_amount, b.total_amount, t.name AS tenant_name
    FROM bills b JOIN tenants t ON t.id = b.tenant_id WHERE b.id = ${billId}
  `
  if (bills.length === 0) return null
  const bill = bills[0]
  const lines = (await sql`
    SELECT room_code, line_type, amount, unit_price FROM bill_lines WHERE bill_id = ${billId} ORDER BY id
  `) as unknown as LineRow[]

  const elecMonth = prevPeriod(bill.period as string)
  const ctx = await computeElecContext(sql, elecMonth)

  const roomCodes = [...new Set(lines.filter((l) => l.line_type === "rent" && l.room_code).map((l) => l.room_code as string))]
  const elecLines = lines
    .filter((l) => l.line_type === "elec_area" || l.line_type === "elec_metered")
    .map((l) => ({ room_code: l.room_code || "", amount: Number(l.amount), metered: l.line_type === "elec_metered" }))
  const hasMetered = elecLines.some((l) => l.metered)

  // 청구 시점 스냅샷 우선: elec_area 라인의 unit_price가 그때 확정된 10평당 단가.
  // (생성 이후 검침·파라미터가 바뀌어도 PDF가 실제 청구된 값과 어긋나지 않도록)
  const areaLine = lines.find((l) => l.line_type === "elec_area" && l.unit_price != null)
  const per10Billed = areaLine ? Number(areaLine.unit_price) : ctx.allocation.per10Billed

  let factory: FactoryDetail | undefined
  if (hasMetered) {
    const f = ctx.factory
    const half = f.usages.HVAC / 2
    // 금액은 저장된 라인 값 우선(청구 스냅샷), 사용량 내역은 현재 검침 컨텍스트(참고용)
    const storedByRoom = new Map(
      elecLines.filter((l) => l.metered).map((l) => [l.room_code, l.amount]),
    )
    factory = {
      mainUsage: f.usages.MAIN,
      f101: { usage: f.usages.F101, hvacHalf: half, amount: storedByRoom.get("F101") ?? f.F101 },
      f103: { usage: f.usages.F103, hvacHalf: half, amount: storedByRoom.get("F103") ?? f.F103 },
      f102: { amount: storedByRoom.get("F102") ?? f.F102, deduction: f.deduction },
      unitPrice: ctx.unitPrice,
    }
  }

  return {
    tenantName: bill.tenant_name,
    billMonth: bill.period,
    rentMgmt: Number(bill.rent_total) + Number(bill.mgmt_total),
    elecAmount: Number(bill.elec_amount),
    total: Number(bill.total_amount),
    per10Billed,
    roomCodes,
    elecLines,
    bankInfo: process.env.BILLING_BANK_INFO || DEFAULT_BANK,
    issueDate: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10),
    factory,
  }
}

// 청구서 PDF 생성 → Blob(private) 저장 → bills.invoice_pathname 기록.
// 반환: { pathname, buffer } (메일 첨부용). 실패 시 null.
export async function generateAndStoreInvoice(
  sql: Sql,
  billId: number,
): Promise<{ pathname: string; buffer: Buffer } | null> {
  try {
    const input = await buildInvoiceInput(sql, billId)
    if (!input) return null
    const tenantRow = await sql`SELECT tenant_id FROM bills WHERE id = ${billId}`
    const tenantId = tenantRow[0]?.tenant_id
    const buffer = await renderInvoicePdf(input)
    const pathname = `invoices/${input.billMonth}/${tenantId}.pdf`
    const blob = await put(pathname, buffer, { access: "private", contentType: "application/pdf", allowOverwrite: true })
    await sql`UPDATE bills SET invoice_pathname = ${blob.pathname}, updated_at = NOW() WHERE id = ${billId}`
    return { pathname: blob.pathname, buffer }
  } catch (error) {
    console.error("Invoice PDF generation error:", error)
    return null
  }
}
