// 청구서 라인 설명 — 포털 청구서 상세(WP8)·관리자 청구서 상세(WP7)가 같이 쓴다(계획서 2.2).
// 저장된 값(bill_lines의 quantity·unit_price·amount)으로만 설명을 만든다. 금액을 다시 계산하지 않는다.
// quantity·unit_price는 NUMERIC 문자열("8.40")로 오고 과거 이관 청구서는 NULL일 수 있다 — 숫자로 바꿀 수 없으면 라벨만 쓴다.
//
// 사용 예:
//   import { describeBillLine, appendBillMemo, usageMonthOf } from "@/lib/bill-display"
//   lines.map((l) => { const d = describeBillLine(l, lines); return <Row label={d.label} sub={d.description} more={d.formula} /> })
//   // 납부 메모·정정 사유는 상세 GET으로 읽은 기존 메모 뒤에 덧붙여 PUT한다(memo는 통째 교체이므로):
//   body: JSON.stringify({ id, memo: appendBillMemo(detail.memo, "10월 2일 입금 확인 · 입금자 솔바람") })

import { addMonths, num, toNumber, won } from "./format"

export interface BillLineInput {
  contract_id?: number | null
  room_code?: string | null
  line_type: string
  label?: string | null
  quantity?: string | number | null
  unit_price?: string | number | null
  amount: string | number
}

export interface BillLineDescription {
  /** 저장된 라벨(없으면 종류 이름) */
  label: string
  /** 한 줄 설명(예: "8.4평 × 평당 21,000원"). 만들 수 없으면 null */
  description: string | null
  /** 펼침 문장(면적 배분 전기료만, 예: "공용 전기료를 면적으로 나눴어요: 132,550원 × 8.4 ÷ 10 = 111,342원") */
  formula: string | null
  /** 날짜만큼(일할) 계산된 라인인가 */
  prorated: boolean
  /** 화면용 종류 이름 */
  kind: string
}

const KIND_LABEL: Record<string, string> = {
  rent: "임대료",
  mgmt: "관리비",
  elec_area: "전기료",
  elec_metered: "전기료",
  manual: "조정",
}

/** 임대료 라인이 일할인가: 금액 ≠ 수량 × 단가(반올림 1원 허용). 수량·단가를 모르면 false */
function isProratedRent(line: BillLineInput): boolean {
  const q = toNumber(line.quantity ?? null)
  const p = toNumber(line.unit_price ?? null)
  const a = toNumber(line.amount)
  if (q === null || p === null || a === null) return false
  return Math.abs(Math.round(q * p) - a) > 1
}

function sameContract(a: BillLineInput, b: BillLineInput): boolean {
  if (a.contract_id != null && b.contract_id != null) return a.contract_id === b.contract_id
  return !!a.room_code && a.room_code === b.room_code
}

export function describeBillLine(line: BillLineInput, sameBillLines: BillLineInput[] = []): BillLineDescription {
  const kind = KIND_LABEL[line.line_type] ?? "기타"
  const label = (line.label ?? "").trim() || kind
  const q = toNumber(line.quantity ?? null)
  const p = toNumber(line.unit_price ?? null)
  const amount = toNumber(line.amount)
  const base = { label, kind, formula: null as string | null, prorated: false }

  switch (line.line_type) {
    case "rent": {
      if (q === null || p === null) return { ...base, description: null }
      const prorated = isProratedRent(line)
      const description = `${num(q)}평 × 평당 ${won(p)}${prorated ? " · 사용한 날만큼 일할 계산" : ""}`
      return { ...base, description, prorated }
    }
    case "mgmt": {
      // 일할 달의 관리비는 gross − rent라 정액이 아니다(lib/billing.ts calcContractCharge). 같은 계약의 임대료 라인으로 판단한다.
      const rent = sameBillLines.find((l) => l !== line && l.line_type === "rent" && sameContract(l, line))
      const prorated = rent ? isProratedRent(rent) : false
      return { ...base, description: prorated ? "날짜만큼(일할)" : "월 정액", prorated }
    }
    case "elec_area": {
      if (q === null || p === null) return { ...base, description: "면적 배분" }
      return {
        ...base,
        description: `면적 배분 · 10평당 ${won(p)} 기준 ${num(q)}평`,
        formula: amount === null ? null : `공용 전기료를 면적으로 나눴어요: ${won(p)} × ${num(q)} ÷ 10 = ${won(amount)}`,
      }
    }
    case "elec_metered":
      return { ...base, description: "계량기 사용량 기준" }
    case "manual":
      return { ...base, description: "조정" }
    default:
      return { ...base, description: null }
  }
}

/** 청구월 → 전기 사용월(한 달 전). "2026-10" → "2026-09" */
export function usageMonthOf(period: string): string {
  return addMonths(period, -1)
}

/** 전기 사용월 → 청구월(한 달 뒤). "2026-09" → "2026-10" */
export function billMonthOf(usageMonth: string): string {
  return addMonths(usageMonth, 1)
}

/**
 * 기존 메모 뒤에 한 줄을 덧붙인 문자열. 청구서 PUT의 memo는 통째 교체이므로, 납부 메모·정정 사유는
 * 상세 GET으로 읽은 기존 메모 + 새 줄을 보낸다(입금자명·정정 사유가 사라지지 않게, 가드 #27).
 */
export function appendBillMemo(existing: string | null | undefined, line: string | null | undefined): string {
  const prev = (existing ?? "").replace(/\s+$/, "")
  const next = (line ?? "").trim()
  if (!next) return prev
  if (!prev) return next
  return `${prev}\n${next}`
}
