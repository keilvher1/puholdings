import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"
import {
  appendDifferentTxMark,
  buildUsageRows,
  checkReceipts,
  countChecks,
  DIFFERENT_TX_MARK,
  differentTxMark,
  findSameTxPairs,
  formatItemRate,
  hasDifferentTxMark,
  marksDifferentTx,
  needsCheck,
  overBudgetItems,
  spentByItem,
} from "@/components/admin/expenses/ledger-check"
import { normalizeName } from "@/components/admin/expenses/client-helpers"
import { emptyReceiptFields, normalizeBudgetName, type ExpenseProject, type ExpenseReceipt } from "@/lib/expenses"

// 증빙 내역(장부) 점검(계획서 4.2.6 L-1·L-2)과 프로젝트 카드 비목별 집행액(4.2.8 K-1, spent_by_item 계약).
// 판정만 보여 주고 집행액 계산은 바꾸지 않는다 — 카드의 비목별 값 = 장부 표(buildUsageRows) 값 = spent_total을 나눈 것.

let session: { id: number; email: string; name: string } | null = null
vi.mock("@/lib/auth", () => ({ getSession: async () => session }))

let seq = 0
function receipt(o: Partial<ExpenseReceipt> = {}): ExpenseReceipt {
  seq += 1
  return {
    ...emptyReceiptFields(),
    id: seq,
    project_id: 1,
    project_name: "AI 기반 스마트 계량 데이터 플랫폼 실증",
    doc_type: "receipt",
    issue_date: "2026-09-10",
    vendor_name: `거래처${seq}`,
    total_amount: 10_000 * seq,
    budget_item: "재료비",
    file_pathname: `expenses/receipts/2026-09/${seq}.jpg`,
    file_name: `${seq}.jpg`,
    file_type: "image/jpeg",
    file_size: 1000,
    file_hash: `h${seq}`,
    ai_confidence: "high",
    created_at: "2026-09-10T00:00:00.000Z",
    updated_at: "2026-09-10T00:00:00.000Z",
    ...o,
  }
}

const PROJECT: Pick<ExpenseProject, "id" | "budget_items" | "start_date" | "end_date"> = {
  id: 1,
  budget_items: [
    { name: "인건비", amount: 40_000_000 },
    { name: "재료비", amount: 10_000_000 },
    { name: "외주용역비", amount: 30_000_000 },
  ],
  start_date: "2026-03-01",
  end_date: "2026-12-31",
}

// 랩 시드의 같은 거래 쌍: 9/14 세금계산서(사업자번호 있음) + 9/16 이체확인증(사업자번호 없음), 9,900,000원
function dodamPair() {
  const tax = receipt({
    doc_type: "tax_invoice",
    issue_date: "2026-09-14",
    vendor_name: "(주)도담소프트웨어",
    vendor_biz_no: "214-86-12345",
    supply_amount: 9_000_000,
    vat_amount: 900_000,
    total_amount: 9_900_000,
    budget_item: "외주용역비",
    payment_method: "transfer",
  })
  const transfer = receipt({
    doc_type: "transfer",
    issue_date: "2026-09-16",
    vendor_name: "주식회사 도담소프트웨어",
    total_amount: 9_900_000,
    budget_item: "외주용역비",
    payment_method: "transfer",
  })
  return { tax, transfer }
}

