import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"

// 청구서 상세 시트·목록의 규칙(WP7, 계획서 4.4.7 B-1·B-3·B-4·B-9, 가드 #20·#22·#27).
// 순수: 생성 라인 편집 불가·단건 발행은 수기만·상태별 동작, 라인 전체 교체 본문, 받을 돈 구간·정렬·경과, 일괄 납부 입력 검사, 납부 안내 문구, 지난달 비교.
// local-pg: 정기 초안에 조정 라인을 더한 뒤(PUT lines) 월 마감에서 다시 만들어도 조정 라인이 남고 합계는 서버가 계산한다.

type AdminSession = { id: number; email: string; name: string }
const session: AdminSession | null = { id: 1, email: "admin@example.com", name: "관리자" }
vi.mock("@/lib/auth", () => ({ getSession: async () => session }))

import { GET, PUT } from "@/app/api/admin/billing/bills/route"
import { POST as GENERATE } from "@/app/api/admin/billing/bills/generate/route"
import {
  bucketSummary,
  buildLinesPayload,
  canEditLine,
  canIssueSingle,
  checkPayItems,
  elapsedText,
  filterReceivables,
  manualEditsDirty,
  manualEditsFrom,
  monthSummary,
  paidToastText,
  paymentGuideText,
  prevMonthComparison,
  sheetActions,
  sortByElapsed,
  unpaidMonthsByTenant,
  type BillLine,
  type BillRow,
} from "@/components/admin/billing/bills/bill-model"
import { DEFAULT_BANK_TEXT, parseBankText } from "@/lib/bank-info"

const TODAY = "2026-10-01"

const row = (o: Partial<BillRow>): BillRow => ({
  id: 1,
  tenant_id: 1,
  tenant_name: "(주)솔바람테크",
  period: "2026-09",
  status: "issued",
  rent_total: "198000",
  mgmt_total: "16500",
  elec_amount: "111342",
  total_amount: "325842",
  due_date: null,
  paid_at: null,
  issued_at: "2026-09-04T01:00:00Z",
  is_manual: false,
  ...o,
})

const GEN_LINES: BillLine[] = [
  { id: 11, contract_id: 5, room_code: "307", line_type: "rent", label: "9월 임대료 (307)", quantity: "14.57", unit_price: "21000", amount: "306000" },
  { id: 12, contract_id: 5, room_code: "307", line_type: "mgmt", label: "9월 관리비 (307)", quantity: null, unit_price: null, amount: "15000" },
  { id: 13, contract_id: 5, room_code: "307", line_type: "elec_area", label: "8월 전기사용료 (307, 면적별)", quantity: "14.57", unit_price: "139191", amount: "202802" },
  { id: 14, contract_id: null, room_code: null, line_type: "manual", label: "8월 과오납분 차감", quantity: null, unit_price: null, amount: "-33000" },
]

describe("상세 시트 — 할 수 있는 일", () => {
  it("생성 라인(임대료·관리비·전기료)은 작성 중이어도 편집 불가, 조정 라인만 편집", () => {
    const draft = row({ status: "draft", issued_at: null })
    for (const l of GEN_LINES.slice(0, 3)) expect(canEditLine(draft, l)).toBe(false)
    expect(canEditLine(draft, GEN_LINES[3])).toBe(true)
    expect(canEditLine(row({ status: "issued" }), GEN_LINES[3])).toBe(false)
    expect(canEditLine(row({ status: "paid" }), GEN_LINES[3])).toBe(false)
  })

  it("단건 발행은 작성 중 수기 청구서만 — 정기 작성 중은 월 마감 4단계 링크", () => {
    expect(canIssueSingle(row({ status: "draft", is_manual: true }))).toBe(true)
    expect(canIssueSingle(row({ status: "draft", is_manual: false }))).toBe(false)
    expect(canIssueSingle(row({ status: "issued", is_manual: true }))).toBe(false)
    expect(sheetActions(row({ status: "draft", is_manual: true, issued_at: null }), TODAY)).toMatchObject({ primary: "issue_single", closeLink: false })
    expect(sheetActions(row({ status: "draft", is_manual: false, issued_at: null }), TODAY)).toMatchObject({ primary: null, closeLink: true })
    // 정정 중(정기, draft + issued_at)도 단건 발행 없음
    expect(sheetActions(row({ status: "draft", is_manual: false }), TODAY).primary).toBeNull()
  })

  it("납부 대기는 [납부 처리]·납기 바꾸기(경고), 기한 지남은 납기 바꾸기 없음, 납부 완료는 PDF·납부 처리 취소만", () => {
    const waiting = sheetActions(row({ due_date: "2026-10-10" }), TODAY)
    expect(waiting.primary).toBe("pay")
    expect(waiting.more).toContain("due")
    expect(waiting.dueWarning).toBe("이미 보낸 메일·포털 안내와 달라져요")
    const noDue = sheetActions(row({ due_date: null }), TODAY)
    expect(noDue.more).toContain("due")
    const late = sheetActions(row({ due_date: "2026-09-10" }), TODAY)
    expect(late.primary).toBe("pay")
    expect(late.more).not.toContain("due")
    expect(sheetActions(row({ status: "overdue", due_date: "2026-09-10" }), TODAY).more).not.toContain("due")
    expect(sheetActions(row({ status: "paid", paid_at: "2026-09-20T00:00:00Z" }), TODAY)).toEqual({ primary: null, closeLink: false, more: ["pdf", "unpay"], dueWarning: null })
  })
})

