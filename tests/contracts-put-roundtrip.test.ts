import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"
import {
  EDITABLE_KEYS,
  NEW_CONTRACT_FORM,
  buildCreateBody,
  buildPutBody,
  changedKeys,
  chargePreview,
  formFromRow,
  isFormDirty,
  validateContractForm,
  type ContractRow,
} from "@/components/admin/billing/settings/contract-sheet-model"
import { parseUnitValue } from "@/components/saas/unit-input-model"
import { importCounts } from "@/components/admin/billing/settings/import-counts"
import { resolveSettingsTab } from "@/components/admin/billing/settings/url-keys"
import { errorDetail } from "@/components/admin/billing/settings/types"
import { RATE_RULES, RENT_RULE_TEXT, MGMT_FIELD_HINT } from "@/components/admin/billing/settings/rate-rules"

// 기준 정보 > 계약 시트의 저장 경로(WP5b, 가드 #21).
// PUT /api/admin/contracts는 전체 덮어쓰기라(빠진 칸 → 기본값·NULL) 시트는 GET 행 전체를 고친 칸만 바꿔 되돌려 보낸다.
// 확인: ① GET 행을 그대로 PUT하면 아무 값도 바뀌지 않는다(공장동 mgmt_fee 30,000원 유지)
//       ② 시트 모델이 보내는 본문에 GET 행의 모든 키가 있다 ③ 고친 칸만 바뀐다 ④ 쿠키 없이 401.
// 라우트(app/api/admin/contracts/route.ts)는 고치지 않는다 — 실제 마이그레이션 위에서 라우트 핸들러를 그대로 부른다(local-pg).

let adminSession: { id: number; email: string; name: string } | null = null
vi.mock("@/lib/auth", () => ({
  getSession: async () => adminSession,
  getPortalSession: async () => null,
}))

import { GET as LIST, PUT as UPDATE, POST as CREATE } from "@/app/api/admin/contracts/route"

const pgAvailable = hasLocalPostgres()

// ── 순수 모델 ─────────────────────────────────────────────────────────────────

const FACTORY_ROW: ContractRow = {
  id: 14,
  tenant_id: 3,
  tenant_name: "(주)무쇠공작소",
  room_id: 2,
  room_code: "F101",
  building: "공장동",
  contract_date: "2022-05-01",
  start_date: "2022-05-01",
  renewal_type: "new",
  pyeong_billed: "42.0",
  pyeong_actual: "42.0",
  rent_unit_price: "15000",
  mgmt_fee: "30000",
  deposit_standard: "8400000",
  deposit_actual: "8400000",
  elec_method: "metered",
  status: "active",
  ended_at: null,
  first_month_billing: "prorated",
  last_month_billing: "full",
  deposit_returned_at: null,
  deposit_returned_amount: null,
  memo: "원상복구 특약",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
}

