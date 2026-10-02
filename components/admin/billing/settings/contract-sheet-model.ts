// 계약 시트의 순수 모델(화면 상태 ↔ API 본문). 테스트: tests/contracts-put-roundtrip.test.ts.
//
// PUT /api/admin/contracts는 "전체 덮어쓰기"다(빠진 칸은 renewal_type → 'renewal', mgmt_fee → 15000,
// first_month_billing → 'full', memo·deposit_actual·start_date → NULL — contracts/route.ts:105-116, 가드 #21).
// 그래서 시트는 GET으로 받은 계약 행 전체를 그대로 두고, 사람이 고친 칸만 바꿔 되돌려 보낸다(buildPutBody).
// 금액·면적 칸 값은 UnitInput 값 계약(쉼표 없는 숫자 문자열 또는 null)을 따른다.
//
// 사용 예:
//   const initial = formFromRow(row)            // 시트를 열 때
//   const [form, setForm] = useState(initial)
//   isFormDirty(initial, form)                  // 닫기 전 확인
//   fetch("/api/admin/contracts", { method: "PUT", body: JSON.stringify(buildPutBody(row, form)) })

import { calcContractCharge } from "@/lib/billing"
import { LEGACY_HINT, RATE_RULES, RENEWAL_HINT } from "./rate-rules"

/** GET /api/admin/contracts 한 행(c.* + tenant_name·room_code·building). 화면에 없는 칸도 그대로 들고 다닌다 */
export interface ContractRow {
  id: number
  tenant_id: number
  tenant_name: string
  room_id: number
  room_code: string
  building?: string | null
  pyeong_billed: string
  pyeong_actual: string | null
  rent_unit_price: string
  mgmt_fee: string
  renewal_type: string
  elec_method: string
  status: string
  deposit_standard: string | null
  deposit_actual: string | null
  ended_at: string | null
  start_date: string | null
  contract_date: string | null
  first_month_billing: string | null
  memo: string | null
  [key: string]: unknown
}

/** 시트에서 고칠 수 있는 칸(기업·호실은 수정 모드에서 읽기 전용 — 바꿔도 API가 무시한다, ISS-114) */
export const EDITABLE_KEYS = [
  "pyeong_billed",
  "rent_unit_price",
  "mgmt_fee",
  "deposit_actual",
  "renewal_type",
  "elec_method",
  "first_month_billing",
  "start_date",
  // 접힌 "다른 조건"
  "pyeong_actual",
  "deposit_standard",
  "contract_date",
  "memo",
] as const
export type EditableKey = (typeof EDITABLE_KEYS)[number]
export type ContractForm = Record<EditableKey, string | null>

const NUMERIC_KEYS = new Set<EditableKey>(["pyeong_billed", "rent_unit_price", "mgmt_fee", "deposit_actual", "pyeong_actual", "deposit_standard"])

export const RENEWAL_OPTIONS = [
  { value: "renewal", label: "신규 입주·갱신", hint: RENEWAL_HINT },
  { value: "new", label: "비갱신 기존 계약", hint: LEGACY_HINT },
] as const
export const ELEC_OPTIONS = [
  { value: "area", label: "면적 배분", hint: "공용 전기료를 부과 면적만큼 나눠 청구해요(본관 사무실)" },
  { value: "metered", label: "계량기 사용량", hint: "호실 계량기 사용량 × kWh 단가로 청구해요(공장동)" },
] as const
export const FIRST_MONTH_OPTIONS = [
  { value: "full", label: "한 달 전액", hint: "입주한 달도 임대료·관리비를 다 청구해요" },
  { value: "prorated", label: "날짜만큼(일할)", hint: "입주일부터 그달 말일까지 날짜만큼만 청구해요" },
  { value: "none", label: "청구 안 함", hint: "입주한 달은 임대료·관리비를 청구하지 않아요" },
] as const

/** 새 계약 기본값 — 지금 화면과 같다(계약구분 갱신, 첫 달 전액 — 가드 #26) */
export const NEW_CONTRACT_FORM: ContractForm = {
  pyeong_billed: null,
  rent_unit_price: String(RATE_RULES.rentRenewal),
  mgmt_fee: String(RATE_RULES.mgmtDefault),
  deposit_actual: null,
  renewal_type: "renewal",
  elec_method: "area",
  first_month_billing: "full",
  start_date: null,
  pyeong_actual: null,
  deposit_standard: null,
  contract_date: null,
  memo: null,
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v)
  return s === "" ? null : s
}

