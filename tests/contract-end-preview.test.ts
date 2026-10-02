import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"

// 퇴실 정산 미리보기(GET …/end/preview)와 실제 퇴실 처리(POST …/end)의 계산이 같은지 확인한다(local-pg, 계획서 4.3.4).
// - 받을 돈 = 기업 전체 issued·overdue 합, 보증금 = 이 계약 deposit_actual(NULL이면 0), 제안 반환액 = 보증금 − 받을 돈
// - 다중 계약(같은 기업 다른 진행 중 계약), 보증금 NULL, 퇴실 달 정기 청구서 발행 여부, 쿠키 없이 401
// end/route.ts는 고치지 않는다. 이 테스트는 두 라우트 핸들러를 그대로 부른다(세션만 가짜).

let adminSession: { id: number; email: string; name: string } | null = { id: 1, email: "kim@pu.test", name: "김운영" }
vi.mock("@/lib/auth", () => ({
  getSession: async () => adminSession,
  getPortalSession: async () => null,
}))

import { GET as PREVIEW } from "@/app/api/admin/contracts/[id]/end/preview/route"
import { POST as END } from "@/app/api/admin/contracts/[id]/end/route"
import { GET as BOARD } from "@/app/api/admin/rooms/board/route"

const pgAvailable = hasLocalPostgres()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any
async function preview(id: number, endedAt?: string): Promise<{ status: number; json: Json }> {
  const qs = endedAt ? `?ended_at=${endedAt}` : ""
  const res = await PREVIEW(new NextRequest(`http://localhost/api/admin/contracts/${id}/end/preview${qs}`), { params: Promise.resolve({ id: String(id) }) })
  return { status: res.status, json: await res.json() }
}
async function end(id: number, body: Record<string, unknown>): Promise<{ status: number; json: Json }> {
  const res = await END(
    new NextRequest(`http://localhost/api/admin/contracts/${id}/end`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    { params: Promise.resolve({ id: String(id) }) },
  )
  return { status: res.status, json: await res.json() }
}

describe("쿠키 없이 401", () => {
  it("세션이 없으면 preview·board는 401(DB에 닿기 전)", async () => {
    const saved = adminSession
    adminSession = null
    try {
      const r = await preview(1, "2026-10-31")
      expect(r.status).toBe(401)
      expect(r.json.success).toBe(false)
      expect((await BOARD()).status).toBe(401)
    } finally {
      adminSession = saved
    }
  })
})

describe.skipIf(!pgAvailable)("퇴실 정산 미리보기 = 퇴실 처리 계산(local-pg)", () => {
  let pg: LocalPg

  beforeAll(async () => {
    pg = await startLocalPg()
    neonConfig.fetchFunction = pg.fetchFunction
    process.env.DATABASE_URL = pg.databaseUrl
    for (const m of ["2026-saas-01-tenants.sql", "2026-saas-02-emails.sql", "2026-saas-06-billing-v2.sql"]) await applyMigration(pg.conn, `scripts/migrations/${m}`)
  }, 90_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
  })

  beforeEach(async () => {
    await pg.conn.simple(`
      TRUNCATE bill_lines, bills, contracts, rooms, tenants RESTART IDENTITY CASCADE;
      INSERT INTO tenants (id, name) VALUES (1, '(주)은하수랩스'), (2, '(주)모래알AI'), (3, '(주)보증금없음');
      INSERT INTO rooms (id, code, building, floor, pyeong, sort_order) VALUES
        (1, '206', '본관', 2, 12.6, 6), (2, '201', '본관', 2, 10.2, 1), (3, '202', '본관', 2, 10.2, 2), (4, '305', '본관', 3, 12.6, 5);
      INSERT INTO contracts (id, tenant_id, room_id, start_date, pyeong_billed, pyeong_actual, rent_unit_price, mgmt_fee, deposit_standard, deposit_actual, elec_method, status) VALUES
        (1, 1, 1, '2022-11-01', 12.6, 12.6, 21000, 15000, 2520000, 2520000, 'area', 'active'),
        (2, 2, 2, '2024-01-01', 10.2, 10.2, 21000, 15000, 2040000, 2040000, 'area', 'active'),
        (3, 2, 3, '2024-01-01', 10.2, 10.2, 21000, 15000, 2040000, 2040000, 'area', 'active'),
        (4, 3, 4, '2025-01-01', 12.6, 12.6, 21000, 15000, 2520000, NULL, 'area', 'active');
    `)
  })

  async function bill(tenant: number, period: string, status: string, total: number, manual = false) {
    await pg.conn.simple(`
      INSERT INTO bills (tenant_id, period, status, is_manual, issued_at, total_amount)
      VALUES (${tenant}, '${period}', '${status}', ${manual ? "TRUE" : "FALSE"}, ${status === "draft" ? "NULL" : `'${period}-01T10:00:00+09'`}, ${total})
    `)
  }

  async function same(id: number, endedAt: string, body: Record<string, unknown> = {}) {
    const p = await preview(id, endedAt)
    expect(p.status).toBe(200)
    const e = await end(id, { ended_at: endedAt, last_month_billing: "full", ...body })
    expect(e.status).toBe(200)
    expect(p.json.preview.deposit_actual).toBe(e.json.offset.deposit_actual)
    expect(p.json.preview.unpaid_total).toBe(e.json.offset.unpaid_total)
    expect(p.json.preview.suggested_return).toBe(e.json.offset.suggested_return)
    return { p: p.json.preview, e: e.json.offset }
  }

  it("한 계약 기업: 납부 대기·기한 지남만 받을 돈(작성 중·납부 완료 제외), 계산이 end와 같다", async () => {
    await bill(1, "2026-08", "overdue", 300000)
    await bill(1, "2026-09", "issued", 279600)
    await bill(1, "2026-07", "paid", 279600)
    await bill(1, "2026-10", "draft", 279600)
    const { p } = await same(1, "2026-10-31")
    expect(p.unpaid_total).toBe(579600)
    expect(p.unpaid_count).toBe(2)
    expect(p.deposit_actual).toBe(2520000)
    expect(p.deposit_recorded).toBe(true)
    expect(p.suggested_return).toBe(2520000 - 579600)
    expect(p.other_active_contracts).toEqual([])
    expect(p.contract).toMatchObject({ id: 1, tenant_name: "(주)은하수랩스", room_code: "206", status: "active" })
    // 퇴실 달(10월) 정기 청구서는 작성 중 → 발행 안 됨
    expect(p.end_month).toBe("2026-10")
    expect(p.end_month_issued).toBe(false)
    expect(p.end_month_bill).toMatchObject({ status: "draft" })
  })

  it("다중 계약: 받을 돈은 기업 전체, 보증금은 이 계약 것, 다른 진행 중 계약(202호)을 알려 준다", async () => {
    await bill(2, "2026-09", "issued", 500000)
    await bill(2, "2026-08", "overdue", 100000)
    const { p } = await same(2, "2026-10-31")
    expect(p.unpaid_total).toBe(600000)
    expect(p.deposit_actual).toBe(2040000) // 201호 계약 보증금만
    expect(p.other_active_contracts).toEqual([{ id: 3, room_code: "202", building: "본관" }])
    // 201호를 끝낸 뒤 202호를 미리 보면 다른 진행 중 계약이 없다
    const after = await preview(3, "2026-10-31")
    expect(after.json.preview.other_active_contracts).toEqual([])
    expect(after.json.preview.unpaid_total).toBe(600000)
  })

  it("보증금 NULL: 0으로 계산하되 deposit_recorded=false, 음수 제안액도 end와 같다", async () => {
    await bill(3, "2026-09", "issued", 279600)
    const { p, e } = await same(4, "2026-10-31")
    expect(p.deposit_recorded).toBe(false)
    expect(p.deposit_actual).toBe(0)
    expect(p.suggested_return).toBe(-279600)
    expect(e.suggested_return).toBe(-279600)
  })

  it("받을 돈이 보증금보다 많으면 제안액이 음수(end와 같음)", async () => {
    await bill(1, "2026-06", "overdue", 2000000)
    await bill(1, "2026-07", "overdue", 1000000)
    const { p } = await same(1, "2026-10-31")
    expect(p.suggested_return).toBe(2520000 - 3000000)
  })

  it("퇴실 달 정기 청구서가 발행(납부 대기·기한 지남·납부 완료)됐으면 end_month_issued, 수기 청구서는 세지 않는다", async () => {
    await bill(1, "2026-10", "issued", 50000, true) // 수기 발행분
    let r = await preview(1, "2026-10-31")
    expect(r.json.preview.end_month_issued).toBe(false)
    expect(r.json.preview.end_month_bill).toBeNull()
    // (tenant_id, period)는 하나뿐이라 수기를 지우고 정기 발행분으로 바꿔 본다
    await pg.conn.simple(`DELETE FROM bills`)
    await bill(1, "2026-10", "issued", 279600)
    r = await preview(1, "2026-10-31")
    expect(r.json.preview.end_month_issued).toBe(true)
    await pg.conn.simple(`UPDATE bills SET status = 'overdue'`)
    r = await preview(1, "2026-10-31")
    expect(r.json.preview.end_month_issued).toBe(true)
    await pg.conn.simple(`UPDATE bills SET status = 'paid' WHERE is_manual = FALSE`)
    r = await preview(1, "2026-10-31")
    expect(r.json.preview.end_month_issued).toBe(true)
    // 다른 달로 미리 보면 그 달 기준
    r = await preview(1, "2026-11-15")
    expect(r.json.preview.end_month).toBe("2026-11")
    expect(r.json.preview.end_month_issued).toBe(false)
  })

  it("미리보기는 아무것도 바꾸지 않는다(계약 상태·종료일 그대로), 이미 끝난 계약은 status=ended", async () => {
    await preview(1, "2026-10-31")
    const rows = await pg.conn.query(`SELECT status, ended_at::text AS ended_at FROM contracts WHERE id = 1`, [])
    expect(rows.rows[0]).toEqual(["active", null])
    await end(1, { ended_at: "2026-10-31" })
    const r = await preview(1)
    expect(r.json.preview.contract.status).toBe("ended")
    expect(r.json.preview.contract.ended_at).toBe("2026-10-31")
    expect(r.json.preview.end_month).toBeNull()
  })

  it("board: 상태 파생은 그대로, 기업별 받을 돈 건수·합계·늦은 건수 필드가 붙는다(진행 중 계약 없는 칸은 0)", async () => {
    await bill(2, "2026-09", "issued", 500000) // 기한 없음, 발행 9/1 → 발행 후 31일 이상이면 늦음
    await bill(2, "2026-10", "issued", 100000)
    await pg.conn.simple(`UPDATE bills SET issued_at = NOW(), due_date = (NOW() + INTERVAL '10 days')::date WHERE period = '2026-10'`)
    await bill(1, "2026-08", "overdue", 300000)
    await bill(1, "2026-07", "paid", 1)
    await pg.conn.simple(`UPDATE contracts SET ended_at = (NOW() + INTERVAL '20 days')::date WHERE id = 1`)
    const res = await BOARD()
    const d = await res.json()
    expect(res.status).toBe(200)
    const by = Object.fromEntries((d.rooms as Json[]).map((r: Json) => [r.code, r]))
    expect(by["206"]).toMatchObject({ state: "leaving", unpaid_count: 1, unpaid_total: 300000, unpaid_late_count: 1, unpaid_past_due_count: 1 })
    expect(by["201"]).toMatchObject({ state: "occupied", unpaid_count: 2, unpaid_total: 600000 })
    expect(by["202"]).toMatchObject({ unpaid_count: 2, unpaid_total: 600000 }) // 같은 기업 → 같은 값
    expect(by["201"].unpaid_late_count).toBeGreaterThanOrEqual(0)
    // 타일 "기한 지남" 배지는 기한이 지난 건만(기한 없는 9월분·기한 전 10월분은 세지 않는다 — 청구서 배지와 같은 말)
    expect(by["201"].unpaid_past_due_count).toBe(0)
    await end(4, { ended_at: "2026-09-30" })
    const d2 = await (await BOARD()).json()
    const r305 = (d2.rooms as Json[]).find((r: Json) => r.code === "305")
    expect(r305).toMatchObject({ state: "vacant", tenant_id: null, unpaid_count: 0, unpaid_total: 0, unpaid_late_count: 0, unpaid_past_due_count: 0 })
    expect(d2.summary).toMatchObject({ total: 4, vacant: 1 })
  })

  it("잘못된 id는 400, 없는 계약은 404", async () => {
    expect((await preview(0)).status).toBe(400)
    const res = await PREVIEW(new NextRequest("http://localhost/x"), { params: Promise.resolve({ id: "abc" }) })
    expect(res.status).toBe(400)
    expect((await preview(999)).status).toBe(404)
  })

  it("보증금 반환을 기록하면 end의 returned_amount만 달라지고 상계 계산은 같다", async () => {
    await bill(1, "2026-09", "issued", 279600)
    const { e } = await same(1, "2026-10-31", { deposit_returned_amount: "2240400", deposit_returned_at: "2026-11-05" })
    expect(e.returned_amount).toBe(2240400)
    const row = await pg.conn.query(`SELECT deposit_returned_amount, deposit_returned_at::text FROM contracts WHERE id = 1`, [])
    expect(row.rows[0]).toEqual(["2240400", "2026-11-05"])
    // 빈값이면 NULL(0원 기록 안 함, 가드 #12)
    await end(2, { ended_at: "2026-10-31", deposit_returned_amount: "" })
    const row2 = await pg.conn.query(`SELECT deposit_returned_amount FROM contracts WHERE id = 2`, [])
    expect(row2.rows[0]).toEqual([null])
  })
})
