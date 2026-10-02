import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"

// 입주기업 API 계약(계획서 4.3.7, 가드 #21·#14) — 실제 마이그레이션 위에서 라우트를 그대로 부른다(local-pg).
//   PUT: 키가 없으면 기존 값 유지, 빈 문자열만 NULL, status도 키가 없으면 유지, 형식 검증은 바뀐 칸만, field_errors 응답.
//   GET: 기존 필드 + 계약 기준 호실·청구서 받을 메일·받을 돈. POST: tax_email·manager_name. DELETE: 그대로.
//   GET /api/admin/tenants/[id]/summary: 조회 전용, 받을 돈·삭제 영향 건수.
//   모든 메서드: 쿠키(세션) 없이 401.

let session: { id: number; email: string; name: string } | null = { id: 1, email: "admin@test", name: "관리자" }
vi.mock("@/lib/auth", () => ({ getSession: async () => session }))

import { GET, POST, PUT, DELETE } from "@/app/api/admin/tenants/route"
import { GET as SUMMARY } from "@/app/api/admin/tenants/[id]/summary/route"
import { businessNoError, emailError, formatBusinessNo, paymentNoticeText, accountNoticeText, coreName, roomsLabel } from "@/lib/tenant-model"

const pgAvailable = hasLocalPostgres()
const URL_BASE = "http://localhost/api/admin/tenants"

function req(method: string, body?: unknown, url = URL_BASE): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe("tenant-model(순수)", () => {
  it("사업자번호: 하이픈 빼고 숫자 10자리", () => {
    expect(businessNoError("")).toBeNull()
    expect(businessNoError("359-82-15780")).toBeNull()
    expect(businessNoError("3598215780")).toBeNull()
    expect(businessNoError("359-82-1578")).toBe("사업자번호는 숫자 10자리예요(지금 9자리)")
    expect(businessNoError("35a-82-15780")).toMatch(/숫자와 하이픈/)
    expect(formatBusinessNo("3598215780")).toBe("359-82-15780")
    expect(formatBusinessNo(" 12345 ")).toBe("12345")
  })
  it("이메일 형식", () => {
    expect(emailError("", "청구서 받을 메일")).toBeNull()
    expect(emailError("tax@sol.example", "청구서 받을 메일")).toBeNull()
    expect(emailError("tax@", "청구서 받을 메일")).toMatch(/청구서 받을 메일 형식/)
  })
  it("안내문: 포털 주소·납부 안내", () => {
    const t = accountNoticeText({ tenantName: "(주)솔바람테크", portalUrl: "https://x.example/portal/login", email: "a@b.kr", password: "Temp1234" })
    expect(t).toContain("https://x.example/portal/login")
    expect(t).toContain("처음 로그인하면 비밀번호를 바꿔 주세요")
    const p = paymentNoticeText({
      tenantName: "(주)솔바람테크",
      bills: [{ period: "2026-09", total_amount: "300000" }, { period: "2026-08", total_amount: "293934" }],
      total: 593934,
      bank: { text: "x", bank: "하나은행", account: "910-910009-44304", holder: "㈜포항연합기술지주" },
      contactPhone: "054-279-8710",
      today: "2026-10-01",
    })
    expect(p).toBe("(주)솔바람테크 8월분·9월분 관리비 593,934원이 아직 입금 확인 전이에요. 하나은행 910-910009-44304(㈜포항연합기술지주)로 보내 주세요. 문의 054-279-8710")
    // 계좌가 분해되지 않으면 원문 한 줄
    const raw = paymentNoticeText({ tenantName: "A", bills: [{ period: "2026-09", total_amount: 1000 }], total: 1000, bank: { text: "농협\n301-0000", bank: null, account: null, holder: null } })
    expect(raw).toContain("농협 / 301-0000로 보내 주세요.")
    expect(coreName("(주)솔바람테크")).toBe("솔바람테크")
    expect(coreName("주식회사 파도소리바이오")).toBe("파도소리바이오")
  })
  it("호실 표시: 숫자 호실은 '201·202호'로 묶는다(휴대폰 카드의 ' · ' 구분과 겹치지 않게)", () => {
    expect(roomsLabel(null)).toBe("")
    expect(roomsLabel("204")).toBe("204호")
    expect(roomsLabel("201, 202")).toBe("201·202호")
    expect(roomsLabel("201,B동 창고")).toBe("201호·B동 창고")
    expect(roomsLabel("201, 202")).not.toContain(" · ")
  })
})