/** GET 행 → 시트 입력 상태(값은 손대지 않고 문자열·null로만 맞춘다) */
export function formFromRow(row: ContractRow): ContractForm {
  const out = {} as ContractForm
  for (const k of EDITABLE_KEYS) out[k] = str(row[k])
  return out
}

/** 두 값이 저장 결과로 같은가(숫자 칸은 "42.0"과 "42"를 같게 본다) */
export function sameValue(key: EditableKey, a: string | null, b: string | null): boolean {
  const x = a === "" ? null : a
  const y = b === "" ? null : b
  if (x === null || y === null) return x === y
  if (NUMERIC_KEYS.has(key)) {
    const nx = Number(x)
    const ny = Number(y)
    if (Number.isFinite(nx) && Number.isFinite(ny)) return nx === ny
  }
  return x === y
}

/** 고친 칸 목록 */
export function changedKeys(initial: ContractForm, form: ContractForm): EditableKey[] {
  return EDITABLE_KEYS.filter((k) => !sameValue(k, initial[k], form[k]))
}

export function isFormDirty(initial: ContractForm, form: ContractForm): boolean {
  return changedKeys(initial, form).length > 0
}

/**
 * PUT 본문 = GET 행 전체 + 고친 칸만 바꾼 값. 고치지 않은 칸은 GET에서 받은 값을 그대로 보낸다
 * (PUT이 빠진 칸을 기본값·NULL로 덮어쓰는 것을 막는다).
 */
export function buildPutBody(row: ContractRow, form: ContractForm): Record<string, unknown> {
  const initial = formFromRow(row)
  const body: Record<string, unknown> = { ...row }
  for (const k of changedKeys(initial, form)) body[k] = form[k]
  body.id = row.id
  return body
}

/** POST 본문(새 계약) */
export function buildCreateBody(form: ContractForm, tenantId: string, roomId: string): Record<string, unknown> {
  return { ...form, tenant_id: tenantId, room_id: roomId }
}

export type ContractErrorKey = "tenant" | "room" | "pyeong_billed" | "rent_unit_price" | "mgmt_fee"

/** 제출 때 한 번에 검사(useFieldErrors.check에 그대로 넣는다). 빈칸을 0으로 바꾸지 않는다(가드 #12) */
export function validateContractForm(
  form: ContractForm,
  opts: { mode: "edit" | "create"; tenantId?: string | null; roomId?: string | null },
): Record<ContractErrorKey, string | false> {
  const positive = (v: string | null) => v !== null && Number.isFinite(Number(v)) && Number(v) > 0
  return {
    tenant: opts.mode === "create" && !opts.tenantId ? "기업을 골라 주세요" : false,
    room: opts.mode === "create" && !opts.roomId ? "호실을 골라 주세요" : false,
    pyeong_billed: !positive(form.pyeong_billed) ? "부과 면적을 입력해 주세요" : false,
    rent_unit_price: form.rent_unit_price === null ? "평당 임대료를 입력해 주세요(면제면 0)" : false,
    mgmt_fee: false,
  }
}

export interface ChargePreview {
  pyeong: number
  unit: number
  rent: number
  mgmt: number
  /** 임대료 + 관리비(부가세 포함, 전기료 별도) */
  gross: number
  /** 관리비 칸이 비어 있어 API 기본값(15,000원)을 쓴 경우 */
  mgmtDefaulted: boolean
}

/** 즉석 계산(표시용) — 청구서와 같은 순수 함수(lib/billing.ts calcContractCharge)를 부른다 */
export function chargePreview(form: ContractForm): ChargePreview | null {
  const pyeong = form.pyeong_billed === null ? NaN : Number(form.pyeong_billed)
  const unit = form.rent_unit_price === null ? NaN : Number(form.rent_unit_price)
  if (!Number.isFinite(pyeong) || !Number.isFinite(unit)) return null
  const mgmtDefaulted = form.mgmt_fee === null
  const mgmt = mgmtDefaulted ? RATE_RULES.mgmtDefault : Number(form.mgmt_fee)
  if (!Number.isFinite(mgmt)) return null
  const c = calcContractCharge({ pyeong_billed: pyeong, rent_unit_price: unit, mgmt_fee: mgmt })
  return { pyeong, unit, rent: c.rent, mgmt: c.mgmt, gross: c.gross, mgmtDefaulted }
}
