import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"

// 추가 청구 ③ "생성 전 달 막기"의 근거(가드 #19) — 지금 동작을 고정한다:
// 같은 기업·같은 청구월에 수기 청구서가 있으면 월 마감 생성(generate)은 그 기업을 건너뛰어 정기 청구서(임대료·관리비·전기료)가 만들어지지 않는다.
// 그래서 화면은 진행 중 계약이 있는 기업의 생성 전 달에는 수기 청구서를 만들지 않게 막는다(addChargeDecision → "blocked").
// 진행 중 계약이 없는 기업(퇴실 정산 등)의 수기 청구서 생성(manual POST)은 그대로 된다.

type AdminSession = { id: number; email: string; name: string }
let session: AdminSession | null = { id: 1, email: "admin@example.com", name: "관리자" }
vi.mock("@/lib/auth", () => ({ getSession: async () => session }))

import { POST as GENERATE } from "@/app/api/admin/billing/bills/generate/route"
import { POST as MANUAL } from "@/app/api/admin/billing/bills/manual/route"
import { addChargeDecision, generateWouldBill, type BillRow } from "@/components/admin/billing/bills/bill-model"

const pgAvailable = hasLocalPostgres()

const req = (url: string, body: unknown) => new Request(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body) })

const bill = (o: Partial<BillRow>): BillRow => ({
  id: 1,
  tenant_id: 1,
  tenant_name: "(주)솔바람테크",
  period: "2026-10",
  status: "draft",
  rent_total: 0,
  mgmt_total: 0,
  elec_amount: 0,
  total_amount: 0,
  due_date: null,
  paid_at: null,
  issued_at: null,
  is_manual: false,
  ...o,
})

describe("addChargeDecision — 네 가지 상태(순수)", () => {
  it("① 그 달 작성 중 청구서가 있으면 항목으로 추가(정기·수기·정정 중 모두 draft)", () => {
    const d = addChargeDecision({ period: "2026-10", bills: [bill({ id: 7, status: "draft" })], hasActiveContract: true })
    expect(d.kind).toBe("add_to_draft")
    expect(d.target?.id).toBe(7)
  })
  it("② 그 달이 발행됐으면 다음 달 작성 중이 있을 때만 그곳(target), 없으면 target 없음", () => {
    const issued = bill({ id: 7, status: "issued", issued_at: "2026-10-01T00:00:00Z" })
    expect(addChargeDecision({ period: "2026-10", bills: [issued], hasActiveContract: true })).toMatchObject({ kind: "issued", target: null, nextPeriod: "2026-11" })
    const withNext = addChargeDecision({ period: "2026-10", bills: [issued, bill({ id: 8, period: "2026-11", status: "draft" })], hasActiveContract: true })
    expect(withNext.kind).toBe("issued")
    expect(withNext.target?.id).toBe(8)
    // 다음 달이 이미 발행됐으면 추가하지 않는다
    expect(addChargeDecision({ period: "2026-10", bills: [issued, bill({ id: 8, period: "2026-11", status: "issued" })], hasActiveContract: true }).target).toBeNull()
    // 납부 완료도 "발행됨" 갈래
    expect(addChargeDecision({ period: "2026-10", bills: [bill({ status: "paid" })], hasActiveContract: false }).kind).toBe("issued")
  })
  it("③ 진행 중 계약 + 그 달 청구서 없음 → 막음", () => {
    expect(addChargeDecision({ period: "2026-10", bills: [bill({ period: "2026-09", status: "paid" })], hasActiveContract: true }).kind).toBe("blocked")
  })
  it("④ 진행 중 계약 없음 + 그 달 청구서 없음 → 새 수기 청구서", () => {
    expect(addChargeDecision({ period: "2026-10", bills: [], hasActiveContract: false }).kind).toBe("new_manual")
  })
})