describe("계약 시트 모델(순수)", () => {
  it("고친 칸이 없으면 본문 = GET 행 그대로(모든 키 포함)", () => {
    const body = buildPutBody(FACTORY_ROW, formFromRow(FACTORY_ROW))
    expect(body).toEqual(FACTORY_ROW)
    for (const k of Object.keys(FACTORY_ROW)) expect(body).toHaveProperty(k)
  })

  it("고친 칸만 바뀌고 나머지는 GET 값 그대로", () => {
    const form = { ...formFromRow(FACTORY_ROW), rent_unit_price: parseUnitValue("16,000원") }
    const body = buildPutBody(FACTORY_ROW, form)
    expect(body.rent_unit_price).toBe("16000")
    expect(body.mgmt_fee).toBe("30000")
    expect(body.memo).toBe("원상복구 특약")
    expect(body.first_month_billing).toBe("prorated")
    expect(body.renewal_type).toBe("new")
    expect({ ...body, rent_unit_price: FACTORY_ROW.rent_unit_price }).toEqual(FACTORY_ROW)
  })

  it("숫자 칸은 \"42.0\"과 \"42\"를 같은 값으로 본다(UnitInput이 소수 끝 0을 지워도 변경 아님)", () => {
    const form = { ...formFromRow(FACTORY_ROW), pyeong_billed: parseUnitValue("42", { decimals: 1 }) }
    expect(form.pyeong_billed).toBe("42")
    expect(changedKeys(formFromRow(FACTORY_ROW), form)).toEqual([])
    expect(isFormDirty(formFromRow(FACTORY_ROW), form)).toBe(false)
    expect(buildPutBody(FACTORY_ROW, form).pyeong_billed).toBe("42.0")
  })

  it("빈칸은 null로 보낸다(0으로 바꾸지 않는다)", () => {
    const form = { ...formFromRow(FACTORY_ROW), deposit_actual: parseUnitValue("") }
    expect(form.deposit_actual).toBeNull()
    expect(buildPutBody(FACTORY_ROW, form).deposit_actual).toBeNull()
  })

  it("편집 칸 목록은 PUT이 읽는 칸을 모두 덮는다(기업·호실 제외)", () => {
    const putReads = [
      "contract_date", "start_date", "renewal_type", "pyeong_billed", "pyeong_actual", "rent_unit_price",
      "mgmt_fee", "deposit_standard", "deposit_actual", "elec_method", "first_month_billing", "memo",
    ]
    expect([...EDITABLE_KEYS].sort()).toEqual([...putReads].sort())
  })

  it("즉석 계산: 42.0평 × 15,000원 = 630,000원, 관리비 30,000원", () => {
    expect(chargePreview(formFromRow(FACTORY_ROW))).toEqual({ pyeong: 42, unit: 15000, rent: 630000, mgmt: 30000, gross: 660000, mgmtDefaulted: false })
    expect(chargePreview({ ...NEW_CONTRACT_FORM })).toBeNull()
    expect(chargePreview({ ...NEW_CONTRACT_FORM, pyeong_billed: "8.4", mgmt_fee: null })).toMatchObject({ rent: 176400, mgmt: 15000, mgmtDefaulted: true })
  })

  it("검사: 수정은 면적·단가만, 추가는 기업·호실도", () => {
    const e1 = validateContractForm(formFromRow(FACTORY_ROW), { mode: "edit" })
    expect(Object.values(e1).filter(Boolean)).toEqual([])
    const e2 = validateContractForm({ ...NEW_CONTRACT_FORM, rent_unit_price: null }, { mode: "create" })
    expect(e2.tenant).toBeTruthy()
    expect(e2.room).toBeTruthy()
    expect(e2.pyeong_billed).toBeTruthy()
    expect(e2.rent_unit_price).toBeTruthy()
    // 단가 0(면제)은 허용
    expect(validateContractForm({ ...NEW_CONTRACT_FORM, pyeong_billed: "10", rent_unit_price: "0" }, { mode: "edit" }).rent_unit_price).toBe(false)
  })

  it("새 계약 기본값은 지금과 같다(갱신·면적 배분·첫 달 전액, 가드 #26)", () => {
    expect(NEW_CONTRACT_FORM).toMatchObject({ renewal_type: "renewal", elec_method: "area", first_month_billing: "full", rent_unit_price: "21000", mgmt_fee: "15000" })
    expect(buildCreateBody(NEW_CONTRACT_FORM, "3", "7")).toMatchObject({ tenant_id: "3", room_id: "7", first_month_billing: "full" })
  })
})

// ── 실제 라우트(local-pg) ─────────────────────────────────────────────────────

