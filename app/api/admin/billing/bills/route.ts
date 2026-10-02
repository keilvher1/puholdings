import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidPeriod, isValidDateString } from "@/lib/billing"
import { RECEIVABLE_SQL } from "@/lib/receivables"
import { todayKST, toKstDate } from "@/lib/format"
import { appendBillMemo } from "@/lib/bill-display"

const BILL_STATUSES = ["draft", "issued", "paid", "overdue"] as const

/**
 * 상태 묶음 파라미터 해석. "issued,overdue"처럼 쉼표가 있으면 묶음(알 수 없는 값은 버림), 쉼표가 없으면 null(기존 단일 상태 경로).
 * 묶음이 비면(모두 알 수 없는 값) 빈 배열 — 정정 중만 받거나 0건이 된다.
 */
function parseStatusSet(raw: string | null): string[] | null {
  if (raw === null || !raw.includes(",")) return null
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => (BILL_STATUSES as readonly string[]).includes(s)))]
}

// GET /api/admin/billing/bills?period=&status= — 목록. ?id= 지정 시 단건+라인
// 추가(WP7, 없으면 지금과 동일):
//   status=issued,overdue  쉼표 묶음. 묶음 조건이나 include=correcting이 있으면 LIMIT을 걸지 않는다(받을 돈이 500건 상한에 잘리지 않게, 가드 #22)
//   include=correcting     정정 중(draft + issued_at) 청구서를 함께 돌려준다
//   tenant_id=             그 기업만(지난달 비교·추가 청구 상태 확인)
//   응답 행 필드 추가: bucket·days(lib/receivables.ts와 같은 판정), mail_status·mail_at(발행 메일 최근 결과)
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const { searchParams } = new URL(request.url)
    const id = Number(searchParams.get("id"))
    if (Number.isInteger(id) && id > 0) {
      const bills = await sql`
        SELECT b.*, b.due_date::text AS due_date, t.name AS tenant_name, t.tax_email, t.contact_email
        FROM bills b JOIN tenants t ON t.id = b.tenant_id WHERE b.id = ${id}
      `
      if (bills.length === 0) return NextResponse.json({ success: false, error: "청구서를 찾을 수 없어요" }, { status: 404 })
      const lines = await sql`SELECT * FROM bill_lines WHERE bill_id = ${id} ORDER BY id`
      return NextResponse.json({ success: true, bill: bills[0], lines })
    }

    const period = searchParams.get("period")
    const status = searchParams.get("status")
    const vPeriod = isValidPeriod(period) ? period : null
    const vStatus = ["draft", "issued", "paid", "overdue"].includes(status || "") ? status : null
    const tenantRaw = Number(searchParams.get("tenant_id"))
    const vTenant = Number.isInteger(tenantRaw) && tenantRaw > 0 ? tenantRaw : null
    const statusSet = parseStatusSet(status)
    const includeCorrecting = searchParams.get("include") === "correcting"

    // 받을 돈 구간·경과일(화면 배지와 같은 판정)과 발행 메일 최근 결과 — 기존 열 뒤에 붙는 추가 필드
    const R = RECEIVABLE_SQL("b", todayKST())
    const extra = sql.unsafe(`${R.bucket} AS bucket, ${R.days} AS days`)

    if (statusSet !== null || includeCorrecting) {
      // 묶음 조회 — LIMIT 없음. 정정 중은 include=correcting일 때만 더한다.
      const set = statusSet ?? (vStatus ? [vStatus] : [])
      const rows = await sql`
        SELECT b.*, b.due_date::text AS due_date, t.name AS tenant_name, ${extra},
               m.status AS mail_status, m.created_at AS mail_at
        FROM bills b JOIN tenants t ON t.id = b.tenant_id
        LEFT JOIN (
          SELECT DISTINCT ON (related_id) related_id, status, created_at
          FROM email_logs WHERE related_type = 'bill' AND template_code = 'bill_issued'
          ORDER BY related_id, created_at DESC
        ) m ON m.related_id = b.id
        WHERE (${vPeriod}::text IS NULL OR b.period = ${vPeriod})
          AND (${vTenant}::int IS NULL OR b.tenant_id = ${vTenant})
          AND (
            b.status = ANY(${set}::text[])
            OR (${includeCorrecting} AND ${sql.unsafe(R.isCorrecting)})
          )
        ORDER BY b.period DESC, t.name
      `
      return NextResponse.json({ success: true, bills: rows })
    }

    const rows = await sql`
      SELECT b.*, b.due_date::text AS due_date, t.name AS tenant_name, ${extra},
             m.status AS mail_status, m.created_at AS mail_at
      FROM bills b JOIN tenants t ON t.id = b.tenant_id
      LEFT JOIN (
        SELECT DISTINCT ON (related_id) related_id, status, created_at
        FROM email_logs WHERE related_type = 'bill' AND template_code = 'bill_issued'
        ORDER BY related_id, created_at DESC
      ) m ON m.related_id = b.id
      WHERE (${vPeriod}::text IS NULL OR b.period = ${vPeriod})
        AND (${vStatus}::text IS NULL OR b.status = ${vStatus})
        AND (${vTenant}::int IS NULL OR b.tenant_id = ${vTenant})
      ORDER BY b.period DESC, t.name
      LIMIT 500
    `
    return NextResponse.json({ success: true, bills: rows })
  } catch (error) {
    console.error("List bills error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// PUT /api/admin/billing/bills — { id, memo?, due_date?, mark_paid?, paid_at?, lines? } 또는 { id, mark_unpaid: true }
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const b = await request.json()
    const id = Number(b.id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    const bills = await sql`SELECT id, status FROM bills WHERE id = ${id}`
    if (bills.length === 0) return NextResponse.json({ success: false, error: "청구서를 찾을 수 없어요" }, { status: 404 })
    const bill = bills[0]

    // 납부 처리 취소(WP7 추가) — 잘못 누른 납부 처리를 화면에서 되돌리는 안전장치(계획서 7.1 ③).
    // 납부 완료(paid)만 납부 대기(issued)로, paid_at은 비우고, 메모에 "납부 취소: 오늘(지운 납부일)"을 덧붙인다(기존 메모 유지).
    // 기한 지남 여부는 화면이 날짜로 판정하므로(lib/receivables.ts) overdue로 되돌리는 규칙은 두지 않는다.
    if (b.mark_unpaid === true) {
      if (bill.status !== "paid") {
        return NextResponse.json({ success: false, error: "납부 완료인 청구서만 납부 처리를 취소할 수 있어요" }, { status: 400 })
      }
      const cur = await sql`SELECT memo, paid_at FROM bills WHERE id = ${id}`
      const paidDay = toKstDate(cur[0]?.paid_at ?? null)
      const memo = appendBillMemo(cur[0]?.memo ?? null, `납부 취소: ${todayKST()}${paidDay ? ` (지운 납부일 ${paidDay})` : ""}`)
      // 상태 조건을 UPDATE에 다시 걸어, 그 사이 다른 창에서 바뀐 건은 건드리지 않는다
      const rows = await sql`
        UPDATE bills SET status = 'issued', paid_at = NULL, memo = ${memo}, updated_at = NOW()
        WHERE id = ${id} AND status = 'paid'
        RETURNING id
      `
      if (rows.length === 0) {
        return NextResponse.json({ success: false, error: "납부 완료인 청구서만 납부 처리를 취소할 수 있어요" }, { status: 400 })
      }
      return NextResponse.json({ success: true })
    }

    // 납부 확인 (이체일)
    if (b.mark_paid === true) {
      if (bill.status !== "issued" && bill.status !== "overdue") {
        return NextResponse.json({ success: false, error: "납부 대기·기한 지남인 청구서만 납부 처리할 수 있어요" }, { status: 400 })
      }
      if (isValidDateString(b.paid_at)) {
        const paidAt = `${b.paid_at}T00:00:00Z`
        await sql`UPDATE bills SET status = 'paid', paid_at = ${paidAt}, updated_at = NOW() WHERE id = ${id}`
      } else {
        await sql`UPDATE bills SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = ${id}`
      }
      return NextResponse.json({ success: true })
    }

    // 라인 수정 (draft만) → 합계 재계산
    if (Array.isArray(b.lines)) {
      if (bill.status !== "draft") {
        return NextResponse.json({ success: false, error: "발행한 청구서의 항목은 고칠 수 없어요" }, { status: 400 })
      }
      const cleaned = b.lines
        .map((l: { contract_id?: number; room_code?: string; line_type?: string; label?: string; quantity?: number; unit_price?: number; amount?: number }) => ({
          contract_id: Number.isInteger(Number(l.contract_id)) && Number(l.contract_id) > 0 ? Number(l.contract_id) : null,
          room_code: String(l.room_code ?? "").slice(0, 20) || null,
          line_type: ["rent", "mgmt", "elec_area", "elec_metered", "manual"].includes(String(l.line_type)) ? l.line_type : "manual",
          label: String(l.label ?? "").slice(0, 200),
          quantity: l.quantity == null || l.quantity === ("" as unknown) ? null : Number(l.quantity),
          unit_price: l.unit_price == null || l.unit_price === ("" as unknown) ? null : Number(l.unit_price),
          amount: Math.round(Number(l.amount ?? 0)),
        }))
        .filter((l: { label: string; amount: number }) => l.label && Number.isFinite(l.amount))
      if (cleaned.length === 0) return NextResponse.json({ success: false, error: "항목이 하나 이상 있어야 해요" }, { status: 400 })

      const rentTotal = cleaned.filter((l: { line_type: string }) => l.line_type === "rent").reduce((s: number, l: { amount: number }) => s + l.amount, 0)
      const mgmtTotal = cleaned.filter((l: { line_type: string }) => l.line_type === "mgmt").reduce((s: number, l: { amount: number }) => s + l.amount, 0)
      const elecTotal = cleaned.filter((l: { line_type: string }) => ["elec_area", "elec_metered"].includes(l.line_type)).reduce((s: number, l: { amount: number }) => s + l.amount, 0)
      const manualTotal = cleaned.filter((l: { line_type: string }) => l.line_type === "manual").reduce((s: number, l: { amount: number }) => s + l.amount, 0)
      const gross = rentTotal + mgmtTotal
      // 공급가액은 생성 경로(calcContractCharge)와 동일하게 계약별로 반올림해 합산
      // (전체 합산 후 반올림하면 다중 호실 기업에서 몇 원 어긋날 수 있음)
      const grossByContract = new Map<string, number>()
      for (const l of cleaned as { contract_id: number | null; line_type: string; amount: number }[]) {
        if (l.line_type !== "rent" && l.line_type !== "mgmt") continue
        const key = String(l.contract_id ?? "manual")
        grossByContract.set(key, (grossByContract.get(key) ?? 0) + l.amount)
      }
      let supply = 0
      for (const g of grossByContract.values()) supply += Math.round(g / 1.1)
      const vat = gross - supply
      const total = gross + elecTotal + manualTotal

      await sql.transaction([
        sql`DELETE FROM bill_lines USING bills WHERE bill_lines.bill_id = bills.id AND bills.id = ${id} AND bills.status = 'draft'`,
        sql`
          INSERT INTO bill_lines (bill_id, contract_id, room_code, line_type, label, quantity, unit_price, amount)
          SELECT ${id}, l.contract_id, l.room_code, l.line_type, l.label, l.quantity, l.unit_price, l.amount
          FROM jsonb_to_recordset(${JSON.stringify(cleaned)}::jsonb)
            AS l(contract_id int, room_code text, line_type text, label text, quantity numeric, unit_price numeric, amount numeric)
          WHERE EXISTS (SELECT 1 FROM bills WHERE id = ${id} AND status = 'draft')
        `,
        // manual 라인은 elec_amount에 섞지 않는다 — 전기료 표기(청구서·정산표)가 왜곡되지 않도록 total에만 반영
        sql`UPDATE bills SET rent_total = ${rentTotal}, mgmt_total = ${mgmtTotal}, supply_amount = ${supply},
              vat_amount = ${vat}, elec_amount = ${elecTotal}, total_amount = ${total}, updated_at = NOW()
            WHERE id = ${id} AND status = 'draft'`,
      ])
    }

    if (b.memo !== undefined) await sql`UPDATE bills SET memo = ${b.memo || null}, updated_at = NOW() WHERE id = ${id}`
    if (b.due_date !== undefined && isValidDateString(b.due_date)) {
      await sql`UPDATE bills SET due_date = ${b.due_date}, updated_at = NOW() WHERE id = ${id}`
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Update bill error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}
