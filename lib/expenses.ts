// 사업비 정산(증빙 관리) 공용 타입·상수·검증.
// 서버(API 라우트)와 클라이언트(관리자 화면) 양쪽에서 import하므로 서버 전용 모듈을 import하지 않는다.
//
// 흐름: 사업·프로젝트 등록(직접 입력 또는 사업 자료 AI 분석) → 영수증 등 증빙 업로드(여러 장 동시)
//       → AI OCR이 표 형태의 "제안값"을 만든다 → 관리자가 확인·수정하고 어느 프로젝트 증빙인지 고른 뒤 저장.
// AI 결과는 제안일 뿐이며, 사용자 확인 없이 DB에 저장하지 않는다(CLAUDE.md 9번 원칙과 동일).

import type { Attachment } from "@/lib/db"

// ── 문서 종류·결제 수단 ─────────────────────────────────────────────────────────
export const EXPENSE_DOC_TYPES = ["receipt", "card_slip", "tax_invoice", "invoice", "transfer", "other"] as const
export type ExpenseDocType = (typeof EXPENSE_DOC_TYPES)[number]
export const DOC_TYPE_LABELS: Record<ExpenseDocType, string> = {
  receipt: "영수증",
  card_slip: "카드 매출전표",
  tax_invoice: "세금계산서",
  invoice: "거래명세서",
  transfer: "이체확인증",
  other: "기타",
}

export const PAYMENT_METHODS = ["card", "cash", "transfer", "other"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  card: "카드",
  cash: "현금",
  transfer: "계좌이체",
  other: "기타",
}

export type Confidence = "high" | "medium" | "low"
export const CONFIDENCE_LABELS: Record<Confidence, string> = { high: "높음", medium: "보통", low: "낮음" }

// ── 업로드 제한 ──────────────────────────────────────────────────────────────
// Vercel 함수 요청 본문 한도(4.5MB) 안에 들어오도록 파일 1개씩 전송한다.
// 이미지는 브라우저에서 긴 변 2000px JPEG로 줄여 보내므로 사실상 PDF에만 걸리는 제한이다.
export const MAX_SCAN_FILE_BYTES = 4 * 1024 * 1024
export const SCAN_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const
export const SCAN_ACCEPT = "image/*,application/pdf"
export const PROJECT_DOC_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"] as const
export const PROJECT_DOC_ACCEPT = "image/*,application/pdf,text/plain"
export const MAX_PROJECT_DOC_FILES = 5
// 브라우저에서 동시에 분석할 파일 수(나머지는 대기열)
export const SCAN_CONCURRENCY = 3

// ── 프로젝트 ─────────────────────────────────────────────────────────────────
export interface BudgetItem {
  name: string // 비목(예: 재료비, 인건비, 외주용역비, 여비, 회의비)
  amount: number | null // 원 단위 정수, 모르면 null
}

export interface ProjectInput {
  name: string // 프로젝트(과제)명 — 필수
  program_name: string // 상위 지원사업명(없으면 '')
  agency: string // 주관·전담 기관(없으면 '')
  description: string
  start_date: string | null // 'YYYY-MM-DD'
  end_date: string | null // 'YYYY-MM-DD'
  total_budget: number | null // 원 단위 정수
  budget_items: BudgetItem[]
  source_files: Attachment[] // AI 분석에 쓴 사업 자료(Blob private, expenses/projects/...)
}

export interface ExpenseProject extends ProjectInput {
  id: number
  status: "active" | "closed"
  created_at: string
  updated_at: string
  receipt_count: number // 저장된 증빙 수
  spent_total: number // 저장된 증빙 합계(원)
}

// AI가 사업 자료에서 뽑아낸 프로젝트 초안(저장 전)
export interface ProjectDraft extends Omit<ProjectInput, "source_files"> {
  confidence: Confidence
  note: string // 판단 근거·애매한 점(한국어)
}

// ── 증빙(영수증 등) ───────────────────────────────────────────────────────────
export interface ReceiptItem {
  name: string
  quantity: number | null
  unit_price: number | null
  amount: number | null
}

// 화면 표에서 편집하는 필드 묶음. 저장된 증빙과 AI 초안이 같은 모양을 공유한다.
export interface ReceiptFields {
  doc_type: ExpenseDocType
  issue_date: string // 'YYYY-MM-DD' (초안에서는 '' 허용, 저장 시 필수)
  vendor_name: string // 거래처(가맹점)명
  vendor_biz_no: string // 사업자등록번호 'NNN-NN-NNNNN' 또는 ''
  supply_amount: number | null // 공급가액
  vat_amount: number | null // 부가세
  total_amount: number | null // 합계(결제 금액) — 저장 시 필수
  payment_method: PaymentMethod
  approval_no: string // 카드 승인번호 등, 없으면 ''
  items: ReceiptItem[] // 품목
  budget_item: string // 비목(프로젝트 budget_items의 name 중 하나 권장, 자유 입력 허용)
  purpose: string // 사용 목적·적요
  memo: string
}

