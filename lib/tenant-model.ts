// 입주기업 화면·API가 같이 쓰는 순수 함수(서버 라우트에서도 import한다 — "use client" 없음).
//   - 형식 검증: 사업자번호(하이픈 빼고 숫자 10자리)·이메일. 서버는 "값이 바뀐 칸"에만 적용한다(계획서 4.3.7).
//   - 목록 행 타입(GET /api/admin/tenants)과 기업 카드 요약 타입(GET /api/admin/tenants/[id]/summary).
//   - 안내문 만들기: 포털 계정 안내문, 납부 안내 문구.
//
// 사용 예:
//   const err = businessNoError("123-45-6789")      // "사업자번호는 숫자 10자리예요(지금 9자리)"
//   formatBusinessNo("1234567890")                  // "123-45-67890"
//   accountNoticeText({ tenantName, portalUrl, email, password })

import { won, billMonthShort } from "@/lib/format"

// ── 형식 검증 ────────────────────────────────────────────────────────────────

export function businessNoDigits(v: string): string {
  return v.replace(/[\s-]/g, "")
}

/** 사업자번호 형식 오류 문구(문제없으면 null). 빈 값은 오류가 아니다 */
export function businessNoError(v: string | null | undefined): string | null {
  const raw = (v ?? "").trim()
  if (!raw) return null
  const d = businessNoDigits(raw)
  if (!/^\d+$/.test(d)) return "사업자번호는 숫자와 하이픈(-)만 써 주세요"
  if (d.length !== 10) return `사업자번호는 숫자 10자리예요(지금 ${d.length}자리)`
  return null
}

