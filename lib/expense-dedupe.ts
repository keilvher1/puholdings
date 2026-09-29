// 사업비 정산 — 같은 거래의 증빙을 두 번 계상하지 않도록 "같은 거래로 보이는지" 판단하는 규칙.
// 서버(/scan에서 이미 저장된 증빙과 대조)와 화면(증빙 올리기 표 안의 행끼리 대조)이 같은 규칙을 쓰도록 여기 모은다.
// 순수 함수만 둔다(서버 전용 모듈을 import하지 않는다).
//
// 예: 같은 99,000원 구매의 '세금계산서.pdf'와 '이체확인증.jpg'를 따로 올리면 행이 2개 생긴다.
//     둘 다 저장하면 집행액이 198,000원으로 잡히므로, 같은 거래로 보이면 경고하고 한쪽만 저장하게 이끈다.

import type { DuplicateReceipt, ExpenseDocType, ReceiptFields } from "./expenses"

// approval: 승인번호가 같다 · amount_party_date: 합계가 같고 거래처가 같으며 날짜가 가깝다
export type SameTxReason = "approval" | "amount_party_date"

export const SAME_TX_REASON_LABELS: Record<SameTxReason, string> = {
  approval: "승인번호가 같습니다",
  amount_party_date: "거래처·합계가 같고 날짜가 가깝습니다",
}

// 이미 저장된 증빙 중 같은 거래로 보이는 것(POST /scan 응답의 possible_duplicates[i])
export interface SimilarReceipt extends DuplicateReceipt {
  doc_type: ExpenseDocType
  reason: SameTxReason
}

export type TxKeyFields = Pick<ReceiptFields, "doc_type" | "issue_date" | "vendor_name" | "vendor_biz_no" | "total_amount" | "approval_no">

// 세금계산서 작성일과 실제 이체일은 며칠 어긋나는 일이 흔하다. 월 정기 결제(같은 거래처·같은 금액)는 30일 간격이라 걸리지 않는다.
export const SAME_TX_MAX_DAYS = 7
// 승인번호가 같아도 날짜가 너무 멀면(다른 카드사의 우연한 같은 번호) 같은 거래로 보지 않는다.
const SAME_APPROVAL_MAX_DAYS = 31
const MIN_APPROVAL_LEN = 6

// 한 거래를 증빙하는 서류가 여럿이면 어느 쪽을 남길지 — 세금계산서 > 카드전표 > 영수증 > 인건비 지급 > 이체확인증 > 거래명세서 > 기타
// (인건비 지급은 귀속월 등 지급 내역을 담은 기록이라 같은 급여의 이체확인증보다 우선한다)
export const DOC_TYPE_PRIORITY: Record<ExpenseDocType, number> = {
  tax_invoice: 5,
  card_slip: 4,
  receipt: 3,
  payroll: 2.5,
  transfer: 2,
  invoice: 1,
  other: 0,
}

export function normalizeApproval(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^0-9a-z]/g, "")
}

// '(주)에이비씨', '주식회사 에이비씨', '㈜ 에이비씨 ' → '에이비씨'
export function normalizeVendor(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/\(\s*(주|유|사|재|합)\s*\)|㈜|㈔|주식회사|유한회사|유한책임회사|사단법인|재단법인|합자회사|합명회사/g, "")
    .replace(/[^0-9a-z가-힣]/g, "")
}

export function vendorsMatch(a: string, b: string): boolean {
  const x = normalizeVendor(a)
  const y = normalizeVendor(b)
  if (x.length < 2 || y.length < 2) return false
  return x === y || x.includes(y) || y.includes(x)
}

function bizDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "")
}

function dayNumber(s: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const t = Date.parse(`${s}T00:00:00Z`)
  return Number.isNaN(t) ? null : Math.round(t / 86_400_000)
}

export function daysApart(a: string, b: string): number | null {
  const x = dayNumber(a)
  const y = dayNumber(b)
  return x === null || y === null ? null : Math.abs(x - y)
}

// 두 증빙이 같은 거래로 보이면 그 이유, 아니면 null.
export function sameTransactionReason(a: TxKeyFields, b: TxKeyFields): SameTxReason | null {
  const days = daysApart(a.issue_date, b.issue_date)

  const ap = normalizeApproval(a.approval_no)
  if (ap.length >= MIN_APPROVAL_LEN && ap === normalizeApproval(b.approval_no) && (days === null || days <= SAME_APPROVAL_MAX_DAYS)) {
    return "approval"
  }

  if (typeof a.total_amount !== "number" || a.total_amount === 0 || a.total_amount !== b.total_amount) return null
  if (days === null || days > SAME_TX_MAX_DAYS) return null
  const ab = bizDigits(a.vendor_biz_no)
  const bb = bizDigits(b.vendor_biz_no)
  // 양쪽 다 사업자번호가 있으면 그것으로만 판단한다(이체확인증처럼 한쪽에 없으면 상호로).
  if (ab.length === 10 && bb.length === 10) return ab === bb ? "amount_party_date" : null
  return vendorsMatch(a.vendor_name, b.vendor_name) ? "amount_party_date" : null
}
