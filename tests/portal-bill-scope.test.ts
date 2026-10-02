import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"

// 입주기업 포털 청구서 스코프(WP8, 계획서 4.5.5·6.9·7.1·7.2 #22·#28) — 로컬 임시 Postgres에 실제 마이그레이션을 적용하고
// /api/portal/* 라우트 핸들러를 그대로 부른다. 세션(쿠키)만 가짜로 바꾼다.
// 확인하는 것:
//   - 쿠키 없이 401(모든 /api/portal/* 데이터 라우트)
//   - 다른 기업 청구서 id 404, 작성 중 초안 404, 정정 중(draft + issued_at)은 { correcting: true }만(금액·라인 없음)
//   - 지난달 비교는 같은 기업의 발행분(issued·paid·overdue)만 — 정정 중·다른 기업 청구서는 비교 대상이 아니다
//   - 목록은 세션 기업의 발행분만 + invoice_pathname 필드
//   - 상세 bank_info = PDF와 같은 계좌(env 원문이 분해되지 않으면 원문만)
// 순수 판정(낼 관리비 요약·기한 없음 문구·프로그램 묶음)은 Postgres 없이 아래 describe에서 본다(운영형 픽스처).

type PortalSession = { role: "tenant"; tenant_id: number; user_id: number; email: string; name: string; must_change_password: boolean }
let portalSession: PortalSession | null = null
vi.mock("@/lib/auth", () => ({
  getSession: async () => null,
  getPortalSession: async () => portalSession,
  changeTenantPassword: async () => ({ success: false, error: "호출되면 안 됨" }),
  createPortalToken: async () => "x",
}))
vi.mock("@vercel/blob", () => ({ get: vi.fn(), put: vi.fn(), del: vi.fn() }))

import { GET as LIST } from "@/app/api/portal/bills/route"
import { GET as DETAIL } from "@/app/api/portal/bills/[id]/route"
import { GET as PROGRAMS } from "@/app/api/portal/programs/route"
import { POST as APPLY } from "@/app/api/portal/applications/route"
import { POST as SUBMIT, PUT as RESUBMIT } from "@/app/api/portal/submissions/route"
import { POST as UPLOAD, DELETE as UNUPLOAD } from "@/app/api/portal/upload/route"
import { POST as CHANGE_PASSWORD } from "@/app/api/portal/change-password/route"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { PortalHome } from "@/components/portal/screens/home"
import { PortalBillCorrecting, PortalBillDetailView } from "@/components/portal/screens/bill-detail"
import { ProgramStage } from "@/components/portal/program-stage"
import { describeBillLine } from "@/lib/bill-display"
import { DEFAULT_BANK_TEXT } from "@/lib/bank-info"
import {
  NO_DUE_SENTENCE,
  billDueText,
  classifyProgram,
  comparePrevious,
  groupPrograms,
  summarizeUnpaid,
  type PortalProgramRow,
} from "@/components/portal/screens/portal-model"

