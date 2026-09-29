import { beforeEach, describe, expect, it, vi } from "vitest"

// lib/fx.ts — 결제일 기준 환율 조회(네트워크는 가짜 fetch, 캐시는 가짜 sql)
vi.mock("@/lib/db", () => ({ getDb: () => null }))

import { fxConversionLine, getExchangeRate, parseKoreaEximRate } from "@/lib/fx"

type Handler = (url: string) => unknown | Promise<unknown>
let calls: string[] = []

function fakeFetch(handler: Handler): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    const body = await handler(url)
    if (body instanceof Response) return body
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
  }) as typeof fetch
}

// 가짜 캐시: 쿼리 글자로 SELECT/INSERT를 구분해 메모리에 둔다.
function fakeCache() {
  const store = new Map<string, { rate: string; rate_date: string }>()
  const writes: unknown[][] = []
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?")
    if (text.includes("SELECT rate")) {
      const hit = store.get(values.join("|"))
      return hit ? [hit] : []
    }
    if (text.includes("INSERT INTO expense_fx_rates")) {
      writes.push(values)
      const [currency, date, source, rate, rateDate] = values as [string, string, string, number, string]
      store.set(`${currency}|${date}|${source}`, { rate: String(rate), rate_date: rateDate })
      return []
    }
    throw new Error(`예상하지 못한 쿼리: ${text}`)
  }
  return { sql, store, writes }
}

const TODAY = "2026-09-29"

beforeEach(() => {
  calls = []
})