describe("세션 없이 401", () => {
  beforeAll(() => {
    session = null
  })
  afterAll(() => {
    session = { id: 1, email: "admin@test", name: "관리자" }
  })
  it("목록·등록·수정·삭제·요약 모두 401", async () => {
    expect((await GET(req("GET"))).status).toBe(401)
    expect((await POST(req("POST", { name: "x" }))).status).toBe(401)
    expect((await PUT(req("PUT", { id: 1, name: "x" }))).status).toBe(401)
    expect((await DELETE(req("DELETE", undefined, `${URL_BASE}?id=1`))).status).toBe(401)
    expect((await SUMMARY(req("GET", undefined, `${URL_BASE}/1/summary`), { params: Promise.resolve({ id: "1" }) })).status).toBe(401)
  })
})

describe.skipIf(!pgAvailable)("tenants API(local-pg)", () => {
  let pg: LocalPg

  beforeAll(async () => {
    pg = await startLocalPg()
    neonConfig.fetchFunction = pg.fetchFunction
    process.env.DATABASE_URL = pg.databaseUrl
    for (const m of ["2026-saas-01-tenants.sql", "2026-saas-02-emails.sql", "2026-saas-04-programs.sql", "2026-saas-06-billing-v2.sql", "2026-saas-07-admin-notes.sql"])
      await applyMigration(pg.conn, `scripts/migrations/${m}`)
  }, 90_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
  })

  beforeEach(async () => {
    session = { id: 1, email: "admin@test", name: "관리자" }
    await pg.conn.simple(`
      TRUNCATE bill_lines, bills, contracts, rooms, email_logs, program_applications, submissions, programs, tenant_users, tenants RESTART IDENTITY CASCADE;
      INSERT INTO tenants (id, name, business_no, ceo_name, room_no, contact_email, contact_phone, move_in_date, status, memo, tax_email, manager_name, overpaid_balance)
      VALUES (1, '(주)솔바람테크', '359-82-15780', '김가온', '204', 'ceo@sol.example', '010-9855-4616', '2024-03-01', 'active', '첫 메모', 'tax@sol.example', '김회계', 33000),
             (2, '형식불량상사', '12345', '박대표', NULL, 'boss@bad.example', NULL, NULL, 'active', NULL, NULL, NULL, 0);
      SELECT setval('tenants_id_seq', 10);
      INSERT INTO rooms (id, code, building, floor, pyeong, sort_order) VALUES (1, '204', '본관', 2, 10, 4), (2, '205', '본관', 2, 20, 5);
      INSERT INTO contracts (tenant_id, room_id, start_date, pyeong_billed, rent_unit_price, mgmt_fee, elec_method, status)
        VALUES (1, 1, '2024-03-01', 10, 21000, 15000, 'area', 'active'), (1, 2, '2025-01-01', 20, 21000, 15000, 'area', 'active');
      INSERT INTO bills (tenant_id, period, total_amount, status, due_date, issued_at, paid_at)
        VALUES (1, '2026-07', 280000, 'paid', '2026-07-10', '2026-07-01', '2026-07-09'),
               (1, '2026-08', 293934, 'overdue', '2026-08-10', '2026-08-01', NULL),
               (1, '2026-09', 300000, 'issued', NULL, '2026-09-01', NULL),
               (1, '2026-10', 310000, 'draft', NULL, NULL, NULL);
      INSERT INTO email_logs (to_email, tenant_id, template_code, subject, status) VALUES ('tax@sol.example', 1, 'bill_issued', '9월분 청구서', 'sent');
    `)
  })

  async function row(id: number) {
    const r = await pg.conn.simple(
      `SELECT name, business_no, ceo_name, room_no, contact_email, contact_phone, move_in_date::text AS move_in_date, status, memo, tax_email, manager_name, overpaid_balance::text AS overpaid FROM tenants WHERE id = ${id}`,
    )
    const f = r[0].fields.map((x) => x.name)
    return Object.fromEntries(f.map((k, i) => [k, r[0].rows[0]?.[i] ?? null])) as Record<string, string | null>
  }

  it("{id, name, status:'moved_out'}만 보내도 나머지 칸이 유지된다", async () => {
    const before = await row(1)
    const res = await PUT(req("PUT", { id: 1, name: "(주)솔바람테크", status: "moved_out" }))
    expect(res.status).toBe(200)
    const after = await row(1)
    expect(after.status).toBe("moved_out")
    for (const k of ["tax_email", "room_no", "memo", "contact_email", "business_no", "ceo_name", "move_in_date", "manager_name", "overpaid", "contact_phone"]) {
      expect(after[k], k).toBe(before[k])
    }
  })

  it("status를 보내지 않으면 상태를 유지한다(active로 되돌리지 않는다)", async () => {
    await pg.conn.simple(`UPDATE tenants SET status = 'moved_out' WHERE id = 1`)
    const res = await PUT(req("PUT", { id: 1, memo: "메모만 바꿈" }))
    expect(res.status).toBe(200)
    const after = await row(1)
    expect(after.status).toBe("moved_out")
    expect(after.memo).toBe("메모만 바꿈")
    expect(after.name).toBe("(주)솔바람테크")
  })

  it("바뀌지 않은 형식 불량 사업자번호가 있어도 메모 저장이 된다", async () => {
    // 전체 행을 보내는 쪽(사업자번호 원문 그대로)
    const full = await PUT(req("PUT", { id: 2, name: "형식불량상사", business_no: "12345", memo: "메모 저장", status: "active" }))
    expect(full.status).toBe(200)
    // 메모만 보내는 쪽(기업 카드 메모 탭: {id, name, memo})
    const memoOnly = await PUT(req("PUT", { id: 2, name: "형식불량상사", memo: "두 번째 메모" }))
    expect(memoOnly.status).toBe(200)
    const after = await row(2)
    expect(after.memo).toBe("두 번째 메모")
    expect(after.business_no).toBe("12345")
  })

  it("바뀐 사업자번호가 9자리면 field_errors.business_no(저장 안 함)", async () => {
    const res = await PUT(req("PUT", { id: 1, name: "(주)솔바람테크", business_no: "359-82-1578", memo: "바뀌면 안 됨" }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.field_errors.business_no).toMatch(/10자리/)
    const after = await row(1)
    expect(after.business_no).toBe("359-82-15780")
    expect(after.memo).toBe("첫 메모")
  })

  it("바뀐 사업자번호 숫자 10자리는 000-00-00000으로 저장", async () => {
    const res = await PUT(req("PUT", { id: 2, business_no: "1234567890" }))
    expect(res.status).toBe(200)
    expect((await row(2)).business_no).toBe("123-45-67890")
  })

  it("바뀐 이메일 형식 오류는 칸별 field_errors", async () => {
    const res = await PUT(req("PUT", { id: 1, tax_email: "tax@", contact_email: "nope" }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(Object.keys(body.field_errors).sort()).toEqual(["contact_email", "tax_email"])
  })

  it("빈 문자열만 NULL, 청구서 받을 메일·담당자 이름 저장", async () => {
    const r1 = await PUT(req("PUT", { id: 1, tax_email: "", manager_name: "이담당" }))
    expect(r1.status).toBe(200)
    let after = await row(1)
    expect(after.tax_email).toBeNull()
    expect(after.manager_name).toBe("이담당")
    expect(after.contact_email).toBe("ceo@sol.example")
    const r2 = await PUT(req("PUT", { id: 1, tax_email: " new@sol.example " }))
    expect(r2.status).toBe(200)
    after = await row(1)
    expect(after.tax_email).toBe("new@sol.example")
  })

  it("기업명은 키가 있으면 비울 수 없고, 없으면 유지", async () => {
    const res = await PUT(req("PUT", { id: 1, name: "  " }))
    expect(res.status).toBe(400)
    expect((await res.json()).field_errors.name).toBeTruthy()
    expect((await PUT(req("PUT", { id: 1, ceo_name: "새대표" }))).status).toBe(200)
    expect((await row(1)).name).toBe("(주)솔바람테크")
  })

  it("과납잔액: 음수는 400, 보내지 않으면 유지(가드 #14)", async () => {
    const neg = await PUT(req("PUT", { id: 1, overpaid_balance: -1 }))
    expect(neg.status).toBe(400)
    expect((await neg.json()).field_errors.overpaid_balance).toBe("더 받은 금액(과납)은 0 이상으로 넣어 주세요")
    expect((await PUT(req("PUT", { id: 1, memo: "x" }))).status).toBe(200)
    expect((await row(1)).overpaid).toBe("33000")
    expect((await PUT(req("PUT", { id: 1, overpaid_balance: "5000" }))).status).toBe(200)
    expect((await row(1)).overpaid).toBe("5000")
  })

  it("기존 호출: 예전 수정 폼처럼 전체 행을 보내면 그대로 저장된다", async () => {
    const legacy = {
      id: 1,
      name: "(주)솔바람테크2",
      business_no: "359-82-15780",
      ceo_name: "김가온",
      room_no: "204",
      contact_email: "ceo@sol.example",
      contact_phone: "010-1111-2222",
      move_in_date: "2024-03-01",
      move_out_date: "",
      status: "active",
      memo: "",
      overpaid_balance: "33000",
    }
    const res = await PUT(req("PUT", legacy))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.tenant.id).toBe(1)
    const after = await row(1)
    expect(after.name).toBe("(주)솔바람테크2")
    expect(after.contact_phone).toBe("010-1111-2222")
    expect(after.memo).toBeNull() // 빈 문자열 → NULL(예전과 같음)
    expect(after.tax_email).toBe("tax@sol.example") // 예전 폼에 없던 칸은 유지
  })

  it("GET 행 전체 + status를 그대로 보내면(WP4 방식) 상태 말고는 바뀌지 않는다", async () => {
    const list = await (await GET(req("GET", undefined, `${URL_BASE}?status=active`))).json()
    const t = list.tenants.find((x: { id: number }) => x.id === 2)
    const before = await row(2)
    const res = await PUT(req("PUT", { ...t, status: "moved_out" }))
    expect(res.status).toBe(200)
    const after = await row(2)
    expect(after).toEqual({ ...before, status: "moved_out" })
  })

  it("없는 기업은 404, id 없으면 400", async () => {
    expect((await PUT(req("PUT", { id: 999, name: "x" }))).status).toBe(404)
    expect((await PUT(req("PUT", { name: "x" }))).status).toBe(400)
  })

  it("GET: 기존 필드 + 계약 기준 호실·청구서 받을 메일·받을 돈", async () => {
    const res = await GET(req("GET"))
    expect(res.status).toBe(200)
    const { tenants } = await res.json()
    const sol = tenants.find((x: { id: number }) => x.id === 1)
    for (const k of ["id", "name", "business_no", "ceo_name", "room_no", "contact_email", "contact_phone", "move_in_date", "move_out_date", "status", "memo", "overpaid_balance", "account_id", "account_email", "account_last_login"]) {
      expect(sol, k).toHaveProperty(k)
    }
    expect(sol.move_in_date).toBe("2024-03-01")
    expect(sol.contract_rooms).toBe("204, 205")
    expect(sol.active_contracts).toBe(2)
    expect(sol.tax_email).toBe("tax@sol.example")
    expect(sol.manager_name).toBe("김회계")
    expect(sol.unpaid_count).toBe(2) // overdue + issued(초안·납부 제외)
    expect(Number(sol.unpaid_total)).toBe(593934)
    expect(sol.unpaid_late_count).toBeGreaterThanOrEqual(1)
    const bad = tenants.find((x: { id: number }) => x.id === 2)
    expect(bad.contract_rooms).toBeNull()
    expect(bad.unpaid_count).toBe(0)
    // status 필터
    const active = await (await GET(req("GET", undefined, `${URL_BASE}?status=moved_out`))).json()
    expect(active.tenants).toHaveLength(0)
  })

  it("POST: 청구서 받을 메일·담당자 이름 저장, 형식 오류는 field_errors", async () => {
    const bad = await POST(req("POST", { name: "새기업", business_no: "123", tax_email: "x@" }))
    expect(bad.status).toBe(400)
    const badBody = await bad.json()
    expect(Object.keys(badBody.field_errors).sort()).toEqual(["business_no", "tax_email"])
    // 입주 폼 즉석 등록(WP4): 같은 메일을 tax_email·contact_email에 같이
    const ok = await POST(req("POST", { name: "(주)새벽빛랩", business_no: "1112233333", tax_email: "a@dawn.example", contact_email: "a@dawn.example", manager_name: "한담당" }))
    expect(ok.status).toBe(200)
    const body = await ok.json()
    expect(body.tenant.id).toBeGreaterThan(10)
    const r = await row(body.tenant.id)
    expect(r.tax_email).toBe("a@dawn.example")
    expect(r.manager_name).toBe("한담당")
    expect(r.business_no).toBe("111-22-33333")
    expect(r.status).toBe("active")
    // 이름 없으면 400
    expect((await POST(req("POST", {}))).status).toBe(400)
  })

  it("summary: 받을 돈·가장 오래된 청구·최근 청구·삭제 영향 건수(SELECT만)", async () => {
    const before = await pg.conn.simple(`SELECT md5(string_agg(t::text, ',' ORDER BY id)) FROM tenants t`)
    const res = await SUMMARY(req("GET"), { params: Promise.resolve({ id: "1" }) })
    expect(res.status).toBe(200)
    const { summary } = await res.json()
    expect(summary.tenant.name).toBe("(주)솔바람테크")
    expect(summary.receivable.count).toBe(2)
    expect(summary.receivable.total).toBe(593934)
    expect(summary.receivable.oldest.period).toBe("2026-08")
    expect(summary.receivable.bills.map((b: { period: string }) => b.period)).toEqual(["2026-08", "2026-09"])
    expect(summary.bills.map((b: { period: string }) => b.period)).toEqual(["2026-10", "2026-09", "2026-08", "2026-07"])
    expect(summary.contracts).toHaveLength(2)
    expect(summary.contracts[0].room_code).toBeTruthy()
    expect(summary.emails).toHaveLength(1)
    expect(summary.impact).toMatchObject({ bills: 4, contracts: 2, applications: 0, submissions: 0, has_account: false })
    const after = await pg.conn.simple(`SELECT md5(string_agg(t::text, ',' ORDER BY id)) FROM tenants t`)
    expect(after[0].rows[0][0]).toBe(before[0].rows[0][0])
    // 없는 기업 404, 잘못된 id 400
    const missing = await SUMMARY(req("GET"), { params: Promise.resolve({ id: "999" }) })
    expect(missing.status).toBe(404)
    expect((await missing.json()).error).toBe("이 기업을 찾을 수 없어요(삭제됐을 수 있어요)")
    expect((await SUMMARY(req("GET"), { params: Promise.resolve({ id: "abc" }) })).status).toBe(400)
  })

  it("DELETE 동작은 그대로(계약·청구서 CASCADE)", async () => {
    const res = await DELETE(req("DELETE", undefined, `${URL_BASE}?id=1`))
    expect(res.status).toBe(200)
    const left = await pg.conn.simple(`SELECT (SELECT COUNT(*) FROM tenants WHERE id = 1), (SELECT COUNT(*) FROM bills WHERE tenant_id = 1), (SELECT COUNT(*) FROM contracts WHERE tenant_id = 1)`)
    expect(left[0].rows[0]).toEqual(["0", "0", "0"])
    expect((await DELETE(req("DELETE", undefined, `${URL_BASE}?id=1`))).status).toBe(404)
  })
})
