import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"

// GET /api/admin/billing/close-status — 월 마감 상태(조회 전용). getCloseProgress를 감싸 필드만 더한다(계획서 4.4.1·4.4.5).
// 단계 상태는 getCloseProgress와 같아야 하고(새로 고침·홈 한 줄과 같은 값), 메일 결과는 issued_at 이후 로그만 센다.

const auth = vi.hoisted(() => ({ session: null as null | { id: number; email: string } }))
vi.mock("@/lib/auth", () => ({ getSession: async () => auth.session, getPortalSession: async () => null }))

import { GET } from "@/app/api/admin/billing/close-status/route"
import { getDb } from "@/lib/db"
import { getCloseProgress } from "@/lib/admin-todo"
import { getCloseStatus } from "@/components/admin/billing/close/status-query"

const req = (q = "") => new Request(`http://localhost/api/admin/billing/close-status${q}`)

describe("close-status 인증", () => {
  it("쿠키 없이 401", async () => {
    auth.session = null
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect((await res.json()).success).toBe(false)
  })
})

const pgAvailable = hasLocalPostgres()

describe.skipIf(!pgAvailable)("close-status(local-pg)", () => {
  let pg: LocalPg

  beforeAll(async () => {
    pg = await startLocalPg()
    neonConfig.fetchFunction = pg.fetchFunction
    process.env.DATABASE_URL = pg.databaseUrl
    for (const m of ["2026-saas-01-tenants.sql", "2026-saas-02-emails.sql", "2026-saas-06-billing-v2.sql"]) await applyMigration(pg.conn, `scripts/migrations/${m}`)
    await pg.conn.simple(`
      INSERT INTO tenants (id, name, tax_email, contact_email) VALUES
        (1, '(주)솔바람테크', 'tax@sol.example', NULL),
        (2, '은하수랩스', '', 'hi@eunha.example'),
        (3, '너나들이커머스', '', '');
      INSERT INTO rooms (id, code, building, floor, pyeong) VALUES (1, '204', '본관', 2, 10), (2, '205', '본관', 2, 20), (3, '206', '본관', 2, 30);
      INSERT INTO contracts (tenant_id, room_id, start_date, pyeong_billed, rent_unit_price, mgmt_fee, elec_method, status, first_month_billing)
        VALUES (1, 1, '2026-01-01', 10, 21000, 15000, 'area', 'active', 'full'),
               (2, 2, '2026-01-01', 20, 21000, 15000, 'area', 'active', 'full'),
               (3, 3, '2026-10-15', 30, 21000, 15000, 'area', 'active', 'prorated');
    `)
  }, 90_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
  })

  beforeEach(async () => {
    auth.session = { id: 1, email: "admin@example.com" }
    await pg.conn.simple(`TRUNCATE email_logs, bill_lines, bills, meter_readings, billing_periods RESTART IDENTITY CASCADE`)
  })

  const sql = () => getDb()!

  async function readings(period: string, v: { MAIN: number; F101: number; F103: number; HVAC: number }) {
    await pg.conn.simple(`
      INSERT INTO meter_readings (meter_id, period, reading)
      SELECT id, '${period}', CASE code WHEN 'MAIN' THEN ${v.MAIN} WHEN 'F101' THEN ${v.F101} WHEN 'F103' THEN ${v.F103} ELSE ${v.HVAC} END FROM meters
    `)
  }
  async function bill(id: number, tenant: number, period: string, status: string, o: { total?: number; issuedAt?: string | null; due?: string | null; elec?: number } = {}) {
    const issued = o.issuedAt !== undefined ? (o.issuedAt === null ? "NULL" : `'${o.issuedAt}'`) : status === "draft" ? "NULL" : `'${period}-04T14:30:00+09'`
    await pg.conn.simple(`
      INSERT INTO bills (id, tenant_id, period, status, issued_at, total_amount, elec_amount, due_date)
      VALUES (${id}, ${tenant}, '${period}', '${status}', ${issued}, ${o.total ?? 100000}, ${o.elec ?? 10000}, ${o.due ? `'${o.due}'` : "NULL"});
      INSERT INTO bill_lines (bill_id, line_type, label, amount, room_code) VALUES (${id}, 'elec_area', '전기', ${o.elec ?? 10000}, '20${tenant + 3}');
    `)
  }
  // 랩과 같은 모양: 9월분 발행(기한 10월 10일), 10월분 작성 중 3건, 9월 사용분 검침·전기료 확정
  async function labLike() {
    await readings("2026-08", { MAIN: 1000, F101: 100, F103: 100, HVAC: 50 })
    await readings("2026-09", { MAIN: 2000, F101: 300, F103: 200, HVAC: 100 })
    await pg.conn.simple(`
      INSERT INTO billing_periods (period, elec_total, elec_unit_price, area_ratio, per10_billed) VALUES
        ('2026-08', 5570000, 102, 0.70, 132550), ('2026-09', 1000000, 102, 0.70, 103830)
    `)
    await bill(1, 1, "2026-09", "paid", { total: 300000, due: "2026-10-10" })
    await bill(2, 2, "2026-09", "issued", { total: 400000, due: "2026-10-10" })
    await bill(11, 1, "2026-10", "draft", { total: 330000 })
    await bill(12, 2, "2026-10", "draft", { total: 360000 })
    await bill(13, 3, "2026-10", "draft", { total: 150000 })
  }

  async function checksum(): Promise<string> {
    const r = await pg.conn.query(
      `SELECT md5(COALESCE(string_agg(id || status || COALESCE(due_date::text,'') || total_amount || COALESCE(memo,''), ',' ORDER BY id), '')) AS h FROM bills`,
      [],
    )
    return String(r.rows[0][0])
  }

  it("단계 상태는 getCloseProgress와 같고(새로 고침·홈 한 줄과 같은 값) 조회만 한다", async () => {
    await labLike()
    const before = await checksum()
    const progress = await getCloseProgress(sql())
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    const s = body.status
    expect(s.usageMonth).toBe("2026-09")
    expect(s.billMonth).toBe("2026-10")
    expect(s.steps).toEqual(progress.steps)
    expect(s.nextStep).toBe(progress.nextStep)
    expect(s.nextStep).toBe(4)
    expect(s.bills).toEqual(progress.bills)
    expect(await checksum()).toBe(before)
  })

  it("발행 대상 요약: 건수·합계·메일 받을 곳(빈 문자열은 없음으로)·이메일 없음·납부 기한 제안", async () => {
    await labLike()
    const s = await getCloseStatus(sql(), null, "2026-10-01")
    expect(s.issue.count).toBe(3)
    expect(s.issue.billIds.sort()).toEqual([11, 12, 13])
    expect(s.issue.total).toBe(840000)
    expect(s.issue.mailable).toBe(2) // tax '' + contact 있음 → 받을 곳 있음
    expect(s.issue.noEmail).toEqual([{ tenantId: 3, name: "너나들이커머스" }])
    expect(s.issue.dueSuggestion).toBe("2026-11-10") // 지난번 규칙: 청구월 다음 달 10일
    expect(s.issue.withDueDate).toBe(0)
    expect(s.issue.staleElec).toEqual([])
    expect(s.latestIssuedBillMonth).toBe("2026-09")
    expect(s.prevMonthTotal).toBe(700000)
    expect(s.kepco.prevMonthTotal).toBe(5570000)
    expect(s.kepco.prevUnitPrice).toBe(102)
    expect(s.monthNotes["2026-09"]).toBe("작성 중 3건")
    expect(s.monthNotes["2026-08"]).toBe("발행 완료")
    const r13 = s.rows.find((r) => r.billId === 13)!
    expect(r13.prevTotal).toBeNull()
    expect(r13.events).toEqual(["10월 15일 입주 · 일할"])
    expect(s.rows.find((r) => r.billId === 11)!.prevTotal).toBe(300000)
  })

  it("지난 청구월에 일할로 입주한 기업은 '지난달 … 입주 · 일할' 사유가 붙는다(첫 온달이라 크게 오름)", async () => {
    await labLike()
    await bill(21, 3, "2026-11", "draft", { total: 300000 })
    await bill(22, 1, "2026-11", "draft", { total: 330000 })
    const s = await getCloseStatus(sql(), "2026-10", "2026-11-01")
    expect(s.billMonth).toBe("2026-11")
    expect(s.rows.find((r) => r.billId === 21)!.events).toEqual(["지난달 10월 15일 입주 · 일할"])
    expect(s.rows.find((r) => r.billId === 22)!.events).toEqual([])
  })

  it("전기료 0원으로 굳은 발행 대상은 issue 라우트 가드와 같은 판정으로 잡힌다", async () => {
    await labLike()
    await pg.conn.simple(`UPDATE bill_lines SET amount = 0 WHERE bill_id = 12`)
    const s = await getCloseStatus(sql(), "2026-09", "2026-10-01")
    expect(s.issue.staleElec).toEqual(["은하수랩스"])
    expect(s.rows.find((r) => r.billId === 12)!.zeroElec).toBe(true)
  })

  it("메일 결과는 이번 발행(issued_at) 이후 로그만 센다 — 정정 재발행 전 예전 로그가 섞이지 않음", async () => {
    await labLike()
    await pg.conn.simple(`
      INSERT INTO email_logs (to_email, template_code, subject, status, error, related_type, related_id, created_at) VALUES
        ('tax@sol.example', 'bill_issued', 's', 'sent', NULL, 'bill', 1, '2026-09-01T10:00:00+09'),
        ('tax@sol.example', 'bill_issued', 's', 'failed', '수신 서버가 메일을 거부했습니다 (mailbox full)', 'bill', 1, '2026-09-04T14:31:00+09'),
        ('hi@eunha.example', 'bill_issued', 's', 'sent', NULL, 'bill', 2, '2026-09-01T10:00:00+09')
    `)
    const s = await getCloseStatus(sql(), "2026-08", "2026-10-01")
    expect(s.billMonth).toBe("2026-09")
    expect(s.isOlderThanLatestIssued).toBe(false)
    expect(s.issue.count).toBe(0)
    expect(s.rows.find((r) => r.billId === 1)!.mail).toEqual({ status: "failed", error: "수신 서버가 메일을 거부했습니다 (mailbox full)" })
    expect(s.rows.find((r) => r.billId === 2)!.mail).toBeNull() // 발행 전 로그는 세지 않는다
  })

  it("가장 최근 발행월보다 이전 달을 열면 isOlderThanLatestIssued, 형식이 틀린 month는 기본 월", async () => {
    await labLike()
    await bill(21, 1, "2026-08", "paid", { total: 290000, due: "2026-09-10" })
    const older = await getCloseStatus(sql(), "2026-07", "2026-10-01")
    expect(older.isOlderThanLatestIssued).toBe(true)
    const res = await GET(req("?month=2026-13"))
    expect((await res.json()).status.usageMonth).toBe("2026-09")
  })

  it("기한 이력이 없으면 청구월 말일을 제안", async () => {
    await bill(31, 1, "2026-10", "draft", { total: 100000 })
    const s = await getCloseStatus(sql(), "2026-09", "2026-10-01")
    expect(s.issue.dueSuggestion).toBe("2026-10-31")
  })
})
