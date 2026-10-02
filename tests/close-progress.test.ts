import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"
import { getDb } from "@/lib/db"
import { getAdminTodo, getCloseProgress, pickCloseMonth } from "@/lib/admin-todo"
import { addMonths, todayKST } from "@/lib/format"

// 월 마감 진행 상태(getCloseProgress)와 기본 마감 월 규칙 — 실제 마이그레이션 위에서 SELECT만 확인한다(local-pg).
// 기본 월이 수기 초안·오래된 작성 중·검침만 있는 과거 달에 끌려가지 않는지가 핵심이다(계획서 2.2.1).

const pgAvailable = hasLocalPostgres()

describe("pickCloseMonth(순수)", () => {
  const row = (period: string, o: Partial<{ regIssued: number; regDraft: number; regCorrecting: number; anyDraft: number }> = {}) => ({
    period,
    regIssued: 0,
    regDraft: 0,
    regDraftTotal: 0,
    regCorrecting: 0,
    anyDraft: 0,
    anyCorrecting: 0,
    ...o,
  })
  it("발행 이력이 없으면 이번 달 청구월(지난달 사용분)", () => {
    expect(pickCloseMonth([], "2026-10-01")).toEqual({ billMonth: "2026-10", usageMonth: "2026-09", latestIssued: null })
    // 수기·오래된 작성 중만 있어도 마찬가지
    expect(pickCloseMonth([row("2026-03", { anyDraft: 1 }), row("2026-04", { regDraft: 2, anyDraft: 2 })], "2026-10-01").billMonth).toBe("2026-10")
  })
  it("L에 작성 중·정정 중이 없으면 L+1, 있으면 L", () => {
    expect(pickCloseMonth([row("2026-09", { regIssued: 22 })], "2026-10-01").billMonth).toBe("2026-10")
    expect(pickCloseMonth([row("2026-09", { regIssued: 21, regDraft: 1 })], "2026-10-01").billMonth).toBe("2026-09")
    expect(pickCloseMonth([row("2026-09", { regIssued: 21, regCorrecting: 1 })], "2026-10-01").billMonth).toBe("2026-09")
    expect(pickCloseMonth([row("2026-12", { regIssued: 1 })], "2026-10-01")).toEqual({ billMonth: "2027-01", usageMonth: "2026-12", latestIssued: "2026-12" })
  })
})

