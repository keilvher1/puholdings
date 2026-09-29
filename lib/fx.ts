// 외화 증빙 환율 조회(서버 전용). 결제일(issue_date) 기준 환율로 원화 금액을 계산하기 위해 쓴다.
//
// 규칙
// - 기준: 결제일의 환율. 그날 고시가 없으면(주말·휴일) 직전 영업일 환율을 쓰고, 실제 고시일을 rate_date로 돌려준다.
// - 출처: env KOREAEXIM_API_KEY가 있으면 한국수출입은행 매매기준율을 먼저 보고, 실패하거나 키가 없으면
//         Frankfurter(유럽중앙은행 기준, 키 불필요)를 쓴다.
// - 오늘·미래 날짜: 오늘(한국 시간)의 최신 고시로 처리하고 캐시에 저장하지 않는다(당일 고시가 나중에 바뀔 수 있다).
// - 캐시: expense_fx_rates (currency, requested_date, source). 캐시 조회·저장 실패(테이블 없음 등)는 무시한다.
// - 네트워크 요청마다 8초 타임아웃.
// 결과를 DB 증빙에 바로 저장하지 않는다. 화면·판독 초안에 채우는 제안값이다.

import { getDb } from "./db"
import { SUPPORTED_CURRENCIES, formatWon, isValidDate, type CurrencyCode, type ExchangeRateSource } from "./expenses"

export type FxSource = Exclude<ExchangeRateSource, "" | "manual">
export interface FxRate {
  rate: number // 1 외화 단위당 원
  rate_date: string // 실제 고시일 'YYYY-MM-DD'
  source: FxSource
}

export const FX_SOURCE_LABELS: Record<Exclude<ExchangeRateSource, "">, string> = {
  ecb: "유럽중앙은행",
  koreaexim: "한국수출입은행 매매기준율",
  manual: "직접 입력",
}

export const FX_TIMEOUT_MS = 8_000
// 수출입은행은 영업일이 아니면 빈 배열을 준다 — 하루씩 이만큼까지 거슬러 올라간다.
const KOREAEXIM_MAX_BACK_DAYS = 10

type CacheSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>

export interface FxOptions {
  sql?: CacheSql | null // 기본: getDb(). null이면 캐시를 쓰지 않는다.
  fetch?: typeof fetch // 기본: 전역 fetch(테스트에서 바꿔 끼운다)
  today?: string // 기본: 한국 시간 오늘
  koreaeximKey?: string // 기본: env KOREAEXIM_API_KEY
}

export function isForeignCurrency(v: unknown): v is Exclude<CurrencyCode, "KRW"> {
  return typeof v === "string" && v !== "KRW" && (SUPPORTED_CURRENCIES as readonly string[]).includes(v)
}

function kstToday(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date())
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function roundRate(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return typeof v === "string" ? v.slice(0, 10) : ""
}

async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const res = await fetchImpl(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FX_TIMEOUT_MS),
    headers: { Accept: "application/json" },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── 한국수출입은행 매매기준율 ────────────────────────────────────────────────────
// 응답: [{ result: 1, cur_unit: 'USD' | 'JPY(100)' | 'CNH' ..., deal_bas_r: '1,388.1' }, ...] · 영업일이 아니면 []
const KOREAEXIM_UNITS: Record<Exclude<CurrencyCode, "KRW">, { unit: string; per: number }> = {
  USD: { unit: "USD", per: 1 },
  EUR: { unit: "EUR", per: 1 },
  JPY: { unit: "JPY(100)", per: 100 },
  CNY: { unit: "CNH", per: 1 },
  GBP: { unit: "GBP", per: 1 },
}