describe("getExchangeRate — 유럽중앙은행(Frankfurter)", () => {
  it("주말 결제일은 직전 영업일 고시를 쓰고 실제 고시일을 돌려준다", async () => {
    const fetch = fakeFetch((url) => {
      expect(url).toBe("https://api.frankfurter.dev/v1/2026-09-19?base=USD&symbols=KRW")
      return { amount: 1, base: "USD", date: "2026-09-18", rates: { KRW: 1388.1 } }
    })
    const r = await getExchangeRate("USD", "2026-09-19", { fetch, today: TODAY, sql: null, koreaeximKey: "" })
    expect(r).toEqual({ rate: 1388.1, rate_date: "2026-09-18", source: "ecb" })
  })

  it("원화·지원하지 않는 통화·잘못된 날짜는 조회하지 않고 null", async () => {
    const fetch = fakeFetch(() => {
      throw new Error("호출되면 안 됨")
    })
    expect(await getExchangeRate("KRW", "2026-09-18", { fetch, today: TODAY, sql: null })).toBeNull()
    expect(await getExchangeRate("AUD", "2026-09-18", { fetch, today: TODAY, sql: null })).toBeNull()
    expect(await getExchangeRate("USD", "2026-02-30", { fetch, today: TODAY, sql: null })).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it("응답이 이상하면(요청일보다 뒤 날짜, KRW 없음) null", async () => {
    const fetch = fakeFetch(() => ({ date: "2026-09-20", rates: { KRW: 1388 } }))
    expect(await getExchangeRate("USD", "2026-09-18", { fetch, today: TODAY, sql: null, koreaeximKey: "" })).toBeNull()
    const fetch2 = fakeFetch(() => ({ date: "2026-09-18", rates: {} }))
    expect(await getExchangeRate("USD", "2026-09-18", { fetch: fetch2, today: TODAY, sql: null, koreaeximKey: "" })).toBeNull()
  })

  it("HTTP 오류·네트워크 오류면 null(예외를 던지지 않는다)", async () => {
    const fetch = fakeFetch(() => new Response("bad", { status: 500 }))
    expect(await getExchangeRate("EUR", "2026-09-18", { fetch, today: TODAY, sql: null, koreaeximKey: "" })).toBeNull()
    const fetch2 = fakeFetch(() => Promise.reject(new TypeError("fetch failed")))
    expect(await getExchangeRate("EUR", "2026-09-18", { fetch: fetch2, today: TODAY, sql: null, koreaeximKey: "" })).toBeNull()
  })
})

describe("getExchangeRate — 한국수출입은행 매매기준율", () => {
  it("JPY(100) 고시는 100으로 나누고 쉼표를 뺀다", async () => {
    const fetch = fakeFetch((url) => {
      expect(url).toContain("oapi.koreaexim.go.kr")
      expect(url).toContain("searchdate=20260918")
      expect(url).toContain("data=AP01")
      return [
        { result: 1, cur_unit: "USD", deal_bas_r: "1,388.1" },
        { result: 1, cur_unit: "JPY(100)", deal_bas_r: "941.23" },
      ]
    })
    const r = await getExchangeRate("JPY", "2026-09-18", { fetch, today: TODAY, sql: null, koreaeximKey: "KEY" })
    expect(r).toEqual({ rate: 9.4123, rate_date: "2026-09-18", source: "koreaexim" })
  })

  it("영업일이 아니면(빈 배열) 하루씩 거슬러 올라간다", async () => {
    const fetch = fakeFetch((url) => {
      if (url.includes("searchdate=20260920") || url.includes("searchdate=20260919")) return []
      return [{ result: 1, cur_unit: "USD", deal_bas_r: "1,390.5" }]
    })
    const r = await getExchangeRate("USD", "2026-09-20", { fetch, today: TODAY, sql: null, koreaeximKey: "KEY" })
    expect(r).toEqual({ rate: 1390.5, rate_date: "2026-09-18", source: "koreaexim" })
    expect(calls).toHaveLength(3)
  })

  it("CNY는 CNH 고시를 쓴다", async () => {
    const fetch = fakeFetch(() => [{ result: 1, cur_unit: "CNH", deal_bas_r: "194.87" }])
    const r = await getExchangeRate("CNY", "2026-09-18", { fetch, today: TODAY, sql: null, koreaeximKey: "KEY" })
    expect(r?.rate).toBe(194.87)
  })

  it("수출입은행이 실패(인증키 오류·HTML 응답)하면 유럽중앙은행으로 넘어간다", async () => {
    const fetch = fakeFetch((url) => {
      if (url.includes("koreaexim")) return [{ result: 3, cur_unit: "", deal_bas_r: "" }]
      return { date: "2026-09-18", rates: { KRW: 1387.25 } }
    })
    const r = await getExchangeRate("USD", "2026-09-18", { fetch, today: TODAY, sql: null, koreaeximKey: "BAD" })
    expect(r).toEqual({ rate: 1387.25, rate_date: "2026-09-18", source: "ecb" })

    const fetch2 = fakeFetch((url) => {
      if (url.includes("koreaexim")) return new Response("<html>점검 중</html>", { status: 200 })
      return { date: "2026-09-18", rates: { KRW: 1387.25 } }
    })
    const r2 = await getExchangeRate("USD", "2026-09-18", { fetch: fetch2, today: TODAY, sql: null, koreaeximKey: "KEY" })
    expect(r2?.source).toBe("ecb")
  })

  it("parseKoreaEximRate: 빈 배열은 'empty', 통화 없음·형식 오류는 null", () => {
    expect(parseKoreaEximRate([], "USD")).toBe("empty")
    expect(parseKoreaEximRate([{ result: 1, cur_unit: "EUR", deal_bas_r: "1,600" }], "USD")).toBeNull()
    expect(parseKoreaEximRate({ error: true }, "USD")).toBeNull()
    expect(parseKoreaEximRate([{ result: 1, cur_unit: "GBP", deal_bas_r: "1,850.40" }], "GBP")).toBe(1850.4)
  })
})

describe("getExchangeRate — 캐시·오늘 날짜", () => {
  it("지난 날짜는 캐시에 저장하고, 다시 부르면 네트워크 없이 캐시로 답한다", async () => {
    const cache = fakeCache()
    const fetch = fakeFetch(() => ({ date: "2026-09-18", rates: { KRW: 1388.1 } }))
    const a = await getExchangeRate("USD", "2026-09-19", { fetch, today: TODAY, sql: cache.sql, koreaeximKey: "" })
    const b = await getExchangeRate("USD", "2026-09-19", { fetch, today: TODAY, sql: cache.sql, koreaeximKey: "" })
    expect(a).toEqual(b)
    expect(calls).toHaveLength(1)
    expect(cache.writes).toHaveLength(1)
    expect(cache.writes[0].slice(0, 3)).toEqual(["USD", "2026-09-19", "ecb"])
  })

  it("오늘·미래 날짜는 오늘의 최신 고시로 처리하고 캐시에 저장하지 않는다", async () => {
    const cache = fakeCache()
    const fetch = fakeFetch((url) => {
      expect(url).toContain(`/v1/${TODAY}?`)
      return { date: "2026-09-26", rates: { KRW: 1391 } }
    })
    const r = await getExchangeRate("USD", "2026-10-15", { fetch, today: TODAY, sql: cache.sql, koreaeximKey: "" })
    expect(r).toEqual({ rate: 1391, rate_date: "2026-09-26", source: "ecb" })
    await getExchangeRate("USD", TODAY, { fetch, today: TODAY, sql: cache.sql, koreaeximKey: "" })
    expect(cache.writes).toHaveLength(0)
    expect(calls).toHaveLength(2)
  })

  it("캐시 테이블이 없어도(조회·저장 실패) 환율은 돌려준다", async () => {
    const broken = async () => {
      throw Object.assign(new Error("relation does not exist"), { code: "42P01" })
    }
    const fetch = fakeFetch(() => ({ date: "2026-09-18", rates: { KRW: 1388.1 } }))
    const r = await getExchangeRate("USD", "2026-09-18", { fetch, today: TODAY, sql: broken, koreaeximKey: "" })
    expect(r?.rate).toBe(1388.1)
  })
})

describe("fxConversionLine", () => {
  it("'USD 20.00 × 1,388.10원(2026-09-18 기준, 유럽중앙은행) = 27,762원'", () => {
    expect(fxConversionLine("USD", 20, { rate: 1388.1, rate_date: "2026-09-18", source: "ecb" }, 27762)).toBe(
      "USD 20.00 × 1,388.10원(2026-09-18 기준, 유럽중앙은행) = 27,762원",
    )
  })
})
