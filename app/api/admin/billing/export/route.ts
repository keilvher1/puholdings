import { NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidPeriod } from "@/lib/billing"

// GET /api/admin/billing/export?period=YYYY-MM — 월별 정산 xlsx (원본 정산표 열 구성)
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ error: "데이터베이스 연결 실패" }, { status: 500 })
  const period = new URL(request.url).searchParams.get("period")
  if (!isValidPeriod(period)) return NextResponse.json({ error: "period(YYYY-MM)가 필요합니다" }, { status: 400 })

  try {
    // 청구서 + 계약 조인 (호실별 행)
    const rows = await sql`
      SELECT b.id AS bill_id, t.name AS tenant_name, t.business_no,
             bl.room_code, bl.line_type, bl.amount, bl.quantity, bl.unit_price,
             b.rent_total, b.mgmt_total, b.supply_amount, b.vat_amount, b.elec_amount, b.total_amount
      FROM bills b
      JOIN tenants t ON t.id = b.tenant_id
      LEFT JOIN bill_lines bl ON bl.bill_id = b.id
      WHERE b.period = ${period}
      ORDER BY t.name, bl.id
    `

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(`${period} 정산`)
    ws.columns = [
      { header: "순번", key: "no", width: 6 },
      { header: "업체명", key: "name", width: 24 },
      { header: "사업자등록번호", key: "biz", width: 16 },
      { header: "호실", key: "room", width: 10 },
      { header: "부과평형", key: "pyeong", width: 10 },
      { header: "임대료", key: "rent", width: 12 },
      { header: "관리비", key: "mgmt", width: 10 },
      { header: "공급가액", key: "supply", width: 12 },
      { header: "부가세", key: "vat", width: 10 },
      { header: "계(부가세포함)", key: "gross", width: 14 },
      { header: "전기료", key: "elec", width: 12 },
      { header: "합계", key: "total", width: 14 },
    ]
    ws.getRow(1).font = { bold: true }

    // 기업별 그룹핑 → 대표 행 하나에 합계, 호실은 비고로
    const byBill = new Map<number, typeof rows>()
    for (const r of rows) {
      if (!byBill.has(r.bill_id)) byBill.set(r.bill_id, [])
      byBill.get(r.bill_id)!.push(r)
    }

    let no = 1
    let sumRentMgmt = 0
    let sumElec = 0
    let sumTotal = 0
    for (const [, lines] of byBill) {
      const first = lines[0]
      const roomCodes = [...new Set(lines.filter((l) => l.line_type === "rent" && l.room_code).map((l) => l.room_code))]
      const pyeongSum = lines.filter((l) => l.line_type === "rent").reduce((s, l) => s + Number(l.quantity || 0), 0)
      ws.addRow({
        no: no++,
        name: first.tenant_name,
        biz: first.business_no || "",
        room: roomCodes.join(", "),
        pyeong: pyeongSum || "",
        rent: Number(first.rent_total),
        mgmt: Number(first.mgmt_total),
        supply: Number(first.supply_amount),
        vat: Number(first.vat_amount),
        gross: Number(first.rent_total) + Number(first.mgmt_total),
        elec: Number(first.elec_amount),
        total: Number(first.total_amount),
      })
      sumRentMgmt += Number(first.rent_total) + Number(first.mgmt_total)
      sumElec += Number(first.elec_amount)
      sumTotal += Number(first.total_amount)
    }

    // 합계 행
    const totalRow = ws.addRow({ name: "합계", gross: sumRentMgmt, elec: sumElec, total: sumTotal })
    totalRow.font = { bold: true }

    // 숫자 포맷
    ;["rent", "mgmt", "supply", "vat", "gross", "elec", "total"].forEach((key) => {
      ws.getColumn(key).numFmt = "#,##0"
    })

    const buffer = await wb.xlsx.writeBuffer()
    const filename = encodeURIComponent(`정산표_${period}.xlsx`)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } catch (error) {
    console.error("Export error:", error)
    return NextResponse.json({ error: "내보내기에 실패했습니다" }, { status: 500 })
  }
}
