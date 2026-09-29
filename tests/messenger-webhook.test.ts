import { beforeEach, describe, expect, it, vi } from "vitest"

// 웹훅 토큰·요청 제한·본문 검사(lib/messenger-extras.ts) + 수신 라우트의 DB 이전 단계.
// DB까지 가는 흐름(실제 메시지 생성)은 tests/messenger-api.test.ts에서 로컬 Postgres로 본다.

let dbCalls = 0
let knownToken = "" // 이 토큰으로 조회하면 웹훅 행을 돌려준다(그 뒤 쿼리는 빈 결과)
vi.mock("@/lib/db", () => ({
  getDb: () => {
    return (strings: TemplateStringsArray, ..._args: unknown[]) => {
      dbCalls++
      if (knownToken && strings.join("?").includes("FROM messenger_webhooks w")) {
        return Promise.resolve([{ id: 1, room_id: 1, name: "배포 알림", token: knownToken, is_archived: false }])
      }
      return Promise.resolve([])
    }
  },
}))

import {
  WEBHOOK_FAIL_LIMIT,
  WEBHOOK_LOOKUP_PREFIX,
  WEBHOOK_RATE_LIMIT,
  WEBHOOK_TOKEN_RE,
  generateWebhookToken,
  parseWebhookPayload,
  resetWebhookRateLimits,
  takeWebhookRate,
  webhookRateBucketCount,
  webhookTokensEqual,
  webhookUrl,
} from "@/lib/messenger-extras"
import { MAX_MESSAGE_LENGTH } from "@/lib/messenger-types"
import { POST as HOOK } from "@/app/api/messenger/hooks/[token]/route"

beforeEach(() => {
  resetWebhookRateLimits()
  dbCalls = 0
  knownToken = ""
})

describe("토큰", () => {
  it("32바이트 랜덤 = 16진수 64자, 매번 다르다", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateWebhookToken()))
    expect(tokens.size).toBe(200)
    for (const t of tokens) expect(t).toMatch(WEBHOOK_TOKEN_RE)
    expect(WEBHOOK_TOKEN_RE.test("A".repeat(64))).toBe(false) // 대문자·다른 문자 거부
    expect(WEBHOOK_TOKEN_RE.test("a".repeat(63))).toBe(false)
  })

  it("비교는 길이·내용이 모두 같아야 참(길이가 달라도 throw하지 않는다)", () => {
    const t = generateWebhookToken()
    expect(webhookTokensEqual(t, t)).toBe(true)
    expect(webhookTokensEqual(t, t.slice(0, -1) + (t.endsWith("0") ? "1" : "0"))).toBe(false)
    expect(webhookTokensEqual(t, t.slice(0, 10))).toBe(false)
    expect(webhookTokensEqual(t, "")).toBe(false)
  })

  it("DB 조회용 앞부분은 전체보다 짧다(나머지는 상수 시간 비교)", () => {
    expect(WEBHOOK_LOOKUP_PREFIX).toBeGreaterThan(0)
    expect(WEBHOOK_LOOKUP_PREFIX).toBeLessThan(64)
  })

  it("주소 형식", () => {
    expect(webhookUrl("https://pu.example/", "ab")).toBe("https://pu.example/api/messenger/hooks/ab")
  })
})

describe("분당 제한", () => {
  it("토큰별 60건, 1분이 지나면 다시 허용", () => {
    const now = 1_000_000
    for (let i = 0; i < WEBHOOK_RATE_LIMIT; i++) expect(takeWebhookRate("t1", now + i)).toBe(true)
    expect(takeWebhookRate("t1", now + 100)).toBe(false)
    expect(takeWebhookRate("t2", now + 100)).toBe(true) // 다른 토큰은 별개
    expect(takeWebhookRate("t1", now + 60_001 + WEBHOOK_RATE_LIMIT)).toBe(true)
  })
})

