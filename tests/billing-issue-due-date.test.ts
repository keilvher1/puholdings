import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"

// POST /api/admin/billing/bills/issue — 선택 파라미터 due_date(계획서 4.4.5, 가드 #3·#25)와 메일 딥링크(4.4.8).
// - due_date 없이 부르면 대상·금액·상태·메일 결과가 예전과 같다(납부 기한을 건드리지 않는다).
// - 주면 발행 UPDATE 한 문장 안에서 NULL인 건만 채우고, 메일 변수 due_date에 그 날짜가 들어간다.
// - 응답에 failed_list(메일을 보내지 못한 곳·사유), 메일의 portal_url은 /portal/bills/{id}.

const h = vi.hoisted(() => ({
  session: null as null | { id: number; email: string },
  mails: [] as { to: string; templateCode: string; vars: Record<string, string>; subjectPrefix?: string; tenantId?: number | null }[],
  failFor: new Map<string, string>(),
  batches: [] as { template: string; recipients: { to: string; vars: Record<string, string> }[] }[],
}))
vi.mock("@/lib/auth", () => ({ getSession: async () => h.session, getPortalSession: async () => null }))
vi.mock("@/lib/mail", () => ({
  sendMail: async (o: { to: string; templateCode: string; vars: Record<string, string>; subjectPrefix?: string; tenantId?: number | null }) => {
    h.mails.push(o)
    const err = h.failFor.get(o.to)
    return err ? { success: false, error: err } : { success: true }
  },
  sendBatch: async (recipients: { to: string; vars: Record<string, string> }[], template: string) => {
    h.batches.push({ template, recipients })
    return { success: true, sent: recipients.length, failed: 0 }
  },
}))
vi.mock("@/lib/invoice-gen", () => ({ generateAndStoreInvoice: async () => null }))
vi.mock("@/lib/messenger-notify", () => ({ notifyBillsIssued: () => {} }))

import { POST } from "@/app/api/admin/billing/bills/issue/route"
import { GET as CRON } from "@/app/api/cron/reminders/route"

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/admin/billing/bills/issue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))

describe("issue 인증", () => {
  it("쿠키 없이 401", async () => {
    h.session = null
    const res = await post({ period: "2026-10" })
    expect(res.status).toBe(401)
  })
})

const pgAvailable = hasLocalPostgres()

