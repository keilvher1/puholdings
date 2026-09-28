import { describe, it, expect } from "vitest"
import { emptyReceiptFields, type ReceiptFields, type UploadedFileMeta } from "@/lib/expenses"
import { normalizeVendor, sameTransactionReason, type SimilarReceipt } from "@/lib/expense-dedupe"
import {
  blankRow,
  findTableMatches,
  hasTableConflict,
  parseQuantityText,
  parseWonText,
  resolveInsertConflicts,
  rowsFromScan,
  type DraftRow,
} from "@/components/admin/expenses/upload-model"

const f = (p: Partial<ReceiptFields>): ReceiptFields => ({ ...emptyReceiptFields(), ...p })
const file = (pathname: string, hash = ""): UploadedFileMeta => ({ pathname, name: pathname.split("/").pop() ?? "", type: "image/jpeg", size: 1, hash })

function row(pathname: string, fields: Partial<ReceiptFields>, opts: { hash?: string; selected?: boolean } = {}): DraftRow {
  const r = blankRow(null, file(pathname, opts.hash), [], null)
  return { ...r, fields: f(fields), selected: opts.selected ?? true }
}

const TAX = { doc_type: "tax_invoice" as const, issue_date: "2026-09-10", vendor_name: "주식회사 에이비씨", vendor_biz_no: "123-45-67890", total_amount: 99000 }
const TRANSFER = { doc_type: "transfer" as const, issue_date: "2026-09-12", vendor_name: "(주)에이비씨", vendor_biz_no: "", total_amount: 99000 }

describe("sameTransactionReason — 같은 거래로 보이는지", () => {
  it("세금계산서 + 이체확인증(상호 표기 다름, 날짜 2일 차이)은 같은 거래", () => {
    expect(sameTransactionReason(f(TAX), f(TRANSFER))).toBe("amount_party_date")
  })
  it("승인번호가 같으면 같은 거래", () => {
    expect(sameTransactionReason(f({ approval_no: "3012-4455", issue_date: "2026-09-01", total_amount: 1000 }), f({ approval_no: "30124455", issue_date: "2026-09-01", total_amount: 1000 }))).toBe(
      "approval"
    )
  })
  it("월 정기 결제(같은 거래처·금액, 30일 간격)는 다른 거래", () => {
    expect(sameTransactionReason(f({ ...TAX, issue_date: "2026-08-10" }), f(TAX))).toBeNull()
  })
  it("사업자번호가 둘 다 있고 다르면 다른 거래", () => {
    expect(sameTransactionReason(f(TAX), f({ ...TAX, vendor_biz_no: "999-99-99999" }))).toBeNull()
  })
  it("금액이 다르면 다른 거래", () => {
    expect(sameTransactionReason(f(TAX), f({ ...TRANSFER, total_amount: 98500 }))).toBeNull()
  })
  it("상호 정규화", () => {
    expect(normalizeVendor("㈜ 에이비씨 포항점")).toBe("에이비씨포항점")
  })
})

describe("표 안의 같은 파일·같은 거래", () => {
  it("다른 파일로 올린 세금계산서·이체확인증: 양쪽에 표시, 둘 다 선택이면 충돌", () => {
    const a = row("expenses/receipts/2026-09/1-세금계산서.pdf", TAX, { hash: "a".repeat(64) })
    const b = row("expenses/receipts/2026-09/2-이체확인증.jpg", TRANSFER, { hash: "b".repeat(64) })
    const m = findTableMatches([a, b])
    expect(m.get(a.key)?.[0]).toMatchObject({ kind: "amount_party_date", otherNumber: 2 })
    expect(m.get(b.key)?.[0]).toMatchObject({ kind: "amount_party_date", otherNumber: 1 })
    expect(hasTableConflict(a, m.get(a.key))).toBe(true)
  })

  it("같은 파일(해시 같음·경로 다름): 나중 행에만 표시", () => {
    const h = "c".repeat(64)
    const a = row("expenses/receipts/2026-09/1-IMG_1234.jpg", TAX, { hash: h })
    const b = row("expenses/receipts/2026-09/2-IMG_1234 2.jpg", TAX, { hash: h })
    const m = findTableMatches([a, b])
    expect(m.get(a.key)).toBeUndefined()
    expect(m.get(b.key)?.[0]).toMatchObject({ kind: "same_file", otherNumber: 1 })
  })

  it("같은 파일에서 나온 행끼리는 비교하지 않는다(AI가 한 파일 속 증빙을 나눈 것)", () => {
    const a = row("expenses/receipts/2026-09/1-두장.jpg", TAX)
    const b = row("expenses/receipts/2026-09/1-두장.jpg", TRANSFER)
    expect(findTableMatches([a, b]).size).toBe(0)
  })

  it("넣을 때: 약한 서류(이체확인증)의 선택을 해제 — 새 행이 약하면 새 행, 기존 행이 약하면 기존 행", () => {
    const tax = row("expenses/receipts/2026-09/1-tax.pdf", TAX)
    const tr = row("expenses/receipts/2026-09/2-tr.jpg", TRANSFER)
    const r1 = resolveInsertConflicts([tax], [tr])
    expect(r1.added[0].selected).toBe(false)
    expect(r1.prev[0].selected).toBe(true)
    const r2 = resolveInsertConflicts([tr], [tax])
    expect(r2.added[0].selected).toBe(true)
    expect(r2.prev[0].selected).toBe(false)
    expect(r2.prev[0].fields).toBe(tr.fields) // 선택만 바뀌고 값은 그대로
  })

  it("넣을 때: 같은 파일을 다시 올린 행은 선택 해제", () => {
    const h = "d".repeat(64)
    const r = resolveInsertConflicts([row("expenses/receipts/a/1-x.jpg", TAX, { hash: h })], [row("expenses/receipts/a/2-x.jpg", { total_amount: 5 }, { hash: h })])
    expect(r.added[0].selected).toBe(false)
  })

  it("저장된 증빙과 같은 거래로 보이는 초안(possible_duplicates)은 기본 선택 해제", () => {
    const draft = { ...f(TRANSFER), suggested_project_id: null, project_reason: "", confidence: "high" as const, low_confidence_fields: [], warnings: [] }
    const sim: SimilarReceipt[] = [
      { id: 7, project_name: "P", issue_date: "2026-09-10", vendor_name: "주식회사 에이비씨", total_amount: 99000, doc_type: "tax_invoice", reason: "amount_party_date" },
    ]
    const rows = rowsFromScan("k", file("expenses/receipts/a/1.jpg"), [draft, draft], [], [], null, [sim, []])
    expect(rows[0].similar).toHaveLength(1)
    expect(rows[0].selected).toBe(false)
    expect(rows[1].selected).toBe(true)
  })
})

describe("금액·수량 입력 해석", () => {
  it("소수점 아래는 버린다(원 단위)", () => {
    expect(parseWonText("12,000.00")).toBe(12000)
    expect(parseWonText("12000.5원")).toBe(12000)
    expect(parseWonText("1,234,000원")).toBe(1234000)
    expect(parseWonText("-3,000")).toBe(-3000)
    expect(parseWonText("")).toBeNull()
  })
  it("수량은 소수를 그대로 받는다", () => {
    expect(parseQuantityText("1.5")).toBe(1.5)
    expect(parseQuantityText("35.12")).toBe(35.12)
    expect(parseQuantityText("1.")).toBe(1)
    expect(parseQuantityText("")).toBeNull()
    expect(parseQuantityText("abc")).toBeUndefined()
    expect(parseQuantityText("-")).toBeUndefined()
  })
})