describe("라인 전체 교체 본문(buildLinesPayload)", () => {
  it("생성 라인은 서버 값 그대로(순서·수량·단가 유지), 조정 라인만 편집 목록으로", () => {
    const edits = manualEditsFrom(GEN_LINES)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({ label: "8월 과오납분 차감", amount: "-33000" })
    const next = [...edits, { key: "n1", label: "주차 1대", amount: "50000" }]
    const { lines, errors } = buildLinesPayload(GEN_LINES, next)
    expect(errors).toEqual({})
    expect(lines.map((l) => l.line_type)).toEqual(["rent", "mgmt", "elec_area", "manual", "manual"])
    expect(lines[0]).toEqual({ contract_id: 5, room_code: "307", line_type: "rent", label: "9월 임대료 (307)", quantity: "14.57", unit_price: "21000", amount: 306000 })
    expect(lines[4]).toMatchObject({ line_type: "manual", label: "주차 1대", amount: 50000, quantity: null, unit_price: null })
    expect(manualEditsDirty(GEN_LINES, next)).toBe(true)
    expect(manualEditsDirty(GEN_LINES, edits)).toBe(false)
  })
  it("조정 라인을 모두 지워도 생성 라인은 남는다, 빈 이름·빈 금액·0원은 칸 오류", () => {
    expect(buildLinesPayload(GEN_LINES, []).lines.map((l) => l.line_type)).toEqual(["rent", "mgmt", "elec_area"])
    const { errors, lines } = buildLinesPayload(GEN_LINES, [
      { key: "a", label: "", amount: "1000" },
      { key: "b", label: "할인", amount: null },
      { key: "c", label: "할인", amount: "0" },
    ])
    expect(Object.keys(errors).sort()).toEqual(["a", "b", "c"])
    expect(errors.a.label).toBe("항목 이름을 적어 주세요")
    expect(errors.b.amount).toBe("금액을 적어 주세요")
    expect(lines).toHaveLength(3)
  })
})

describe("받을 돈 — 구간·경과·정렬(운영형·랩형)", () => {
  const rows = [
    row({ id: 1, period: "2026-07", status: "overdue", due_date: "2026-08-10", total_amount: "313207" }), // 52일 지남
    row({ id: 2, period: "2026-08", status: "overdue", due_date: "2026-09-10", total_amount: "291192" }), // 21일
    row({ id: 3, period: "2026-09", status: "issued", due_date: "2026-10-10", total_amount: "302742" }), // 9일 남음
    row({ id: 4, tenant_id: 2, tenant_name: "은하수랩스", period: "2026-06", status: "issued", due_date: null, issued_at: "2026-06-04T01:00:00Z", total_amount: "100000" }), // 운영형: 기한 없음
    row({ id: 5, tenant_id: 3, tenant_name: "너나들이", period: "2026-08", status: "draft", issued_at: "2026-09-04T01:00:00Z", total_amount: "200000" }), // 정정 중
    row({ id: 6, status: "paid", paid_at: "2026-09-20T00:00:00Z" }),
  ]
  it("구간 5개 + 정정 중 따로(받을 돈 합계에 넣지 않음)", () => {
    const s = bucketSummary(rows, TODAY)
    expect(s.buckets.not_due).toEqual({ count: 1, sum: 302742 })
    expect(s.buckets.d1_30).toEqual({ count: 1, sum: 291192 })
    expect(s.buckets.d31_60).toEqual({ count: 1, sum: 313207 })
    expect(s.buckets.d60_plus.count).toBe(0)
    expect(s.buckets.no_due).toEqual({ count: 1, sum: 100000 })
    expect(s.receivable).toEqual({ count: 4, sum: 302742 + 291192 + 313207 + 100000 })
    expect(s.late.count).toBe(3) // 1~30 + 31~60 + 기한 없음 119일
    expect(s.correcting).toEqual({ count: 1, sum: 200000, periods: ["2026-08"] })
  })
  it("경과 글자는 배지와 같은 판정: 'n일 지남' / '발행 후 n일' / 'n일 남음'", () => {
    expect(elapsedText(rows[0], TODAY)).toBe("52일 지남")
    expect(elapsedText(rows[2], TODAY)).toBe("9일 남음")
    expect(elapsedText(rows[3], TODAY)).toBe("발행 후 119일")
    expect(elapsedText(rows[4], TODAY)).toBe("정정 중")
  })
  it("거르기(bucket·late·correcting·검색)와 경과일 긴 순 정렬", () => {
    expect(filterReceivables(rows, {}, TODAY).map((r) => r.id).sort()).toEqual([1, 2, 3, 4])
    expect(filterReceivables(rows, { bucket: "no_due" }, TODAY).map((r) => r.id)).toEqual([4])
    expect(filterReceivables(rows, { bucket: "late" }, TODAY).map((r) => r.id).sort()).toEqual([1, 2, 4])
    expect(filterReceivables(rows, { bucket: "correcting" }, TODAY).map((r) => r.id)).toEqual([5])
    expect(filterReceivables(rows, { q: "은하수" }, TODAY).map((r) => r.id)).toEqual([4])
    expect(sortByElapsed(filterReceivables(rows, {}, TODAY), TODAY).map((r) => r.id)).toEqual([1, 2, 4, 3])
  })
  it("같은 기업 미수 청구월 수(3개월 미납 배지)", () => {
    const m = unpaidMonthsByTenant(rows, TODAY)
    expect(m.get(1)).toBe(3)
    expect(m.get(3)).toBeUndefined()
  })
  it("월별 요약: 상태 이름 '납부 대기', 정정 중은 작성 중 탭", () => {
    const s = monthSummary(rows, TODAY)
    expect(s.counts).toEqual({ all: 6, draft: 1, issued: 2, late: 2, paid: 1 })
    expect(s.paid.sum).toBe(325842)
  })
})

