// 호실 현황·입주·퇴실 화면의 순수 모델(React 없음). 화면과 테스트(tests/move-in-out-defaults.test.ts)가 같이 쓴다.
// 금액 계산은 lib/billing.ts의 calcContractCharge를 "표시용으로만" 부른다(정산 계산식은 바꾸지 않는다, 계획서 7.1).
// 기본값은 지금과 같다: 첫 달·마지막 달 "한 달 전액"(full), 계약 구분 'new'(화면 문구 "신규 입주"). 가드 #26.
//
// 사용 예:
//   const form = moveInDefaults(room)                  // 공장동이면 15,000원/평 · 30,000원/월 · 계량기
//   const errs = validateMoveIn(form, { newTenant })   // 칸 키 → 오류 문구(없으면 빈 객체)
//   const body = moveInPayload(form, room.id, tenantId)
//   firstBillNotice({ startDate: "2026-10-15", monthIssued: false })   // { kind: "pending", text: "첫 청구서는 10월분 월 마감 3단계에서 들어가요" }

import { calcContractCharge, daysInMonthOf } from "@/lib/billing"
import { billMonthShort, num, thisMonthKST, toNumber, won } from "@/lib/format"

// ── 보드 ─────────────────────────────────────────────────────────────────────

export type BoardState = "occupied" | "vacant" | "leaving" | "maintenance"
/** 주소(?state=)와 범례 칩의 값. API의 maintenance는 화면에서 unavailable("사용 불가") */
export type LegendKey = "all" | "occupied" | "leaving" | "vacant" | "unavailable"

export interface BoardRoom {
  id: number
  code: string
  building: string
  floor: number | null
  pyeong: number | string | null
  tenant_id: number | null
  tenant_name: string | null
  contract_id: number | null
  ended_at: string | null
  state: BoardState
  dday: number | null
  /** (선택) 그 기업의 받을 돈 건수·합계(board API가 주면) */
  unpaid_count?: number | null
  unpaid_total?: number | string | null
  /** (선택) 그중 늦은 건수(기한 지남 또는 기한 없이 발행 후 31일 이상) */
  unpaid_late_count?: number | null
  /** (선택) 그중 기한이 지난 건수(overdue 또는 기한 < 오늘) — 타일 "기한 지남 n건" 배지(청구서 배지와 같은 판정) */
  unpaid_past_due_count?: number | null
}

export const LEGEND_KEYS: LegendKey[] = ["all", "occupied", "leaving", "vacant", "unavailable"]

export function legendOf(state: BoardState): Exclude<LegendKey, "all"> {
  return state === "maintenance" ? "unavailable" : state
}

/** 주소 값 → 범례 키. 모르는 값은 all(오류 화면 없이 기본값) */
export function parseLegend(raw: string | null | undefined): LegendKey {
  return LEGEND_KEYS.includes(raw as LegendKey) ? (raw as LegendKey) : "all"
}

/** 칩 숫자 = 그 칩을 눌렀을 때 보이는 칸 수(입주 중은 퇴실 예정을 뺀 수) */
export function legendCounts(rooms: Pick<BoardRoom, "state">[]): Record<LegendKey, number> {
  const c: Record<LegendKey, number> = { all: rooms.length, occupied: 0, leaving: 0, vacant: 0, unavailable: 0 }
  for (const r of rooms) c[legendOf(r.state)]++
  return c
}

/** 입주율 문장용: 입주(퇴실 예정 포함) 칸 수와 비율 */
export function occupancy(rooms: Pick<BoardRoom, "state">[]): { total: number; occupied: number; rate: number } {
  const total = rooms.length
  const occupied = rooms.filter((r) => r.state === "occupied" || r.state === "leaving").length
  return { total, occupied, rate: total > 0 ? Math.round((occupied / total) * 100) : 0 }
}

/** 퇴실 예정 칩은 0이면 숨긴다(지금 그 칩을 고른 상태면 빈 상태를 보이려고 남긴다) */
export function visibleLegendKeys(counts: Record<LegendKey, number>, current: LegendKey): LegendKey[] {
  return LEGEND_KEYS.filter((k) => k !== "leaving" || counts.leaving > 0 || current === "leaving")
}

const NAME_NOISE = /\(주\)|㈜|주식회사|\s+/g
function norm(s: string): string {
  return s.replace(NAME_NOISE, "").toLowerCase()
}