describe.skipIf(!pgAvailable)("issue due_date·딥링크(local-pg)", () => {
  let pg: LocalPg

  beforeAll(async () => {
    pg = await startLocalPg()
    neonConfig.fetchFunction = pg.fetchFunction
    process.env.DATABASE_URL = pg.databaseUrl
    for (const m of ["2026-saas-01-tenants.sql", "2026-saas-02-emails.sql", "2026-saas-04-programs.sql", "2026-saas-06-billing-v2.sql"])
      await applyMigration(pg.conn, `scripts/migrations/${m}`)
    await pg.conn.simple(`
      INSERT INTO tenants (id, name, tax_email, contact_email) VALUES
        (1, '(주)솔바람테크', 'tax@sol.example', 'c1@sol.example'),
        (2, '은하수랩스', '', 'hi@eunha.example'),
        (3, '너나들이커머스', NULL, NULL),
        (4, '(주)바람개비소재', 'bad@wind.example', NULL);
    `)
  }, 90_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
    delete process.env.CRON_SECRET
  })

  beforeEach(async () => {
    h.session = { id: 1, email: "admin@example.com" }
    h.mails.length = 0
    h.batches.length = 0
    h.failFor.clear()
    await pg.conn.simple(`TRUNCATE email_logs, bill_lines, bills, meter_readings, billing_periods RESTART IDENTITY CASCADE`)
    // 10월분 작성 중 4건(1건은 정정 재발행이라 기존 기한 있음) + 9월분 발행·납부(건드리면 안 됨)
    await pg.conn.simple(`
      INSERT INTO bills (id, tenant_id, period, status, total_amount, due_date, issued_at) VALUES
        (11, 1, '2026-10', 'draft', 330000, NULL, NULL),
        (12, 2, '2026-10', 'draft', 360000, '2026-11-20', '2026-10-04T14:30:00+09'),
        (13, 3, '2026-10', 'draft', 150000, NULL, NULL),
        (14, 4, '2026-10', 'draft', 1377000, NULL, NULL),
        (21, 1, '2026-09', 'issued', 300000, '2026-10-10', '2026-09-04T14:30:00+09'),
        (22, 2, '2026-09', 'paid', 400000, '2026-10-10', '2026-09-04T14:30:00+09');
      INSERT INTO bill_lines (bill_id, line_type, label, amount) VALUES
        (11, 'rent', '10월 임대료', 330000), (12, 'rent', '10월 임대료', 360000), (13, 'rent', '10월 임대료', 150000), (14, 'rent', '10월 임대료', 1377000);
    `)
  })

  async function rows() {
    const r = await pg.conn.query(`SELECT id, status, total_amount::text, due_date::text FROM bills ORDER BY id`, [])
    return r.rows.map(([id, status, total, due]) => ({ id: Number(id), status, total, due }))
  }

  it("due_date 없이 부르면 예전과 같다: 그 달 draft만 발행, 금액·기한 그대로, 메일 결과·이메일 없음 동일", async () => {
    const before = await rows()
    const res = await post({ period: "2026-10" })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ success: true, issued: 4, mail: { sent: 3, failed: 0 }, no_email: ["너나들이커머스"], failed_list: [], elec_month: "2026-09" })
    const after = await rows()
    for (const b of after) {
      const prev = before.find((x) => x.id === b.id)!
      expect(b.total).toBe(prev.total) // 금액 그대로
      expect(b.due).toBe(prev.due) // 납부 기한 그대로(NULL은 NULL)
      expect(b.status).toBe(b.id < 20 ? "issued" : prev.status) // 9월분은 건드리지 않음
    }
    const vars = Object.fromEntries(h.mails.map((m) => [m.to, m.vars]))
    expect(vars["tax@sol.example"].due_date).toBe("-")
    expect(vars["hi@eunha.example"].due_date).toBe("2026-11-20")
    // 받는 곳: tax_email이 빈 문자열이면 contact_email(예전 JS || 와 같음)
    expect(Object.keys(vars).sort()).toEqual(["bad@wind.example", "hi@eunha.example", "tax@sol.example"])
  })

  it("due_date를 주면 NULL인 건만 채워지고(정정 재발행의 기존 기한은 유지) 메일 변수에 그 날짜가 들어간다", async () => {
    const res = await post({ bill_ids: [11, 12, 13, 14], due_date: "2026-11-10" })
    expect(res.status).toBe(200)
    const after = Object.fromEntries((await rows()).map((b) => [b.id, b]))
    expect(after[11].due).toBe("2026-11-10")
    expect(after[12].due).toBe("2026-11-20")
    expect(after[13].due).toBe("2026-11-10")
    expect(after[21].due).toBe("2026-10-10")
    const vars = Object.fromEntries(h.mails.map((m) => [m.to, m.vars]))
    expect(vars["tax@sol.example"].due_date).toBe("2026-11-10")
    expect(vars["hi@eunha.example"].due_date).toBe("2026-11-20")
  })

  it("메일의 '청구서 보기'는 그 청구서(/portal/bills/{id})로 간다", async () => {
    await post({ period: "2026-10" })
    const sol = h.mails.find((m) => m.to === "tax@sol.example")!
    expect(sol.vars.portal_url).toBe("http://localhost/portal/bills/11")
  })

  it("응답의 failed_list: 보내지 못한 곳과 사유(설정 안 됨 표시)", async () => {
    h.failFor.set("bad@wind.example", "수신 서버가 메일을 거부했습니다 (mailbox full)")
    h.failFor.set("hi@eunha.example", "RESEND_API_KEY not set")
    const body = await (await post({ period: "2026-10", due_date: "2026-11-10" })).json()
    expect(body.mail).toEqual({ sent: 1, failed: 2 })
    expect(body.failed_list).toEqual([
      { bill_id: 12, tenant_id: 2, tenant_name: "은하수랩스", error: "RESEND_API_KEY not set", not_configured: true },
      { bill_id: 14, tenant_id: 4, tenant_name: "(주)바람개비소재", error: "수신 서버가 메일을 거부했습니다 (mailbox full)", not_configured: false },
    ])
  })

  it("잘못된 due_date는 400이고 아무것도 발행하지 않는다", async () => {
    const res = await post({ period: "2026-10", due_date: "2026-02-30" })
    expect(res.status).toBe(400)
    expect((await rows()).filter((b) => b.status === "issued").map((b) => b.id)).toEqual([21])
    expect(h.mails).toHaveLength(0)
  })

  it("전기료 0원 가드는 그대로(force 없이 발행 안 됨)", async () => {
    await pg.conn.simple(`
      INSERT INTO billing_periods (period, elec_total, elec_unit_price, area_ratio, per10_billed) VALUES ('2026-09', 1000000, 102, 0.70, 50000);
      INSERT INTO bill_lines (bill_id, line_type, label, amount) VALUES (11, 'elec_area', '9월 전기', 0);
    `)
    const res = await post({ bill_ids: [11, 12], due_date: "2026-11-10" })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.needs_regenerate).toBe(true)
    expect(body.stale).toEqual(["(주)솔바람테크"])
    expect((await rows()).find((b) => b.id === 11)!.status).toBe("draft")
  })

  it("납부 안내 크론 메일도 그 청구서로 간다(/portal/bills/{id})", async () => {
    process.env.CRON_SECRET = "test-secret"
    const in3 = new Date(Date.now() + 9 * 3600_000 + 3 * 86400_000).toISOString().slice(0, 10)
    await pg.conn.simple(`UPDATE bills SET due_date = '${in3}' WHERE id = 21`)
    const res = await CRON(new Request("http://localhost/api/cron/reminders", { headers: { authorization: "Bearer test-secret" } }))
    expect(res.status).toBe(200)
    const reminders = h.batches.find((b) => b.template === "bill_reminder")!
    expect(reminders.recipients).toHaveLength(1)
    expect(reminders.recipients[0].vars.portal_url).toBe("http://localhost/portal/bills/21")
  })
})
