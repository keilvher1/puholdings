import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidPeriod, prevPeriod } from "@/lib/billing"

// POST /api/admin/billing/readings/import — xlsx 업로드로 검침 일괄 입력
// form-data: file(xlsx), period(YYYY-MM). 1행은 헤더 [기업명, 항목명, 당월지침].
// 기업명/항목명 매칭 실패, 값 오류 행은 errors로 반환하고 나머지는 저장한다.
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
    const formData = await request.formData()
    const file = formData.get("file")
    const period = formData.get("period")
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "파일이 필요합니다" }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "파일이 너무 큽니다 (최대 5MB)" }, { status: 400 })
    }
    if (!isValidPeriod(period)) {
      return NextResponse.json({ success: false, error: "period(YYYY-MM)가 필요합니다" }, { status: 400 })
    }

    const buf = new Uint8Array(await file.arrayBuffer())
    let rows: unknown[][]
    try {
      const wb = XLSX.read(buf, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]
    } catch {
      return NextResponse.json({ success: false, error: "엑셀 파일을 읽을 수 없습니다" }, { status: 400 })
    }
    if (rows.length < 2) {
      return NextResponse.json({ success: false, error: "데이터 행이 없습니다" }, { status: 400 })
    }

    const prev = prevPeriod(period)
    const [tenants, items, currReadings, prevReadings] = await Promise.all([
      sql`SELECT id, name FROM tenants WHERE status = 'active'`,
      sql`SELECT id, name FROM billing_items WHERE is_metered = TRUE AND is_active = TRUE`,
      sql`SELECT tenant_id, item_id, prev_value FROM meter_readings WHERE period = ${period}`,
      sql`SELECT tenant_id, item_id, curr_value FROM meter_readings WHERE period = ${prev}`,
    ])
    const tenantByName = new Map(tenants.map((t) => [String(t.name).trim(), t.id]))
    const itemByName = new Map(items.map((i) => [String(i.name).trim(), i.id]))
    const currPrevMap = new Map(currReadings.map((r) => [`${r.tenant_id}:${r.item_id}`, Number(r.prev_value)]))
    const prevCurrMap = new Map(prevReadings.map((r) => [`${r.tenant_id}:${r.item_id}`, Number(r.curr_value)]))

    let saved = 0
    const errors: { row: number; message: string }[] = []

    // 1행은 헤더
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0 || row.every((c) => c === null || c === undefined || c === "")) continue
      const rowNo = i + 1
      const tenantName = String(row[0] ?? "").trim()
      const itemName = String(row[1] ?? "").trim()
      const rawValue = row[2]

      const tenantId = tenantByName.get(tenantName)
      if (!tenantId) {
        errors.push({ row: rowNo, message: `기업명 매칭 실패: "${tenantName}"` })
        continue
      }
      const itemId = itemByName.get(itemName)
      if (!itemId) {
        errors.push({ row: rowNo, message: `항목명 매칭 실패: "${itemName}"` })
        continue
      }
      const currValue = Number(rawValue)
      if (rawValue === null || rawValue === undefined || rawValue === "" || !Number.isFinite(currValue) || currValue < 0) {
        errors.push({ row: rowNo, message: `당월지침 값이 올바르지 않습니다: "${rawValue}"` })
        continue
      }

      const key = `${tenantId}:${itemId}`
      // 이미 당월 저장분이 있으면 그 prev 유지, 없으면 전월 curr(없으면 0)
      const prevValue = currPrevMap.get(key) ?? prevCurrMap.get(key) ?? 0
      if (currValue < prevValue) {
        errors.push({ row: rowNo, message: `당월지침(${currValue})이 전월지침(${prevValue})보다 작습니다` })
        continue
      }

      try {
        await sql`
          INSERT INTO meter_readings (tenant_id, item_id, period, prev_value, curr_value)
          VALUES (${tenantId}, ${itemId}, ${period}, ${prevValue}, ${currValue})
          ON CONFLICT (tenant_id, item_id, period) DO UPDATE
          SET prev_value = EXCLUDED.prev_value, curr_value = EXCLUDED.curr_value
        `
        saved++
      } catch (error) {
        console.error("Import reading upsert error:", error)
        errors.push({ row: rowNo, message: "저장 실패" })
      }
    }

    return NextResponse.json({ success: true, saved, errors })
  } catch (error) {
    console.error("Readings import error:", error)
    return NextResponse.json({ success: false, error: "업로드 처리에 실패했습니다" }, { status: 500 })
  }
}
