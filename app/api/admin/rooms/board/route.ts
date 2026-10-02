import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { todayKST } from "@/lib/programs"
import { RECEIVABLE_SQL } from "@/lib/receivables"

// GET /api/admin/rooms/board — 층별 호실 현황 보드
// 상태는 계약에서 파생: active 계약 있음 → 입주중 / ended_at 미래 → 퇴실예정
//   / 없음 → 공실 / rooms.status='maintenance' → 사용불가
// (WP4 추가 필드) 기업별 받을 돈: unpaid_count·unpaid_total — 그 기업의 납부 대기·기한 지남(issued·overdue) 청구서 수·합계,
//   unpaid_late_count — 그중 늦은 것(RECEIVABLE_SQL.isLate: 기한이 지났거나 기한 없이 발행 후 31일 이상),
//   unpaid_past_due_count — 그중 기한이 지난 것(RECEIVABLE_SQL.isPastDue, 청구서 배지 "기한 지남"과 같은 판정).
//   lib/receivables.ts의 RECEIVABLE_SQL과 같은 정의. 기업이 없는 칸은 0. 기존 필드·상태 판정은 그대로다.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const today = todayKST()
    const R = RECEIVABLE_SQL("b", today)
    const rows = await sql`
      SELECT r.id, r.code, r.building, r.floor, r.pyeong, r.status AS room_status,
             c.id AS contract_id, c.tenant_id, t.name AS tenant_name,
             c.pyeong_billed, c.ended_at::text AS ended_at,
             COALESCE(u.unpaid_count, 0)::int AS unpaid_count,
             COALESCE(u.unpaid_total, 0)::bigint AS unpaid_total,
             COALESCE(u.unpaid_late_count, 0)::int AS unpaid_late_count,
             COALESCE(u.unpaid_past_due_count, 0)::int AS unpaid_past_due_count
      FROM rooms r
      LEFT JOIN contracts c ON c.room_id = r.id AND c.status = 'active'
      LEFT JOIN tenants t ON t.id = c.tenant_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS unpaid_count, SUM(b.total_amount) AS unpaid_total,
               COUNT(*) FILTER (WHERE ${sql.unsafe(R.isLate)}) AS unpaid_late_count,
               COUNT(*) FILTER (WHERE ${sql.unsafe(R.isPastDue)}) AS unpaid_past_due_count
        FROM bills b
        WHERE c.tenant_id IS NOT NULL AND b.tenant_id = c.tenant_id AND ${sql.unsafe(R.isReceivable)}
      ) u ON TRUE
      WHERE r.is_active = TRUE
      ORDER BY r.building, r.sort_order, r.code
    `
    const board = rows.map((r) => {
      let state: "occupied" | "vacant" | "leaving" | "maintenance"
      let dday: number | null = null
      if (r.room_status === "maintenance") state = "maintenance"
      else if (!r.contract_id) state = "vacant"
      else if (r.ended_at && r.ended_at >= today) {
        state = "leaving"
        dday = Math.round(
          (Date.parse(`${r.ended_at}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
        )
      } else state = "occupied"
      return {
        id: r.id, code: r.code, building: r.building, floor: r.floor, pyeong: r.pyeong,
        tenant_id: r.tenant_id, tenant_name: r.tenant_name, contract_id: r.contract_id,
        ended_at: r.ended_at, state, dday,
        unpaid_count: Number(r.unpaid_count ?? 0), unpaid_total: Number(r.unpaid_total ?? 0),
        unpaid_late_count: Number(r.unpaid_late_count ?? 0),
        unpaid_past_due_count: Number(r.unpaid_past_due_count ?? 0),
      }
    })
    const total = board.length
    const occupied = board.filter((b) => b.state === "occupied" || b.state === "leaving").length
    const vacant = board.filter((b) => b.state === "vacant").length
    const leaving = board.filter((b) => b.state === "leaving").length
    return NextResponse.json({
      success: true,
      rooms: board,
      summary: { total, occupied, vacant, leaving, occupancy_rate: total > 0 ? Math.round((occupied / total) * 100) : 0 },
    })
  } catch (error) {
    console.error("Rooms board error:", error)
    return NextResponse.json({ success: false, error: "현황을 불러오지 못했습니다" }, { status: 500 })
  }
}