export function parseKoreaEximRate(body: unknown, currency: Exclude<CurrencyCode, "KRW">): number | "empty" | null {
  if (!Array.isArray(body)) return null
  if (body.length === 0) return "empty"
  const { unit, per } = KOREAEXIM_UNITS[currency]
  const row = body.find((r) => r && typeof r === "object" && String((r as Record<string, unknown>).cur_unit).trim() === unit) as
    | Record<string, unknown>
    | undefined
  if (!row) {
    // result 2(코드 오류)·3(인증키 오류)·4(일일 한도 초과)는 모든 행에 같이 온다.
    return null
  }
  if (row.result !== undefined && Number(row.result) !== 1) return null
  const n = Number(String(row.deal_bas_r ?? "").replace(/,/g, "").trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return roundRate(n / per)
}

async function fromKoreaExim(
  fetchImpl: typeof fetch,
  key: string,
  currency: Exclude<CurrencyCode, "KRW">,
  date: string,
): Promise<FxRate | null> {
  for (let back = 0; back <= KOREAEXIM_MAX_BACK_DAYS; back++) {
    const day = addDays(date, -back)
    const url =
      "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON" +
      `?authkey=${encodeURIComponent(key)}&searchdate=${day.replace(/-/g, "")}&data=AP01`
    const parsed = parseKoreaEximRate(await fetchJson(fetchImpl, url), currency)
    if (parsed === null) return null
    if (parsed === "empty") continue
    return { rate: parsed, rate_date: day, source: "koreaexim" }
  }
  return null
}

// ── Frankfurter(유럽중앙은행 기준) ───────────────────────────────────────────────
// 응답: { amount: 1, base: 'USD', date: '2026-09-18', rates: { KRW: 1388.1 } } — 주말이면 직전 영업일 date로 돌려준다.
async function fromEcb(fetchImpl: typeof fetch, currency: Exclude<CurrencyCode, "KRW">, date: string): Promise<FxRate | null> {
  const body = (await fetchJson(fetchImpl, `https://api.frankfurter.dev/v1/${date}?base=${currency}&symbols=KRW`)) as {
    date?: unknown
    rates?: { KRW?: unknown }
  } | null
  const rate = Number(body?.rates?.KRW)
  const rateDate = typeof body?.date === "string" ? body.date : ""
  if (!Number.isFinite(rate) || rate <= 0 || !isValidDate(rateDate) || rateDate > date) return null
  return { rate: roundRate(rate), rate_date: rateDate, source: "ecb" }
}

// ── 캐시 ──────────────────────────────────────────────────────────────────────
async function readCache(sql: CacheSql, currency: string, date: string, source: FxSource): Promise<FxRate | null> {
  try {
    const rows = await sql`
      SELECT rate, to_char(rate_date, 'YYYY-MM-DD') AS rate_date
      FROM expense_fx_rates
      WHERE currency = ${currency} AND requested_date = ${date}::date AND source = ${source}
    `
    const r = rows[0]
    const rate = Number(r?.rate)
    const rateDate = toDateStr(r?.rate_date)
    if (!r || !Number.isFinite(rate) || rate <= 0 || !isValidDate(rateDate)) return null
    return { rate, rate_date: rateDate, source }
  } catch {
    return null
  }
}

async function writeCache(sql: CacheSql, currency: string, date: string, v: FxRate): Promise<void> {
  try {
    await sql`
      INSERT INTO expense_fx_rates (currency, requested_date, source, rate, rate_date)
      VALUES (${currency}, ${date}::date, ${v.source}, ${v.rate}::numeric, ${v.rate_date}::date)
      ON CONFLICT (currency, requested_date, source) DO NOTHING
    `
  } catch (error) {
    console.error("FX cache write failed:", error)
  }
}

// currency의 date(결제일) 기준 환율. 원화·지원하지 않는 통화·잘못된 날짜·모든 출처 실패면 null.
export async function getExchangeRate(currency: CurrencyCode | string, date: string, opts: FxOptions = {}): Promise<FxRate | null> {
  if (!isForeignCurrency(currency) || !isValidDate(date)) return null
  const today = opts.today ?? kstToday()
  const fetchImpl = opts.fetch ?? globalThis.fetch
  const key = opts.koreaeximKey ?? process.env.KOREAEXIM_API_KEY ?? ""
  // 오늘·미래: 오늘의 최신 고시로, 캐시하지 않는다(당일 고시는 바뀔 수 있다).
  const settled = date < today
  const target = settled ? date : today
  const sql: CacheSql | null = settled ? (opts.sql !== undefined ? opts.sql : (getDb() as unknown as CacheSql | null)) : null

  const sources: FxSource[] = key ? ["koreaexim", "ecb"] : ["ecb"]
  for (const source of sources) {
    if (sql) {
      const cached = await readCache(sql, currency, target, source)
      if (cached) return cached
    }
    let got: FxRate | null = null
    try {
      got = source === "koreaexim" ? await fromKoreaExim(fetchImpl, key, currency, target) : await fromEcb(fetchImpl, currency, target)
    } catch (error) {
      console.error(`FX fetch failed (${source} ${currency} ${target}):`, error instanceof Error ? error.message : error)
      got = null
    }
    if (got) {
      if (sql) await writeCache(sql, currency, target, got)
      return got
    }
  }
  return null
}

// ── 표시 ──────────────────────────────────────────────────────────────────────
// "USD 20.00" — 통화 코드를 붙인 표기(서버 경고 문구용). 화면의 숫자 표기는 upload-model의 formatForeign(n, currency).
export function formatForeignWithCode(currency: string, amount: number): string {
  const digits = currency === "JPY" ? 0 : 2
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`
}

export function formatRate(rate: number): string {
  return rate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

// "USD 20.00 × 1,388.10원(2026-09-18 기준, 유럽중앙은행) = 27,762원"
export function fxConversionLine(currency: string, foreign: number, fx: FxRate, krw: number): string {
  return `${formatForeignWithCode(currency, foreign)} × ${formatRate(fx.rate)}원(${fx.rate_date} 기준, ${FX_SOURCE_LABELS[fx.source]}) = ${formatWon(krw)}`
}
