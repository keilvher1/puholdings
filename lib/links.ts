// 화면 사이 링크의 약속(계획서 3.4 URL 계약)을 함수로 만든 것. 링크를 만드는 모든 WP는 이 함수만 쓴다.
// 특히 /admin/billing?month=는 "전기 사용월", /admin/billing/bills?period=는 "청구월"이라 손으로 만들면 한 달씩 어긋나기 쉽다.
// 순수 함수. 값이 비어 있으면(undefined·null·"") 그 파라미터를 넣지 않는다. 기본값이어도 넘긴 값은 그대로 넣는다.
//
// 사용 예:
//   import { billingCloseHref, billsHref, roomsHref } from "@/lib/links"
//   billingCloseHref("2026-09", 4)                         // "/admin/billing?month=2026-09&step=4"
//   billsHref({ view: "receivable", bucket: "late" })      // "/admin/billing/bills?view=receivable&bucket=late"
//   billsHref({ bill: 87 })                                // 청구서 상세 시트 열기
//   billsHref({ add: true, tenant: 3, period: "2026-10" })  // 추가 청구 시트(기업·청구월 채움): "...?period=2026-10&tenant=3&add=1"
//   programHref(4)                                         // "/admin/programs/4"
//   roomsHref({ room: "305", action: "movein" })           // 305호 시트의 입주 처리 흐름
//   billingCloseHrefForBillMonth("2026-10", 3)             // 청구월로 부를 때: "/admin/billing?month=2026-09&step=3"

import { addMonths } from "./format"

type Param = string | number | boolean | null | undefined

function href(path: string, params: [string, Param][]): string {
  const qs = new URLSearchParams()
  for (const [k, v] of params) {
    if (v === undefined || v === null || v === "" || v === false) continue
    qs.set(k, v === true ? "1" : String(v))
  }
  const s = qs.toString()
  return s ? `${path}?${s}` : path
}

// ── 관리비 정산 ───────────────────────────────────────────────────────────────

export type CloseStepNumber = 1 | 2 | 3 | 4

/** 월 마감(WP6). usageYm = 전기 사용월("2026-09" → 10월분 청구서를 만드는 마감). step 1~4 */
export function billingCloseHref(usageYm?: string | null, step?: CloseStepNumber | null): string {
  return href("/admin/billing", [
    ["month", usageYm],
    ["step", step],
  ])
}

/** 청구월로 월 마감 링크를 만들 때(청구월 − 1개월 = 사용월로 바꿔 준다) */
export function billingCloseHrefForBillMonth(billYm: string, step?: CloseStepNumber | null): string {
  return billingCloseHref(addMonths(billYm, -1), step)
}

export type BillsView = "receivable" | "month" | "draft"
export type BillsStatusParam = "draft" | "issued" | "overdue" | "paid"
export type BillsBucketParam = "late" | "not_due" | "d1_30" | "d31_60" | "d60_plus" | "no_due" | "correcting"

/** 청구서(WP7). period = 청구월. 기본 view는 receivable(받을 돈). view=receivable에서 period는 "그 청구월만" 거르는 조건 */
export function billsHref(p: {
  view?: BillsView
  period?: string | null
  status?: BillsStatusParam
  bucket?: BillsBucketParam
  q?: string | null
  bill?: number | string | null
  tenant?: number | string | null
  /** true면 추가 청구 시트를 연다(?add=1). tenant·period와 함께 주면 기업·청구월을 채워 연다 */
  add?: boolean
} = {}): string {
  return href("/admin/billing/bills", [
    ["view", p.view],
    ["period", p.period],
    ["status", p.status],
    ["bucket", p.bucket],
    ["q", p.q],
    ["bill", p.bill],
    ["tenant", p.tenant],
    ["add", p.add],
  ])
}

export type BillingSettingsTab = "rates" | "contracts" | "rooms" | "data"

/** 관리비 정산 > 기준 정보(WP5b). 기본 tab=rates */
export function billingSettingsHref(p: { tab?: BillingSettingsTab; contract?: number | string | null; tenant?: number | string | null } = {}): string {
  return href("/admin/billing/settings", [
    ["tab", p.tab],
    ["contract", p.contract],
    ["tenant", p.tenant],
  ])
}

// ── 호실·입주기업 ─────────────────────────────────────────────────────────────

export type RoomState = "occupied" | "leaving" | "vacant" | "unavailable"