// 업로드되어 Blob에 보관된 원본 파일 정보
export interface UploadedFileMeta {
  pathname: string // expenses/receipts/YYYY-MM/{timestamp}-{name}
  name: string
  type: string
  size: number
  hash: string // sha256 hex — 같은 파일 중복 업로드 감지용
}

// AI OCR 초안. 파일 한 개에 증빙이 여러 장 들어 있으면 초안도 여러 개다.
export interface ReceiptDraft extends ReceiptFields {
  suggested_project_id: number | null // 등록된 프로젝트 목록 중 AI가 추정한 것(확신 없으면 null)
  project_reason: string
  confidence: Confidence
  low_confidence_fields: (keyof ReceiptFields)[] // 사람이 꼭 확인해야 하는 칸
  warnings: string[]
}

// 같은 파일(해시 일치)로 이미 저장된 증빙
export interface DuplicateReceipt {
  id: number
  project_name: string
  issue_date: string
  vendor_name: string
  total_amount: number
}

// POST /api/admin/expenses/scan 응답
export type ScanResponse =
  | { success: true; file: UploadedFileMeta; drafts: ReceiptDraft[]; duplicates: DuplicateReceipt[] }
  | { success: false; error: string; needs_setup?: boolean }

// POST /api/admin/expenses/projects/analyze 응답
export type AnalyzeProjectsResponse =
  | { success: true; drafts: ProjectDraft[]; files: Attachment[]; warnings: string[] }
  | { success: false; error: string; needs_setup?: boolean }

// POST /api/admin/expenses/receipts 요청 한 건
export interface ReceiptCreateInput extends ReceiptFields {
  project_id: number
  file: UploadedFileMeta
  ai_confidence: Confidence | null
  ai_raw: unknown // 감사용 AI 원본 초안(그대로 JSONB 저장)
}

export interface ExpenseReceipt extends ReceiptFields {
  id: number
  project_id: number
  project_name: string
  file_pathname: string
  file_name: string
  file_type: string
  file_size: number
  file_hash: string
  ai_confidence: Confidence | null
  created_at: string
  updated_at: string
}

// ── 검증·표시 도우미 ───────────────────────────────────────────────────────────
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export function isValidDate(s: string | null | undefined): s is string {
  if (!s || !DATE_RE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function isWholeWon(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && Math.abs(n) < 1e12
}

// 저장 직전 필수값·형식 검증. 빈 배열이면 저장 가능.
export function validateReceiptFields(r: ReceiptFields): string[] {
  const errors: string[] = []
  if (!isValidDate(r.issue_date)) errors.push("거래일자를 YYYY-MM-DD 형식으로 입력하세요")
  if (!r.vendor_name.trim()) errors.push("거래처명을 입력하세요")
  if (r.vendor_name.length > 200) errors.push("거래처명이 너무 깁니다")
  if (!isWholeWon(r.total_amount)) errors.push("합계 금액을 원 단위 정수로 입력하세요")
  if (r.supply_amount !== null && !isWholeWon(r.supply_amount)) errors.push("공급가액은 원 단위 정수여야 합니다")
  if (r.vat_amount !== null && !isWholeWon(r.vat_amount)) errors.push("부가세는 원 단위 정수여야 합니다")
  if (!EXPENSE_DOC_TYPES.includes(r.doc_type)) errors.push("문서 종류가 올바르지 않습니다")
  if (!PAYMENT_METHODS.includes(r.payment_method)) errors.push("결제 수단이 올바르지 않습니다")
  if (r.vendor_biz_no && !/^\d{3}-?\d{2}-?\d{5}$/.test(r.vendor_biz_no)) errors.push("사업자등록번호 형식이 올바르지 않습니다")
  if (r.budget_item.length > 100) errors.push("비목이 너무 깁니다")
  return errors
}

// 공급가액 + 부가세 ≠ 합계면 경고(저장은 막지 않는다)
export function amountMismatch(r: Pick<ReceiptFields, "supply_amount" | "vat_amount" | "total_amount">): boolean {
  if (r.supply_amount === null || r.vat_amount === null || r.total_amount === null) return false
  return r.supply_amount + r.vat_amount !== r.total_amount
}

export function formatBizNo(s: string): string {
  const d = s.replace(/\D/g, "")
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : s
}

export function formatWon(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? `${n.toLocaleString("ko-KR")}원` : "-"
}

export function emptyReceiptFields(): ReceiptFields {
  return {
    doc_type: "receipt",
    issue_date: "",
    vendor_name: "",
    vendor_biz_no: "",
    supply_amount: null,
    vat_amount: null,
    total_amount: null,
    payment_method: "card",
    approval_no: "",
    items: [],
    budget_item: "",
    purpose: "",
    memo: "",
  }
}
