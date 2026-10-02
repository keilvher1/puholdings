// 청구서 화면의 서버 호출 모음(클라이언트). 기존 API만 부른다:
//   GET/PUT /api/admin/billing/bills, POST …/bills/issue(수기 청구서 bill_ids만), POST …/bills/manual, GET …/bills/download,
//   GET /api/admin/tenants, GET /api/admin/contracts, POST /api/admin/notes
// 실패는 예외 대신 { ok:false, status, error }로 돌려주고, 화면은 friendlyError()로 사용자 문구를 만든다.

import { friendlyError, MSG } from "@/lib/messages"
import { appendBillMemo } from "@/lib/bill-display"
import type { BillLine, BillRow, ContractForBilling, LinesPayloadLine } from "./bill-model"

export interface ApiOk<T> {
  ok: true
  data: T
}
export interface ApiFail {
  ok: false
  status: number
  error: string
  /** 서버가 준 원래 본문(needs_regenerate 등 판단용) */
  body?: Record<string, unknown> | null
}
export type ApiResult<T> = ApiOk<T> | ApiFail

const BASE = "/api/admin/billing/bills"

async function call<T>(url: string, init: RequestInit | undefined, fallback: string, pick: (body: Record<string, unknown>) => T): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { credentials: "include", ...init })
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok || !body || body.success === false) {
      return { ok: false, status: res.ok ? 400 : res.status, error: friendlyError(res.ok ? 400 : res.status, (body?.error as string) ?? null, fallback), body }
    }
    return { ok: true, data: pick(body) }
  } catch {
    return { ok: false, status: 0, error: friendlyError(0, null, fallback) }
  }
}

const json = (body: unknown): RequestInit => ({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

/** 받을 돈(납부 대기·기한 지남) + 정정 중 — 상태 묶음 조회라 건수 상한이 없다 */
export function fetchReceivables(): Promise<ApiResult<BillRow[]>> {
  return call(`${BASE}?status=issued,overdue&include=correcting`, undefined, MSG.loadFailed, (b) => (b.bills as BillRow[]) ?? [])
}

/** 작성 중(정정 중 포함) 전체 */
export function fetchDrafts(): Promise<ApiResult<BillRow[]>> {
  return call(`${BASE}?status=draft`, undefined, MSG.loadFailed, (b) => (b.bills as BillRow[]) ?? [])
}

/** 한 청구월 전체(월별 보기) */
export function fetchMonth(period: string): Promise<ApiResult<BillRow[]>> {
  return call(`${BASE}?period=${encodeURIComponent(period)}`, undefined, MSG.loadFailed, (b) => (b.bills as BillRow[]) ?? [])
}

/** 한 기업의 청구서(지난달 비교·추가 청구 상태 확인). period를 주면 그 달만 */
export function fetchTenantBills(tenantId: number, period?: string): Promise<ApiResult<BillRow[]>> {
  const q = new URLSearchParams({ tenant_id: String(tenantId) })
  if (period) q.set("period", period)
  return call(`${BASE}?${q}`, undefined, MSG.loadFailed, (b) => (b.bills as BillRow[]) ?? [])
}

export interface BillDetail {
  bill: BillRow & { tax_email?: string | null; contact_email?: string | null; memo?: string | null }
  lines: BillLine[]
}

export function fetchBill(id: number): Promise<ApiResult<BillDetail>> {
  return call(`${BASE}?id=${id}`, undefined, MSG.loadFailed, (b) => ({ bill: b.bill as BillDetail["bill"], lines: (b.lines as BillLine[]) ?? [] }))
}

/** 납부 처리(이체일 필수 — 빈값으로 부르지 않는다) */
export function markPaid(id: number, paidAt: string): Promise<ApiResult<true>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return Promise.resolve({ ok: false, status: 400, error: "입금일을 골라 주세요." })
  return call(BASE, json({ id, mark_paid: true, paid_at: paidAt }), MSG.saveFailed, () => true as const)
}

/** 납부 처리 취소(paid → issued, 서버가 메모에 기록) */
export function markUnpaid(id: number): Promise<ApiResult<true>> {
  return call(BASE, json({ id, mark_unpaid: true }), MSG.saveFailed, () => true as const)
}

/** 메모 덧붙이기: 상세 GET으로 지금 메모를 읽고 appendBillMemo로 합쳐 PUT(memo는 통째 교체라서, 가드 #27) */
export async function appendMemo(id: number, line: string): Promise<ApiResult<true>> {
  const cur = await fetchBill(id)
  if (!cur.ok) return cur
  return call(BASE, json({ id, memo: appendBillMemo(cur.data.bill.memo ?? null, line) }), MSG.saveFailed, () => true as const)
}

/** 메모 전체 바꾸기(시트의 메모 칸 — 방금 읽은 메모를 고친 값) */
export function saveMemo(id: number, memo: string): Promise<ApiResult<true>> {
  return call(BASE, json({ id, memo }), MSG.saveFailed, () => true as const)
}

export function saveDueDate(id: number, dueDate: string): Promise<ApiResult<true>> {
  return call(BASE, json({ id, due_date: dueDate }), MSG.saveFailed, () => true as const)
}

/** 라인 전체 교체(작성 중만). 합계는 서버가 다시 계산한다 */
export function saveLines(id: number, lines: LinesPayloadLine[]): Promise<ApiResult<true>> {
  return call(BASE, json({ id, lines }), MSG.saveFailed, () => true as const)
}

export interface IssueResult {
  issued: number
  mail: { sent: number; failed: number }
  no_email: string[]
}

/** 수기 청구서 한 건 발행(기존 issue bill_ids). 강행(force)은 보내지 않는다 */
export function issueOne(id: number): Promise<ApiResult<IssueResult>> {
  return call(`${BASE}/issue`, post({ bill_ids: [id] }), "발행하지 못했어요.", (b) => ({
    issued: Number(b.issued ?? 0),
    mail: (b.mail as IssueResult["mail"]) ?? { sent: 0, failed: 0 },
    no_email: (b.no_email as string[]) ?? [],
  }))
}

export function createManualBill(p: {
  tenant_id: number
  period: string
  due_date?: string
  memo?: string
  lines: { label: string; amount: number; line_type: "manual" }[]
}): Promise<ApiResult<{ id: number }>> {
  return call(`${BASE}/manual`, post(p), MSG.saveFailed, (b) => ({ id: Number(b.id) }))
}

export interface TenantOption {
  id: number
  name: string
  status: string
  room_no: string | null
}

export function fetchTenants(): Promise<ApiResult<TenantOption[]>> {
  return call("/api/admin/tenants", undefined, MSG.loadFailed, (b) => (b.tenants as TenantOption[]) ?? [])
}

/** 그 기업의 계약 전부(진행 중·종료) — 추가 청구 판정은 생성과 같은 기준(generateWouldBill)으로 화면에서 거른다 */
export function fetchTenantContracts(tenantId: number): Promise<ApiResult<ContractForBilling[]>> {
  return call(`/api/admin/contracts?tenant_id=${tenantId}`, undefined, MSG.loadFailed, (b) => (b.contracts as ContractForBilling[]) ?? [])
}

export function createNote(title: string, body: string): Promise<ApiResult<{ id: number }>> {
  return call("/api/admin/notes", post({ category: "confirm", title, body }), MSG.saveFailed, (b) => ({ id: Number(b.id) }))
}
