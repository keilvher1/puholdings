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