describe("일괄 납부 입력 검사·토스트·메모", () => {
  it("입금일 기본값 없음 → 빈 날짜는 보내지 않고 칸 오류, 발행일보다 앞서면 경고", () => {
    const rs = [row({ id: 1 }), row({ id: 2, issued_at: "2026-09-25T01:00:00Z" }), row({ id: 3 })]
    const c = checkPayItems(
      [
        { id: 1, include: true, date: "" },
        { id: 2, include: true, date: "2026-09-20" },
        { id: 3, include: false, date: "" },
      ],
      rs,
      TODAY,
    )
    expect(c.missingDate).toEqual([1])
    expect(c.ready).toEqual([{ id: 2, paid_at: "2026-09-20" }])
    expect(c.beforeIssued).toEqual([2])
    expect(checkPayItems([{ id: 1, include: true, date: "2026-13-40" }], rs, TODAY).invalidDate).toEqual([1])
    expect(checkPayItems([{ id: 1, include: true, date: "2026-10-05" }], rs, TODAY).future).toEqual([1])
  })
  it("토스트 문장", () => {
    expect(paidToastText([row({ period: "2026-08" })])).toMatch(/^\(주\)솔바람테크 (2026년 )?8월분을 납부 완료로 바꿨어요$/)
    expect(paidToastText([row({}), row({ id: 2 }), row({ id: 3 })])).toBe("3건을 납부 완료로 바꿨어요")
  })
})

describe("납부 안내 문구·지난달 비교", () => {
  it("계좌는 PDF와 같은 원문에서 나눈 값, 나누지 못하면 원문 그대로", () => {
    const bank = { text: DEFAULT_BANK_TEXT, ...parseBankText(DEFAULT_BANK_TEXT) }
    const t = paymentGuideText({
      tenantName: "(주)솔바람테크",
      bills: [{ period: "2026-09", total_amount: "302742" }, { period: "2026-08", total_amount: "291192" }],
      bank,
      phone: "054-279-8710",
      today: TODAY,
    })
    expect(t).toBe("(주)솔바람테크 8월분·9월분 관리비 593,934원이 아직 입금 확인 전이에요. 하나은행 910-910009-44304(㈜포항연합기술지주)로 보내 주세요. 문의 054-279-8710")
    const raw = paymentGuideText({ tenantName: "A", bills: [{ period: "2026-09", total_amount: 1000 }], bank: { text: "예금주 A\n계좌 미정", bank: null, account: null, holder: null }, phone: null, today: TODAY })
    expect(raw).toBe("A 9월분 관리비 1,000원이 아직 입금 확인 전이에요. 예금주 A · 계좌 미정로 보내 주세요.")
  })
  it("지난달 비교 한 줄", () => {
    const cur = row({ elec_amount: "122892", total_amount: "337392" })
    expect(prevMonthComparison(cur, row({}))).toBe("지난달보다 11,550원 늘었어요 · 전기료가 가장 많이 늘었어요")
    expect(prevMonthComparison(row({}), cur)).toBe("지난달보다 11,550원 줄었어요 · 전기료가 가장 많이 줄었어요")
    expect(prevMonthComparison(row({}), row({}))).toBe("지난달과 같은 금액이에요")
    expect(prevMonthComparison(row({}), null)).toBeNull()
    // 정기 청구서끼리만 비교한다(수기 청구서가 끼면 비교 줄 없음)
    expect(prevMonthComparison(row({ is_manual: true }), row({}))).toBeNull()
    expect(prevMonthComparison(cur, row({ is_manual: true }))).toBeNull()
  })
})

