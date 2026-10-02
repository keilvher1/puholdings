// 화면 표시 전용 형식 함수(관리자·포털·확인창·토스트 공용). 저장 형식(NUMERIC(12,0)·CHAR(7)·DATE)은 그대로 두고
// "보이는 글자"만 만든다. 순수 함수이고 서버·클라이언트 어디서든 import할 수 있다.
// 날짜 계산은 모두 한국 시간(KST) 기준이다. 서버가 UTC로 돌아도(TZ=UTC) 같은 글자가 나온다.
//
// 사용 예:
//   import { won, billMonth, due, todayKST } from "@/lib/format"
//   won(1234000)                       // "1,234,000원"
//   billMonth("2026-09")               // "2026년 9월분"
//   usageToBill("2026-09")             // "9월 사용분 → 10월 청구"
//   due("2026-10-10", "2026-10-01")    // "10월 10일(토)까지 · 9일 남음"
//   dateTime(row.created_at)           // "10월 1일 오후 2:20"
//
// 주의: lib/billing.ts·lib/expenses.ts의 formatWon은 PDF·메일·기존 테스트가 쓰므로 그대로 둔다.
//       새로 쓰거나 고치는 화면 코드는 이 파일만 쓴다.

import { todayKST } from "./programs"

// 기준일은 호실 보드와 같은 함수 하나만 쓴다(새로 만들지 않고 다시 내보낸다).
export { todayKST }

export type NumberLike = number | string | null | undefined
export type DateLike = string | Date | null | undefined

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const YM = /^(\d{4})-(0[1-9]|1[0-2])$/

// ── 내부 도우미 ───────────────────────────────────────────────────────────────

/** 숫자로 바꿀 수 없으면 null("", null, undefined, "abc", NaN). NUMERIC 문자열("8.40")도 받는다. */
export function toNumber(v: NumberLike): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const s = v.trim().replace(/,/g, "")
  if (s === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function group(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/** 천 단위 쉼표. 소수는 maxFraction 자리까지 반올림하고, 뒤쪽 0은 minFraction 자리까지 지운다. */
function formatNumber(n: number, minFraction: number, maxFraction: number): string {
  let fixed = Math.abs(n).toFixed(maxFraction)
  if (maxFraction > minFraction && fixed.includes(".")) {
    const [ip, fp0] = fixed.split(".")
    let fp = fp0
    while (fp.length > minFraction && fp.endsWith("0")) fp = fp.slice(0, -1)
    fixed = fp.length > 0 ? `${ip}.${fp}` : ip
  }
  const [intPart, fracPart] = fixed.split(".")
  const body = group(intPart) + (fracPart !== undefined ? `.${fracPart}` : "")
  return n < 0 && Number(fixed) !== 0 ? `-${body}` : body
}

/** "YYYY-MM-DD" 그대로 쓰거나, 타임스탬프(Date·ISO 문자열)를 KST 날짜로 바꾼다. 실패하면 null. */
export function toKstDate(d: DateLike): string | null {
  if (d === null || d === undefined || d === "") return null
  if (typeof d === "string") {
    const s = d.trim()
    if (DATE_ONLY.test(s)) return s
    const t = Date.parse(s)
    if (Number.isNaN(t)) return null
    return new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10)
  }
  const t = d.getTime()
  if (Number.isNaN(t)) return null
  return new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10)
}

function parts(ymd: string): { y: number; m: number; d: number; wd: string } {
  const [y, m, d] = ymd.split("-").map(Number)
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return { y, m, d, wd }
}

