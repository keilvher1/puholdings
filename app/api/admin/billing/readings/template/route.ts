import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidPeriod, prevPeriod } from "@/lib/billing"

// GET /api/admin/billing/readings/template?period=YYYY-MM
// active 기업 × 검침 항목으로 입력용 xlsx 생성 (전월지침 참고 열 포함)
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
    const period = searchParams.get("period")
    if (!isValidPeriod(period)) {
      return NextResponse.json({ success: false, error: "period(YYYY-MM)가 필요합니다" }, { status: 400 })
    }
    const prev = prevPeriod(period)

    const [tenants, items, prevReadings] = await Promise.all([
      sql`SELECT id, name FROM tenants WHERE status = 'active' ORDER BY room_no NULLS LAST, name`,
      sql`SELECT id, name FROM billing_items WHERE is_metered = TRUE AND is_active = TRUE ORDER BY sort_order, id`,
      sql`SELECT tenant_id, item_id, curr_value FROM meter_readings WHERE period = ${prev}`,
    ])
    const prevMap = new Map(prevReadings.map((r) => [`${r.tenant_id}:${r.item_id}`, Number(r.curr_value)]))

    const aoa: (string | number)[][] = [["기업명", "항목명", "당월지침", "전월지침(참고)"]]
    for (const t of tenants) {
      for (const item of items) {
        aoa.push([t.name, item.name, "", prevMap.get(`${t.id}:${item.id}`) ?? 0])
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws["!cols"] = [{ wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 14 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "검침")
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer

    const filename = encodeURIComponent(`검침입력_${period}.xlsx`)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } catch (error) {
    console.error("Readings template error:", error)
    return NextResponse.json({ success: false, error: "템플릿 생성에 실패했습니다" }, { status: 500 })
  }
}