/** 검색: 호실 코드 또는 기업명(‘(주)’·‘주식회사’·띄어쓰기 무시)에 들어 있으면 맞음. 빈 검색어면 null(모두 진하게) */
export function matchRoom(room: Pick<BoardRoom, "code" | "tenant_name">, q: string): boolean | null {
  const query = norm(q.trim())
  if (!query) return null
  if (norm(room.code).includes(query)) return true
  return room.tenant_name ? norm(room.tenant_name).includes(query) : false
}

/** 기업 이름 비교용 키(‘(주)’·‘주식회사’·띄어쓰기·대소문자 무시) */
export function tenantNameKey(name: string): string {
  return norm(name.trim())
}

/**
 * 새 기업으로 등록하려는 이름과 같은(정규화 키가 같은) 기존 기업. 퇴실한 기업도 포함한다(다시 들어오는 기업을 두 번 만들지 않게).
 * 예: "은하수 랩스" → [{ id: 1, name: "(주)은하수랩스", status: "moved_out" }]
 */
export function findSameNameTenants<T extends { name: string }>(name: string, tenants: readonly T[] | null | undefined): T[] {
  const key = tenantNameKey(name)
  if (!key || !tenants) return []
  return tenants.filter((t) => tenantNameKey(t.name) === key)
}

/** 건물 순서: 본관 먼저, 그 밖은 이름순 */
export function sortBuildings(names: string[]): string[] {
  return [...new Set(names)].sort((a, b) => (a === "본관" ? -1 : b === "본관" ? 1 : a.localeCompare(b, "ko")))
}

/** 건물 → 층(오름차순) → 호실 */
export function groupByFloor(rooms: BoardRoom[]): { building: string; floors: { floor: number | null; rooms: BoardRoom[] }[] }[] {
  return sortBuildings(rooms.map((r) => r.building)).map((building) => {
    const inB = rooms.filter((r) => r.building === building)
    const floors = [...new Set(inB.map((r) => r.floor))].sort((a, b) => (a ?? 999) - (b ?? 999))
    return { building, floors: floors.map((floor) => ({ floor, rooms: inB.filter((r) => r.floor === floor) })) }
  })
}

/** 퇴실 예정 타일 글자: "10월 31일 퇴실 · 29일 남음" */
export function leavingText(endedAt: string | null, dday: number | null): string | null {
  if (!endedAt || !/^\d{4}-\d{2}-\d{2}$/.test(endedAt)) return null
  const m = Number(endedAt.slice(5, 7))
  const d = Number(endedAt.slice(8, 10))
  const left = dday === null ? "" : dday === 0 ? " · 오늘" : ` · ${dday}일 남음`
  return `${m}월 ${d}일 퇴실${left}`
}

/**
 * 주소로 여는 흐름(?room=&action=)을 지금 상태에서 열어도 되는가.
 * movein은 새로 불러온 상태가 공실일 때만, moveout은 지금 진행 중 계약이 있을 때만(계획서 4.3.4).
 */
export function canOpenAction(room: Pick<BoardRoom, "state" | "contract_id">, action: string | null | undefined): { ok: boolean; reason: string | null } {
  if (action === "movein") {
    return room.state === "vacant" ? { ok: true, reason: null } : { ok: false, reason: "공실이 아니라서 입주 처리를 열지 않았어요" }
  }
  if (action === "moveout") {
    return room.contract_id && (room.state === "occupied" || room.state === "leaving")
      ? { ok: true, reason: null }
      : { ok: false, reason: "진행 중인 계약이 없어서 퇴실 처리를 열지 않았어요" }
  }
  return { ok: false, reason: null }
}

// ── 공통 ─────────────────────────────────────────────────────────────────────

export type MonthBilling = "full" | "prorated" | "none"
export const DEPOSIT_PER_PYEONG = 200000 // 기준 보증금 = 평당 20만 원(contracts/route.ts와 같은 값, 표시용)
export const FACTORY_BUILDING = "공장동"

export function isFactory(building: string | null | undefined): boolean {
  return building === FACTORY_BUILDING
}

/** 날짜가 이번 달(KST)보다 뒤의 달인가 — 미래 입주·퇴실 경고용 */
export function isAfterThisMonth(dateStr: string | null | undefined, today?: string): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  return dateStr.slice(0, 7) > thisMonthKST(today)
}

