import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidPeriod, prevPeriod, daysInMonthOf, calcBill, decideBillRegen, type BillContractInput, type BillLineData, type ProrateOption } from "@/lib/billing"
import { computeElecContext, factoryChargeByRoom } from "@/lib/billing-db"

interface StoredLine { line_type: string; room_code: string | null; label: string | null; unit_price: string | number | null; amount: string | number }

// 라인 순서까지 포함해 "청구서가 실제로 같은가"를 본다. 금액·단가는 NUMERIC이라 문자열로 오므로 수로 비교.
function sameBill(
  cur: Record<string, unknown>,
  next: { rent_total: number; mgmt_total: number; elec_amount: number; total_amount: number; lines: BillLineData[] },
  manualTotal: number,
): boolean {
  if (Number(cur.rent_total) !== next.rent_total) return false
  if (Number(cur.mgmt_total) !== next.mgmt_total) return false
  if (Number(cur.elec_amount) !== next.elec_amount) return false
  if (Number(cur.total_amount) !== next.total_amount + manualTotal) return false
  const a = (cur.lines as StoredLine[]) ?? []
  if (a.length !== next.lines.length) return false
  const key = (l: { line_type: string; room_code: string | null; label: string | null; unit_price: string | number | null; amount: string | number }) =>
    [l.line_type, l.room_code ?? "", l.label ?? "", l.unit_price == null ? "" : Number(l.unit_price), Number(l.amount)].join("|")
  return a.every((l, i) => key(l) === key(next.lines[i]))
}