describe("같은 거래로 보이는 쌍", () => {
  it("도담소프트웨어 9,900,000원 두 건(거래처·합계 같고 7일 안)을 쌍으로 잡는다", () => {
    const { tax, transfer } = dodamPair()
    const other = receipt({ total_amount: 9_900_000, vendor_name: "다른회사", issue_date: "2026-09-15" })
    const pairs = findSameTxPairs([tax, transfer, other])
    expect(pairs).toEqual([{ a: tax.id, b: transfer.id, reason: "amount_party_date" }])
    const checks = checkReceipts([tax, transfer, other], [PROJECT])
    expect(checks.get(tax.id)?.warnings).toContain("same_tx")
    expect(checks.get(transfer.id)?.pairs).toEqual([{ otherId: tax.id, reason: "amount_party_date" }])
    expect(needsCheck(checks.get(other.id))).toBe(false)
  })

  it("승인번호가 같은 두 건도 쌍이다(금액·거래처가 달라도)", () => {
    const a = receipt({ doc_type: "card_slip", approval_no: "3012-4455", total_amount: 54_000, vendor_name: "모락모락 국밥" })
    const b = receipt({ doc_type: "receipt", approval_no: "30124455", total_amount: 54_500, vendor_name: "모락모락", issue_date: "2026-09-11" })
    expect(findSameTxPairs([a, b])).toEqual([{ a: a.id, b: b.id, reason: "approval" }])
  })

  it("한쪽 메모에 [다른 거래 확인]이 있으면 쌍에서 빠진다", () => {
    const { tax, transfer } = dodamPair()
    transfer.memo = appendDifferentTxMark("9월 2차 지급")
    expect(transfer.memo).toBe(`9월 2차 지급 ${DIFFERENT_TX_MARK}`)
    expect(hasDifferentTxMark(transfer.memo)).toBe(true)
    expect(appendDifferentTxMark(transfer.memo)).toBe(transfer.memo) // 두 번 붙이지 않는다
    expect(findSameTxPairs([tax, transfer])).toEqual([])
    const checks = checkReceipts([tax, transfer], [PROJECT])
    expect(needsCheck(checks.get(tax.id))).toBe(false)
    expect(needsCheck(checks.get(transfer.id))).toBe(false)
  })

  it("[다른 거래 확인 #상대id]는 그 쌍만 빼고, 나중에 들어온 같은 거래는 다시 잡는다", () => {
    const { tax, transfer } = dodamPair()
    transfer.memo = appendDifferentTxMark("9월 2차 지급", tax.id)
    expect(transfer.memo).toBe(`9월 2차 지급 ${differentTxMark(tax.id)}`)
    expect(appendDifferentTxMark(transfer.memo, tax.id)).toBe(transfer.memo) // 두 번 붙이지 않는다
    expect(hasDifferentTxMark(transfer.memo)).toBe(false) // 예전(전체) 표시와 다르다
    expect(marksDifferentTx(transfer.memo, tax.id)).toBe(true)
    expect(findSameTxPairs([tax, transfer])).toEqual([])
    // 같은 거래의 서류가 한 번 더 들어오면(이체확인증 재업로드) 그 쌍은 다시 잡힌다
    const again = receipt({ ...transfer, id: 0, memo: "" })
    again.id = transfer.id + 1000
    const pairs = findSameTxPairs([tax, transfer, again])
    expect(pairs.some((p) => p.a === transfer.id && p.b === again.id)).toBe(true)
    expect(pairs.some((p) => p.a === tax.id && p.b === again.id)).toBe(true)
    expect(pairs.some((p) => p.a === tax.id && p.b === transfer.id)).toBe(false)
  })

  it("상대 id가 앞자리만 같으면 표시로 보지 않는다(#3 ≠ #32)", () => {
    expect(marksDifferentTx(`메모 ${differentTxMark(32)}`, 3)).toBe(false)
    expect(marksDifferentTx(`메모 ${differentTxMark(3)}`, 32)).toBe(false)
    expect(marksDifferentTx(`메모 ${DIFFERENT_TX_MARK}`, 32)).toBe(true)
  })

  it("월 정기 결제(같은 거래처·같은 금액, 30일 간격)는 쌍이 아니다", () => {
    const a = receipt({ vendor_name: "누리클라우드(주)", total_amount: 1_178_000, issue_date: "2026-08-05" })
    const b = receipt({ vendor_name: "누리클라우드(주)", total_amount: 1_178_000, issue_date: "2026-09-05" })
    expect(findSameTxPairs([a, b])).toEqual([])
  })

  it("기간으로 좁힌 목록이라도 pairSource(프로젝트 전체)에서 상대를 찾는다", () => {
    const { tax, transfer } = dodamPair()
    const checks = checkReceipts([transfer], [PROJECT], { pairSource: [tax, transfer] })
    expect(checks.get(transfer.id)?.pairs.map((p) => p.otherId)).toEqual([tax.id])
  })
})