/** 매달 청구 예상(부가세 포함): 임대료(면적×단가) + 관리비 */
export function monthlyCharge(pyeong: unknown, rent: unknown, mgmt: unknown): { rent: number; mgmt: number; gross: number } | null {
  const p = toNumber(pyeong as string)
  const r = toNumber(rent as string)
  const m = toNumber(mgmt as string)
  if (p === null || r === null || m === null) return null
  const c = calcContractCharge({ pyeong_billed: p, rent_unit_price: r, mgmt_fee: m })
  return { rent: Math.round(c.rent), mgmt: Math.round(c.mgmt), gross: Math.round(c.gross) }
}

export function monthlyText(ch: { rent: number; mgmt: number; gross: number } | null): string {
  if (!ch) return "-"
  return `${won(ch.rent)} + 관리비 ${won(ch.mgmt)} = ${won(ch.gross)}`
}

/** 일할 예상액(표시용). 입주 달: 입주일~말일, 퇴실 달: 1일~퇴실일 */
export function proratedEstimate(
  kind: "first" | "last",
  dateStr: string | null | undefined,
  c: { pyeong: unknown; rent: unknown; mgmt: unknown },
): { ym: string; usedDays: number; daysInMonth: number; amount: number } | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  const p = toNumber(c.pyeong as string)
  const r = toNumber(c.rent as string)
  const m = toNumber(c.mgmt as string)
  if (p === null || r === null || m === null) return null
  const ym = dateStr.slice(0, 7)
  const dim = daysInMonthOf(ym)
  const day = Number(dateStr.slice(8, 10))
  const usedDays = kind === "first" ? dim - day + 1 : day
  const amount = calcContractCharge({ pyeong_billed: p, rent_unit_price: r, mgmt_fee: m }, { usedDays, daysInMonth: dim }).gross
  return { ym, usedDays, daysInMonth: dim, amount }
}

/** 정기 청구서가 그 달에 이미 발행됐는가(수기 제외, 발행·기한 지남·납부 완료 중 하나라도) */
export function isMonthIssued(bills: { status: string; is_manual?: boolean | null }[]): boolean {
  return bills.some((b) => !b.is_manual && (b.status === "issued" || b.status === "overdue" || b.status === "paid"))
}

// ── 입주 ─────────────────────────────────────────────────────────────────────

export interface MoveInForm {
  start_date: string
  pyeong_billed: string | null
  rent_unit_price: string | null
  mgmt_fee: string | null
  deposit_actual: string | null
  elec_method: "area" | "metered"
  first_month_billing: MonthBilling
  renewal_type: "new" | "renewal"
}

export type MoveInField = "tenant" | "newName" | "businessNo" | "billEmail" | "start" | "pyeong" | "rent" | "mgmt" | "deposit"

export const MOVE_IN_LABELS: Record<MoveInField, string> = {
  tenant: "입주 기업",
  newName: "기업 이름",
  businessNo: "사업자번호",
  billEmail: "청구서 받을 메일",
  start: "입주일",
  pyeong: "부과 면적",
  rent: "평당 임대료",
  mgmt: "관리비",
  deposit: "받은 보증금",
}

/** 기준 단가: 신규 입주 21,000원/평·15,000원/월, 공장동 15,000원/평·30,000원/월 */
export function baseRates(building: string | null | undefined): { rent: string; mgmt: string; hint: string } {
  return isFactory(building)
    ? { rent: "15000", mgmt: "30000", hint: "공장동 기준 단가예요" }
    : { rent: "21000", mgmt: "15000", hint: "신규 입주 기준 단가예요" }
}

export function moveInDefaults(room: Pick<BoardRoom, "building" | "pyeong">): MoveInForm {
  const rates = baseRates(room.building)
  const p = toNumber(room.pyeong as string)
  return {
    start_date: "",
    pyeong_billed: p === null ? null : String(p),
    rent_unit_price: rates.rent,
    mgmt_fee: rates.mgmt,
    deposit_actual: null,
    elec_method: isFactory(room.building) ? "metered" : "area",
    first_month_billing: "full", // 지금과 같은 기본값(가드 #26). 바꾸려면 업무 결정(5.3)
    renewal_type: "new", // 저장값 'new', 화면 문구 "신규 입주"
  }
}

