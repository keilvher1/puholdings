import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidPeriod, isValidDateString } from "@/lib/billing"

// GET /api/admin/billing/bills?period=&status= — 목록. ?id= 지정 시 단건 상세(bill_lines 포함)
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (id) {
      const billId = Number(id)
      if (!Number.isInteger(billId) || billId <= 0) {
        return NextResponse.json({ success: false, error: "잘못된 id입니다" }, { status: 400 })
      }
      const bills = await sql`
        SELECT b.*, b.due_date::text AS due_date, t.name AS tenant_name, t.room_no, t.contact_email
        FROM bills b JOIN tenants t ON t.id = b.tenant_id
        WHERE b.id = ${billId}
      `
      if (bills.length === 0) {
        return NextResponse.json({ success: false, error: "존재하지 않는 청구서입니다" }, { status: 404 })
      }
      const lines = await sql`SELECT * FROM bill_lines WHERE bill_id = ${billId} ORDER BY id`
      return NextResponse.json({ success: true, bill: bills[0], lines })
    }

    const period = searchParams.get("period")
    const status = searchParams.get("status")
    const validStatus = ["draft", "issued", "paid", "overdue"].includes(status || "") ? status : null
    const validPeriod = isValidPeriod(period) ? period : null

    const rows =
      validPeriod && validStatus
        ? await sql`
            SELECT b.*, b.due_date::text AS due_date, t.name AS tenant_name, t.room_no, t.contact_email
            FROM bills b JOIN tenants t ON t.id = b.tenant_id
            WHERE b.period = ${validPeriod} AND b.status = ${validStatus}
            ORDER BY t.room_no NULLS LAST, t.name
          `
        : validPeriod
          ? await sql`
              SELECT b.*, b.due_date::text AS due_date, t.name AS tenant_name, t.room_no, t.contact_email
              FROM bills b JOIN tenants t ON t.id = b.tenant_id
              WHERE b.period = ${validPeriod}
              ORDER BY t.room_no NULLS LAST, t.name
            `
          : validStatus
            ? await sql`
                SELECT b.*, b.due_date::text AS due_date, t.name AS tenant_name, t.room_no, t.contact_email
                FROM bills b JOIN tenants t ON t.id = b.tenant_id
                WHERE b.status = ${validStatus}
                ORDER BY b.period DESC, t.name
              `
            : await sql`
                SELECT b.*, b.due_date::text AS due_date, t.name AS tenant_name, t.room_no, t.contact_email
                FROM bills b JOIN tenants t ON t.id = b.tenant_id
                ORDER BY b.period DESC, t.name
                LIMIT 300
              `
    return NextResponse.json({ success: true, bills: rows })
  } catch (error) {
    console.error("List bills error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// PUT /api/admin/billing/bills — 청구서 수정
// body: { id, memo?, due_date?, lines?, mark_paid? }
// - lines 수정은 draft 상태에서만 허용 (합계 재계산)
// - mark_paid는 issued/overdue 상태에서만 허용
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const { id, memo, due_date, lines, mark_paid } = await request.json()
    const billId = Number(id)
    if (!Number.isInteger(billId) || billId <= 0) {
      return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    }

    const bills = await sql`SELECT id, status FROM bills WHERE id = ${billId}`
    if (bills.length === 0) {
      return NextResponse.json({ success: false, error: "존재하지 않는 청구서입니다" }, { status: 404 })
    }
    const bill = bills[0]

    // 납부 확인
    if (mark_paid === true) {
      if (bill.status !== "issued" && bill.status !== "overdue") {
        return NextResponse.json(
          { success: false, error: "발행된 청구서만 납부 확인할 수 있습니다" },
          { status: 400 }
        )
      }
      await sql`UPDATE bills SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = ${billId}`
      return NextResponse.json({ success: true })
    }

    // 라인 수정 (draft만)
    if (Array.isArray(lines)) {
      if (bill.status !== "draft") {
        return NextResponse.json(
          { success: false, error: "발행된 청구서의 항목은 수정할 수 없습니다" },
          { status: 400 }
        )
      }
      const cleaned = lines
        .map((l: { item_id?: number; label?: string; quantity?: number; unit_price?: number; amount?: number }) => ({
          item_id: Number.isInteger(Number(l.item_id)) && Number(l.item_id) > 0 ? Number(l.item_id) : null,
          label: String(l.label ?? "").trim(),
          quantity: l.quantity === null || l.quantity === undefined || l.quantity === ("" as unknown) ? null : Number(l.quantity),
          unit_price: l.unit_price === null || l.unit_price === undefined || l.unit_price === ("" as unknown) ? null : Number(l.unit_price),
          amount: Math.round(Number(l.amount ?? 0)),
        }))
        .filter((l) => l.label && Number.isFinite(l.amount))
      if (cleaned.length === 0) {
        return NextResponse.json({ success: false, error: "항목이 최소 1개 필요합니다" }, { status: 400 })
      }
      const total = cleaned.reduce((sum, l) => sum + l.amount, 0)

      // 트랜잭션 + status='draft' 가드: 처리 중 발행된 청구서를 덮어쓰지 않는다
      const results = await sql.transaction([
        sql`
          DELETE FROM bill_lines USING bills
          WHERE bill_lines.bill_id = bills.id AND bills.id = ${billId} AND bills.status = 'draft'
        `,
        sql`
          INSERT INTO bill_lines (bill_id, item_id, label, quantity, unit_price, amount)
          SELECT ${billId}, l.item_id, l.label, l.quantity, l.unit_price, l.amount
          FROM jsonb_to_recordset(${JSON.stringify(cleaned)}::jsonb)
            AS l(item_id int, label text, quantity numeric, unit_price numeric, amount numeric)
          WHERE EXISTS (SELECT 1 FROM bills WHERE id = ${billId} AND status = 'draft')
        `,
        sql`
          UPDATE bills SET total_amount = ${total}, updated_at = NOW()
          WHERE id = ${billId} AND status = 'draft'
          RETURNING id
        `,
      ])
      const updated = results[2] as { id: number }[]
      if (updated.length === 0) {
        return NextResponse.json(
          { success: false, error: "처리 중 청구서가 발행되어 항목을 수정할 수 없습니다" },
          { status: 409 }
        )
      }
    }

    // 메모 수정 (모든 상태 허용 — 내부 기록용)
    if (memo !== undefined) {
      await sql`UPDATE bills SET memo = ${memo || null}, updated_at = NOW() WHERE id = ${billId}`
    }
    // 납기 수정: 발행 후 변경하면 메일로 안내된 납기와 어긋나므로 draft만 허용
    if (due_date !== undefined) {
      if (!isValidDateString(due_date)) {
        return NextResponse.json({ success: false, error: "올바른 납부 기한이 아닙니다" }, { status: 400 })
      }
      if (bill.status !== "draft") {
        return NextResponse.json(
          { success: false, error: "발행된 청구서의 납기는 수정할 수 없습니다" },
          { status: 400 }
        )
      }
      await sql`UPDATE bills SET due_date = ${due_date}, updated_at = NOW() WHERE id = ${billId}`
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Update bill error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}