/** 숫자 10자리면 "000-00-00000"으로, 아니면 입력 그대로(앞뒤 공백만 뺌) */
export function formatBusinessNo(v: string): string {
  const raw = v.trim()
  const d = businessNoDigits(raw)
  if (/^\d{10}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
  return raw
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 이메일 형식 오류 문구(문제없으면 null). 빈 값은 오류가 아니다. label은 칸 이름 */
export function emailError(v: string | null | undefined, label: string): string | null {
  const raw = (v ?? "").trim()
  if (!raw) return null
  if (raw.length > 255) return `${label}이 너무 길어요`
  if (!EMAIL_RE.test(raw)) return `${label} 형식을 확인해 주세요(예: tax@company.kr)`
  return null
}

export function isValidDateText(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export type TenantFieldKey = "name" | "business_no" | "tax_email" | "contact_email" | "status" | "overpaid_balance" | "move_in_date" | "move_out_date"
export type TenantFieldErrors = Partial<Record<TenantFieldKey, string>>

// ── 목록 행(GET /api/admin/tenants) ─────────────────────────────────────────

export interface TenantRow {
  id: number
  name: string
  business_no: string | null
  ceo_name: string | null
  room_no: string | null
  contact_email: string | null
  contact_phone: string | null
  move_in_date: string | null
  move_out_date: string | null
  status: "active" | "moved_out"
  memo: string | null
  overpaid_balance: string | null
  created_at?: string
  updated_at?: string
  account_id: number | null
  account_email: string | null
  account_last_login: string | null
  // WP5a 추가(응답 필드 추가만)
  tax_email: string | null
  manager_name: string | null
  /** 진행 중 계약의 호실 코드("201, 202"), 없으면 null */
  contract_rooms: string | null
  active_contracts: number
  /** 진행 중 계약 중 가장 이른 시작일(YYYY-MM-DD) */
  contract_start: string | null
  unpaid_count: number
  unpaid_total: string
  /** 받을 돈 중 기한 지남(또는 기한 없이 발행 후 31일 이상) 건수 */
  unpaid_late_count: number
}

/** 청구서 발행 메일이 실제로 가는 주소(issue/route.ts: tax_email || contact_email) */
export function billMailTarget(t: Pick<TenantRow, "tax_email" | "contact_email">): { email: string | null; via: "tax" | "contact" | "none" } {
  if (t.tax_email) return { email: t.tax_email, via: "tax" }
  if (t.contact_email) return { email: t.contact_email, via: "contact" }
  return { email: null, via: "none" }
}

export function roomsLabel(rooms: string | null | undefined): string {
  if (!rooms) return ""
  const list = rooms.split(/,\s*/).filter(Boolean)
  // 숫자 호실은 "201·202호"로 묶는다(휴대폰 카드의 " · " 항목 구분과 헷갈리지 않게)
  const numeric = list.filter((r) => /^\d+$/.test(r))
  const others = list.filter((r) => !/^\d+$/.test(r))
  return [numeric.length > 0 ? `${numeric.join("·")}호` : "", ...others].filter(Boolean).join("·")
}

/** 이름 일치 검색용 핵심 이름("(주)솔바람테크" → "솔바람테크") */
export function coreName(name: string): string {
  return name
    .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사|\(사\)|사단법인|\(재\)|재단법인/g, "")
    .replace(/\s+/g, "")
    .trim()
}

/** 검색: 기업명·대표·사업자번호·호실(계약 기준·수기)·메일 */
export function matchesTenant(t: TenantRow, q: string): boolean {
  const needle = q.trim().toLowerCase().replace(/\s+/g, "")
  if (!needle) return true
  const hay = [t.name, t.ceo_name, t.business_no, t.business_no ? businessNoDigits(t.business_no) : null, t.contract_rooms, t.room_no, t.tax_email, t.contact_email, t.manager_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, "")
  return hay.includes(needle)
}

// ── 기업 카드 요약(GET /api/admin/tenants/[id]/summary) ─────────────────────

export interface SummaryContract {
  id: number
  room_code: string | null
  building: string | null
  status: "active" | "ended"
  start_date: string | null
  ended_at: string | null
  pyeong_billed: string | null
  rent_unit_price: string | null
  mgmt_fee: string | null
  deposit_standard: string | null
  deposit_actual: string | null
  deposit_returned_amount: string | null
  elec_method: string | null
  renewal_type: string | null
}

export interface SummaryBill {
  id: number
  period: string
  total_amount: string
  status: string
  is_manual: boolean
  due_date: string | null
  issued_at: string | null
  paid_at: string | null
}

export interface SummaryEmail {
  id: number
  template_code: string | null
  subject: string | null
  to_email: string
  status: string
  error: string | null
  created_at: string
}

export interface SummaryNote {
  id: number
  title: string
  status: string
  created_at: string
}

export interface UnpaidBill {
  id: number
  period: string
  status: string
  total_amount: string
  due_date: string | null
  issued_at: string | null
}

export interface TenantSummary {
  tenant: TenantRow
  contracts: SummaryContract[]
  /** 최근 12건(청구월 내림차순) */
  bills: SummaryBill[]
  receivable: {
    count: number
    total: number
    late_count: number
    correcting_count: number
    /** 받을 돈 중 청구월이 가장 이른 것 */
    oldest: UnpaidBill | null
    /** 받을 돈 청구서 전체(청구월 오름차순) — 납부 안내 문구용 */
    bills: UnpaidBill[]
  }
  emails: SummaryEmail[]
  notes: SummaryNote[]
  impact: { bills: number; contracts: number; applications: number; submissions: number; has_account: boolean }
}

// ── 안내문 ──────────────────────────────────────────────────────────────────

/** 포털 계정 안내문(복사용): 주소·로그인 이메일·임시 비밀번호·첫 로그인 안내 */
export function accountNoticeText(p: { tenantName: string; portalUrl: string; email: string; password: string }): string {
  return [
    `[${p.tenantName}] 입주기업 포털 계정 안내`,
    `포털 주소: ${p.portalUrl}`,
    `로그인 이메일: ${p.email}`,
    `임시 비밀번호: ${p.password}`,
    "처음 로그인하면 비밀번호를 바꿔 주세요.",
  ].join("\n")
}

/**
 * 납부 안내 문구(복사용, 계획서 4.4.7 B-9 모양) — 문자·카카오톡으로 보낼 한 덩어리.
 * "(주)솔바람테크 8월분·9월분 관리비 593,934원이 아직 입금 확인 전이에요. 하나은행 910-910009-44304(㈜포항연합기술지주)로 보내 주세요. 문의 054-279-8710"
 * 계좌는 서버에서 읽은 getBillingBankInfo()를 넘긴다. 분해되지 않으면 원문을 한 줄로.
 */
export function paymentNoticeText(p: {
  tenantName: string
  bills: { period: string; total_amount: string | number }[]
  total: number
  bank: { text: string; bank: string | null; account: string | null; holder: string | null }
  contactPhone?: string | null
  today?: string
}): string {
  const months = [...new Set(p.bills.map((b) => b.period))].sort().map((ym) => billMonthShort(ym, p.today))
  const account =
    p.bank.bank && p.bank.account
      ? `${p.bank.bank} ${p.bank.account}${p.bank.holder ? `(${p.bank.holder})` : ""}`
      : p.bank.text.replace(/\s*\n\s*/g, " / ").trim()
  const parts = [
    `${p.tenantName} ${months.join("·")} 관리비 ${won(p.total)}이 아직 입금 확인 전이에요.`,
    `${account}로 보내 주세요.`,
  ]
  if (p.contactPhone) parts.push(`문의 ${p.contactPhone}`)
  return parts.join(" ")
}
