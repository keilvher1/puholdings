import { NextResponse } from "next/server"
import { getPortalSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { listPortalBills } from "@/components/portal/screens/portal-data"

// GET /api/portal/bills — 본인 기업 청구서 목록 (발행 이후 상태만, draft 제외)
// 데이터 스코프는 요청 파라미터가 아닌 세션의 tenant_id로만 결정한다.
// 행마다 invoice_pathname(PDF가 있을 때만 값)을 같이 준다 — 목록의 행별 [PDF] 버튼용(파일은 /api/file이 소유권을 다시 검사).
export async function GET() {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const rows = await listPortalBills(sql, session.tenant_id)
    return NextResponse.json({ success: true, bills: rows })
  } catch (error) {
    console.error("Portal bills error:", error)
    return NextResponse.json({ success: false, error: "청구서를 불러오지 못했습니다" }, { status: 500 })
  }
}
