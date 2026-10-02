import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"

// WP1: GET /api/admin/emails(since·type·건수 응답 추가)와 메일 화면 규칙, 관리자 홈 할 일 줄(운영형).
//   - 쿠키(세션) 없이 401
//   - since 없으면 예전 응답과 같음({ success, logs }, 같은 열·같은 순서·최근 200건)
//   - since가 있으면 기간·종류·검색으로 거르고, 상태별 건수를 준다. "설정 안 됨" 실패는 보내지 못함에서 빠진다
// (관리자 홈 할 일 줄 테스트는 tests/admin-home-lines.test.ts로 옮겼다.)

let session: { id: number; email: string; name: string } | null = { id: 1, email: "admin@test", name: "관리자" }
vi.mock("@/lib/auth", () => ({ getSession: async () => session }))

import { GET } from "@/app/api/admin/emails/route"
import { getDb } from "@/lib/db"
import { MAIL_NOT_CONFIGURED_ERRORS } from "@/lib/admin-todo"
import {
  friendlyMailError,
  isNotConfiguredError,
  mailRowStatus,
  mailTypeLabel,
  NOT_CONFIGURED_ERRORS,
  parseSince,
  plainTextToHtml,
  resendAvailability,
  type MailLogRow,
} from "@/lib/email-model"

const get = (qs = "") => GET(new Request(`http://localhost/api/admin/emails${qs}`))

describe("GET /api/admin/emails 권한", () => {
  it("쿠키(세션) 없이 401", async () => {
    const saved = session
    session = null
    try {
      const res = await get()
      expect(res.status).toBe(401)
      expect((await get("?since=30d")).status).toBe(401)
    } finally {
      session = saved
    }
  })
})

// ── 순수 규칙 ─────────────────────────────────────────────────────────────────