export function standardDeposit(pyeong: unknown): number | null {
  const p = toNumber(pyeong as string)
  return p === null ? null : Math.round(DEPOSIT_PER_PYEONG * p)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateMoveIn(
  f: MoveInForm,
  o: { tenantId: string | null; newTenant: { name: string; businessNo: string; email: string } | null },
): Partial<Record<MoveInField, string>> {
  const e: Partial<Record<MoveInField, string>> = {}
  if (o.newTenant) {
    if (!o.newTenant.name.trim()) e.newName = "기업 이름을 입력해 주세요"
    const bn = o.newTenant.businessNo.replace(/[\s-]/g, "")
    if (bn && !/^\d{10}$/.test(bn)) e.businessNo = "사업자번호는 숫자 10자리예요"
    if (o.newTenant.email.trim() && !EMAIL_RE.test(o.newTenant.email.trim())) e.billEmail = "메일 주소 형식을 확인해 주세요"
  } else if (!o.tenantId) {
    e.tenant = "입주 기업을 골라 주세요"
  }
  if (!f.start_date) e.start = "입주일을 골라 주세요"
  if (f.pyeong_billed === null || f.pyeong_billed === "") e.pyeong = "부과 면적을 입력해 주세요"
  else if (Number(f.pyeong_billed) <= 0) e.pyeong = "부과 면적은 0보다 커야 해요"
  if (f.rent_unit_price === null || f.rent_unit_price === "") e.rent = "평당 임대료를 입력해 주세요"
  if (f.mgmt_fee === null || f.mgmt_fee === "") e.mgmt = "관리비를 입력해 주세요"
  return e
}

/** POST /api/admin/contracts 본문(기존 필드 그대로). 받은 보증금 빈칸은 null(0원 기록 안 함) */
export function moveInPayload(f: MoveInForm, roomId: number, tenantId: number) {
  return {
    tenant_id: tenantId,
    room_id: roomId,
    start_date: f.start_date,
    pyeong_billed: f.pyeong_billed,
    rent_unit_price: f.rent_unit_price,
    mgmt_fee: f.mgmt_fee,
    deposit_actual: f.deposit_actual,
    elec_method: f.elec_method,
    first_month_billing: f.first_month_billing,
    renewal_type: f.renewal_type,
  }
}

/** 새 기업 POST 본문: 청구서 받을 메일은 tax_email·contact_email에 같은 값 */
export function newTenantPayload(t: { name: string; businessNo: string; email: string }, startDate: string, roomCode: string) {
  const email = t.email.trim() || null
  return {
    name: t.name.trim(),
    business_no: t.businessNo.trim() || null,
    tax_email: email,
    contact_email: email,
    move_in_date: startDate || null,
    room_no: roomCode,
  }
}

/** 서버 field_errors → 입주 폼 칸 */
export function mapTenantFieldErrors(fe: Record<string, string> | null | undefined): Partial<Record<MoveInField, string>> {
  const out: Partial<Record<MoveInField, string>> = {}
  if (!fe) return out
  if (fe.name) out.newName = fe.name
  if (fe.business_no) out.businessNo = fe.business_no
  if (fe.tax_email || fe.contact_email) out.billEmail = fe.tax_email || fe.contact_email
  return out
}

export const FIRST_MONTH_LABEL: Record<MonthBilling, string> = {
  full: "한 달 전액",
  prorated: "입주일부터 날짜만큼(일할)",
  none: "첫 달은 청구 안 함",
}

/**
 * 완료 카드의 첫 청구 안내(사실대로). 입주일이 속한 청구월에 정기 청구서가 이미 발행됐어도, 그 기업은 그 달 청구서가 없으므로
 * 월 마감 3단계를 다시 실행하면 생성이 이 기업 청구서를 새로 만든다(lib/billing decideBillRegen: 기존 청구서 없음 → create).
 * 추가 청구(수기)는 쓰지 않는다 — 수기 청구서가 있으면 생성이 그 기업을 건너뛰어 정기 청구가 빠지므로 추가 청구 화면이 막는다(가드 #19).
 * monthIssued가 null이면(조회 실패) 확인을 권한다.
 */
export function firstBillNotice(o: {
  startDate: string
  monthIssued: boolean | null
  firstMonth: MonthBilling
  estimate?: number | null
  today?: string
}): { kind: "pending" | "issued" | "none" | "unknown"; text: string } {
  const ym = o.startDate.slice(0, 7)
  const label = billMonthShort(ym, o.today)
  if (o.firstMonth === "none") return { kind: "none", text: `${label}은 청구하지 않아요. 다음 달 청구서부터 들어가요` }
  if (o.monthIssued === null) return { kind: "unknown", text: `${label} 청구서가 이미 발행됐는지 확인하지 못했어요. 월 마감 화면에서 확인해 주세요` }
  if (!o.monthIssued) return { kind: "pending", text: `첫 청구서는 ${label} 월 마감 3단계에서 들어가요` }
  const amount = o.estimate != null ? `(약 ${won(o.estimate)})` : ""
  return {
    kind: "issued",
    text: `${label}은 이미 발행됐어요. 월 마감에서 [정정 시작]을 누른 뒤 3단계 [청구서 다시 만들기]를 하면 이 기업 ${label} 청구서${amount}가 새로 생겨요. 발행한 청구서를 되돌릴지 물으면 ‘그대로 두기’를 고르고 4단계에서 발행해 주세요`,
  }
}

// ── 퇴실 ─────────────────────────────────────────────────────────────────────

export interface MoveOutForm {
  ended_at: string
  last_month_billing: MonthBilling
  deposit: "not_yet" | "returned"
  returned_at: string
  returned_amount: string | null
}

export type MoveOutField = "endedAt" | "returnedAt" | "returnedAmount"
export const MOVE_OUT_LABELS: Record<MoveOutField, string> = {
  endedAt: "퇴실일",
  returnedAt: "반환일",
  returnedAmount: "돌려준 금액",
}

export const LAST_MONTH_LABEL: Record<MonthBilling, string> = {
  full: "한 달 전액",
  prorated: "퇴실일까지 날짜만큼(일할)",
  none: "마지막 달 청구 안 함",
}

/** "마지막 달 한 달 전액" · "마지막 달 청구 안 함"(라벨에 이미 "마지막 달"이 있으면 겹쳐 쓰지 않는다) */
export function lastMonthText(k: MonthBilling): string {
  const label = LAST_MONTH_LABEL[k]
  return label.startsWith("마지막 달") ? label : `마지막 달 ${label}`
}

/** 퇴실 폼 기본값: 종료 예정일이 있으면 미리 채움, 마지막 달 "한 달 전액"(지금과 같음), 보증금 "아직 돌려주지 않았어요" */
export function moveOutDefaults(endedAt?: string | null): MoveOutForm {
  const d = endedAt && /^\d{4}-\d{2}-\d{2}$/.test(endedAt) ? endedAt : ""
  return { ended_at: d, last_month_billing: "full", deposit: "not_yet", returned_at: "", returned_amount: null }
}

export function validateMoveOut(f: MoveOutForm): Partial<Record<MoveOutField, string>> {
  const e: Partial<Record<MoveOutField, string>> = {}
  if (!f.ended_at) e.endedAt = "퇴실일을 골라 주세요"
  if (f.deposit === "returned") {
    if (!f.returned_at) e.returnedAt = "반환일을 골라 주세요"
    if (f.returned_amount === null || f.returned_amount === "") e.returnedAmount = "돌려준 금액을 입력해 주세요"
  }
  return e
}

/** POST /contracts/[id]/end 본문(기존 필드 그대로). "아직 돌려주지 않았어요"면 반환액 빈값 → 서버가 NULL로 둔다 */
export function moveOutPayload(f: MoveOutForm) {
  const returned = f.deposit === "returned"
  return {
    ended_at: f.ended_at,
    last_month_billing: f.last_month_billing,
    deposit_returned_amount: returned ? f.returned_amount ?? "" : "",
    ...(returned && f.returned_at ? { deposit_returned_at: f.returned_at } : {}),
  }
}

/** preview API 응답(app/api/admin/contracts/[id]/end/preview) */
export interface EndPreview {
  contract: {
    id: number
    tenant_id: number
    tenant_name: string
    room_code: string
    building: string
    status: string
    deposit_actual: string | null
    ended_at: string | null
  }
  deposit_actual: number
  deposit_recorded: boolean
  unpaid_total: number
  unpaid_count: number
  suggested_return: number
  other_active_contracts: { id: number; room_code: string; building: string }[]
  end_month: string | null
  end_month_bill: { id: number; status: string; total_amount: number } | null
  end_month_issued: boolean
}

/**
 * 정산 한 줄: 보증금이 있고 차액이 0 이상이면 "돌려줄 금액", 아니면 "받을 돈이 n원 남아요".
 * 보증금 기록이 없으면(deposit_actual NULL) 음수를 돌려줄 금액으로 보이지 않는다.
 */
export function settlement(o: { deposit: number; unpaid: number; depositRecorded: boolean }): {
  kind: "return" | "owed" | "even"
  amount: number
  text: string
} {
  const diff = o.deposit - o.unpaid
  if (!o.depositRecorded) {
    if (o.unpaid > 0) return { kind: "owed", amount: o.unpaid, text: `보증금 기록이 없어요. 받을 돈이 ${won(o.unpaid)} 남아요` }
    return { kind: "even", amount: 0, text: "보증금 기록이 없고 받을 돈도 없어요" }
  }
  if (diff < 0) return { kind: "owed", amount: -diff, text: `보증금을 빼고도 받을 돈이 ${won(-diff)} 남아요` }
  return { kind: "return", amount: diff, text: `돌려줄 금액 ${won(diff)} = 보증금 − 받을 돈` }
}

/** 퇴실 달 청구서가 이미 발행됐는데 한 달 전액이 아닌 것을 고르면 정정 필요 안내 */
export function lastMonthIssuedWarning(o: { endMonthIssued: boolean; endMonth: string | null; lastMonth: MonthBilling; today?: string }): string | null {
  if (!o.endMonthIssued || !o.endMonth || o.lastMonth === "full") return null
  const label = billMonthShort(o.endMonth, o.today)
  const what = o.lastMonth === "prorated" ? "일할로" : "청구 안 함으로"
  return `${label}이 한 달 전액으로 이미 발행됐어요. ${what} 바꾸려면 월 마감에서 정정이 필요해요`
}

/**
 * 퇴실 2단계 "처리하면" 목록의 청구 문장(generate/route.ts 규칙 그대로):
 *   - 퇴실 처리한 계약은 퇴실일이 속한 달의 청구서에만 들어가고(full 전액 · prorated 일할 · none 제외),
 *     그 전 달 중 아직 만들지 않은 청구서에는 들어가지 않는다(진행 중 계약이 아니므로).
 *   - 그 달 정기 청구서가 이미 발행됐으면 생성이 그 기업을 건너뛰므로 발행된 금액(한 달 전액)이 그대로 남는다.
 */
export function lastMonthBillingLine(o: {
  endMonth: string
  lastMonth: MonthBilling
  endMonthIssued: boolean
  futureEnd: boolean
  today?: string
}): string {
  const label = billMonthShort(o.endMonth, o.today)
  const m = Number(o.endMonth.slice(5, 7))
  let line: string
  if (o.endMonthIssued) {
    line =
      o.lastMonth === "full"
        ? `${label} 청구서는 이미 발행돼 그대로예요(${m}월 한 달 전액).`
        : `${label} 청구서는 이미 한 달 전액으로 발행돼 그대로 남아요. 바꾸려면 위 안내대로 정정해야 해요.`
  } else if (o.lastMonth === "none") {
    line = `${label} 청구서에는 이 계약을 넣지 않아요(마지막 달 청구 안 함).`
  } else if (o.lastMonth === "prorated") {
    line = `${label} 청구서에 이 계약이 퇴실일까지 날짜만큼(일할) 들어가요.`
  } else {
    line = `${label} 청구서에 이 계약이 한 달 전액으로 들어가요.`
  }
  if (o.futureEnd) line += ` 그 전 달 청구서 중 아직 만들지 않은 것에는 이 계약이 들어가지 않아요.`
  return line
}

/** 퇴실 정산 메모 제목: "(주)은하수랩스 206호 퇴실 정산 — 보증금 2,520,000원 − 받을 돈 0원 = 돌려줄 금액 2,520,000원" */
export function moveOutNoteTitle(o: { tenantName: string; roomCode: string; deposit: number; unpaid: number; depositRecorded: boolean }): string {
  const s = settlement({ deposit: o.deposit, unpaid: o.unpaid, depositRecorded: o.depositRecorded })
  const tail =
    s.kind === "return"
      ? `보증금 ${won(o.deposit)} − 받을 돈 ${won(o.unpaid)} = 돌려줄 금액 ${won(s.amount)}`
      : s.kind === "owed" && o.depositRecorded
        ? `보증금 ${won(o.deposit)} − 받을 돈 ${won(o.unpaid)} → 받을 돈 ${won(s.amount)} 남음`
        : s.kind === "owed"
          ? `보증금 기록 없음 · 받을 돈 ${won(s.amount)} 남음`
          : "보증금 기록 없음 · 받을 돈 없음"
  return `${o.tenantName} ${o.roomCode}호 퇴실 정산 — ${tail}`
}

/** 면적 표시: 12.6 → "12.6평" */
export function pyeongText(p: unknown): string {
  const n = toNumber(p as string)
  return n === null ? "-" : `${num(n, 1)}평`
}
