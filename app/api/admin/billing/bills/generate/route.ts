import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidPeriod, prevPeriod, daysInMonthOf, calcBill, type BillContractInput, type BillLineData, type ProrateOption } from "@/lib/billing"
import { computeElecContext, factoryChargeByRoom } from "@/lib/billing-db"

// POST /api/admin/billing/bills/generate — { billMonth: 'YYYY-MM', force?: boolean }
// 청구월 M = M월 임대료 + (M−1)월 전기료. 공실 자동 제외, 이미 발행(issued+)된 건 스킵.
// draft의 수동 조정 라인(manual)은 재생성 후에도 보존한다.
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const { billMonth, force } = await request.json()
    if (!isValidPeriod(billMonth)) return NextResponse.json({ success: false, error: "billMonth(YYYY-MM)가 필요합니다" }, { status: 400 })
    const elecMonth = prevPeriod(billMonth)
    const billLabel = String(Number(billMonth.slice(5, 7)))
    const elecLabel = String(Number(elecMonth.slice(5, 7)))
    const dim = daysInMonthOf(billMonth)

    const elecCtx = await computeElecContext(sql, elecMonth)
    const per10Billed = elecCtx.allocation.per10Billed
    const factoryByRoom = factoryChargeByRoom(elecCtx.factory)

    // 검침 사용량 음수(당월 지침 누락·오타 등)는 공장동 전기료가 음수로 계산되므로 차단
    const negMeters = Object.entries(elecCtx.factory.usages).filter(([, v]) => v < 0).map(([k]) => k)
    if (negMeters.length > 0) {
      return NextResponse.json({
        success: false,
        error: `${elecMonth} 검침 사용량이 음수인 계량기가 있습니다(${negMeters.join(", ")}). 월 마감 1단계에서 전월·당월 지침을 확인하세요.`,
      }, { status: 400 })
    }
    // 음수 단가(한전 총액 < 공장동 부담 A 등)는 force로도 우회 불가 — 음수 전기료 청구서 원천 차단
    if (per10Billed < 0) {
      return NextResponse.json({
        success: false,
        error: `${elecMonth} 10평당 전기 단가가 음수(${per10Billed}원)로 계산됩니다. 한전 총액이 공장동 부담보다 작지 않은지 2단계 파라미터와 검침을 확인하세요.`,
      }, { status: 400 })
    }
    // 전기 파라미터가 전혀 없으면 전기료 0원 청구서가 조용히 만들어지므로 명시적 확인 없이는 차단
    if (elecCtx.elecTotal === 0 && elecCtx.per10Billed === null && force !== true) {
      return NextResponse.json({
        success: false,
        needs_force: true,
        error: `${elecMonth} 전기료 파라미터(한전 총액·10평당 확정단가)가 입력되지 않아 전기료가 0원으로 계산됩니다. 월 마감 1·2단계를 먼저 진행하세요.`,
      }, { status: 400 })
    }

    // 청구 대상 계약: 진행중 + billMonth에 종료된 계약(마지막달 청구용)
    const contracts = await sql`
      SELECT c.id, c.tenant_id, c.pyeong_billed, c.rent_unit_price, c.mgmt_fee, c.elec_method,
             c.status, c.start_date::text AS start_date, c.ended_at::text AS ended_at,
             c.first_month_billing, c.last_month_billing, r.code AS room_code,
             t.name AS tenant_name
      FROM contracts c
      JOIN rooms r ON r.id = c.room_id
      JOIN tenants t ON t.id = c.tenant_id
      WHERE c.status = 'active'
         OR (c.status = 'ended' AND to_char(c.ended_at, 'YYYY-MM') = ${billMonth})
      ORDER BY c.tenant_id
    `

    const existing = await sql`SELECT tenant_id, status FROM bills WHERE period = ${billMonth}`
    const billByTenant = new Map(existing.map((b) => [b.tenant_id, b.status]))

    // 기업별 그룹화
    const byTenant = new Map<number, { name: string; contracts: typeof contracts }>()
    for (const c of contracts) {
      if (!byTenant.has(c.tenant_id)) byTenant.set(c.tenant_id, { name: c.tenant_name, contracts: [] })
      byTenant.get(c.tenant_id)!.contracts.push(c)
    }

    // 청구 대상에서 빠진 기업(퇴실·공실 처리 등)의 기존 draft 자동 정리.
    // 수기 청구서(is_manual)는 의도적 발행이므로 보존, 발행(issued+)된 건 건드리지 않음.
    const billableTenantIds = [...byTenant.keys()]
    const removedRows = await sql`
      DELETE FROM bills
      WHERE period = ${billMonth} AND status = 'draft'
        AND COALESCE(is_manual, FALSE) = FALSE
        AND NOT (tenant_id = ANY(${billableTenantIds}))
      RETURNING tenant_id
    `
    const removed = removedRows.length

    let created = 0
    let regenerated = 0
    const skipped: { tenant_name: string; reason: string }[] = []

    for (const [tenantId, group] of byTenant) {
      const status = billByTenant.get(tenantId)
      if (status && status !== "draft") {
        skipped.push({ tenant_name: group.name, reason: `이미 ${status} 상태` })
        continue
      }

      const inputs: BillContractInput[] = []
      for (const c of group.contracts) {
        // 일할/제외 판정
        let prorate: ProrateOption | undefined
        let skip = false
        let skipElec = false
        const startsThisMonth = c.start_date && c.start_date.slice(0, 7) === billMonth
        const endsThisMonth = c.ended_at && c.ended_at.slice(0, 7) === billMonth
        if (startsThisMonth) {
          // 첫달 전기료는 전월(입주 전) 사용분이므로 청구하지 않는다 (엑셀 관행: 신규입주 첫 청구는 임대료만)
          skipElec = true
          if (c.first_month_billing === "none") skip = true
          else if (c.first_month_billing === "prorated") {
            const startDay = Number(c.start_date.slice(8, 10))
            prorate = { usedDays: dim - startDay + 1, daysInMonth: dim }
          }
        } else if (endsThisMonth) {
          if (c.last_month_billing === "none") skip = true
          else if (c.last_month_billing === "prorated") {
            const endDay = Number(c.ended_at.slice(8, 10))
            prorate = { usedDays: endDay, daysInMonth: dim }
          }
        }
        if (skip) continue

        inputs.push({
          id: c.id,
          room_code: c.room_code,
          pyeong_billed: Number(c.pyeong_billed),
          rent_unit_price: Number(c.rent_unit_price),
          mgmt_fee: Number(c.mgmt_fee),
          elec_method: c.elec_method,
          metered_elec: c.elec_method === "metered" ? factoryByRoom[c.room_code] ?? 0 : undefined,
          prorate,
          skip_elec: skipElec,
        })
      }

      if (inputs.length === 0) {
        skipped.push({ tenant_name: group.name, reason: "청구할 계약 없음" })
        continue
      }

      const bill = calcBill(inputs, per10Billed, billLabel, elecLabel)

      // 기존 draft의 수동 조정 라인(오입금 차감 등)은 재생성 후에도 유지.
      // SELECT가 아래 트랜잭션 밖이라 다른 관리자의 동시 라인 편집과 겹치면 그 편집이 유실될 수 있으나
      // (neon HTTP 트랜잭션은 read-then-write를 원자화할 수 없음) 단일 관리자 운영이라 허용.
      const manualRows = await sql`
        SELECT l.contract_id, l.room_code, l.label, l.quantity, l.unit_price, l.amount
        FROM bill_lines l JOIN bills b ON b.id = l.bill_id
        WHERE b.tenant_id = ${tenantId} AND b.period = ${billMonth} AND b.status = 'draft' AND l.line_type = 'manual'
        ORDER BY l.id
      `
      const manualLines: BillLineData[] = manualRows.map((l) => ({
        contract_id: l.contract_id == null ? null : Number(l.contract_id),
        room_code: l.room_code == null ? null : String(l.room_code),
        line_type: "manual" as const,
        label: String(l.label ?? "조정"),
        quantity: l.quantity == null ? null : Number(l.quantity),
        unit_price: l.unit_price == null ? null : Number(l.unit_price),
        amount: Number(l.amount),
      }))
      const manualTotal = manualLines.reduce((s, l) => s + l.amount, 0)
      bill.lines.push(...manualLines)

      // 삭제+삽입을 트랜잭션으로 원자화. 동시 generate가 스냅숏을 지나쳐 와도
      // ON CONFLICT DO NOTHING이라 unique 충돌로 500이 나지 않는다(그 기업만 미생성).
      await sql.transaction([
        sql`DELETE FROM bills WHERE tenant_id = ${tenantId} AND period = ${billMonth} AND status = 'draft'`,
        sql`
          WITH b AS (
            INSERT INTO bills (tenant_id, period, rent_total, mgmt_total, supply_amount, vat_amount, elec_amount, total_amount, status)
            VALUES (${tenantId}, ${billMonth}, ${bill.rent_total}, ${bill.mgmt_total}, ${bill.supply_amount},
                    ${bill.vat_amount}, ${bill.elec_amount}, ${bill.total_amount + manualTotal}, 'draft')
            ON CONFLICT (tenant_id, period) DO NOTHING
            RETURNING id
          )
          INSERT INTO bill_lines (bill_id, contract_id, room_code, line_type, label, quantity, unit_price, amount)
          SELECT b.id, l.contract_id, l.room_code, l.line_type, l.label, l.quantity, l.unit_price, l.amount
          FROM b, jsonb_to_recordset(${JSON.stringify(bill.lines)}::jsonb)
            AS l(contract_id int, room_code text, line_type text, label text, quantity numeric, unit_price numeric, amount numeric)
        `,
      ])
      if (status === "draft") regenerated++
      else created++
    }

    return NextResponse.json({
      success: true,
      bill_month: billMonth,
      elec_month: elecMonth,
      per10_billed: per10Billed,
      created, regenerated, removed, skipped,
    })
  } catch (error) {
    console.error("Generate bills error:", error)
    return NextResponse.json({ success: false, error: "청구서 생성에 실패했습니다" }, { status: 500 })
  }
}
