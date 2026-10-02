import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"

// bills GET 상태 묶음(WP7, 계획서 4.4.7 B-1, 가드 #22) — 운영형 픽스처(납부 기한 NULL·overdue 0건·600건 이상)에서
// ① 파라미터가 없으면 지금과 같은 행(LIMIT 500, period DESC) ② status=issued,overdue는 상한 없이 3개월 전 issued까지 "기한 없음" 구간으로
// ③ include=correcting이면 정정 중(draft + issued_at)도 ④ 쿠키 없이 401.

type AdminSession = { id: number; email: string; name: string }
let session: AdminSession | null = { id: 1, email: "admin@example.com", name: "관리자" }
vi.mock("@/lib/auth", () => ({ getSession: async () => session }))

import { GET, PUT } from "@/app/api/admin/billing/bills/route"
import { addMonths, todayKST } from "@/lib/format"

const pgAvailable = hasLocalPostgres()

function daysAgoIso(n: number): string {
  const d = new Date(`${todayKST()}T03:00:00Z`) // KST 정오
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString()
}

async function get(qs: string) {
  const res = await GET(new Request(`http://localhost/api/admin/billing/bills${qs}`))
  return { status: res.status, body: (await res.json()) as { success: boolean; bills: Record<string, unknown>[] } }
}

describe("bills GET 쿠키 없이 401", () => {
  it("GET·PUT 모두 세션이 없으면 401", async () => {
    const saved = session
    session = null
    try {
      expect((await GET(new Request("http://localhost/api/admin/billing/bills?status=issued,overdue&include=correcting"))).status).toBe(401)
      const put = await PUT(new Request("http://localhost/api/admin/billing/bills", { method: "PUT", body: JSON.stringify({ id: 1, mark_unpaid: true }) }))
      expect(put.status).toBe(401)
    } finally {
      session = saved
    }
  })
})