describe.skipIf(!pgAvailable)("getCloseProgress(local-pg)", () => {
  let pg: LocalPg

  beforeAll(async () => {
    pg = await startLocalPg()
    neonConfig.fetchFunction = pg.fetchFunction
    process.env.DATABASE_URL = pg.databaseUrl
    for (const m of [
      "2026-saas-01-tenants.sql",
      "2026-saas-02-emails.sql",
      "2026-saas-04-programs.sql",
      "2026-saas-06-billing-v2.sql",
      "2026-expense-01.sql",
      "2026-expense-02-inbox.sql",
    ])
      await applyMigration(pg.conn, `scripts/migrations/${m}`)
    await pg.conn.simple(`
      CREATE TABLE IF NOT EXISTS inquiries (id SERIAL PRIMARY KEY, company_name VARCHAR(255) NOT NULL, contact_person VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL, phone VARCHAR(50), message TEXT, status VARCHAR(50) DEFAULT 'new', created_at TIMESTAMPTZ DEFAULT NOW());
      INSERT INTO tenants (id, name) VALUES (1, '(주)솔바람테크'), (2, '은하수랩스'), (3, '너나들이커머스');
      INSERT INTO rooms (id, code, building, floor, pyeong) VALUES (1, '204', '본관', 2, 10), (2, '205', '본관', 2, 20), (3, '206', '본관', 2, 30);
      INSERT INTO contracts (tenant_id, room_id, start_date, pyeong_billed, rent_unit_price, mgmt_fee, elec_method, status)
        VALUES (1, 1, '2026-01-01', 10, 21000, 15000, 'area', 'active'), (2, 2, '2026-01-01', 20, 21000, 15000, 'area', 'active'),
               (3, 3, '2026-01-01', 30, 21000, 15000, 'area', 'active');
    `)
  }, 90_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
  })

  beforeEach(async () => {
    await pg.conn.simple(`TRUNCATE bill_lines, bills, meter_readings, billing_periods RESTART IDENTITY CASCADE`)
  })

  const sql = () => getDb()!

  async function readings(period: string, v: { MAIN: number; F101: number; F103: number; HVAC: number }) {
    await pg.conn.simple(`
      INSERT INTO meter_readings (meter_id, period, reading)
      SELECT id, '${period}', CASE code WHEN 'MAIN' THEN ${v.MAIN} WHEN 'F101' THEN ${v.F101} WHEN 'F103' THEN ${v.F103} ELSE ${v.HVAC} END FROM meters
    `)
  }
  async function bill(tenant: number, period: string, status: string, o: { manual?: boolean; issuedAt?: string | null; total?: number } = {}) {
    const issued = o.issuedAt === undefined ? (status === "draft" ? "NULL" : `'${period}-01T10:00:00+09'`) : o.issuedAt === null ? "NULL" : `'${o.issuedAt}'`
    await pg.conn.simple(`
      INSERT INTO bills (tenant_id, period, status, is_manual, issued_at, total_amount)
      VALUES (${tenant}, '${period}', '${status}', ${o.manual ? "TRUE" : "FALSE"}, ${issued}, ${o.total ?? 100000})
    `)
  }
  // 랩과 같은 모양: 9월분 발행 완료, 10월분 작성 중, 9월 사용분 검침·전기료 확정
  async function labLike() {
    await readings("2026-08", { MAIN: 1000, F101: 100, F103: 100, HVAC: 50 })
    await readings("2026-09", { MAIN: 2000, F101: 300, F103: 200, HVAC: 100 })
    await pg.conn.simple(`
      INSERT INTO billing_periods (period, elec_total, elec_unit_price, area_ratio, per10_billed) VALUES ('2026-09', 1000000, 102, 0.70, 103830)
    `)
    for (const t of [1, 2, 3]) await bill(t, "2026-09", "issued")
    for (const t of [1, 2, 3]) await bill(t, "2026-10", "draft", { total: 200000 })
  }

  it("랩형: 9월분 발행·10월분 작성 중 → 9월 사용분 → 10월 청구, 1~3단계 완료·4단계 진행 중", async () => {
    await labLike()
    const p = await getCloseProgress(sql())
    expect(p).toMatchObject({ usageMonth: "2026-09", billMonth: "2026-10", isDefault: true, isOlderThanLatestIssued: false })
    expect(p.meters).toEqual({ saved: 4, total: 4, negative: 0 })
    expect(p.allocation).toEqual({ kepcoTotal: 1000000, kwhUnitPrice: 102, per10Confirmed: 103830, checkOk: true })
    expect(p.bills).toEqual({ draft: 3, draftTotal: 600000, manualDraft: 0, correcting: 0, issued: 0, overdue: 0, paid: 0, issuedTotal: 0 })
    expect(p.steps.map((s) => s.status)).toEqual(["done", "done", "done", "current"])
    expect(p.steps[0].note).toBe("4개 중 4개 입력")
    expect(p.steps[2].note).toBe("작성 중 3건")
    expect(p.nextStep).toBe(4)
    expect(p.needsCorrection).toBe(false)
  })

  it("수기 초안·오래된 작성 중은 기본 월을 끌고 가지 않고 staleDrafts로 따로 보인다", async () => {
    await labLike()
    await bill(1, "2026-03", "draft", { manual: true })
    await bill(2, "2026-04", "draft")
    await bill(3, "2026-12", "issued", { manual: true }) // 미래 달 수기 발행분도 L이 아니다
    await bill(1, "2026-11", "draft", { manual: true })
    const p = await getCloseProgress(sql())
    expect(p.usageMonth).toBe("2026-09")
    expect(p.bills.manualDraft).toBe(0)
    const todo = await getAdminTodo(sql(), "2026-10-01")
    expect(todo.draftBills).toEqual({ billMonth: "2026-10", usageMonth: "2026-09", count: 3, total: 600000 })
    expect(todo.staleDrafts).toEqual({ count: 2, oldestBillMonth: "2026-03" })
  })

  it("검침만 있는 과거 달에 끌려가지 않는다(검침은 판정에 쓰지 않음) — 이번 달 검침 전이면 1단계부터", async () => {
    await readings("2026-01", { MAIN: 10, F101: 1, F103: 1, HVAC: 1 })
    await readings("2026-02", { MAIN: 20, F101: 2, F103: 2, HVAC: 2 })
    for (const t of [1, 2, 3]) await bill(t, "2026-09", "paid")
    const p = await getCloseProgress(sql())
    expect(p.usageMonth).toBe("2026-09")
    expect(p.billMonth).toBe("2026-10")
    expect(p.meters).toEqual({ saved: 0, total: 4, negative: 0 })
    expect(p.allocation.kepcoTotal).toBeNull()
    expect(p.allocation.checkOk).toBeNull()
    expect(p.steps.map((s) => s.status)).toEqual(["current", "blocked", "blocked", "blocked"])
    expect(p.steps[1].note).toBe("먼저 1단계가 필요해요")
    expect(p.nextStep).toBe(1)
  })

  it("L에 정정 중이 남아 있으면 대상은 L, 4단계는 확인 필요", async () => {
    for (const t of [1, 2]) await bill(t, "2026-09", "issued")
    await bill(3, "2026-09", "draft", { issuedAt: "2026-09-01T10:00:00+09" }) // 발행했다가 되돌림
    const p = await getCloseProgress(sql())
    expect(p.billMonth).toBe("2026-09")
    expect(p.usageMonth).toBe("2026-08")
    expect(p.bills.correcting).toBe(1)
    expect(p.bills.issued).toBe(2)
    expect(p.steps[3]).toEqual({ key: "issue", status: "attention", note: "정정 중 1건" })
    const todo = await getAdminTodo(sql(), "2026-10-01")
    expect(todo.correcting).toEqual({ count: 1, billMonths: ["2026-09"] })
  })

  it("발행 이력이 없으면 이번 달 청구월", async () => {
    await bill(1, "2026-02", "draft", { manual: true })
    const p = await getCloseProgress(sql())
    const thisMonth = todayKST().slice(0, 7)
    expect(p.billMonth).toBe(thisMonth)
    expect(p.usageMonth).toBe(addMonths(thisMonth, -1))
    expect(p.isDefault).toBe(true)
  })

  it("지난 달을 열면 isDefault=false·isOlderThanLatestIssued=true, 형식이 틀린 월은 기본 월", async () => {
    await labLike()
    const old = await getCloseProgress(sql(), "2026-07")
    expect(old).toMatchObject({ usageMonth: "2026-07", billMonth: "2026-08", isDefault: false, isOlderThanLatestIssued: true })
    const bad = await getCloseProgress(sql(), "2026-13")
    expect(bad).toMatchObject({ usageMonth: "2026-09", isDefault: true })
  })

  it("발행한 달: 발행 뒤 전기 파라미터가 바뀌었거나 0원 전기 라인이 있으면 needsCorrection(읽기 전용)", async () => {
    await readings("2026-07", { MAIN: 1000, F101: 100, F103: 100, HVAC: 50 })
    await readings("2026-08", { MAIN: 2000, F101: 300, F103: 200, HVAC: 100 })
    for (const t of [1, 2, 3]) await bill(t, "2026-09", "issued", { issuedAt: "2026-09-01T10:00:00+09" })
    await pg.conn.simple(`
      INSERT INTO billing_periods (period, elec_total, elec_unit_price, area_ratio, per10_billed, updated_at)
      VALUES ('2026-08', 1000000, 102, 0.70, 103830, '2026-08-31T10:00:00+09')
    `)
    let p = await getCloseProgress(sql(), "2026-08")
    expect(p.needsCorrection).toBe(false)
    expect(p.steps[3]).toEqual({ key: "issue", status: "done", note: "발행 3건" })
    expect(p.nextStep).toBeNull()
    expect(p.bills.issuedTotal).toBe(300000)

    await pg.conn.simple(`UPDATE billing_periods SET updated_at = '2026-09-02T10:00:00+09' WHERE period = '2026-08'`)
    p = await getCloseProgress(sql(), "2026-08")
    expect(p.needsCorrection).toBe(true)
    expect(p.steps[3].status).toBe("attention")

    await pg.conn.simple(`UPDATE billing_periods SET updated_at = '2026-08-31T10:00:00+09' WHERE period = '2026-08'`)
    await pg.conn.simple(`INSERT INTO bill_lines (bill_id, line_type, label, amount) VALUES (1, 'elec_area', '8월 전기사용료', 0)`)
    p = await getCloseProgress(sql(), "2026-08")
    expect(p.needsCorrection).toBe(true)
  })

  it("음수 사용량은 1단계 확인 필요", async () => {
    await readings("2026-08", { MAIN: 2000, F101: 300, F103: 200, HVAC: 100 })
    await readings("2026-09", { MAIN: 1500, F101: 400, F103: 300, HVAC: 150 })
    const p = await getCloseProgress(sql(), "2026-09")
    expect(p.meters).toEqual({ saved: 4, total: 4, negative: 1 })
    expect(p.steps[0]).toEqual({ key: "meters", status: "attention", note: "음수 사용량 1개" })
  })

  it("조회가 실패하면 예외를 던진다(0으로 바꾸지 않음)", async () => {
    await pg.conn.simple(`ALTER TABLE billing_periods RENAME TO billing_periods_x`)
    try {
      await expect(getCloseProgress(sql(), "2026-09")).rejects.toThrow()
    } finally {
      await pg.conn.simple(`ALTER TABLE billing_periods_x RENAME TO billing_periods`)
    }
  })
})