function dayNumber(ymd: string): number {
  const { y, m, d } = parts(ymd)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

function toTimestamp(ts: DateLike): number | null {
  if (ts === null || ts === undefined || ts === "") return null
  if (ts instanceof Date) return Number.isNaN(ts.getTime()) ? null : ts.getTime()
  const s = ts.trim()
  // 날짜만 있으면 KST 자정으로 본다
  const t = DATE_ONLY.test(s) ? Date.parse(`${s}T00:00:00+09:00`) : Date.parse(s)
  return Number.isNaN(t) ? null : t
}

// ── 금액·숫자 ─────────────────────────────────────────────────────────────────

/** 1234000 → "1,234,000원", null → "-". 문장·카드·확인창용. */
export function won(n: NumberLike): string {
  const v = toNumber(n)
  return v === null ? "-" : `${formatNumber(Math.round(v), 0, 0)}원`
}

/** 1234000 → "1,234,000"(단위 없음, 표의 금액 열 — 머리글에 "(원)"). null → "-". */
export function wonNum(n: NumberLike): string {
  const v = toNumber(n)
  return v === null ? "-" : formatNumber(Math.round(v), 0, 0)
}

/**
 * 검침·면적 같은 일반 숫자. digits를 주면 정확히 그 자리수(63048.3, 1 → "63,048.3"),
 * 안 주면 소수 둘째 자리까지 쓰고 뒤쪽 0은 지운다(235820.0 → "235,820", "8.40" → "8.4"). null → "-".
 */
export function num(n: NumberLike, digits?: number): string {
  const v = toNumber(n)
  if (v === null) return "-"
  if (digits !== undefined) return formatNumber(v, digits, digits)
  return formatNumber(v, 0, 2)
}

// ── 날짜 ─────────────────────────────────────────────────────────────────────

/** "2026-10-25" → "2026. 10. 25.(일)". 타임스탬프는 KST 날짜로 바꿔 쓴다. null → "-". */
export function date(d: DateLike): string {
  const ymd = toKstDate(d)
  if (!ymd) return "-"
  const { y, m, d: day, wd } = parts(ymd)
  return `${y}. ${m}. ${day}.(${wd})`
}

/** "2026-10-25" → "10월 25일(일)"(올해면), 다른 해면 date()와 같다. null → "-". */
export function dateShort(d: DateLike, today: string = todayKST()): string {
  const ymd = toKstDate(d)
  if (!ymd) return "-"
  const { y, m, d: day, wd } = parts(ymd)
  if (String(y) !== today.slice(0, 4)) return date(ymd)
  return `${m}월 ${day}일(${wd})`
}

/** 남은(+)·지난(−) 일수. d가 오늘이면 0. 날짜가 아니면 null. */
export function daysFrom(d: DateLike, today: string = todayKST()): number | null {
  const ymd = toKstDate(d)
  if (!ymd || !DATE_ONLY.test(today)) return null
  return dayNumber(ymd) - dayNumber(today)
}

/**
 * 납부 기한·마감 표시.
 *   미래 → "10월 10일(토)까지 · 9일 남음", 오늘 → "오늘까지", 지남 → "9월 10일(목) · 21일 지남", null → "납부 기한 없음"
 */
export function due(d: DateLike, today: string = todayKST()): string {
  const ymd = toKstDate(d)
  if (!ymd) return "납부 기한 없음"
  const diff = daysFrom(ymd, today)!
  if (diff === 0) return "오늘까지"
  const label = dateShort(ymd, today)
  return diff > 0 ? `${label}까지 · ${diff}일 남음` : `${label} · ${-diff}일 지남`
}

/** 발행일(타임스탬프) → "발행 후 52일". 같은 날이면 "발행 후 0일". null → "-". */
export function sinceIssued(issuedAt: DateLike, today: string = todayKST()): string {
  const diff = daysFrom(issuedAt, today)
  return diff === null ? "-" : `발행 후 ${Math.max(0, -diff)}일`
}

/** 타임스탬프 → "10월 1일 오후 2:20"(KST, 초 없음). 올해가 아니면 앞에 "2025년 ". null → "-". */
export function dateTime(ts: DateLike, today: string = todayKST()): string {
  const t = toTimestamp(ts)
  if (t === null) return "-"
  const k = new Date(t + KST_OFFSET_MS)
  const y = k.getUTCFullYear()
  const m = k.getUTCMonth() + 1
  const d = k.getUTCDate()
  const h = k.getUTCHours()
  const min = String(k.getUTCMinutes()).padStart(2, "0")
  const ampm = h < 12 ? "오전" : "오후"
  const h12 = h % 12 === 0 ? 12 : h % 12
  const yearPart = String(y) === today.slice(0, 4) ? "" : `${y}년 `
  return `${yearPart}${m}월 ${d}일 ${ampm} ${h12}:${min}`
}

/**
 * 상대 시각: 1분 안 "방금 전", 1시간 안 "n분 전", 하루 안 "n시간 전", 30일 안 "n일 전", 그 뒤로는 date().
 * 전체 일시는 부르는 쪽이 title(툴팁)에 dateTime(ts)로 넣는다. now는 테스트용(ms).
 */
export function relative(ts: DateLike, now: number = Date.now()): string {
  const t = toTimestamp(ts)
  if (t === null) return "-"
  const diffMs = Math.max(0, now - t)
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return "방금 전"
  if (min < 60) return `${min}분 전`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = dayNumber(new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10)) - dayNumber(new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10))
  if (days <= 30) return `${Math.max(1, days)}일 전`
  return date(new Date(t))
}

// ── 월 ───────────────────────────────────────────────────────────────────────

export function isYm(ym: unknown): ym is string {
  return typeof ym === "string" && YM.test(ym)
}

/** "2026-10" + n개월. addMonths("2026-12", 1) = "2027-01". */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`
}

/** "2026-10" → "2026년 10월". 형식이 아니면 원문, null → "-". */
export function month(ym: string | null | undefined): string {
  if (!ym) return "-"
  if (!isYm(ym)) return ym
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`
}

/** 청구월 "2026-09" → "2026년 9월분"(청구서 이름, 늘 연도 포함). */
export function billMonth(ym: string | null | undefined): string {
  if (!ym) return "-"
  if (!isYm(ym)) return ym
  return `${month(ym)}분`
}

/** 청구월 짧은 이름: 올해면 "9월분", 다른 해면 "2026년 9월분"(용어 사전 "10월분 청구서"). */
export function billMonthShort(ym: string | null | undefined, today: string = todayKST()): string {
  if (!ym) return "-"
  if (!isYm(ym)) return ym
  return ym.slice(0, 4) === today.slice(0, 4) ? `${Number(ym.slice(5, 7))}월분` : billMonth(ym)
}

/** 전기 사용월 → "9월 사용분 → 10월 청구"("2026-12" → "12월 사용분 → 1월 청구"). */
export function usageToBill(usageYm: string | null | undefined): string {
  if (!usageYm || !isYm(usageYm)) return usageYm ?? "-"
  const next = addMonths(usageYm, 1)
  return `${Number(usageYm.slice(5, 7))}월 사용분 → ${Number(next.slice(5, 7))}월 청구`
}

/** 오늘(KST)이 속한 달 "YYYY-MM". */
export function thisMonthKST(today: string = todayKST()): string {
  return today.slice(0, 7)
}