// POST /api/admin/billing/bills/generate — { billMonth: 'YYYY-MM', force?: boolean, regenerate_issued?: boolean }
// 청구월 M = M월 임대료 + (M−1)월 전기료. 공실 자동 제외.
// 기본은 draft만 재생성하고 발행(issued/overdue)된 건은 스킵한다.
// regenerate_issued=true면 발행된 건도 초안(draft)으로 되돌려 다시 만든다 — 전기료 파라미터를
// 발행 뒤에 입력한 경우처럼, 재생성하지 않으면 영원히 반영되지 않는 상황을 복구하기 위한 경로.
// 납부 완료(paid)·수기 청구서(is_manual)는 어떤 경우에도 건드리지 않는다.
// 수동 조정 라인(manual)은 재생성 후에도 보존한다.
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const { billMonth, force, regenerate_issued } = await request.json()
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
    // 검침 지침이 아예 없는 달은 readingsFor의 LEFT JOIN이 0으로 채워 사용량 0 → 공장동 전기료 0원이
    // 되는데, 사용량이 음수가 아니라 위의 음수 가드에도 걸리지 않는다. 명시적 확인 없이는 차단.
    const missingReadings = (await sql`
      SELECT m.code FROM meters m
      WHERE NOT EXISTS (SELECT 1 FROM meter_readings r WHERE r.meter_id = m.id AND r.period = ${elecMonth})
      ORDER BY m.sort_order
    `).map((r) => r.code as string)
    if (missingReadings.length > 0 && force !== true) {
      return NextResponse.json({
        success: false,
        needs_force: true,
        error: `${elecMonth} 검침 지침이 없는 계량기가 있습니다(${missingReadings.join(", ")}). 공장동 전기료가 0원으로 계산됩니다. 월 마감 1단계를 먼저 진행하세요.`,
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

    const existing = await sql`
      SELECT tenant_id, status, COALESCE(is_manual, FALSE) AS is_manual FROM bills WHERE period = ${billMonth}
    `
    const billByTenant = new Map(
      existing.map((b) => [b.tenant_id, { status: b.status as string, is_manual: b.is_manual as boolean }]),
    )

    // 기업별 그룹화
    const byTenant = new Map<number, { name: string; contracts: typeof contracts }>()
    for (const c of contracts) {
      if (!byTenant.has(c.tenant_id)) byTenant.set(c.tenant_id, { name: c.tenant_name, contracts: [] })
      byTenant.get(c.tenant_id)!.contracts.push(c)
    }

    // 청구 대상에서 빠진 기업(퇴실·공실 처리 등)의 기존 draft 자동 정리.
    // 수기 청구서(is_manual)는 의도적 발행이므로 보존, 발행(issued+)된 건 건드리지 않음.
    // issued_at IS NULL 조건: 한 번이라도 발행됐다가 재생성으로 초안이 된 건은 자동 삭제하지 않는다
    // (그 사이 계약이 종료되면 이미 나간 청구서가 조용히 사라져 버린다).
    // 청구 대상이 0건이면 ANY(빈 배열)이 항상 거짓이라 그 달 초안이 전부 지워지므로 정리 자체를 건너뛴다.
    const billableTenantIds = [...byTenant.keys()]
    const removedRows = billableTenantIds.length === 0 ? [] : await sql`
      DELETE FROM bills
      WHERE period = ${billMonth} AND status = 'draft'
        AND COALESCE(is_manual, FALSE) = FALSE
        AND issued_at IS NULL
        AND NOT (tenant_id = ANY(${billableTenantIds}))
      RETURNING tenant_id
    `
    const removed = removedRows.length

    let created = 0
    let regenerated = 0
    let reissued = 0 // 발행 상태에서 초안으로 되돌려 재생성한 건수
    let reissuable = 0 // regenerate_issued=true로 재생성 가능한(지금은 스킵된) 건수
    let elecSum = 0 // 이번에 생성·재생성된 청구서의 전기료 합계
    const skipped: { tenant_name: string; reason: string }[] = []
    const unmappedMetered: string[] = [] // 계량기에 매핑되지 않아 전기료 0원이 된 검침 계약

    for (const [tenantId, group] of byTenant) {
      const prev = billByTenant.get(tenantId)
      const decision = decideBillRegen(prev, regenerate_issued === true)
      if (decision.action === "skip") {
        if (decision.reissuable) reissuable++
        skipped.push({ tenant_name: group.name, reason: decision.reason })
        continue
      }
      // 재생성 시 갱신을 허용할 기존 상태. paid·수기는 절대 포함되지 않는다.
      const allowedStatuses = decision.action === "regenerate" ? decision.allowedStatuses : ["draft"]

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

        // 검침 방식인데 공장동 계량기(F101·F102·F103)에 매핑되지 않는 호실은 전기료가 조용히 0원이
        // 된다. 청구는 그대로 진행하되(임대료는 나가야 하므로) 관리자에게 반드시 알린다.
        if (c.elec_method === "metered" && !skipElec && factoryByRoom[c.room_code] === undefined) {
          unmappedMetered.push(`${group.name}(${c.room_code})`)
        }

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

      // 기존 청구서의 수동 조정 라인(오입금 차감 등)은 재생성 후에도 유지.
      // SELECT가 아래 UPSERT 밖이라 다른 관리자의 동시 라인 편집과 겹치면 그 편집이 유실될 수 있으나
      // (neon HTTP 트랜잭션은 read-then-write를 원자화할 수 없음) 단일 관리자 운영이라 허용.
      const manualRows = await sql`
        SELECT l.contract_id, l.room_code, l.label, l.quantity, l.unit_price, l.amount
        FROM bill_lines l JOIN bills b ON b.id = l.bill_id
        WHERE b.tenant_id = ${tenantId} AND b.period = ${billMonth}
          AND b.status = ANY(${allowedStatuses}::text[]) AND l.line_type = 'manual'
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

      // 발행된 건을 되돌릴 때는 "실제로 달라지는" 청구서만 손댄다.
      // 내용이 같은데도 초안→재발행을 태우면 금액이 그대로인 기업에까지 [정정] 메일이 나간다.
      if (prev && prev.status !== "draft") {
        const cur = await sql`
          SELECT b.rent_total, b.mgmt_total, b.elec_amount, b.total_amount,
                 COALESCE(json_agg(json_build_object(
                   'line_type', l.line_type, 'room_code', l.room_code, 'label', l.label,
                   'unit_price', l.unit_price, 'amount', l.amount
                 ) ORDER BY l.id) FILTER (WHERE l.id IS NOT NULL), '[]') AS lines
          FROM bills b LEFT JOIN bill_lines l ON l.bill_id = b.id
          WHERE b.tenant_id = ${tenantId} AND b.period = ${billMonth}
          GROUP BY b.id
        `
        if (cur.length > 0 && sameBill(cur[0], bill, manualTotal)) {
          skipped.push({ tenant_name: group.name, reason: "내용 변경 없음 — 발행 상태 유지" })
          continue
        }
      }

      // 삭제 후 재삽입이 아니라 제자리 UPSERT — bills.id를 유지해야 메일 로그(email_logs.related_id)·
      // 납부기한·메모가 재생성으로 끊기지 않는다. 라인만 통째로 교체한다.
      // 단일 문장이라 원자적이고, WHERE 조건이 걸린 DO UPDATE라 그 사이 paid로 바뀐 건은 갱신되지 않는다.
      const updated = await sql`
        WITH up AS (
          INSERT INTO bills (tenant_id, period, rent_total, mgmt_total, supply_amount, vat_amount, elec_amount, total_amount, status)
          VALUES (${tenantId}, ${billMonth}, ${bill.rent_total}, ${bill.mgmt_total}, ${bill.supply_amount},
                  ${bill.vat_amount}, ${bill.elec_amount}, ${bill.total_amount + manualTotal}, 'draft')
          ON CONFLICT (tenant_id, period) DO UPDATE SET
            rent_total = EXCLUDED.rent_total, mgmt_total = EXCLUDED.mgmt_total,
            supply_amount = EXCLUDED.supply_amount, vat_amount = EXCLUDED.vat_amount,
            elec_amount = EXCLUDED.elec_amount, total_amount = EXCLUDED.total_amount,
            -- issued_at은 지우지 않는다: '한 번 나간 적 있는 청구서'라는 사실이 위 자동 정리의
            -- 보호 조건이자 재발행 시 정정본 판별 근거다. 재발행하면 issue 라우트가 NOW()로 덮는다.
            -- invoice_pathname은 내용이 바뀌어 PDF가 낡았으므로 비운다(재발행 때 새로 생성).
            status = 'draft', invoice_pathname = NULL, updated_at = NOW()
          WHERE bills.status = ANY(${allowedStatuses}::text[])
            AND COALESCE(bills.is_manual, FALSE) = FALSE
          RETURNING id
        ), cleared AS (
          DELETE FROM bill_lines WHERE bill_id IN (SELECT id FROM up)
        ), inserted AS (
          INSERT INTO bill_lines (bill_id, contract_id, room_code, line_type, label, quantity, unit_price, amount)
          SELECT up.id, l.contract_id, l.room_code, l.line_type, l.label, l.quantity, l.unit_price, l.amount
          FROM up, jsonb_to_recordset(${JSON.stringify(bill.lines)}::jsonb)
            AS l(contract_id int, room_code text, line_type text, label text, quantity numeric, unit_price numeric, amount numeric)
          RETURNING bill_id
        )
        SELECT id FROM up
      `
      if (updated.length === 0) {
        // 동시 편집으로 paid/수기로 바뀐 경우 등 — 조용히 넘기지 않고 사유를 남긴다
        skipped.push({ tenant_name: group.name, reason: "다른 작업과 겹쳐 갱신되지 않음 — 다시 시도하세요" })
        continue
      }
      elecSum += bill.elec_amount
      if (!prev) created++
      else if (prev.status === "draft") regenerated++
      else reissued++
    }

    return NextResponse.json({
      success: true,
      bill_month: billMonth,
      elec_month: elecMonth,
      per10_billed: per10Billed,
      elec_sum: elecSum,
      unmapped_metered: unmappedMetered,
      created, regenerated, reissued, reissuable, removed, skipped,
    })
  } catch (error) {
    console.error("Generate bills error:", error)
    return NextResponse.json({ success: false, error: "청구서 생성에 실패했습니다" }, { status: 500 })
  }
}