describe("확인 필요(warning)와 참고(회색)", () => {
  it("신뢰도 낮음만 있는 증빙은 warning이 아니라 참고다", () => {
    const r = receipt({ ai_confidence: "low" })
    const c = checkReceipts([r], [PROJECT]).get(r.id)!
    expect(c.warnings).toEqual([])
    expect(c.notes).toEqual(["low_confidence"])
    expect(needsCheck(c)).toBe(false)
  })

  it("환율 직접 입력·원본 없음(인건비 제외)도 참고다", () => {
    const usd = receipt({ currency: "USD", foreign_amount: 20, exchange_rate: 1400, exchange_rate_source: "manual", total_amount: 28_000 })
    const noFile = receipt({ file_pathname: null })
    const payroll = receipt({ doc_type: "payroll", file_pathname: null, budget_item: "인건비", payroll_month: "2026-09" })
    const checks = checkReceipts([usd, noFile, payroll], [PROJECT])
    expect(checks.get(usd.id)).toMatchObject({ warnings: [], notes: ["manual_fx"] })
    expect(checks.get(noFile.id)).toMatchObject({ warnings: [], notes: ["no_file"] })
    expect(checks.get(payroll.id)).toMatchObject({ warnings: [], notes: [] })
  })

  it("금액 불일치·비목 미지정·예산 외·기간 밖은 warning이다", () => {
    const mismatch = receipt({ supply_amount: 10_000, vat_amount: 1_000, total_amount: 12_000 })
    const unassigned = receipt({ budget_item: "  " })
    const offBudget = receipt({ budget_item: "사무용품비" })
    const spacing = receipt({ budget_item: " 외주용역비 " }) // 공백만 다른 건 예산 비목
    const before = receipt({ issue_date: "2026-02-27" })
    const payrollLast = receipt({ doc_type: "payroll", issue_date: "2027-01-05", payroll_month: "2026-12", budget_item: "인건비" })
    const checks = checkReceipts([mismatch, unassigned, offBudget, spacing, before, payrollLast], [PROJECT])
    expect(checks.get(mismatch.id)?.warnings).toEqual(["amount_mismatch"])
    expect(checks.get(unassigned.id)?.warnings).toEqual(["unassigned"])
    expect(checks.get(offBudget.id)?.warnings).toEqual(["off_budget"])
    expect(checks.get(spacing.id)?.warnings).toEqual([])
    expect(checks.get(before.id)?.warnings).toEqual(["out_of_period"])
    // 인건비는 귀속월로 본다(12월 급여를 1월에 줘도 기간 안)
    expect(checks.get(payrollLast.id)?.warnings).toEqual([])
  })

  it("사유별 건수 — 같은 거래는 쌍 수로 센다", () => {
    const { tax, transfer } = dodamPair()
    const low = receipt({ ai_confidence: "low" })
    const checks = checkReceipts([tax, transfer, low], [PROJECT])
    const c = countChecks([tax.id, transfer.id, low.id], checks)
    expect(c.pairs).toBe(1)
    expect(c.receipts).toBe(2)
    expect(c.byReason.same_tx).toBe(2)
    expect(c.byReason.low_confidence).toBe(1)
  })
})