describe.skipIf(!pgAvailable)("PUT /api/admin/contracts 행 전체 왕복(local-pg)", () => {
  let pg: LocalPg

  beforeAll(async () => {
    pg = await startLocalPg()
    neonConfig.fetchFunction = pg.fetchFunction
    process.env.DATABASE_URL = pg.databaseUrl
    for (const m of ["2026-saas-01-tenants.sql", "2026-saas-02-emails.sql", "2026-saas-04-programs.sql", "2026-saas-06-billing-v2.sql"])
      await applyMigration(pg.conn, `scripts/migrations/${m}`)
  }, 90_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
  })

  beforeEach(async () => {
    await pg.conn.simple(`
      TRUNCATE contracts, rooms, tenants RESTART IDENTITY CASCADE;
      INSERT INTO tenants (id, name) VALUES (1, '(주)솔바람테크'), (2, '(주)무쇠공작소'), (3, '(주)퇴실기업');
      INSERT INTO rooms (id, code, building, floor, pyeong) VALUES (1, '204', '본관', 2, 8.4), (2, 'F101', '공장동', 1, 42), (3, '305', '본관', 3, 12.6);
      INSERT INTO contracts (tenant_id, room_id, contract_date, start_date, renewal_type, pyeong_billed, pyeong_actual, rent_unit_price, mgmt_fee,
                             deposit_standard, deposit_actual, elec_method, first_month_billing, memo)
        VALUES (1, 1, '2025-03-01', '2025-03-15', 'renewal', 8.4, 8.4, 21000, 15000, 1680000, NULL, 'area', 'prorated', NULL),
               (2, 2, '2022-05-01', '2022-05-01', 'new', 42, 42, 15000, 30000, 8400000, 8400000, 'metered', 'none', '원상복구 특약');
      INSERT INTO contracts (tenant_id, room_id, start_date, renewal_type, pyeong_billed, pyeong_actual, rent_unit_price, mgmt_fee,
                             deposit_standard, deposit_actual, elec_method, status, ended_at, last_month_billing, deposit_returned_at, deposit_returned_amount)
        VALUES (3, 3, '2024-01-01', 'new', 12.6, 12.6, 20000, 15000, 2520000, 2520000, 'area', 'ended', '2026-08-15', 'prorated', '2026-08-20', 2400000);
    `)
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function call(handler: (req: any) => Promise<Response>, method: string, body?: unknown, path = "/api/admin/contracts") {
    const req = new NextRequest(`http://localhost${path}`, {
      method,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    })
    const res = await handler(req)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, json: (await res.json()) as any }
  }
  const admin = { id: 1, email: "lab-admin@example.com", name: "관리자" }
  const strip = (rows: ContractRow[]) =>
    rows.map((r) => {
      const { updated_at: _u, ...rest } = r
      return JSON.parse(JSON.stringify(rest))
    })
  async function list(): Promise<ContractRow[]> {
    adminSession = admin
    const r = await call(LIST, "GET")
    expect(r.status).toBe(200)
    return r.json.contracts
  }

  it("쿠키(세션) 없이 GET·PUT·POST는 401", async () => {
    adminSession = null
    expect((await call(LIST, "GET")).status).toBe(401)
    expect((await call(UPDATE, "PUT", { id: 1, pyeong_billed: 1, rent_unit_price: 1 })).status).toBe(401)
    expect((await call(CREATE, "POST", { tenant_id: 1, room_id: 3, pyeong_billed: 1, rent_unit_price: 1 })).status).toBe(401)
  })

  it("GET 행을 그대로 PUT하면 아무 값도 바뀌지 않는다(공장동 관리비 30,000원 유지)", async () => {
    const before = await list()
    expect(before).toHaveLength(3)
    for (const row of before) {
      adminSession = admin
      const r = await call(UPDATE, "PUT", row)
      expect(r.status).toBe(200)
    }
    const after = await list()
    expect(strip(after)).toEqual(strip(before))
    const factory = after.find((c) => c.room_code === "F101")!
    expect(factory.mgmt_fee).toBe("30000")
    expect(factory.renewal_type).toBe("new")
    expect(factory.first_month_billing).toBe("none")
    expect(factory.memo).toBe("원상복구 특약")
    expect(factory.deposit_actual).toBe("8400000")
  })

  it("시트 모델 본문(buildPutBody)에 GET 행의 모든 키가 있고, 고치지 않으면 저장 뒤에도 같다", async () => {
    const before = await list()
    for (const row of before) {
      const body = buildPutBody(row, formFromRow(row))
      for (const k of Object.keys(row)) expect(body, `키 ${k}`).toHaveProperty(k)
      adminSession = admin
      expect((await call(UPDATE, "PUT", body)).status).toBe(200)
    }
    expect(strip(await list())).toEqual(strip(before))
  })

  it("공장동 계약에서 평당 임대료만 고치면 그 칸만 바뀐다(관리비·청구 방식·메모·보증금 유지)", async () => {
    const before = await list()
    const row = before.find((c) => c.room_code === "F101")!
    const form = { ...formFromRow(row), rent_unit_price: parseUnitValue("16,000") }
    adminSession = admin
    expect((await call(UPDATE, "PUT", buildPutBody(row, form))).status).toBe(200)
    const after = await list()
    const changed = after.find((c) => c.room_code === "F101")!
    expect(changed.rent_unit_price).toBe("16000")
    expect(strip([{ ...changed, rent_unit_price: row.rent_unit_price }])).toEqual(strip([row]))
    // 다른 계약은 그대로
    expect(strip(after.filter((c) => c.room_code !== "F101"))).toEqual(strip(before.filter((c) => c.room_code !== "F101")))
  })

  it("빈칸으로 비운 받은 보증금은 0이 아니라 NULL로 저장된다(가드 #12)", async () => {
    const row = (await list()).find((c) => c.room_code === "F101")!
    const form = { ...formFromRow(row), deposit_actual: parseUnitValue("") }
    adminSession = admin
    expect((await call(UPDATE, "PUT", buildPutBody(row, form))).status).toBe(200)
    expect((await list()).find((c) => c.room_code === "F101")!.deposit_actual).toBeNull()
  })

  it("(왜 행 전체를 보내나) 고친 칸만 보내면 PUT이 빠진 칸을 기본값으로 덮어쓴다 — 시트는 이 길을 쓰지 않는다", async () => {
    const row = (await list()).find((c) => c.room_code === "F101")!
    adminSession = admin
    await call(UPDATE, "PUT", { id: row.id, pyeong_billed: row.pyeong_billed, rent_unit_price: row.rent_unit_price })
    const after = (await list()).find((c) => c.room_code === "F101")!
    expect(after.mgmt_fee).toBe("15000") // 30,000원이 15,000원이 된다
    expect(after.memo).toBeNull()
  })

  it("(알려진 라우트 동작) 실제 면적·기준 보증금이 NULL인 행은 PUT이 부과 면적·평당 20만 원으로 채운다 — 화면 힌트로 알린다", async () => {
    await pg.conn.simple(`UPDATE contracts SET pyeong_actual = NULL, deposit_standard = NULL WHERE room_id = 1`)
    const row = (await list()).find((c) => c.room_code === "204")!
    adminSession = admin
    expect((await call(UPDATE, "PUT", buildPutBody(row, formFromRow(row)))).status).toBe(200)
    const after = (await list()).find((c) => c.room_code === "204")!
    expect(after.pyeong_actual).toBe("8.4")
    expect(after.deposit_standard).toBe("1680000")
    // 그 밖의 칸은 그대로
    expect(strip([{ ...after, pyeong_actual: null, deposit_standard: null }])).toEqual(strip([row]))
  })

  it("새 계약(POST)은 시트 기본값 그대로 저장된다", async () => {
    adminSession = admin
    const r = await call(CREATE, "POST", buildCreateBody({ ...NEW_CONTRACT_FORM, pyeong_billed: "12.6", deposit_actual: "2520000" }, "3", "3"))
    expect(r.status).toBe(200)
    const created = (await list()).find((c) => c.id === r.json.id)!
    expect(created).toMatchObject({ renewal_type: "renewal", elec_method: "area", first_month_billing: "full", rent_unit_price: "21000", mgmt_fee: "15000", pyeong_billed: "12.6", deposit_actual: "2520000" })
  })
})