describe("메일 화면 규칙(순수)", () => {
  it("설정 안 됨 문구는 lib/admin-todo와 같은 값을 쓰고, 같은 뜻의 변형도 잡는다", () => {
    expect([...NOT_CONFIGURED_ERRORS]).toEqual([...MAIL_NOT_CONFIGURED_ERRORS])
    expect(isNotConfiguredError("RESEND_API_KEY not set")).toBe(true)
    expect(isNotConfiguredError("MAIL_FROM not set")).toBe(true)
    expect(isNotConfiguredError("RESEND_API_KEY 미설정 — 발송 건너뜀")).toBe(true)
    expect(isNotConfiguredError("Invalid `to` field")).toBe(false)
    expect(isNotConfiguredError(null)).toBe(false)
  })

  it("종류는 한글 이름, 오류는 쉬운 말", () => {
    expect(mailTypeLabel("bill_issued")).toBe("청구서 발행")
    expect(mailTypeLabel("bill_reminder")).toBe("납부 안내")
    expect(mailTypeLabel("tenant_welcome")).toBe("포털 계정 안내")
    expect(mailTypeLabel("manual")).toBe("직접 작성")
    expect(mailTypeLabel("inquiry_received")).toBe("문의 알림")
    expect(friendlyMailError("RESEND_API_KEY not set")).toBe("메일 발송 설정이 없어 보내지 않았어요")
    expect(friendlyMailError("수신 서버가 메일을 거부했습니다 (mailbox full)")).toContain("받는 서버가 거부했어요")
    expect(friendlyMailError("Invalid `to` field: 주소 형식 오류")).toContain("받는 주소 형식")
    for (const e of ["RESEND_API_KEY not set", "boom", "Invalid `to` field"]) expect(friendlyMailError(e)).not.toMatch(/[A-Z]{2,}_/)
  })

  it("상태: 설정 안 됨 실패는 not_configured", () => {
    expect(mailRowStatus({ status: "failed", error: "MAIL_FROM not set" })).toBe("not_configured")
    expect(mailRowStatus({ status: "failed", error: "x" })).toBe("failed")
    expect(mailRowStatus({ status: "sent", error: null })).toBe("sent")
  })

  const row = (over: Partial<MailLogRow> = {}): MailLogRow => ({
    id: 1, to_email: "a@t.test", tenant_id: 1, tenant_name: "가", template_code: "bill_issued", subject: "s",
    status: "failed", error: "mailbox full", related_type: "bill", related_id: 9, sent_at: null,
    created_at: "2026-09-04T05:00:00Z", bill_status: "issued", bill_updated_at: "2026-09-04T04:00:00Z", bill_period: "2026-09",
    ...over,
  })

  it("다시 보내기: 메일 꺼짐·설정 안 됨·계정 안내·납부 완료·메일 뒤에 바뀐 청구서면 끈다", () => {
    expect(resendAvailability(row(), true)).toMatchObject({ canResend: true, billMail: true })
    expect(resendAvailability(row(), false).canResend).toBe(false)
    expect(resendAvailability(row({ error: "RESEND_API_KEY not set" }), true)).toMatchObject({ canResend: false, reason: expect.stringContaining("설정이 없던") })
    expect(resendAvailability(row({ template_code: "tenant_welcome", related_type: "tenant_user" }), true).canResend).toBe(false)
    expect(resendAvailability(row({ bill_status: "paid" }), true)).toMatchObject({ canResend: false, reason: expect.stringContaining("납부 완료") })
    expect(resendAvailability(row({ bill_updated_at: "2026-09-10T00:00:00Z" }), true)).toMatchObject({ canResend: false, reason: expect.stringContaining("바뀌었어요") })
    expect(resendAvailability(row({ bill_status: undefined, bill_updated_at: undefined }), true).canResend).toBe(false)
    expect(resendAvailability(row({ status: "sent", error: null }), true).canResend).toBe(false)
    expect(resendAvailability(row({ related_type: "inquiry", template_code: "inquiry_received" }), true).canResend).toBe(true)
  })

  it("다시 보내기: 청구서가 없어졌거나(null) 발행 상태가 아니면 끈다", () => {
    // 기업 삭제 cascade 등으로 LEFT JOIN 결과가 없으면 bill_status·bill_updated_at이 null
    expect(resendAvailability(row({ bill_status: null, bill_updated_at: null, bill_period: null }), true)).toMatchObject({
      canResend: false,
      reason: expect.stringContaining("찾지 못했어요"),
    })
    expect(resendAvailability(row({ bill_status: "draft" }), true)).toMatchObject({ canResend: false, reason: expect.stringContaining("발행 상태가 아니에요") })
    expect(resendAvailability(row({ bill_status: "overdue" }), true).canResend).toBe(true)
    expect(resendAvailability(row({ bill_updated_at: "2026-09-10T00:00:00Z" }), true).reason).toContain("확인해 주세요")
    expect(resendAvailability(row({ bill_updated_at: "2026-09-10T00:00:00Z" }), true).reason).not.toContain("다시 발행")
  })

  it("일반 글 → 단락 HTML(이스케이프, 변수 유지)", () => {
    expect(plainTextToHtml("{{tenant_name}} 담당자님,\n안녕하세요.\n\n<b>공지</b> & 안내")).toBe(
      "<p>{{tenant_name}} 담당자님,<br>안녕하세요.</p>\n<p>&lt;b&gt;공지&lt;/b&gt; &amp; 안내</p>",
    )
    expect(plainTextToHtml("  \n\n ")).toBe("")
  })

  it("since: 일 수·날짜만 받는다", () => {
    const now = Date.parse("2026-10-02T00:00:00Z")
    expect(parseSince("30d", now)).toBe("2026-09-02T00:00:00.000Z")
    expect(parseSince("2026-09-01", now)).toBe("2026-08-31T15:00:00.000Z")
    expect(parseSince("0d", now)).toBeNull()
    expect(parseSince("abc", now)).toBeNull()
    expect(parseSince("", now)).toBeNull()
  })
})