/** 호실 현황(WP4). room = 호실 코드(시트 열기), action = movein|moveout(그 흐름 열기) */
export function roomsHref(p: { state?: RoomState; q?: string | null; room?: string | null; action?: "movein" | "moveout" } = {}): string {
  return href("/admin/rooms", [
    ["state", p.state],
    ["q", p.q],
    ["room", p.room],
    ["action", p.action],
  ])
}

export type TenantsTab = "active" | "moved_out" | "all"
export type TenantsFilter = "no_portal" | "no_bill_email" | "unpaid"
export type TenantCardTab = "overview" | "contract" | "bills" | "contact" | "memo"

/** 입주기업(WP5a). tenant = 기업 카드 열기, card = 카드 탭. 기본 tab=active */
export function tenantsHref(p: {
  tab?: TenantsTab
  q?: string | null
  filter?: TenantsFilter
  tenant?: number | string | null
  card?: TenantCardTab
} = {}): string {
  return href("/admin/tenants", [
    ["tab", p.tab],
    ["q", p.q],
    ["filter", p.filter],
    ["tenant", p.tenant],
    ["card", p.card],
  ])
}

// ── 증빙 처리 ─────────────────────────────────────────────────────────────────

export type ExpensesView = "all" | "review" | "input" | "ready" | "excluded"

/** 증빙 올리기(WP2). inbox=true면 데스크톱 앱에서 온 건만 */
export function expensesHref(p: { project_id?: number | string | null; view?: ExpensesView; inbox?: boolean } = {}): string {
  return href("/admin/expenses", [
    ["project_id", p.project_id],
    ["view", p.view],
    ["inbox", p.inbox],
  ])
}

export type ReceiptsView = "all" | "check" | "unassigned" | "foreign" | "payroll"

/** 증빙 내역(WP3). receipt = 편집 시트 열기. 모든 조건을 주소에 남긴다 */
export function receiptsHref(p: {
  project_id?: number | string | null
  from?: string | null
  to?: string | null
  q?: string | null
  doc_type?: string | null
  item?: string | null
  view?: ReceiptsView
  receipt?: number | string | null
} = {}): string {
  return href("/admin/expenses/receipts", [
    ["project_id", p.project_id],
    ["from", p.from],
    ["to", p.to],
    ["q", p.q],
    ["doc_type", p.doc_type],
    ["item", p.item],
    ["view", p.view],
    ["receipt", p.receipt],
  ])
}

/** 증빙 인쇄(WP3). layout = 한 쪽에 1·2·4장 */
export function receiptsPrintHref(p: { project_id?: number | string | null; from?: string | null; to?: string | null; layout?: 1 | 2 | 4 } = {}): string {
  return href("/admin/expenses/receipts/print", [
    ["project_id", p.project_id],
    ["from", p.from],
    ["to", p.to],
    ["layout", p.layout],
  ])
}

// ── 소통·기타 ─────────────────────────────────────────────────────────────────

/** 메일(WP1). type = email_logs.template_code 그대로 */
export function emailsHref(p: { status?: "failed" | "sent"; type?: string | null; q?: string | null } = {}): string {
  return href("/admin/emails", [
    ["status", p.status],
    ["type", p.type],
    ["q", p.q],
  ])
}

/** 문의(WP1) */
export function inquiriesHref(p: { status?: "new" } = {}): string {
  return href("/admin/inquiries", [["status", p.status]])
}

/** 프로그램(제출물 검토) */
export function programsHref(): string {
  return "/admin/programs"
}

/** 프로그램 상세(신청·제출물 검토) — /admin/programs/{id}[?tab=submissions] (tab: 처음 열 탭, 기본 신청 현황) */
export function programHref(id: number | string, opts: { tab?: "submissions" } = {}): string {
  const base = `/admin/programs/${encodeURIComponent(String(id))}`
  return opts.tab ? `${base}?tab=${opts.tab}` : base
}

/** 관리자 로그인(next는 safeNext로 다시 검사된다) */
export function adminLoginHref(next?: string | null): string {
  return href("/admin/login", [["next", next]])
}

// ── 입주기업 포털 ─────────────────────────────────────────────────────────────

/** 포털 청구서 목록(WP8). 미납이 있으면 기본 unpaid */
export function portalBillsHref(p: { view?: "unpaid" | "all" } = {}): string {
  return href("/portal/bills", [["view", p.view]])
}

/** 포털 청구서 상세 */
export function portalBillHref(id: number | string): string {
  return `/portal/bills/${encodeURIComponent(String(id))}`
}

/** 포털 로그인(next는 safeNext로 다시 검사된다) */
export function portalLoginHref(next?: string | null): string {
  return href("/portal/login", [["next", next]])
}
