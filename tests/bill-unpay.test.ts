import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"

// 납부 처리 취소(PUT mark_unpaid, WP7 — 계획서 4.4.7 B-3, 7.1 ③). paid만 issued로, paid_at NULL, 메모에 "납부 취소: 오늘"을 덧붙인다(기존 메모 유지).
// 다른 상태는 400. 기존 mark_paid·memo 동작은 그대로(납부 → 메모는 따로, 가드 #27).

type AdminSession = { id: number; email: string; name: string }
let session: AdminSession | null = { id: 1, email: "admin@example.com", name: "관리자" }
vi.mock("@/lib/auth", () => ({ getSession: async () => session }))

import { GET, PUT } from "@/app/api/admin/billing/bills/route"
import { todayKST } from "@/lib/format"
import { appendBillMemo } from "@/lib/bill-display"

const pgAvailable = hasLocalPostgres()

async function put(body: unknown) {
  const res = await PUT(new Request("http://localhost/api/admin/billing/bills", { method: "PUT", body: JSON.stringify(body) }))
  return { status: res.status, body: (await res.json()) as { success: boolean; error?: string } }
}

describe("mark_unpaid 쿠키 없이 401", () => {
  it("세션이 없으면 401", async () => {
    const saved = session
    session = null
    try {
      expect((await put({ id: 1, mark_unpaid: true })).status).toBe(401)
    } finally {
      session = saved
    }
  })
})

describe.skipIf(!pgAvailable)("PUT mark_unpaid(local-pg)", () => {
  let pg: LocalPg

  beforeAll(async () => {
    pg = await startLocalPg()
    neonConfig.fetchFunction = pg.fetchFunction
    process.env.DATABASE_URL = pg.databaseUrl
    for (const m of ["2026-saas-01-tenants.sql", "2026-saas-02-emails.sql", "2026-saas-06-billing-v2.sql"]) await applyMigration(pg.conn, `scripts/migrations/${m}`)
    await pg.conn.simple(`INSERT INTO tenants (id, name) VALUES (1, '(주)솔바람테크')`)
  }, 90_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
  })

  beforeEach(async () => {
    await pg.conn.simple(`
      TRUNCATE bill_lines, bills RESTART IDENTITY CASCADE;
      INSERT INTO bills (id, tenant_id, period, total_amount, status, due_date, issued_at, paid_at, memo) VALUES
        (1, 1, '2026-08', 291192, 'paid', '2026-09-10', '2026-09-04T01:00:00Z', '2026-09-20T00:00:00Z', '입금자 솔바람'),
        (2, 1, '2026-09', 302742, 'issued', '2026-10-10', '2026-10-01T01:00:00Z', NULL, NULL),
        (3, 1, '2026-07', 313207, 'overdue', '2026-08-10', '2026-08-04T01:00:00Z', NULL, NULL),
        (4, 1, '2026-10', 300000, 'draft', NULL, NULL, NULL, NULL),
        (5, 1, '2026-06', 280000, 'paid', NULL, '2026-06-04T01:00:00Z', '2026-06-20T00:00:00Z', NULL);
    `)
  })

  const row = async (id: number) => {
    const r = await pg.conn.simple(`SELECT status, paid_at, memo FROM bills WHERE id = ${id}`)
    const [status, paid_at, memo] = r[0].rows[0]
    return { status, paid_at, memo }
  }

  it("paid → issued, paid_at NULL, 기존 메모 뒤에 '납부 취소: 오늘 (지운 납부일)'을 덧붙인다", async () => {
    const r = await put({ id: 1, mark_unpaid: true })
    expect(r).toEqual({ status: 200, body: { success: true } })
    const b = await row(1)
    expect(b.status).toBe("issued")
    expect(b.paid_at).toBeNull()
    expect(b.memo).toBe(appendBillMemo("입금자 솔바람", `납부 취소: ${todayKST()} (지운 납부일 2026-09-20)`))
    // 메모가 비어 있던 건은 그 한 줄만
    await put({ id: 5, mark_unpaid: true })
    expect((await row(5)).memo).toBe(`납부 취소: ${todayKST()} (지운 납부일 2026-06-20)`)
  })

  it("납부 완료가 아니면 400이고 아무것도 바뀌지 않는다", async () => {
    for (const id of [2, 3, 4]) {
      const before = await row(id)
      const r = await put({ id, mark_unpaid: true })
      expect(r.status).toBe(400)
      expect(r.body.error).toBe("납부 완료인 청구서만 납부 처리를 취소할 수 있어요")
      expect(await row(id)).toEqual(before)
    }
    expect((await put({ id: 999, mark_unpaid: true })).status).toBe(404)
  })

  it("되돌린 뒤 다시 납부 처리할 수 있고(이체일 그대로), 받을 돈 묶음 조회에 다시 잡힌다", async () => {
    await put({ id: 1, mark_unpaid: true })
    const res = await GET(new Request("http://localhost/api/admin/billing/bills?status=issued,overdue"))
    const ids = ((await res.json()) as { bills: { id: number }[] }).bills.map((b) => Number(b.id)).sort()
    expect(ids).toEqual([1, 2, 3])
    expect((await put({ id: 1, mark_paid: true, paid_at: "2026-09-21" })).status).toBe(200)
    const b = await row(1)
    expect(b.status).toBe("paid")
    expect(String(b.paid_at)).toContain("2026-09-21")
  })

  it("기존 동작 그대로: mark_paid는 같은 요청의 memo를 무시하고, memo PUT은 통째 교체", async () => {
    await put({ id: 2, mark_paid: true, paid_at: "2026-10-02", memo: "무시돼야 함" })
    expect(await row(2)).toMatchObject({ status: "paid", memo: null })
    await put({ id: 2, memo: appendBillMemo(null, "2026-10-02 입금 확인 · 입금자 솔바람") })
    expect((await row(2)).memo).toBe("2026-10-02 입금 확인 · 입금자 솔바람")
  })
})