describe.skipIf(!pgAvailable)("bills GET 상태 묶음(local-pg, 운영형 픽스처)", () => {
  let pg: LocalPg
  const TENANTS = 30
  const MONTHS = 22 // 30 × 22 = 660건(납부 완료) — 500건 상한을 넘긴다
  const OLD = "2024-01" // 가장 오래된 청구월: 여기에 미수 1건(기한 NULL, 95일 전 발행)

  beforeAll(async () => {
    pg = await startLocalPg()
    neonConfig.fetchFunction = pg.fetchFunction
    process.env.DATABASE_URL = pg.databaseUrl
    for (const m of ["2026-saas-01-tenants.sql", "2026-saas-02-emails.sql", "2026-saas-06-billing-v2.sql"]) await applyMigration(pg.conn, `scripts/migrations/${m}`)
    const values = Array.from({ length: TENANTS }, (_, i) => `(${i + 1}, '기업${String(i + 1).padStart(2, "0")}')`).join(",")
    await pg.conn.simple(`INSERT INTO tenants (id, name) VALUES ${values}`)
  }, 90_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
  })

  beforeEach(async () => {
    await pg.conn.simple(`TRUNCATE bill_lines, bills, email_logs RESTART IDENTITY CASCADE`)
    const rows: string[] = []
    for (let t = 1; t <= TENANTS; t++) {
      for (let m = 1; m <= MONTHS; m++) {
        const p = addMonths(OLD, m) // 2024-02 ~ 2025-11
        rows.push(`(${t}, '${p}', 100000, 'paid', '${daysAgoIso(400)}', '${daysAgoIso(390)}')`)
      }
    }
    await pg.conn.simple(`INSERT INTO bills (tenant_id, period, total_amount, status, issued_at, paid_at) VALUES ${rows.join(",")}`)
    // 운영형: 기한 NULL·overdue 없음. 3개월 전에 발행한 미수 1건(가장 오래된 청구월)
    await pg.conn.simple(`INSERT INTO bills (tenant_id, period, total_amount, status, due_date, issued_at) VALUES (1, '${OLD}', 313207, 'issued', NULL, '${daysAgoIso(95)}')`)
  })

  it("파라미터가 없으면 지금과 같은 행·순서(LIMIT 500, period DESC) — 그래서 오래된 미수가 잘린다", async () => {
    const { status, body } = await get("")
    expect(status).toBe(200)
    expect(body.bills.length).toBe(500)
    const old = (
      await pg.conn.simple(`SELECT b.id FROM bills b JOIN tenants t ON t.id = b.tenant_id ORDER BY b.period DESC, t.name LIMIT 500`)
    )[0].rows.map((r) => Number(r[0]))
    expect(body.bills.map((b) => Number(b.id))).toEqual(old)
    expect(body.bills.some((b) => b.period === OLD)).toBe(false)
    // 기존 필드는 그대로(추가 필드만 붙는다)
    for (const k of ["id", "tenant_id", "period", "status", "total_amount", "due_date", "tenant_name", "is_manual", "issued_at", "paid_at"]) expect(body.bills[0]).toHaveProperty(k)
  })

  it("단일 상태(status=issued)도 지금처럼 같은 경로(상한 유지)", async () => {
    const { body } = await get("?status=issued")
    expect(body.bills.map((b) => b.period)).toEqual([OLD])
    const { body: paid } = await get("?status=paid")
    expect(paid.bills.length).toBe(500)
  })

  it("status=issued,overdue는 상한 없이 3개월 전 issued를 '기한 없음' 구간으로 돌려준다", async () => {
    const { status, body } = await get("?status=issued,overdue")
    expect(status).toBe(200)
    expect(body.bills.length).toBe(1)
    const b = body.bills[0]
    expect(b.period).toBe(OLD)
    expect(b.bucket).toBe("no_due")
    expect(Number(b.days)).toBe(95)
    expect(b.due_date).toBeNull()
    // 묶음 조회는 상한이 없다: paid까지 묶으면 661건 모두
    const all = await get("?status=paid,issued")
    expect(all.body.bills.length).toBe(TENANTS * MONTHS + 1)
  })

  it("include=correcting이면 정정 중(draft + issued_at)을 함께, 없으면 빼고, 그냥 작성 중은 늘 뺀다", async () => {
    await pg.conn.simple(`
      INSERT INTO bills (tenant_id, period, total_amount, status, issued_at) VALUES (2, '2026-08', 200000, 'draft', '${daysAgoIso(40)}');
      INSERT INTO bills (tenant_id, period, total_amount, status) VALUES (3, '2026-10', 300000, 'draft');
    `)
    const without = await get("?status=issued,overdue")
    expect(without.body.bills.map((b) => b.period).sort()).toEqual([OLD])
    const withC = await get("?status=issued,overdue&include=correcting")
    const periods = withC.body.bills.map((b) => `${b.status}:${b.period}`).sort()
    expect(periods).toEqual(["draft:2026-08", `issued:${OLD}`])
    const corr = withC.body.bills.find((b) => b.status === "draft")!
    expect(corr.bucket).toBeNull()
  })

  it("tenant_id·period로 한 기업 한 달만(지난달 비교용), 발행 메일 최근 결과 필드", async () => {
    const id = Number((await pg.conn.simple(`SELECT id FROM bills WHERE tenant_id = 1 AND period = '${OLD}'`))[0].rows[0][0])
    await pg.conn.simple(`
      INSERT INTO email_logs (to_email, tenant_id, template_code, status, related_type, related_id, created_at)
      VALUES ('a@example.com', 1, 'bill_issued', 'failed', 'bill', ${id}, NOW() - INTERVAL '2 day'),
             ('a@example.com', 1, 'bill_issued', 'sent', 'bill', ${id}, NOW() - INTERVAL '1 day')
    `)
    const { body } = await get(`?tenant_id=1&period=${OLD}`)
    expect(body.bills.length).toBe(1)
    expect(body.bills[0].mail_status).toBe("sent")
    const { body: none } = await get(`?tenant_id=2&period=${OLD}`)
    expect(none.bills.length).toBe(0)
  })
})