describe("본문(잔디 Incoming Webhook 형식)", () => {
  it("body·connectColor·connectInfo", () => {
    const r = parseWebhookPayload({
      body: "[배포] 완료",
      connectColor: "#fac11b",
      connectInfo: [{ title: "버전", description: "1.2.0" }, { title: "", description: "" }, { title: "담당", description: "운영팀", imageUrl: "x" }],
    })
    expect(r).toEqual({
      ok: true,
      payload: {
        body: "[배포] 완료",
        connect_color: "#FAC11B",
        connect_info: [
          { title: "버전", description: "1.2.0" },
          { title: "담당", description: "운영팀" },
        ],
      },
    })
  })

  it("슬랙식 { text }도 받는다", () => {
    expect(parseWebhookPayload({ text: "hi" })).toMatchObject({ ok: true, payload: { body: "hi" } })
  })

  it("본문 5000자 초과·빈 본문·잘못된 색·배열 아님은 거부", () => {
    expect(parseWebhookPayload({ body: "a".repeat(MAX_MESSAGE_LENGTH) }).ok).toBe(true)
    expect(parseWebhookPayload({ body: "a".repeat(MAX_MESSAGE_LENGTH + 1) }).ok).toBe(false)
    expect(parseWebhookPayload({ body: "   " }).ok).toBe(false)
    expect(parseWebhookPayload({ body: "x", connectColor: "red" }).ok).toBe(false)
    expect(parseWebhookPayload({ body: "x", connectInfo: { title: "a" } }).ok).toBe(false)
    expect(parseWebhookPayload(["x"]).ok).toBe(false)
    expect(parseWebhookPayload(null).ok).toBe(false)
  })
})

describe("POST /api/messenger/hooks/[token] — DB 이전 단계", () => {
  const post = (token: string, body: string) =>
    HOOK(new Request(`http://localhost/api/messenger/hooks/${token}`, { method: "POST", body, headers: { "Content-Type": "application/json" } }), {
      params: Promise.resolve({ token }),
    })

  it("형식이 틀린 토큰은 DB를 보지 않고 404", async () => {
    for (const bad of ["abc", "A".repeat(64), "../" + "a".repeat(61), "a".repeat(65)]) {
      const res = await post(bad, JSON.stringify({ body: "x" }))
      expect(res.status).toBe(404)
    }
    expect(dbCalls).toBe(0)
  })

  it("JSON이 아니거나 본문이 비면 400", async () => {
    const t = generateWebhookToken()
    expect((await post(t, "not json")).status).toBe(400)
    expect((await post(t, JSON.stringify({ body: "" }))).status).toBe(400)
    expect(dbCalls).toBe(0)
  })

  it("없는 토큰은 404(존재 여부를 흘리지 않음)", async () => {
    const res = await post(generateWebhookToken(), JSON.stringify({ body: "x" }))
    expect(res.status).toBe(404)
  })

  it("같은 토큰으로 1분에 60건을 넘으면 429(맞는 토큰만 셈)", async () => {
    const t = generateWebhookToken()
    knownToken = t
    for (let i = 0; i < WEBHOOK_RATE_LIMIT; i++) expect((await post(t, JSON.stringify({ body: "x" }))).status).not.toBe(429)
    const res = await post(t, JSON.stringify({ body: "x" }))
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("60")
  })

  it("모르는 토큰을 계속 보내면 보낸 곳(IP)별로 막고, 막힌 뒤에는 DB를 보지 않는다", async () => {
    const postFrom = (ip: string) =>
      HOOK(
        new Request(`http://localhost/api/messenger/hooks/x`, {
          method: "POST",
          body: JSON.stringify({ body: "x" }),
          headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
        }),
        { params: Promise.resolve({ token: generateWebhookToken() }) }
      )
    for (let i = 0; i < WEBHOOK_FAIL_LIMIT; i++) expect((await postFrom("198.51.100.7")).status).toBe(404)
    const calls = dbCalls
    const blocked = await postFrom("198.51.100.7")
    expect(blocked.status).toBe(429)
    expect(dbCalls).toBe(calls)
    // 다른 곳에서 오는 요청은 따로 센다
    expect((await postFrom("203.0.113.9")).status).toBe(404)
  })

  it("요청 제한 버킷은 무한히 늘지 않는다(모르는 토큰은 토큰별 버킷을 만들지 않음)", () => {
    const now = Date.now()
    for (let i = 0; i < 6000; i++) takeWebhookRate(`k${i}`, now)
    expect(webhookRateBucketCount()).toBeLessThanOrEqual(5000)
    for (let i = 0; i < WEBHOOK_RATE_LIMIT; i++) takeWebhookRate("k6000", now)
    expect(takeWebhookRate("k6000", now)).toBe(false)
  })
})