describe("generateWouldBill — 생성(generate) 대상과 같은 기준(가드 #19)", () => {
  it("진행 중 계약이면 청구 대상", () => {
    expect(generateWouldBill([{ status: "active", start_date: "2026-01-01", ended_at: null }], "2026-10")).toEqual({ bills: true, endedOnly: false })
  })
  it("그 청구월에 끝난 계약도 마지막 달 청구 대상(퇴실한 달) — endedOnly", () => {
    const c = { status: "ended", start_date: "2026-01-01", ended_at: "2026-10-03", last_month_billing: "full" }
    expect(generateWouldBill([c], "2026-10")).toEqual({ bills: true, endedOnly: true })
    // 다음 달부터는 대상 아님
    expect(generateWouldBill([c], "2026-11")).toEqual({ bills: false, endedOnly: false })
    // 진행 중 계약이 함께 있으면 endedOnly 아님
    expect(generateWouldBill([c, { status: "active", start_date: "2026-01-01" }], "2026-10")).toEqual({ bills: true, endedOnly: false })
  })
  it("마지막 달·첫 달 청구 'none'이면 생성도 건너뛰므로 대상 아님", () => {
    expect(generateWouldBill([{ status: "ended", start_date: "2026-01-01", ended_at: "2026-10-03", last_month_billing: "none" }], "2026-10").bills).toBe(false)
    expect(generateWouldBill([{ status: "active", start_date: "2026-10-15", first_month_billing: "none" }], "2026-10").bills).toBe(false)
    // 첫 달 'none'이어도 다음 달은 대상
    expect(generateWouldBill([{ status: "active", start_date: "2026-10-15", first_month_billing: "none" }], "2026-11").bills).toBe(true)
  })
  it("모르는 값은 막는 쪽(대상)으로 본다, 계약 없음은 대상 아님", () => {
    expect(generateWouldBill([{ status: "active" }], "2026-10").bills).toBe(true)
    expect(generateWouldBill([], "2026-10").bills).toBe(false)
    expect(generateWouldBill([{ status: "ended", ended_at: "2026-08-31" }], "2026-10").bills).toBe(false)
  })
})

describe("쿠키 없이 401(생성·수기 청구 라우트)", () => {
  it("세션이 없으면 401", async () => {
    const saved = session
    session = null
    try {
      expect((await GENERATE(req("/api/admin/billing/bills/generate", { billMonth: "2026-10", force: true }))).status).toBe(401)
      expect((await MANUAL(req("/api/admin/billing/bills/manual", { tenant_id: 1, period: "2026-10", lines: [{ label: "x", amount: 1 }] }))).status).toBe(401)
    } finally {
      session = saved
    }
  })
})