describe.skipIf(!hasLocalPostgres())("정기 초안의 조정 라인은 재생성 뒤에도 남는다(local-pg)", () => {
  let pg: LocalPg

  beforeAll(async () => {
    pg = await startLocalPg()
    neonConfig.fetchFunction = pg.fetchFunction
    process.env.DATABASE_URL = pg.databaseUrl
    for (const m of ["2026-saas-01-tenants.sql", "2026-saas-02-emails.sql", "2026-saas-06-billing-v2.sql"]) await applyMigration(pg.conn, `scripts/migrations/${m}`)
    await pg.conn.simple(`
      INSERT INTO tenants (id, name) VALUES (1, '(주)솔바람테크');
      INSERT INTO rooms (id, code, building, floor, pyeong) VALUES (1, '204', '본관', 2, 10);
      INSERT INTO contracts (id, tenant_id, room_id, start_date, pyeong_billed, rent_unit_price, mgmt_fee, elec_method, status)
        VALUES (1, 1, 1, '2026-01-01', 10, 21000, 15000, 'area', 'active');
    `)
  }, 90_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
  })

  const generate = async () => {
    const res = await GENERATE(new Request("http://localhost/api/admin/billing/bills/generate", { method: "POST", body: JSON.stringify({ billMonth: "2026-10", force: true }) }))
    expect(res.status).toBe(200)
  }
  const detail = async (id: number) => {
    const res = await GET(new Request(`http://localhost/api/admin/billing/bills?id=${id}`))
    return (await res.json()) as { bill: BillRow; lines: BillLine[] }
  }

  it("시트처럼 PUT lines(생성 라인 그대로 + 조정 라인) → 합계는 서버 계산 → 재생성 뒤에도 조정 라인 유지, 생성 라인은 다시 계산", async () => {
    await generate()
    const id = Number((await pg.conn.simple(`SELECT id FROM bills WHERE tenant_id = 1 AND period = '2026-10'`))[0].rows[0][0])
    const before = await detail(id)
    const baseTotal = Number(before.bill.total_amount)
    expect(before.lines.every((l) => l.line_type !== "manual")).toBe(true)

    const body = buildLinesPayload(before.lines, [{ key: "n", label: "8월 과오납분 차감", amount: "-33000" }])
    const put = await PUT(new Request("http://localhost/api/admin/billing/bills", { method: "PUT", body: JSON.stringify({ id, lines: body.lines }) }))
    expect(put.status).toBe(200)
    const after = await detail(id)
    expect(Number(after.bill.total_amount)).toBe(baseTotal - 33000)
    expect(after.lines.filter((l) => l.line_type !== "manual").map((l) => [l.line_type, Number(l.amount)])).toEqual(
      before.lines.map((l) => [l.line_type, Number(l.amount)]),
    )

    // 계약 단가를 바꾸고 다시 만들면 생성 라인은 새 값, 조정 라인은 그대로
    await pg.conn.simple(`UPDATE contracts SET rent_unit_price = 22000 WHERE id = 1`)
    await generate()
    const regen = await detail(id)
    const manual = regen.lines.filter((l) => l.line_type === "manual")
    expect(manual.map((l) => [l.label, Number(l.amount)])).toEqual([["8월 과오납분 차감", -33000]])
    const rent = regen.lines.find((l) => l.line_type === "rent")!
    expect(Number(rent.amount)).toBe(10 * 22000) // 10평 × 22,000원(이전 21,000원)
    expect(Number(regen.bill.total_amount)).toBe(regen.lines.reduce((s, l) => s + Number(l.amount), 0))
  })

  it("발행된 청구서에는 라인 교체가 거부된다(시트도 편집 칸을 그리지 않음)", async () => {
    const id = Number((await pg.conn.simple(`SELECT id FROM bills WHERE tenant_id = 1 AND period = '2026-10'`))[0].rows[0][0])
    await pg.conn.simple(`UPDATE bills SET status = 'issued', issued_at = NOW() WHERE id = ${id}`)
    const d = await detail(id)
    expect(canEditLine(d.bill, { line_type: "manual" })).toBe(false)
    const res = await PUT(new Request("http://localhost/api/admin/billing/bills", { method: "PUT", body: JSON.stringify({ id, lines: buildLinesPayload(d.lines, []).lines }) }))
    expect(res.status).toBe(400)
  })
})