// ── 가져오기 확인창 숫자(같은 화면, 순수) ─────────────────────────────────────

describe("가져오기 확인창 숫자(importCounts)", () => {
  it("기업·계약·호실(계약 호실 + 공실, 중복 제거)을 센다", () => {
    const n = importCounts({
      tenants: [
        { name: "가", matched_tenant_id: 3, contracts: [{ room_code: "201" }, { room_code: "202" }] },
        { name: "나", matched_tenant_id: null, contracts: [{ room_code: "F101" }, { room_code: "" }] },
      ],
      vacant_rooms: [{ code: "305" }, { code: "201" }],
    })
    expect(n).toEqual({ tenants: 2, newTenants: 1, matched: 1, contracts: 3, rooms: 4 })
  })
})

// ── 주소 → 탭, 오류 문구, 단가 규칙 상수(검토 반영, 순수) ─────────────────────

describe("기준 정보 주소 → 탭(resolveSettingsTab)", () => {
  it("tab이 맞는 값이면 그대로, 모르는 값·없음은 단가·기본값", () => {
    expect(resolveSettingsTab({ tab: "rooms", contract: "", tenant: "" })).toEqual({ tab: "rooms", fill: false })
    expect(resolveSettingsTab({ tab: "rates", contract: "", tenant: "" })).toEqual({ tab: "rates", fill: false })
    expect(resolveSettingsTab({ tab: "garbage", contract: "", tenant: "" })).toEqual({ tab: "rates", fill: false })
  })
  it("tab 없이 ?contract= 또는 ?tenant=만 있으면 계약 탭 + 주소에 tab=contracts를 채운다", () => {
    expect(resolveSettingsTab({ tab: "rates", contract: "14", tenant: "" })).toEqual({ tab: "contracts", fill: true })
    expect(resolveSettingsTab({ tab: "rates", contract: "", tenant: "3" })).toEqual({ tab: "contracts", fill: true })
    expect(resolveSettingsTab({ tab: "contracts", contract: "14", tenant: "" })).toEqual({ tab: "contracts", fill: false })
  })
})

describe("오류 Notice 본문(errorDetail)", () => {
  it("제목과 같은 첫 문장을 덜어 낸다", () => {
    expect(errorDetail("저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.", "저장하지 못했어요")).toBe("인터넷 연결을 확인하고 다시 눌러 주세요.")
  })
  it("첫 문장이 다르면 그대로 둔다", () => {
    expect(errorDetail("로그인이 끝났어요. 다시 로그인해 주세요.", "저장하지 못했어요")).toBe("로그인이 끝났어요. 다시 로그인해 주세요.")
  })
})

describe("단가 규칙 상수(rate-rules)", () => {
  it("문장과 새 계약 기본값이 같은 숫자를 쓴다", () => {
    expect(RENT_RULE_TEXT).toBe("신규 입주·갱신 21,000원 · 비갱신 기존 계약 20,000원 · 공장동 15,000원")
    expect(MGMT_FIELD_HINT).toBe("보통 15,000원, 공장동 30,000원이에요. 비우면 15,000원으로 저장돼요")
    expect(NEW_CONTRACT_FORM.rent_unit_price).toBe(String(RATE_RULES.rentRenewal))
    expect(NEW_CONTRACT_FORM.mgmt_fee).toBe(String(RATE_RULES.mgmtDefault))
  })
})
