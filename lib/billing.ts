// 관리비 공통 헬퍼. 월 표기는 'YYYY-MM' CHAR(7), 금액은 원 단위 정수(NUMERIC(12,0)).

export function isValidPeriod(period: unknown): period is string {
  return typeof period === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(period)
}

export function prevPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

// 'YYYY-MM-DD' 형식 + 실제 존재하는 날짜인지 검증
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function formatWon(amount: number | string): string {
  return Number(amount).toLocaleString("ko-KR")
}

export const BILL_STATUS_LABELS: Record<string, string> = {
  draft: "작성 중",
  issued: "발행됨",
  paid: "납부 완료",
  overdue: "연체",
}

// ============================================================================
// 관리비 청구 계산 엔진 (실제 엑셀 정산표 수식의 역공학 결과)
// 순수 함수 — DB/네트워크 의존 없음. tests/billing.test.ts의 2026-05 실측값 통과 기준.
// ============================================================================

/** 천원 미만 절사 (엑셀 ROUNDDOWN(x, -3)) */
export function roundDown1000(x: number): number {
  return Math.floor(x / 1000) * 1000
}

/** 10원 단위 반올림 (10평당 청구단가 확정 기본 제안) */
export function roundTo10(x: number): number {
  return Math.round(x / 10) * 10
}

/** 일할 계산: 월액 × 사용일수 ÷ 해당월 일수, 반올림 */
export function prorate(monthlyAmount: number, usedDays: number, daysInMonth: number): number {
  if (daysInMonth <= 0) return 0
  return Math.round((monthlyAmount * usedDays) / daysInMonth)
}

export function daysInMonthOf(period: string): number {
  const [y, m] = period.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

// ---------- 계약별 임대료·관리비·부가세 ----------

export interface ContractChargeInput {
  pyeong_billed: number
  rent_unit_price: number
  mgmt_fee: number
}

export interface ProrateOption {
  usedDays: number
  daysInMonth: number
}

export interface ContractCharge {
  rent: number
  mgmt: number
  gross: number // 부가세포함액 = rent + mgmt
  supply: number // 공급가액 = ROUND(gross / 1.1)
  vat: number // 부가세 = gross - supply  (supply+vat=gross 항상 성립)
}

// 임대료 = 부과평형 × 평당단가, 관리비 = 정액.
// 공급가액 = ROUND(gross/1.1), 부가세 = gross - supply → 1원 오차 없이 supply+vat=gross.
export function calcContractCharge(c: ContractChargeInput, opt?: ProrateOption): ContractCharge {
  let rent = c.pyeong_billed * c.rent_unit_price
  let mgmt = c.mgmt_fee
  let gross = rent + mgmt
  if (opt) {
    gross = prorate(gross, opt.usedDays, opt.daysInMonth)
    rent = prorate(rent, opt.usedDays, opt.daysInMonth)
    mgmt = gross - rent // rent+mgmt=gross 불변식 유지
  }
  const supply = Math.round(gross / 1.1)
  const vat = gross - supply
  return { rent, mgmt, gross, supply, vat }
}

// ---------- 면적별(사무실) 전기료: 10평당 청구단가 기준 ----------

/** area 방식 계약 1건의 전기료 = (10평당 청구단가 × 부과평형) / 10 */
export function calcAreaElec(per10Billed: number, pyeongBilled: number): number {
  return Math.round((per10Billed * pyeongBilled) / 10)
}

// ---------- 공장동 검침 전기료 (계량기 4개) ----------

export interface FactoryReadings {
  MAIN: number // 공장동 전체(주계량기) 누적 지침
  F101: number
  F103: number
  HVAC: number // 냉난방기(F101·F103 공용)
}

export interface FactoryElecResult {
  F101: number
  F102: number
  F103: number
  totalA: number // 공장동 부담 합 = F101 + F102 + F103
  usages: FactoryReadings // 사용량(당월-전월)
  deduction: number // F102 계산용 차감액
}

// ⚠ 차감액: 실제 엑셀 수식 그대로 — 단가 × (F101 사용량 + 냉난방기 "전체" 사용량).
//   F103 자체 사용량은 차감에 포함되지 않는다(엑셀 원본 로직).
//   계량기 계통(주계량기가 무엇을 포함하는지) 확인 후 수정 가능한 지점이라 함수로 분리.
export function factoryF102Deduction(unitPrice: number, f101Usage: number, hvacUsage: number): number {
  return unitPrice * (f101Usage + hvacUsage)
}

// 냉난방기 사용량 ÷2 를 F101·F103에 절반씩 가산. 각 청구액은 천원 미만 절사.
export function calcFactoryElec(
  readings: FactoryReadings,
  prev: FactoryReadings,
  unitPrice: number,
): FactoryElecResult {
  const usages: FactoryReadings = {
    MAIN: readings.MAIN - prev.MAIN,
    F101: readings.F101 - prev.F101,
    F103: readings.F103 - prev.F103,
    HVAC: readings.HVAC - prev.HVAC,
  }
  const hvacHalf = usages.HVAC / 2
  const F101 = roundDown1000(unitPrice * (usages.F101 + hvacHalf))
  const F103 = roundDown1000(unitPrice * (usages.F103 + hvacHalf))
  const deduction = factoryF102Deduction(unitPrice, usages.F101, usages.HVAC)
  const F102 = roundDown1000(unitPrice * usages.MAIN - deduction)
  return { F101, F102, F103, totalA: F101 + F102 + F103, usages, deduction }
}

// ---------- 전기료 3단 배분 (월 1회 파라미터) ----------

export interface ElecPeriodParams {
  elec_total: number // 한전 총 전기료
  area_ratio: number // 면적별 배분율 (엑셀 기존 0.70)
  per10_billed?: number // 관리자 확정 10평당 청구단가 (미지정 시 제안값 사용)
}

export interface ElecAllocation {
  areaShare: number // 면적별 기업부담 = (elec_total - A) × ratio
  per10Calc: number // 10평당 실계산 단가
  per10Suggested: number // 10원 단위 반올림 제안
  per10Billed: number // 실제 적용 단가
  officeB: number // 사무실 기업부담 = per10Billed × (부과평형합/10)
  centerC: number // 센터부담 = elec_total - A - B
  checkOk: boolean // 검산: A + B + C = elec_total
}

export function calcElecAllocation(
  params: ElecPeriodParams,
  pyeongSumArea: number, // area 방식 active 계약들의 부과평형 합
  factoryA: number, // 공장동 부담 합
): ElecAllocation {
  const areaShare = (params.elec_total - factoryA) * params.area_ratio
  const per10Calc = pyeongSumArea > 0 ? areaShare / (pyeongSumArea / 10) : 0
  const per10Suggested = roundTo10(per10Calc)
  const per10Billed = params.per10_billed ?? per10Suggested
  const officeB = Math.round(per10Billed * (pyeongSumArea / 10))
  const centerC = params.elec_total - factoryA - officeB
  return {
    areaShare,
    per10Calc,
    per10Suggested,
    per10Billed,
    officeB,
    centerC,
    checkOk: factoryA + officeB + centerC === params.elec_total,
  }
}