describe("비목별 집행액(spent_by_item) = 장부 표(buildUsageRows)", () => {
  const receipts = () => {
    seq = 100
    const { tax, transfer } = dodamPair()
    return [
      tax,
      transfer,
      receipt({ budget_item: "외주용역비", total_amount: 15_400_000 }),
      receipt({ budget_item: "재료비 ", total_amount: 120_000 }),
      receipt({ budget_item: "재료비", total_amount: 18_000 }),
      receipt({ budget_item: "", total_amount: 50_000 }),
      receipt({ budget_item: "사무용품비", total_amount: 33_000 }),
      receipt({ budget_item: "재료비", total_amount: null }),
    ]
  }

  it("키는 normalizeName과 같은 규칙이고, 값은 표의 집행액과 같으며, 합은 집행액 합계와 같다", () => {
    const list = receipts()
    for (const s of ["  외주 용역비 ", "재료비", "", " a\tb "]) expect(normalizeBudgetName(s)).toBe(normalizeName(s))
    const by = spentByItem(list)
    const rows = buildUsageRows(PROJECT, list)
    for (const row of rows) {
      const key = row.kind === "unassigned" ? "" : normalizeBudgetName(row.name)
      expect(by[key] ?? 0).toBe(row.spent)
    }
    const total = list.reduce((s, r) => s + (typeof r.total_amount === "number" ? r.total_amount : 0), 0)
    expect(Object.values(by).reduce((s, n) => s + n, 0)).toBe(total)
    expect(rows.reduce((s, r) => s + r.spent, 0)).toBe(total)
  })

  it("프로젝트 카드 비목 초과: 외주용역비 35,200,000 / 30,000,000 = 117%", () => {
    const list = receipts()
    const over = overBudgetItems({ budget_items: PROJECT.budget_items, spent_by_item: spentByItem(list) })
    expect(over.map((o) => [o.name, o.spent, formatItemRate(o.rate)])).toEqual([["외주용역비", 35_200_000, "117%"]])
    // spent_by_item이 없으면(예전 응답) 표시하지 않는다
    expect(overBudgetItems({ budget_items: PROJECT.budget_items })).toEqual([])
  })
})

// ── 라우트: 쿠키 없이 401 ──────────────────────────────────────────────────────
describe("증빙 내역 조회·내려받기 라우트 — 로그인 없이 401", () => {
  beforeEach(() => {
    session = null
  })
  it("receipts GET·export·download", async () => {
    const { GET: receiptsGet } = await import("@/app/api/admin/expenses/receipts/route")
    const { GET: exportGet } = await import("@/app/api/admin/expenses/export/route")
    const { GET: downloadGet } = await import("@/app/api/admin/expenses/download/route")
    for (const [handler, url] of [
      [receiptsGet, "http://localhost/api/admin/expenses/receipts?doc_type=transfer&budget_item=외주용역비"],
      [exportGet, "http://localhost/api/admin/expenses/export?from=2026-09-01&to=2026-09-30"],
      [downloadGet, "http://localhost/api/admin/expenses/download?project_id=1"],
    ] as const) {
      const res = await handler(new Request(url))
      expect(res.status).toBe(401)
    }
  })
})

// ── local-pg: 실제 SQL로 계약 확인 ─────────────────────────────────────────────
const pgAvailable = hasLocalPostgres()

