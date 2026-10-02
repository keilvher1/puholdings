import { NextResponse } from "next/server"
import { getPortalSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { getPortalBillDetail } from "@/components/portal/screens/portal-data"

// GET /api/portal/bills/[id] — 본인 기업 청구서 상세 (bill_lines 포함)
// 세션의 tenant_id로 스코프하므로 타 기업 청구서 id로는 404가 난다.
// 응답 필드(계획서 4.5.5, 모두 세션 tenant_id 안에서만):
//   bank_info  — 입금 계좌(PDF와 같은 원문 + 분해값, lib/bank-info.ts)
//   previous   — 같은 기업의 바로 앞 발행 청구서(issued·paid·overdue)와 비교 한 줄. 없으면 null
//   정정 중(draft + issued_at)인 본인 청구서는 { success: true, correcting: true }만 준다(금액·라인 없음).
//   그 밖의 draft는 지금처럼 404.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const { id } = await params
    const billId = Number(id)
    if (!Number.isInteger(billId) || billId <= 0) {
      return NextResponse.json({ success: false, error: "잘못된 id입니다" }, { status: 400 })
    }

    const result = await getPortalBillDetail(sql, session.tenant_id, billId)
    if (result.kind === "not_found") {
      return NextResponse.json({ success: false, error: "청구서를 찾을 수 없습니다" }, { status: 404 })
    }
    if (result.kind === "correcting") {
      return NextResponse.json({ success: true, correcting: true })
    }
    return NextResponse.json({
      success: true,
      bill: result.bill,
      lines: result.lines,
      previous: result.previous,
      bank_info: result.bank_info,
    })
  } catch (error) {
    console.error("Portal bill detail error:", error)
    return NextResponse.json({ success: false, error: "청구서를 불러오지 못했습니다" }, { status: 500 })
  }
}