describe.skipIf(!pgAvailable)("수기 청구서가 있는 달 생성은 그 기업을 건너뛴다(local-pg)", () => {
  let pg: LocalPg

  beforeAll(async () => {
    pg = await startLocalPg()
    neonConfig.fetchFunction = pg.fetchFunction
    process.env.DATABASE_URL = pg.databaseUrl
    for (const m of ["2026-saas-01-tenants.sql", "2026-saas-02-emails.sql", "2026-saas-06-billing-v2.sql"]) await applyMigration(pg.conn, `scripts/migrations/${m}`)
    await pg.conn.simple(`
      INSERT INTO tenants (id, name, status) VALUES (1, '(주)솔바람테크', 'active'), (2, '은하수랩스', 'active'), (3, '너나들이커머스', 'moved_out');
      INSERT INTO rooms (id, code, building, floor, pyeong) VALUES (1, '204', '본관', 2, 10), (2, '205', '본관', 2, 20);
      INSERT INTO contracts (tenant_id, room_id, start_date, pyeong_billed, rent_unit_price, mgmt_fee, elec_method, status)
        VALUES (1, 1, '2026-01-01', 10, 21000, 15000, 'area', 'active'), (2, 2, '2026-01-01', 20, 21000, 15000, 'area', 'active');
    `)
  }, 90_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
  })

  beforeEach(async () => {
    await pg.conn.simple(`TRUNCATE bill_lines, bills RESTART IDENTITY CASCADE`)
  })

  const billsOf = async (period: string) =>
    (await pg.conn.simple(`SELECT tenant_id, is_manual, status, total_amount FROM bills WHERE period = '${period}' ORDER BY tenant_id`))[0].rows.map((r) => ({
      tenant_id: Number(r[0]),
      is_manual: r[1] === "t",
      status: r[2],
      total: Number(r[3]),
    }))

  it("진행 중 계약 기업에 생성 전 달 수기 청구서를 만들면, 그 달 생성에서 그 기업의 정기 청구서가 빠진다", async () => {
    const m = await MANUAL(req("/api/admin/billing/bills/manual", { tenant_id: 1, period: "2026-10", lines: [{ label: "원상복구비", amount: 440000 }] }))
    expect(m.status).toBe(200)
    const g = await GENERATE(req("/api/admin/billing/bills/generate", { billMonth: "2026-10", force: true }))
    const body = (await g.json()) as { success: boolean; created: number; skipped: { tenant_name: string; reason: string }[] }
    expect(body.success).toBe(true)
    expect(body.created).toBe(1) // 은하수랩스만
    expect(body.skipped.map((s) => s.tenant_name)).toContain("(주)솔바람테크")
    expect(body.skipped.find((s) => s.tenant_name === "(주)솔바람테크")?.reason).toMatch(/수기 청구서/)
    const rows = await billsOf("2026-10")
    expect(rows).toEqual([
      { tenant_id: 1, is_manual: true, status: "draft", total: 440000 }, // 임대료·관리비·전기료 없음
      { tenant_id: 2, is_manual: false, status: "draft", total: rows[1].total },
    ])
    const lines = (await pg.conn.simple(`SELECT line_type FROM bill_lines l JOIN bills b ON b.id = l.bill_id WHERE b.tenant_id = 1`))[0].rows.map((r) => r[0])
    expect(lines).toEqual(["manual"])
  })

  it("진행 중 계약이 없는 기업(퇴실 정산)의 수기 청구서는 지금처럼 만들어지고, 같은 달 두 번째는 409", async () => {
    const ok = await MANUAL(req("/api/admin/billing/bills/manual", { tenant_id: 3, period: "2026-10", lines: [{ label: "퇴실 정산", amount: 120000, line_type: "manual" }] }))
    expect(ok.status).toBe(200)
    const dup = await MANUAL(req("/api/admin/billing/bills/manual", { tenant_id: 3, period: "2026-10", lines: [{ label: "추가", amount: 1000 }] }))
    expect(dup.status).toBe(409)
    expect(await billsOf("2026-10")).toEqual([{ tenant_id: 3, is_manual: true, status: "draft", total: 120000 }])
  })

  it("그 청구월에 끝난 계약(퇴실한 달)도 생성 대상이라, 수기 청구서가 있으면 마지막 달 정기 청구가 빠진다 → 화면은 막는다", async () => {
    await pg.conn.simple(`
      INSERT INTO tenants (id, name, status) VALUES (4, '노을영상', 'moved_out');
      INSERT INTO rooms (id, code, building, floor, pyeong) VALUES (4, '301', '본관', 3, 10);
      INSERT INTO contracts (id, tenant_id, room_id, start_date, pyeong_billed, rent_unit_price, mgmt_fee, elec_method, status, ended_at)
        VALUES (904, 4, 4, '2026-01-01', 10, 21000, 15000, 'area', 'ended', '2026-11-12');
    `)
    try {
      // 화면 판정: 그 달 종료 계약 → ③ 막음
      const contracts = (await pg.conn.simple(`SELECT status, start_date::text, ended_at::text, first_month_billing, last_month_billing FROM contracts WHERE tenant_id = 4`))[0].rows.map((r) => ({
        status: String(r[0]),
        start_date: String(r[1]),
        ended_at: String(r[2]),
        first_month_billing: String(r[3]),
        last_month_billing: String(r[4]),
      }))
      const g = generateWouldBill(contracts, "2026-11")
      expect(g).toEqual({ bills: true, endedOnly: true })
      expect(addChargeDecision({ period: "2026-11", bills: [], hasActiveContract: g.bills }).kind).toBe("blocked")

      // 수기 청구서가 없으면 생성이 노을영상 11월 마지막 달 정기 청구서를 만든다
      const g1 = (await (await GENERATE(req("/api/admin/billing/bills/generate", { billMonth: "2026-11", force: true }))).json()) as { success: boolean }
      expect(g1.success).toBe(true)
      expect((await billsOf("2026-11")).find((b) => b.tenant_id === 4)).toMatchObject({ is_manual: false })

      // 수기 청구서가 먼저 있으면 생성은 그 기업을 건너뛴다(정기 청구 누락) — 그래서 화면이 막아야 한다
      await pg.conn.simple(`TRUNCATE bill_lines, bills RESTART IDENTITY CASCADE`)
      expect((await MANUAL(req("/api/admin/billing/bills/manual", { tenant_id: 4, period: "2026-11", lines: [{ label: "원상복구비", amount: 300000 }] }))).status).toBe(200)
      const g2 = (await (await GENERATE(req("/api/admin/billing/bills/generate", { billMonth: "2026-11", force: true }))).json()) as {
        success: boolean
        skipped: { tenant_name: string; reason: string }[]
      }
      expect(g2.success).toBe(true)
      expect(g2.skipped.find((s) => s.tenant_name === "노을영상")?.reason).toMatch(/수기 청구서/)
      expect((await billsOf("2026-11")).find((b) => b.tenant_id === 4)).toEqual({ tenant_id: 4, is_manual: true, status: "draft", total: 300000 })
    } finally {
      await pg.conn.simple(`DELETE FROM contracts WHERE id = 904; DELETE FROM rooms WHERE id = 4; DELETE FROM tenants WHERE id = 4;`)
    }
  })
})