const T1: PortalSession = { role: "tenant", tenant_id: 1, user_id: 1, email: "a@t1.example.com", name: "김담당", must_change_password: false }
const T2: PortalSession = { role: "tenant", tenant_id: 2, user_id: 2, email: "b@t2.example.com", name: "이담당", must_change_password: false }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: any, ctx: { params: Promise<any> }) => Promise<Response>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(who: PortalSession | null, handler: Handler, path: string, init: { method?: string; body?: unknown; params?: Record<string, string> } = {}): Promise<{ status: number; json: any }> {
  portalSession = who
  const req = new NextRequest(`http://localhost${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : {},
  })
  const res = await handler(req, { params: Promise.resolve(init.params ?? {}) })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: res.status, json }
}
const detail = (who: PortalSession | null, id: number | string) => call(who, DETAIL, `/api/portal/bills/${id}`, { params: { id: String(id) } })

const pgAvailable = hasLocalPostgres()

describe.skipIf(!pgAvailable)("포털 청구서 스코프(local-pg)", () => {
  let pg: LocalPg
  const savedBank = process.env.BILLING_BANK_INFO

  beforeAll(async () => {
    delete process.env.BILLING_BANK_INFO
    pg = await startLocalPg()
    neonConfig.fetchFunction = pg.fetchFunction
    process.env.DATABASE_URL = pg.databaseUrl
    for (const m of ["2026-saas-01-tenants.sql", "2026-saas-02-emails.sql", "2026-saas-04-programs.sql", "2026-saas-06-billing-v2.sql"])
      await applyMigration(pg.conn, `scripts/migrations/${m}`)
    await pg.conn.simple(`
      INSERT INTO tenants (id, name) VALUES (1, '(주)솔바람테크'), (2, '은하수랩스');
      INSERT INTO rooms (id, code, building, floor, pyeong) VALUES (1, '204', '본관', 2, 8.4), (2, '205', '본관', 2, 10);
      INSERT INTO contracts (id, tenant_id, room_id, start_date, pyeong_billed, rent_unit_price, mgmt_fee, elec_method, status)
        VALUES (1, 1, 1, '2026-01-01', 8.4, 21000, 15000, 'area', 'active'), (2, 2, 2, '2026-01-01', 10, 21000, 15000, 'area', 'active');
      -- 기업 1: 7월 납부 완료, 8월 정정 중(발행했다가 되돌림), 9월 납부 대기, 10월 작성 중
      INSERT INTO bills (id, tenant_id, period, rent_total, mgmt_total, supply_amount, vat_amount, elec_amount, total_amount, status, due_date, issued_at, paid_at, invoice_pathname) VALUES
        (1, 1, '2026-07', 176400, 15000, 174000, 17400, 99792, 291192, 'paid', '2026-08-10', '2026-07-01T09:00:00+09', '2026-08-05T10:00:00+09', 'invoices/2026-07/1.pdf'),
        (2, 1, '2026-08', 176400, 15000, 174000, 17400, 999999, 1191399, 'draft', NULL, '2026-08-01T09:00:00+09', NULL, NULL),
        (3, 1, '2026-09', 176400, 15000, 174000, 17400, 111342, 302742, 'issued', '2026-10-10', '2026-09-01T09:00:00+09', NULL, NULL),
        (4, 1, '2026-10', 176400, 15000, 174000, 17400, 100000, 291400, 'draft', NULL, NULL, NULL, NULL),
      -- 기업 2: 8월 납부 대기(기한 없음), 9월 연체
        (5, 2, '2026-08', 210000, 15000, 204545, 20455, 75000, 300000, 'issued', NULL, '2026-08-01T09:00:00+09', NULL, NULL),
        (6, 2, '2026-09', 210000, 15000, 204545, 20455, 175000, 400000, 'overdue', '2026-09-10', '2026-09-01T09:00:00+09', NULL, NULL);
      INSERT INTO bill_lines (bill_id, contract_id, room_code, line_type, label, quantity, unit_price, amount) VALUES
        (1, 1, '204', 'rent', '7월 임대료 (204)', 8.4, 21000, 176400),
        (1, 1, '204', 'mgmt', '7월 관리비 (204)', NULL, NULL, 15000),
        (1, 1, '204', 'elec_area', '6월 전기사용료 (204, 면적별)', 8.4, 118800, 99792),
        (2, 1, '204', 'elec_area', '7월 전기사용료 (204, 면적별)', 8.4, 999999, 999999),
        (3, 1, '204', 'rent', '9월 임대료 (204)', 8.4, 21000, 176400),
        (3, 1, '204', 'mgmt', '9월 관리비 (204)', NULL, NULL, 15000),
        (3, 1, '204', 'elec_area', '8월 전기사용료 (204, 면적별)', 8.4, 132550, 111342),
        (5, 2, '205', 'rent', '8월 임대료 (205)', 10, 21000, 210000),
        (5, 2, '205', 'mgmt', '8월 관리비 (205)', NULL, NULL, 15000),
        (5, 2, '205', 'elec_area', '7월 전기사용료 (205, 면적별)', 10, 75000, 75000),
        (6, 2, '205', 'rent', '9월 임대료 (205)', 10, 21000, 210000),
        (6, 2, '205', 'mgmt', '9월 관리비 (205)', NULL, NULL, 15000),
        (6, 2, '205', 'elec_area', '8월 전기사용료 (205, 면적별)', 10, 175000, 175000),
        (6, NULL, NULL, 'manual', '8월 과오납분 차감', NULL, NULL, 0);
      INSERT INTO programs (id, title, status, apply_start, apply_end, submit_deadline) VALUES
        (1, '시제품 제작 지원사업', 'open', '2026-01-01', '2099-12-31', '2099-12-31');
      INSERT INTO program_applications (program_id, tenant_id, status) VALUES (1, 2, 'accepted');
      INSERT INTO submissions (program_id, tenant_id, title, status, feedback) VALUES (1, 2, '기업 2 제출물', 'resubmit_requested', '근거를 보완해 주세요');
    `)
  }, 90_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
    if (savedBank !== undefined) process.env.BILLING_BANK_INFO = savedBank
  })

  it("쿠키(세션) 없이 부르면 모든 포털 데이터 라우트가 401", async () => {
    expect((await call(null, LIST, "/api/portal/bills")).status).toBe(401)
    expect((await detail(null, 3)).status).toBe(401)
    expect((await call(null, PROGRAMS, "/api/portal/programs")).status).toBe(401)
    expect((await call(null, PROGRAMS, "/api/portal/programs?id=1")).status).toBe(401)
    expect((await call(null, APPLY, "/api/portal/applications", { body: { program_id: 1 } })).status).toBe(401)
    expect((await call(null, SUBMIT, "/api/portal/submissions", { body: { program_id: 1 } })).status).toBe(401)
    expect((await call(null, RESUBMIT, "/api/portal/submissions", { method: "PUT", body: { id: 1 } })).status).toBe(401)
    expect((await call(null, UPLOAD, "/api/portal/upload", { method: "POST" })).status).toBe(401)
    expect((await call(null, UNUPLOAD, "/api/portal/upload", { method: "DELETE", body: { pathname: "submissions/1/x.pdf" } })).status).toBe(401)
    expect((await call(null, CHANGE_PASSWORD, "/api/portal/change-password", { body: { current_password: "a", new_password: "abcdefgh" } })).status).toBe(401)
  })

  it("목록은 세션 기업의 발행분만(작성 중·정정 중 없음), 청구월 최신순, invoice_pathname 필드가 있다", async () => {
    const r1 = await call(T1, LIST, "/api/portal/bills")
    expect(r1.status).toBe(200)
    expect(r1.json.bills.map((b: { id: number }) => b.id)).toEqual([3, 1])
    expect(r1.json.bills[1].invoice_pathname).toBe("invoices/2026-07/1.pdf")
    expect(r1.json.bills[0]).toHaveProperty("invoice_pathname", null)
    const r2 = await call(T2, LIST, "/api/portal/bills")
    expect(r2.json.bills.map((b: { id: number }) => b.id)).toEqual([6, 5])
  })

  it("다른 기업 청구서 id는 404(목록·상세 어디서도 보이지 않는다)", async () => {
    for (const id of [5, 6]) {
      const r = await detail(T1, id)
      expect(r.status).toBe(404)
      expect(r.json).not.toHaveProperty("bill")
    }
    for (const id of [1, 3]) expect((await detail(T2, id)).status).toBe(404)
    // 다른 기업의 정정 중 청구서도 "고치는 중"이 아니라 404
    expect((await detail(T2, 2)).status).toBe(404)
  })

  it("작성 중 초안은 404, 정정 중(draft + issued_at) 본인 청구서는 { correcting: true }만 — 금액·라인 없음", async () => {
    expect((await detail(T1, 4)).status).toBe(404)
    const r = await detail(T1, 2)
    expect(r.status).toBe(200)
    expect(r.json).toEqual({ success: true, correcting: true })
    expect(JSON.stringify(r.json)).not.toContain("1191399")
  })

  it("잘못된 id는 400", async () => {
    expect((await detail(T1, "abc")).status).toBe(400)
    expect((await detail(T1, 0)).status).toBe(400)
  })

  it("상세: 라인·공급가액·계좌(PDF와 같은 원문 + 계좌번호만), 면적 배분 설명 숫자로 금액이 다시 맞는다", async () => {
    const r = await detail(T1, 3)
    expect(r.status).toBe(200)
    expect(r.json.bill).toMatchObject({ id: 3, period: "2026-09", status: "issued", due_date: "2026-10-10" })
    expect(Number(r.json.bill.supply_amount)).toBe(174000)
    expect(Number(r.json.bill.vat_amount)).toBe(17400)
    expect(r.json.lines).toHaveLength(3)
    expect(r.json.bank_info).toEqual({ text: DEFAULT_BANK_TEXT, bank: "하나은행", account: "910-910009-44304", holder: "㈜포항연합기술지주" })
    const elec = r.json.lines.find((l: { line_type: string }) => l.line_type === "elec_area")
    const d = describeBillLine(elec, r.json.lines)
    expect(d.description).toBe("면적 배분 · 10평당 132,550원 기준 8.4평")
    expect(d.formula).toBe("공용 전기료를 면적으로 나눴어요: 132,550원 × 8.4 ÷ 10 = 111,342원")
    expect(Math.round((132550 * 8.4) / 10)).toBe(Number(elec.amount))
  })

  it("지난달 비교는 같은 기업의 발행분만: 기업 1의 9월분은 정정 중인 8월분을 건너뛰고 7월분과 비교한다", async () => {
    const r = await detail(T1, 3)
    expect(r.json.previous).toMatchObject({ period: "2026-07", consecutive: false, previousTotal: 291192, diff: 11550 })
    expect(r.json.previous.sentence).toBe("2026년 7월분보다 11,550원 늘었어요 · 전기료가 가장 많이 늘었어요(+11,550원)")
    // 기업 2의 8월분(300,000원)과 정정 중 8월분(1,191,399원)의 금액이 섞이지 않는다
    expect(JSON.stringify(r.json.previous)).not.toContain("1191399")
    expect(r.json.previous.previousTotal).not.toBe(300000)
  })

  it("기업 2의 9월분은 자기 8월분과 비교한다(바로 앞 달 → '지난달')", async () => {
    const r = await detail(T2, 6)
    expect(r.status).toBe(200)
    expect(r.json.previous).toMatchObject({ period: "2026-08", consecutive: true, diff: 100000 })
    expect(r.json.previous.sentence).toBe("지난달보다 100,000원 늘었어요 · 전기료가 가장 많이 늘었어요(+100,000원)")
  })

  it("첫 청구서는 비교 대상이 없다(previous: null)", async () => {
    const r = await detail(T1, 1)
    expect(r.status).toBe(200)
    expect(r.json.previous).toBeNull()
  })

  it("계좌 env 원문이 분해되지 않으면 기본 계좌로 떨어지지 않고 원문만(account null)", async () => {
    process.env.BILLING_BANK_INFO = "입금 계좌는 담당자에게 문의해 주세요"
    try {
      const r = await detail(T1, 3)
      expect(r.json.bank_info).toEqual({ text: "입금 계좌는 담당자에게 문의해 주세요", bank: null, account: null, holder: null })
    } finally {
      delete process.env.BILLING_BANK_INFO
    }
  })

  it("프로그램 목록·상세의 신청·제출 상태도 세션 기업 것만 보인다", async () => {
    const r1 = await call(T1, PROGRAMS, "/api/portal/programs")
    expect(r1.json.programs[0]).toMatchObject({ id: 1, application_status: null, submission_status: null })
    const d1 = await call(T1, PROGRAMS, "/api/portal/programs?id=1")
    expect(d1.json.program).toMatchObject({ application_status: null, submission_id: null, feedback: null })
    const r2 = await call(T2, PROGRAMS, "/api/portal/programs?id=1")
    expect(r2.json.program).toMatchObject({ application_status: "accepted", submission_status: "resubmit_requested", feedback: "근거를 보완해 주세요" })
  })
})

// ── 순수 판정(운영형 픽스처 포함) ──────────────────────────────────────────────

describe("낼 관리비 요약(summarizeUnpaid)", () => {
  const TODAY = "2026-10-01"
  const bill = (o: Partial<{ id: number; period: string; total_amount: string; status: string; due_date: string | null; issued_at: string | null; paid_at: string | null }>) => ({
    id: 1,
    period: "2026-09",
    total_amount: "0",
    status: "issued",
    due_date: null,
    issued_at: "2026-09-01T09:00:00+09:00",
    paid_at: null,
    ...o,
  })

  it("랩 조건: 9월분(기한 전) + 8월분(DB 연체) → 합계 593,934원, 기한 지남 문장, 기한 없음 문장 없음", () => {
    const s = summarizeUnpaid(
      [
        bill({ id: 87, period: "2026-09", total_amount: "302742", due_date: "2026-10-10" }),
        bill({ id: 66, period: "2026-08", total_amount: "291192", status: "overdue", due_date: "2026-09-10", issued_at: "2026-08-01T09:00:00+09:00" }),
        bill({ id: 40, period: "2026-07", total_amount: "280000", status: "paid", due_date: "2026-08-10", paid_at: "2026-08-05T10:00:00+09:00" }),
      ],
      TODAY,
    )
    expect(s.count).toBe(2)
    expect(s.total).toBe(593934)
    expect(s.lateSentence).toBe("8월분 납부 기한이 21일 지났어요")
    expect(s.noDueSentence).toBeNull()
    expect(s.rows.map((r) => r.bill.id)).toEqual([87, 66])
    expect(s.rows[0].dueText).toBe("10월 10일(토)까지 · 9일 남음")
    expect(s.rows[1].dueText).toBe("9월 10일(목) · 21일 지남")
    expect(s.mostUrgent?.bill.id).toBe(66)
  })

  it("issued인데 기한 날짜가 지났으면(cron 없이) DB 상태와 상관없이 기한 지남", () => {
    const s = summarizeUnpaid([bill({ id: 1, period: "2026-08", total_amount: "100", due_date: "2026-09-10" })], TODAY)
    expect(s.lateSentence).toBe("8월분 납부 기한이 21일 지났어요")
  })

  it("운영형(납부 기한 NULL · overdue 없음): '기한이 따로 정해지지 않았어요', 기한 지남 문장 없음, 발행 52일이 지나도 연체처럼 말하지 않는다", () => {
    const s = summarizeUnpaid(
      [
        bill({ id: 2, period: "2026-09", total_amount: "302742", issued_at: "2026-09-01T09:00:00+09:00" }),
        bill({ id: 1, period: "2026-08", total_amount: "291192", issued_at: "2026-08-10T09:00:00+09:00" }),
      ],
      TODAY,
    )
    expect(s.total).toBe(593934)
    expect(s.lateSentence).toBeNull()
    expect(s.noDueSentence).toBe(NO_DUE_SENTENCE)
    expect(NO_DUE_SENTENCE).toContain("기한이 따로 정해지지 않았어요")
    expect(NO_DUE_SENTENCE).not.toContain("PDF")
    expect(s.rows.every((r) => r.dueText === "납부 기한 없음" && !r.pastDue)).toBe(true)
  })

  it("정정 중·작성 중·납부 완료는 낼 관리비에 들어가지 않는다", () => {
    const s = summarizeUnpaid(
      [
        bill({ id: 1, status: "draft", issued_at: "2026-09-01T09:00:00+09:00", total_amount: "100" }),
        bill({ id: 2, status: "draft", issued_at: null, total_amount: "100" }),
        bill({ id: 3, status: "paid", total_amount: "100", paid_at: "2026-09-20T10:00:00+09:00" }),
      ],
      TODAY,
    )
    expect(s.count).toBe(0)
    expect(s.total).toBe(0)
    expect(s.mostUrgent).toBeNull()
  })

  it("납부 완료 행은 납부 확인일을 보인다", () => {
    expect(billDueText({ status: "paid", due_date: "2026-09-10", paid_at: "2026-09-20T10:00:00+09:00" }, TODAY)).toBe("9월 20일(일) 납부 확인")
  })
})

describe("지난달 비교 한 줄(comparePrevious)", () => {
  it("줄었을 때·같을 때·조정 라인", () => {
    const cur = { period: "2026-09", total_amount: 270000, lines: [{ line_type: "rent", amount: 200000 }, { line_type: "manual", amount: -33000 }, { line_type: "elec_area", amount: 103000 }] }
    const prev = { period: "2026-08", total_amount: 300000, lines: [{ line_type: "rent", amount: 200000 }, { line_type: "elec_area", amount: 100000 }] }
    expect(comparePrevious(cur, prev)?.sentence).toBe("지난달보다 30,000원 줄었어요 · 조정 항목 때문에 가장 많이 줄었어요(-33,000원)")
    expect(comparePrevious({ ...prev, period: "2026-09" }, prev)?.sentence).toBe("지난달과 같은 금액이에요")
    expect(comparePrevious(cur, null)).toBeNull()
  })
})

describe("프로그램 묶음(groupPrograms) — 카드당 배지 1개", () => {
  const TODAY = "2026-10-01"
  const p = (o: Partial<PortalProgramRow>): PortalProgramRow => ({
    id: 1,
    title: "공고",
    status: "open",
    apply_start: "2026-09-01",
    apply_end: "2026-10-10",
    submit_deadline: "2026-10-31",
    application_status: null,
    submission_status: null,
    ...o,
  })

  it("해야 할 일·신청할 수 있어요·신청한 프로그램·지난 프로그램으로 나뉜다", () => {
    const g = groupPrograms(
      [
        p({ id: 1, status: "closed", apply_end: "2026-08-20", application_status: "rejected" }),
        p({ id: 2, apply_end: "2026-10-20" }),
        p({ id: 3, apply_end: "2026-10-10" }),
        p({ id: 4, application_status: "accepted", submit_deadline: "2026-10-20" }),
        p({ id: 5, application_status: "accepted", submission_status: "resubmit_requested" }),
        p({ id: 6, application_status: "applied" }),
        p({ id: 7, application_status: "accepted", submission_status: "reviewing" }),
        p({ id: 8, apply_end: "2026-09-20" }),
      ],
      TODAY,
    )
    expect(g.todo.map((c) => c.program.id)).toEqual([4, 5])
    expect(g.todo.map((c) => c.badge.label)).toEqual(["자료 제출 필요", "보완 요청"])
    expect(g.todo[0].line).toBe("자료 제출 · 10월 20일(화)까지(19일 남음)")
    expect(g.available.map((c) => c.program.id)).toEqual([3, 2])
    expect(g.available[0].line).toBe("신청 마감 10월 10일(토) · 9일 남음")
    expect(g.applied.map((c) => c.badge.label).sort()).toEqual(["검토 중", "결과 기다리는 중"])
    expect(g.past.map((c) => c.program.id)).toEqual([8, 1])
    expect(g.past.map((c) => c.badge.label)).toEqual(["모집 마감", "미선정"])
  })

  it("제출 마감이 지난 선정 건은 해야 할 일에 남지 않는다", () => {
    expect(classifyProgram(p({ application_status: "accepted", submit_deadline: "2026-09-30" }), TODAY).group).toBe("past")
  })
})

// ── 화면 문구(서버 렌더 결과) — 운영형 조건에서 약속·연체 문구가 나오지 않는지 ─────────────────────

describe("포털 화면 문구(렌더)", () => {
  const TODAY = "2026-10-01"
  const BANK = { text: DEFAULT_BANK_TEXT, bank: "하나은행", account: "910-910009-44304", holder: "㈜포항연합기술지주" }
  const RAW_BANK = { text: "입금 계좌는 센터에 문의해 주세요", bank: null, account: null, holder: null }
  const row = (o: Record<string, unknown>) => ({ id: 1, period: "2026-09", total_amount: "0", status: "issued", due_date: null, issued_at: "2026-09-01T09:00:00+09:00", paid_at: null, invoice_pathname: null, ...o })
  const home = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(PortalHome, { rooms: ["204"], programs: [], bank: BANK, phone: "054-279-8710", today: TODAY, bills: [], ...props } as never))

  it("홈(랩 조건): 합계·기한 지남 문장·계좌·[계좌번호 복사], '대시보드'·'환영합니다'·'처음 오셨네요' 없음", () => {
    const html = home({
      bills: [
        row({ id: 87, period: "2026-09", total_amount: "302742", due_date: "2026-10-10" }),
        row({ id: 66, period: "2026-08", total_amount: "291192", status: "overdue", due_date: "2026-09-10" }),
      ],
    })
    expect(html).toContain("593,934")
    expect(html).toContain("8월분 납부 기한이 21일 지났어요")
    expect(html).toContain("910-910009-44304")
    expect(html).toContain("계좌번호 복사")
    expect(html).toContain("204호 · 창업보육센터 입주기업")
    for (const w of ["대시보드", "환영합니다", "처음 오셨네요"]) expect(html).not.toContain(w)
  })

  it("홈(운영형: 기한 NULL·overdue 없음): '기한이 따로 정해지지 않았어요', 기한 지남 문장·'PDF를 확인해 주세요' 없음", () => {
    const html = home({ bills: [row({ id: 2, total_amount: "302742" }), row({ id: 1, period: "2026-08", total_amount: "291192", issued_at: "2026-08-10T09:00:00+09:00" })] })
    expect(html).toContain("납부 기한이 따로 정해지지 않았어요")
    expect(html).not.toContain("지났어요")
    expect(html).not.toContain("PDF를 확인해 주세요")
    expect(html).not.toContain("알려 드려요")
  })

  it("계좌 원문이 분해되지 않으면 원문만 보이고 [계좌번호 복사]는 숨긴다", () => {
    const html = home({ bank: RAW_BANK, bills: [row({ total_amount: "100" })] })
    expect(html).toContain("입금 계좌는 센터에 문의해 주세요")
    expect(html).not.toContain("계좌번호 복사")
  })

  it("청구서 불러오기 실패는 0건이 아니라 오류로 보인다", () => {
    const html = home({ bills: null })
    expect(html).toContain("청구서를 불러오지 못했어요")
    expect(html).not.toContain("낼 관리비가 없어요")
  })

  it("청구서 상세: 면적 배분 식·조정 라인·공급가액·PDF 없음 안내·지난달 비교, '정액' 없음", () => {
    const bill = {
      id: 97, period: "2026-09", total_amount: "269742", status: "issued", due_date: null, issued_at: "2026-09-01T09:00:00+09:00", paid_at: null,
      rent_total: "176400", mgmt_total: "15000", supply_amount: "174000", vat_amount: "17400", elec_amount: "111342", tenant_name: "x", room_no: null, invoice_pathname: null,
    }
    const lines = [
      { id: 1, contract_id: 1, room_code: "204", line_type: "rent", label: "9월 임대료 (204)", quantity: "8.40", unit_price: "21000.00", amount: "176400" },
      { id: 2, contract_id: 1, room_code: "204", line_type: "mgmt", label: "9월 관리비 (204)", quantity: null, unit_price: null, amount: "15000" },
      { id: 3, contract_id: 1, room_code: "204", line_type: "elec_area", label: "8월 전기사용료 (204, 면적별)", quantity: "8.40", unit_price: "132550.00", amount: "111342" },
      { id: 4, contract_id: null, room_code: null, line_type: "manual", label: "8월 과오납분 차감", quantity: null, unit_price: null, amount: "-33000" },
    ]
    const previous = comparePrevious({ period: "2026-09", total_amount: 269742, lines }, { period: "2026-08", total_amount: 291192, lines: [{ line_type: "rent", amount: 176400 }, { line_type: "mgmt", amount: 15000 }, { line_type: "elec_area", amount: 99792 }] })
    const html = renderToStaticMarkup(createElement(PortalBillDetailView, { bill, lines, previous, bank: BANK, phone: "054-279-8710", today: TODAY } as never))
    expect(html).toContain("132,550원 × 8.4 ÷ 10 = 111,342원")
    expect(html).toContain("8.4평 × 평당 21,000원")
    expect(html).toContain("조정")
    expect(html).toContain("-33,000")
    // "정액"은 관리비 라인의 "월 정액"(휴대폰 목록·데스크톱 표 각 1번)에만 — 조정·전기 라인에는 쓰지 않는다
    expect(html.match(/정액/g)?.length).toBe(2)
    expect(html.match(/월 정액/g)?.length).toBe(2)
    expect(html).toContain("임대료·관리비 공급가액 174,000원 · 부가세 17,400원")
    expect(html).toContain("PDF 파일이 아직 없어요")
    expect(html).toContain("지난달보다 21,450원 줄었어요")
    expect(html).toContain("납부 기한이 따로 정해지지 않았어요")
    expect(html).toContain("임대료·관리비는 9월분, 전기료는 8월 사용분이에요")
  })

  it("정정 중 안내에는 금액·항목이 없다", () => {
    const html = renderToStaticMarkup(createElement(PortalBillCorrecting, { period: "2026-08", phone: "054-279-8710" }))
    expect(html).toContain("센터에서 고치는 중이에요")
    expect(html).not.toMatch(/\d{1,3},\d{3}원/)
  })

  it("프로그램 단계 상자: 메일이 꺼져 있으면 메일 약속을 하지 않는다", () => {
    const base = { status: "open", apply_start: "2026-09-01", apply_end: "2026-10-10", submit_deadline: "2026-10-20", application_status: "applied", applied_at: "2026-10-01T05:20:00Z", submission_id: null, submission_status: null, feedback: null, submitted_at: null, submission_updated_at: null }
    const off = renderToStaticMarkup(createElement(ProgramStage, { program: base, mailEnabled: false, onApply: () => {}, today: TODAY }))
    expect(off).toContain("선정 결과는 이 화면에서 볼 수 있어요")
    expect(off).not.toContain("메일")
    expect(off).not.toContain("알려 드려요")
    const on = renderToStaticMarkup(createElement(ProgramStage, { program: base, mailEnabled: true, onApply: () => {}, today: TODAY }))
    expect(on).toContain("메일과 이 화면에서")
    const submitted = renderToStaticMarkup(createElement(ProgramStage, { program: { ...base, application_status: "accepted", submission_id: 1, submission_status: "submitted", submitted_at: "2026-10-01T05:20:11Z" }, mailEnabled: false, onApply: () => {}, today: TODAY }))
    expect(submitted).toContain("10월 1일 오후 2:20에 제출했어요")
    expect(submitted).not.toMatch(/2:20:11/)
  })

  it("센터가 '완료'로 닫은 신청(제출물 없음)은 제출 버튼·마감 문구 없이 '완료됐어요'만, 휴대폰 단계 줄은 마지막 단계", () => {
    const base = { status: "closed", apply_start: "2026-08-01", apply_end: "2026-08-20", submit_deadline: "2026-11-20", application_status: "completed", applied_at: "2026-08-05T05:20:00Z", submission_id: null, submission_status: null, feedback: null, submitted_at: null, submission_updated_at: null }
    for (const submit_deadline of ["2026-11-20", "2026-09-01", null]) {
      const html = renderToStaticMarkup(createElement(ProgramStage, { program: { ...base, submit_deadline }, mailEnabled: false, onApply: () => {}, today: TODAY }))
      expect(html).toContain("이 프로그램은 완료됐어요")
      expect(html).not.toContain("자료 제출하기")
      expect(html).not.toContain("제출 마감일이 지나")
      expect(html).toContain("3단계 중 3단계")
    }
  })

  it("단계가 모두 끝나지 않았어도 진행 중 칸이 없으면 마지막으로 끝난 단계를 가리킨다(미선정 → 2단계)", () => {
    const p = { status: "closed", apply_start: "2026-08-01", apply_end: "2026-08-20", submit_deadline: null, application_status: "rejected", applied_at: null, submission_id: null, submission_status: null, feedback: null, submitted_at: null, submission_updated_at: null }
    const html = renderToStaticMarkup(createElement(ProgramStage, { program: p, mailEnabled: false, onApply: () => {}, today: TODAY }))
    expect(html).toContain("3단계 중 2단계")
    expect(html).toContain("이번에는 선정되지 않았어요")
  })

  it("기한 지남 안내는 날짜에 요일 괄호를 겹치지 않는다(\"납부 기한(9월 10일)이\")", () => {
    const bill = {
      id: 87, period: "2026-08", total_amount: "100000", status: "overdue", due_date: "2026-09-10", issued_at: "2026-08-01T09:00:00+09:00", paid_at: null,
      rent_total: "0", mgmt_total: "0", supply_amount: null, vat_amount: null, elec_amount: null, tenant_name: "x", room_no: null, invoice_pathname: null,
    }
    const html = renderToStaticMarkup(createElement(PortalBillDetailView, { bill, lines: [], previous: null, bank: BANK, phone: "054-279-8710", today: TODAY } as never))
    expect(html).toContain("납부 기한(9월 10일)이")
    expect(html).not.toMatch(/납부 기한\(9월 10일\(/)
  })
})
