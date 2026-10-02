import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"
import { getDb } from "@/lib/db"
import { getAdminTodo, sidebarBadges, visibleTodoLines, type AdminTodo } from "@/lib/admin-todo"
import { isLate, RECEIVABLE_SQL, receivableState } from "@/lib/receivables"

// 관리자 "오늘 할 일" 집계(getAdminTodo)의 모양과 사이드바 배지 계산.
// 운영형 조건(납부 기한 NULL·overdue 0·3개월 전 발행 1건·메일 env 없음·퇴실 예정 0)에서 맞는 숫자가 나오는지 확인한다.

const TODAY = "2026-10-01"

function baseTodo(over: Partial<AdminTodo> = {}): AdminTodo {
  return {
    today: TODAY,
    draftBills: null,
    staleDrafts: null,
    correcting: null,
    receivable: { count: 0, total: 0, late: { count: 0, total: 0 }, oldest: null, nextDue: null },
    expenseInbox: { count: 0 },
    leaving: { count: 0, nearest: null },
    submissions: { toReview: 0, resubmitRequested: 0 },
    inquiriesNew: { count: 0 },
    mail: { enabled: false, failed30d: 0, notConfigured30d: 0 },
    ...over,
  }
}

describe("sidebarBadges·visibleTodoLines(순수)", () => {
  it("랩형: 관리비 = 기한 지남 + 정정 중, 증빙 6, 호실 2, 문의 2, 메일은 켜져 있을 때만", () => {
    const todo = baseTodo({
      draftBills: { billMonth: "2026-10", usageMonth: "2026-09", count: 22, total: 10637510 },
      correcting: { count: 3, billMonths: ["2026-08"] },
      receivable: { count: 15, total: 8797165, late: { count: 4, total: 1260831 }, oldest: null, nextDue: null },
      expenseInbox: { count: 6 },
      leaving: { count: 2, nearest: { roomCode: "206", endedAt: "2026-10-31" } },
      submissions: { toReview: 2, resubmitRequested: 1 },
      inquiriesNew: { count: 2 },
      mail: { enabled: true, failed30d: 1, notConfigured30d: 0 },
    })
    expect(sidebarBadges(todo)).toEqual({ billing: 7, expenses: 6, rooms: 2, programs: 2, inquiries: 2, emails: 1, homeTotal: 8 })
    expect(visibleTodoLines(todo)).toEqual(["correcting", "draftBills", "receivable", "expenseInbox", "leaving", "submissions", "inquiries", "mail"])
  })
  it("메일이 꺼져 있으면 메일 배지·줄이 없다(설정 안 됨 실패는 애초에 failed30d에 없다)", () => {
    const todo = baseTodo({ mail: { enabled: false, failed30d: 2, notConfigured30d: 40 } })
    expect(sidebarBadges(todo).emails).toBe(0)
    expect(visibleTodoLines(todo)).not.toContain("mail")
  })
  it("모두 0이면 홈 합계 0(배지 없음)", () => {
    expect(sidebarBadges(baseTodo())).toEqual({ billing: 0, expenses: 0, rooms: 0, programs: 0, inquiries: 0, emails: 0, homeTotal: 0 })
  })
  it("보완 요청만 있으면 제출물 줄을 띄우지 않는다(입주기업 차례)", () => {
    expect(visibleTodoLines(baseTodo({ submissions: { toReview: 0, resubmitRequested: 3 } }))).toEqual([])
  })
})

const pgAvailable = hasLocalPostgres()