describe.skipIf(!pgAvailable)("listProjects.spent_by_item·조회 조건(local-pg)", () => {
  let pg: LocalPg

  beforeAll(async () => {
    pg = await startLocalPg()
    neonConfig.fetchFunction = pg.fetchFunction
    process.env.DATABASE_URL = pg.databaseUrl
    for (const m of ["2026-expense-01.sql", "2026-expense-03-fx-payroll.sql"]) await applyMigration(pg.conn, `scripts/migrations/${m}`)
    await pg.conn.simple(`
      INSERT INTO expense_projects (id, name, start_date, end_date, total_budget, budget_items, status) VALUES
        (1, 'AI 기반 스마트 계량 데이터 플랫폼 실증', '2026-03-01', '2026-12-31', 120000000,
         '[{"name":"인건비","amount":40000000},{"name":"재료비","amount":10000000},{"name":"외주용역비","amount":30000000}]', 'active'),
        (2, '빈 프로젝트', NULL, NULL, NULL, '[]', 'active');
      INSERT INTO expense_receipts (project_id, doc_type, issue_date, vendor_name, vendor_biz_no, supply_amount, vat_amount, total_amount,
        payment_method, budget_item, purpose, file_pathname, file_name, file_type, file_size, file_hash) VALUES
        (1, 'tax_invoice', '2026-09-14', '(주)도담소프트웨어', '214-86-12345', 9000000, 900000, 9900000, 'transfer', '외주용역비', '대시보드 개발', 'expenses/receipts/2026-09/a.pdf', 'a.pdf', 'application/pdf', 10, 'ha'),
        (1, 'transfer', '2026-09-16', '(주)도담소프트웨어', '', NULL, NULL, 9900000, 'transfer', '외주용역비', '대시보드 개발', 'expenses/receipts/2026-09/b.jpg', 'b.jpg', 'image/jpeg', 10, 'hb'),
        (1, 'tax_invoice', '2026-08-10', '주식회사 한올디자인', '', NULL, NULL, 15400000, 'transfer', ' 외주용역비', 'UI 디자인', 'expenses/receipts/2026-08/c.pdf', 'c.pdf', 'application/pdf', 10, 'hc'),
        (1, 'receipt', '2026-08-31', '바른전자부품', '', NULL, NULL, 18000, 'card', '재료비', '케이블', 'expenses/receipts/2026-08/d.jpg', 'd.jpg', 'image/jpeg', 10, 'hd'),
        (1, 'receipt', '2026-09-22', '누리기계공구', '', NULL, NULL, 120000, 'card', '재료비  ', 'DIN 레일', 'expenses/receipts/2026-09/e.jpg', 'e.jpg', 'image/jpeg', 10, 'he'),
        (1, 'receipt', '2026-09-23', '미지정상회', '', NULL, NULL, 50000, 'card', '', '', 'expenses/receipts/2026-09/f.jpg', 'f.jpg', 'image/jpeg', 10, 'hf'),
        (1, 'receipt', '2026-09-24', '문구나라', '', NULL, NULL, 33000, 'card', '사무용품비', '복사용지', 'expenses/receipts/2026-09/g.jpg', 'g.jpg', 'image/jpeg', 10, 'hg');
    `)
  }, 90_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
  })

  it("카드의 비목별 값 = 장부 표 값, 합 = spent_total, 기존 필드는 그대로", async () => {
    const { getDb } = await import("@/lib/db")
    const { listProjects, listReceipts } = await import("@/lib/expense-db")
    const sql = getDb()!
    const projects = await listProjects(sql)
    const p1 = projects.find((p) => p.id === 1)!
    const p2 = projects.find((p) => p.id === 2)!
    expect(p1.receipt_count).toBe(7)
    expect(p1.spent_total).toBe(9_900_000 * 2 + 15_400_000 + 18_000 + 120_000 + 50_000 + 33_000)
    expect(p1.spent_by_item).toEqual({ 외주용역비: 35_200_000, 재료비: 138_000, "": 50_000, 사무용품비: 33_000 })
    expect(Object.values(p1.spent_by_item!).reduce((s, n) => s + n, 0)).toBe(p1.spent_total)
    expect(p2.spent_by_item).toEqual({})
    expect(p2.spent_total).toBe(0)

    const rows = buildUsageRows(p1, await listReceipts(sql, { projectId: 1 }))
    for (const row of rows) {
      const key = row.kind === "unassigned" ? "" : normalizeBudgetName(row.name)
      expect(p1.spent_by_item![key] ?? 0).toBe(row.spent) // 집행이 없는 비목은 키가 없다(0)
    }
    expect(overBudgetItems(p1).map((o) => [o.name, formatItemRate(o.rate)])).toEqual([["외주용역비", "117%"]])
    // 장부 점검: 도담 쌍
    const all = await listReceipts(sql, { projectId: 1 })
    const checks = checkReceipts(all, [p1])
    const dodam = all.filter((r) => r.vendor_name === "(주)도담소프트웨어")
    expect(dodam.map((r) => checks.get(r.id)?.warnings.includes("same_tx"))).toEqual([true, true])
  })

  it("문서 종류·비목 조건(없으면 지금과 같음), 비목은 공백 차이를 무시", async () => {
    const { getDb } = await import("@/lib/db")
    const { listReceipts } = await import("@/lib/expense-db")
    const sql = getDb()!
    expect((await listReceipts(sql, { projectId: 1 })).length).toBe(7)
    expect((await listReceipts(sql, { projectId: 1, docType: "tax_invoice" })).map((r) => r.vendor_name).sort()).toEqual([
      "(주)도담소프트웨어",
      "주식회사 한올디자인",
    ])
    expect((await listReceipts(sql, { projectId: 1, budgetItem: "외주용역비" })).length).toBe(3)
    expect((await listReceipts(sql, { projectId: 1, budgetItem: "재료비" })).length).toBe(2)
    expect((await listReceipts(sql, { projectId: 1, docType: "transfer", budgetItem: "외주용역비" })).length).toBe(1)
  })

  it("비목 조건의 공백은 화면(normalizeBudgetName)과 같은 규칙 — NBSP·전각 공백도 공백으로 본다", async () => {
    const { getDb } = await import("@/lib/db")
    const { listReceipts } = await import("@/lib/expense-db")
    const sql = getDb()!
    await pg.conn.simple(`
      INSERT INTO expense_receipts (project_id, doc_type, issue_date, vendor_name, total_amount, payment_method, budget_item, file_pathname, file_name, file_type, file_size, file_hash) VALUES
        (2, 'receipt', '2026-09-01', '공백상회', 1000, 'card', E'\\u3000외주\\u00a0 용역비\\u00a0', 'expenses/receipts/2026-09/w1.jpg', 'w1.jpg', 'image/jpeg', 10, 'hw1'),
        (2, 'receipt', '2026-09-02', '탭상회', 2000, 'card', E'외주\\t용역비', 'expenses/receipts/2026-09/w2.jpg', 'w2.jpg', 'image/jpeg', 10, 'hw2'),
        (2, 'receipt', '2026-09-03', '다른상회', 3000, 'card', '외주용역비', 'expenses/receipts/2026-09/w3.jpg', 'w3.jpg', 'image/jpeg', 10, 'hw3');
    `)
    const all = await listReceipts(sql, { projectId: 2 })
    const key = normalizeBudgetName(all.find((r) => r.vendor_name === "공백상회")!.budget_item)
    expect(key).toBe("외주 용역비")
    const hit = await listReceipts(sql, { projectId: 2, budgetItem: "외주 용역비" })
    // 화면에서 같은 키로 묶이는 증빙 = 서버 조건으로 걸리는 증빙
    expect(hit.map((r) => r.vendor_name).sort()).toEqual(all.filter((r) => normalizeBudgetName(r.budget_item) === key).map((r) => r.vendor_name).sort())
    expect(hit.map((r) => r.vendor_name).sort()).toEqual(["공백상회", "탭상회"])
  })

  it("GET 라우트: 조건 파라미터와 조건이 걸린 엑셀 파일명", async () => {
    session = { id: 1, email: "admin@test", name: "관리자" }
    const { GET: receiptsGet } = await import("@/app/api/admin/expenses/receipts/route")
    const r1 = await receiptsGet(new Request("http://localhost/api/admin/expenses/receipts?project_id=1&doc_type=transfer&item=외주용역비"))
    const b1 = (await r1.json()) as { receipts: ExpenseReceipt[] }
    expect(b1.receipts.map((r) => r.doc_type)).toEqual(["transfer"])

    const { GET: exportGet } = await import("@/app/api/admin/expenses/export/route")
    const all = await exportGet(new Request("http://localhost/api/admin/expenses/export?project_id=1"))
    expect(all.status).toBe(200)
    expect(decodeURIComponent(all.headers.get("Content-Disposition") ?? "")).not.toContain("_조건_")
    const sep = await exportGet(new Request("http://localhost/api/admin/expenses/export?project_id=1&from=2026-09-01&to=2026-09-30&q=도담"))
    expect(sep.status).toBe(200)
    const cd = decodeURIComponent(sep.headers.get("Content-Disposition") ?? "")
    expect(cd).toContain("_조건_2026-09-01~2026-09-30_검색 도담_")

    const ExcelJS = (await import("exceljs")).default
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(await sep.arrayBuffer()) as unknown as ArrayBuffer)
    const ws = wb.getWorksheet("증빙 목록")!
    expect(String(ws.getRow(1).getCell(1).value)).toContain("조회 조건: 기간 2026-09-01 ~ 2026-09-30 · 검색어 '도담'")
    expect(ws.getRow(2).getCell(1).value).toBe("번호")
    expect(ws.rowCount).toBe(2 + 2 + 1) // 조건 행 + 머리 행 + 도담 2건 + 합계
    session = null
  })
})