// ── local-pg: since 없으면 예전과 같음, since 있으면 거르기·건수 ───────────────

const pgAvailable = hasLocalPostgres()

describe.skipIf(!pgAvailable)("GET /api/admin/emails(local-pg)", () => {
  let pg: LocalPg
  const savedMail = { key: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM }

  beforeAll(async () => {
    pg = await startLocalPg()
    neonConfig.fetchFunction = pg.fetchFunction
    process.env.DATABASE_URL = pg.databaseUrl
    for (const m of ["2026-saas-01-tenants.sql", "2026-saas-02-emails.sql", "2026-saas-06-billing-v2.sql"])
      await applyMigration(pg.conn, `scripts/migrations/${m}`)
    await pg.conn.simple(`
      INSERT INTO tenants (id, name) VALUES (1, '(주)솔바람테크'), (2, '은하수랩스'), (3, '너나들이커머스');
      INSERT INTO bills (id, tenant_id, period, status, issued_at, due_date, total_amount, updated_at) VALUES
        (10, 1, '2026-09', 'issued', NOW() - INTERVAL '20 days', '2026-10-10', 300000, NOW() - INTERVAL '20 days'),
        (11, 2, '2026-09', 'paid',   NOW() - INTERVAL '20 days', '2026-10-10', 200000, NOW() - INTERVAL '2 days'),
        (12, 3, '2026-09', 'issued', NOW() - INTERVAL '20 days', '2026-10-10', 100000, NOW() - INTERVAL '1 day');
    `)
    // 250건(200건 상한 확인용) + 여러 상태
    const values: string[] = []
    for (let i = 0; i < 240; i++) values.push(`('s${i}@t.test', 1, 'bill_issued', '제목 ${i}', 'sent', NULL, 'bill', 10, NOW() - (${i} || ' hours')::interval)`)
    values.push(
      `('f1@t.test', 1, 'bill_issued', '실패1', 'failed', 'mailbox full', 'bill', 10, NOW() - INTERVAL '3 days')`,
      `('f2@t.test', 2, 'bill_issued', '실패2', 'failed', 'Invalid \`to\` field', 'bill', 11, NOW() - INTERVAL '4 days')`,
      `('f3@t.test', 3, 'bill_issued', '실패3', 'failed', 'mailbox full', 'bill', 12, NOW() - INTERVAL '5 days')`,
      `('n1@t.test', NULL, 'inquiry_received', '문의', 'failed', 'RESEND_API_KEY not set', 'inquiry', 2, NOW() - INTERVAL '1 days')`,
      `('n2@t.test', 2, 'manual', '공지', 'failed', 'MAIL_FROM not set', NULL, NULL, NOW() - INTERVAL '2 days')`,
      `('old@t.test', 1, 'bill_reminder', '옛 실패', 'failed', 'mailbox full', 'bill', 10, NOW() - INTERVAL '45 days')`,
      `('q@t.test', 3, 'manual', '대기', 'queued', NULL, NULL, NULL, NOW() - INTERVAL '6 days')`,
    )
    await pg.conn.simple(
      `INSERT INTO email_logs (to_email, tenant_id, template_code, subject, status, error, related_type, related_id, created_at) VALUES ${values.join(",\n")};`,
    )
  }, 90_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
  })
  beforeEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.MAIL_FROM
  })
  afterEach(() => {
    if (savedMail.key === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = savedMail.key
    if (savedMail.from === undefined) delete process.env.MAIL_FROM
    else process.env.MAIL_FROM = savedMail.from
  })

  // 바꾸기 전 라우트의 쿼리 그대로(기준)
  async function legacy(status: string | null) {
    const sql = getDb()!
    return status === "sent" || status === "failed" || status === "queued"
      ? await sql`
          SELECT l.id, l.to_email, l.tenant_id, l.template_code, l.subject, l.status, l.error,
                 l.related_type, l.related_id, l.sent_at, l.created_at, t.name AS tenant_name
          FROM email_logs l LEFT JOIN tenants t ON t.id = l.tenant_id
          WHERE l.status = ${status} ORDER BY l.created_at DESC LIMIT 200`
      : await sql`
          SELECT l.id, l.to_email, l.tenant_id, l.template_code, l.subject, l.status, l.error,
                 l.related_type, l.related_id, l.sent_at, l.created_at, t.name AS tenant_name
          FROM email_logs l LEFT JOIN tenants t ON t.id = l.tenant_id
          ORDER BY l.created_at DESC LIMIT 200`
  }

  it("since 없으면 예전 응답과 같다({ success, logs }, 200건, 상태 거르기 그대로)", async () => {
    for (const status of [null, "failed", "sent", "queued", "bogus"]) {
      const res = await get(status ? `?status=${status}` : "")
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Object.keys(body).sort()).toEqual(["logs", "success"])
      expect(body.success).toBe(true)
      const expected = JSON.parse(JSON.stringify(await legacy(status)))
      expect(body.logs).toEqual(expected)
    }
    const all = await (await get()).json()
    expect(all.logs).toHaveLength(200)
    const failed = await (await get("?status=failed")).json()
    expect(failed.logs).toHaveLength(6) // 설정 안 됨 포함(예전 동작)
  })

  it("since=30d: 건수 응답, 설정 안 됨은 보내지 못함에서 빠지고 따로 센다, 30일 넘은 것은 빠진다", async () => {
    const body = await (await get("?since=30d&status=failed")).json()
    expect(body.success).toBe(true)
    expect(body.mail_enabled).toBe(false)
    expect(body.counts).toEqual({ failed: 3, not_configured: 2, sent: 240, queued: 1, all: 246 })
    expect(body.logs.map((l: { to_email: string }) => l.to_email)).toEqual(["f1@t.test", "f2@t.test", "f3@t.test"])
    const f1 = body.logs[0]
    expect(f1.bill_status).toBe("issued")
    expect(f1.bill_period).toBe("2026-09")
    expect(body.logs[1].bill_status).toBe("paid")

    const nc = await (await get("?since=30d&status=not_configured")).json()
    expect(nc.logs.map((l: { to_email: string }) => l.to_email)).toEqual(["n1@t.test", "n2@t.test"])
    expect(nc.logs[0].bill_status).toBeNull()
  })

  it("since: 종류·검색·페이지", async () => {
    const t = await (await get("?since=90d&type=bill_reminder")).json()
    expect(t.counts).toMatchObject({ failed: 1, all: 1 })
    expect(t.logs[0].to_email).toBe("old@t.test")

    const q = await (await get(`?since=30d&q=${encodeURIComponent("은하수")}`)).json()
    expect(q.logs.map((l: { to_email: string }) => l.to_email).sort()).toEqual(["f2@t.test", "n2@t.test"])
    expect(q.counts.all).toBe(2)
    const pct = await (await get(`?since=30d&q=${encodeURIComponent("%")}`)).json()
    expect(pct.counts.all).toBe(0) // %는 글자 그대로 찾는다

    const p1 = await (await get("?since=30d&status=sent")).json()
    expect(p1.logs).toHaveLength(200)
    expect(p1.has_more).toBe(true)
    const p2 = await (await get("?since=30d&status=sent&page=2")).json()
    expect(p2.logs).toHaveLength(40)
    expect(p2.has_more).toBe(false)
  })

  it("since 형식이 틀리면 400(사용자 문구), 메일 env가 있으면 mail_enabled=true", async () => {
    const bad = await get("?since=forever")
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toBe("조회 기간이 맞지 않아요. 다시 골라 주세요")
    process.env.RESEND_API_KEY = "re_test"
    process.env.MAIL_FROM = "센터 <noreply@example.com>"
    expect((await (await get("?since=30d")).json()).mail_enabled).toBe(true)
  })
})