describe.skipIf(!pgAvailable)("getAdminTodo(local-pg)", () => {
  let pg: LocalPg
  const savedMail = { key: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM }

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
      INSERT INTO tenants (id, name) VALUES (1, '(주)솔바람테크'), (2, '은하수랩스'), (3, '너나들이커머스'), (4, '포항테크');
      INSERT INTO rooms (id, code, building, floor, pyeong, status) VALUES
        (1, '204', '본관', 2, 10, 'available'), (2, '205', '본관', 2, 10, 'available'), (3, '206', '본관', 2, 10, 'available'), (4, '207', '본관', 2, 10, 'maintenance');
      INSERT INTO programs (id, title, status) VALUES (1, '창업 교육', 'open');
    `)
  }, 90_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
  })

  beforeEach(async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.MAIL_FROM
    await pg.conn.simple(`
      TRUNCATE bill_lines, bills, contracts, submissions, email_logs, expense_inbox, inquiries RESTART IDENTITY CASCADE;
    `)
  })
  afterEach(() => {
    if (savedMail.key === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = savedMail.key
    if (savedMail.from === undefined) delete process.env.MAIL_FROM
    else process.env.MAIL_FROM = savedMail.from
  })

  const sql = () => getDb()!

  it("운영형: 기한 NULL·overdue 0·3개월 전 발행 1건 → 받을 돈에 '기한 없음 · 발행 후 92일'로 들어가고 늦음 1건", async () => {
    await pg.conn.simple(`
      INSERT INTO bills (tenant_id, period, status, issued_at, due_date, total_amount) VALUES
        (1, '2026-07', 'issued', '2026-07-01T11:00:00+09', NULL, 330000),
        (2, '2026-09', 'issued', '2026-09-21T11:00:00+09', NULL, 220000),
        (3, '2026-09', 'issued', '2026-09-21T11:00:00+09', NULL, 110000),
        (1, '2026-09', 'paid',   '2026-09-21T11:00:00+09', NULL, 500000);
    `)
    const todo = await getAdminTodo(sql(), TODAY)
    expect(todo.today).toBe(TODAY)
    expect(todo.receivable).toEqual({
      count: 3,
      total: 660000,
      late: { count: 1, total: 330000 },
      oldest: { billMonth: "2026-07", tenantName: "(주)솔바람테크", dueDate: null, issuedAt: expect.any(String), days: 92, kind: "no_due" },
      nextDue: null,
    })
    expect(todo.leaving).toEqual({ count: 0, nearest: null })
    expect(todo.mail.enabled).toBe(false)
    expect(sidebarBadges(todo).billing).toBe(1)
    expect(sidebarBadges(todo).emails).toBe(0)
    expect(visibleTodoLines(todo)).toEqual(["receivable"])
  })

  it("메일: 설정 안 됨 실패는 failed30d에서 빼고 따로 센다, 30일 넘은 실패는 세지 않는다", async () => {
    await pg.conn.simple(`
      INSERT INTO email_logs (to_email, status, error, created_at) VALUES
        ('a@t.test', 'failed', 'RESEND_API_KEY not set', NOW() - INTERVAL '1 day'),
        ('b@t.test', 'failed', 'RESEND_API_KEY not set', NOW() - INTERVAL '2 days'),
        ('c@t.test', 'failed', 'MAIL_FROM not set', NOW() - INTERVAL '3 days'),
        ('d@t.test', 'failed', 'Invalid recipient', NOW() - INTERVAL '4 days'),
        ('e@t.test', 'failed', NULL, NOW() - INTERVAL '5 days'),
        ('f@t.test', 'failed', 'Invalid recipient', NOW() - INTERVAL '40 days'),
        ('g@t.test', 'sent', NULL, NOW());
    `)
    const off = await getAdminTodo(sql(), TODAY)
    expect(off.mail).toEqual({ enabled: false, failed30d: 2, notConfigured30d: 3 })
    expect(sidebarBadges(off).emails).toBe(0)
    expect(visibleTodoLines(off)).not.toContain("mail")

    process.env.RESEND_API_KEY = "re_test"
    process.env.MAIL_FROM = "센터 <noreply@example.com>"
    const on = await getAdminTodo(sql(), TODAY)
    expect(on.mail).toEqual({ enabled: true, failed30d: 2, notConfigured30d: 3 })
    expect(sidebarBadges(on).emails).toBe(2)
    expect(visibleTodoLines(on)).toContain("mail")
  })

  it("랩형: 7·8월 기한 지남 4건, 정정 중, 다음 납부 기한, 퇴실 예정(오늘 포함·사용 불가 호실 제외), 대기 건수", async () => {
    await pg.conn.simple(`
      INSERT INTO bills (tenant_id, period, status, issued_at, due_date, total_amount) VALUES
        (1, '2026-07', 'overdue', '2026-07-01T11:00:00+09', '2026-07-10', 300000),
        (2, '2026-07', 'overdue', '2026-07-01T11:00:00+09', '2026-07-10', 260831),
        (3, '2026-08', 'overdue', '2026-08-01T11:00:00+09', '2026-08-10', 400000),
        (4, '2026-08', 'issued',  '2026-08-01T11:00:00+09', '2026-08-10', 300000),
        (1, '2026-09', 'issued',  '2026-09-01T11:00:00+09', '2026-10-10', 100000),
        (2, '2026-09', 'issued',  '2026-09-01T11:00:00+09', '2026-10-10', 100000),
        (3, '2026-09', 'draft',   '2026-09-01T11:00:00+09', '2026-10-10', 100000),
        (4, '2026-09', 'issued',  '2026-09-01T11:00:00+09', '2026-10-20', 100000);
      INSERT INTO contracts (tenant_id, room_id, pyeong_billed, rent_unit_price, status, ended_at) VALUES
        (1, 1, 10, 21000, 'active', '2026-10-31'),
        (2, 2, 10, 21000, 'active', '2026-10-01'),
        (3, 3, 10, 21000, 'active', '2026-09-30'),
        (4, 4, 10, 21000, 'active', '2026-10-15');
      INSERT INTO expense_inbox (file_pathname, file_name, status) VALUES ('a', 'a.pdf', 'pending'), ('b', 'b.pdf', 'pending'), ('c', 'c.pdf', 'done');
      INSERT INTO submissions (program_id, tenant_id, status) VALUES (1, 1, 'submitted'), (1, 2, 'reviewing'), (1, 3, 'resubmit_requested'), (1, 4, 'approved');
      INSERT INTO inquiries (company_name, contact_person, email, status) VALUES ('가', '나', 'x@t.test', 'new'), ('다', '라', 'y@t.test', NULL), ('마', '바', 'z@t.test', 'read');
    `)
    const todo = await getAdminTodo(sql(), TODAY)
    expect(todo.receivable.count).toBe(7)
    expect(todo.receivable.late).toEqual({ count: 4, total: 1260831 })
    expect(todo.receivable.oldest).toMatchObject({ billMonth: "2026-07", dueDate: "2026-07-10", days: 83, kind: "past_due" })
    expect(todo.receivable.nextDue).toEqual({ date: "2026-10-10", count: 2 })
    expect(todo.correcting).toEqual({ count: 1, billMonths: ["2026-09"] })
    expect(todo.leaving).toEqual({ count: 2, nearest: { roomCode: "205", endedAt: "2026-10-01" } })
    expect(todo.expenseInbox).toEqual({ count: 2 })
    expect(todo.submissions).toEqual({ toReview: 2, resubmitRequested: 1 })
    expect(todo.inquiriesNew).toEqual({ count: 2 })
    expect(sidebarBadges(todo)).toMatchObject({ billing: 5, expenses: 2, rooms: 2, programs: 2, inquiries: 2, emails: 0 })
  })

  it("RECEIVABLE_SQL은 receivableState·isLate와 같은 판정을 낸다", async () => {
    await pg.conn.simple(`
      INSERT INTO bills (tenant_id, period, status, issued_at, due_date, total_amount) VALUES
        (1, '2026-01', 'issued',  '2026-01-05T11:00:00+09', NULL, 1),
        (1, '2026-02', 'issued',  '2026-09-01T23:30:00+09', NULL, 1),
        (1, '2026-03', 'issued',  '2026-08-31T11:00:00+09', NULL, 1),
        (1, '2026-04', 'issued',  NULL, NULL, 1),
        (1, '2026-05', 'overdue', '2026-09-21T11:00:00+09', NULL, 1),
        (1, '2026-06', 'overdue', '2026-09-21T11:00:00+09', '2026-10-05', 1),
        (1, '2026-07', 'issued',  '2026-07-01T11:00:00+09', '2026-10-01', 1),
        (1, '2026-08', 'issued',  '2026-07-01T11:00:00+09', '2026-09-30', 1),
        (1, '2026-09', 'issued',  '2026-07-01T11:00:00+09', '2026-08-31', 1),
        (1, '2026-10', 'issued',  '2026-07-01T11:00:00+09', '2026-08-01', 1),
        (1, '2026-11', 'paid',    '2026-07-01T11:00:00+09', '2026-08-01', 1),
        (1, '2026-12', 'draft',   '2026-07-01T11:00:00+09', NULL, 1),
        (2, '2026-01', 'draft',   NULL, NULL, 1);
    `)
    const R = RECEIVABLE_SQL("b", TODAY)
    const rows = await sql()`
      SELECT b.status, b.due_date::text AS due_date, b.issued_at,
             ${sql().unsafe(R.bucket)} AS bucket, ${sql().unsafe(R.days)} AS days,
             ${sql().unsafe(R.isLate)} AS late, ${sql().unsafe(R.isCorrecting)} AS correcting
      FROM bills b ORDER BY b.id
    `
    expect(rows.length).toBe(13)
    for (const r of rows) {
      const st = receivableState({ status: r.status as string, due_date: r.due_date as string | null, issued_at: r.issued_at as Date | null }, TODAY)
      const label = `${r.status} due=${r.due_date} issued=${String(r.issued_at)}`
      expect(r.bucket ?? null, label).toBe(st.bucket)
      expect(r.days === null ? null : Number(r.days), label).toBe(st.days)
      expect(r.late, label).toBe(isLate(st))
      expect(r.correcting, label).toBe(st.kind === "correcting")
    }
  })

  it("테이블을 읽지 못하면 예외를 던진다(0으로 바꾸지 않음)", async () => {
    await pg.conn.simple(`ALTER TABLE expense_inbox RENAME TO expense_inbox_x`)
    try {
      await expect(getAdminTodo(sql(), TODAY)).rejects.toThrow()
    } finally {
      await pg.conn.simple(`ALTER TABLE expense_inbox_x RENAME TO expense_inbox`)
    }
  })
})
