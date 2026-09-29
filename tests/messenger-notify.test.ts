import { describe, expect, it, vi } from "vitest"

// 업무 이벤트 → 메신저 "시스템 알림" 문구(lib/messenger-notify.ts).
// 실제 글쓰기(postSystemMessage)는 after() 안에서 돌기 때문에, 요청 범위 밖(이 테스트)에서는
// notify*()가 조용히 아무것도 하지 않아야 한다 — 기존 라우트 테스트가 깨지지 않는 근거.

const postSystemMessage = vi.fn(async (_input: { slug: string; text: string; info?: unknown }) => undefined)
vi.mock("@/lib/messenger", () => ({ postSystemMessage }))

// after(): 기본은 실제처럼 "요청 범위 밖" 오류, inRequest=true면 콜백을 모아 둔다.
let inRequest = false
const afterCallbacks: (() => Promise<void>)[] = []
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (cb: () => Promise<void>) => {
    if (!inRequest) throw new Error("`after` was called outside a request scope")
    afterCallbacks.push(cb)
  },
}))

import {
  billsIssuedAlert,
  inboxAlert,
  inquiryAlert,
  notifyBillsIssued,
  notifyInboxArrival,
  notifyInquiry,
} from "@/lib/messenger-notify"

describe("문의 알림", () => {
  it("이름·회사·문의 앞부분만 담고(연락처 제외) 문의 관리로 연결한다", () => {
    const a = inquiryAlert({ name: "홍길동", company: "포항테크", message: "입주 문의드립니다.\n\n면적은?" })
    expect(a.text).toContain("홍길동 (포항테크)")
    expect(a.text).toContain("(/admin/inquiries)")
    expect(a.info[0]).toEqual({ title: "문의 내용", description: "입주 문의드립니다. 면적은?" })
    expect(a.info).toHaveLength(1)
    expect(JSON.stringify(a)).not.toContain("연락처")
  })

  it("긴 문의는 200자로 자르고, 회사가 없으면 괄호를 붙이지 않는다", () => {
    const a = inquiryAlert({ name: "김", company: "", message: "가".repeat(500) })
    expect(a.text).toContain("**새 문의** · 김\n")
    expect(a.info[0].description).toHaveLength(201)
    expect(a.info[0].description.endsWith("…")).toBe(true)
  })

  it("이름에 마크다운 기호를 넣어도 링크·굵게 문법이 깨지지 않는다", () => {
    const a = inquiryAlert({ name: "**[가짜](http://x)**", company: "", message: "m" })
    expect(a.text).not.toContain("[가짜](http://x)")
    expect(a.text.match(/\*\*/g)).toHaveLength(2) // '**새 문의**'만
  })
})

describe("증빙 도착 알림", () => {
  const base = { id: 9, file_name: "영수증.pdf", scan_status: "ok" as const, first: { vendor_name: "포항문구", total_amount: 11000 }, pending: 3 }

  it("첫 도착은 파일명·거래처·금액·대기 건수를 자세히", () => {
    const a = inboxAlert(base, 0)
    expect(a.text).toContain("영수증.pdf")
    expect(a.text).toContain("확인 대기 **3건**")
    expect(a.info).toEqual([{ title: "거래처 · 금액", description: "포항문구 · 11,000원" }])
  })

  it("3분 안에 연달아 오면 합치지 않고 대기 건수 요약만 새로 보낸다", () => {
    const a = inboxAlert({ ...base, pending: 7 }, 2)
    expect(a.text).toBe("증빙 추가 도착 · 확인 대기 **7건**")
    expect(a.info).toEqual([])
  })

  it("인식 실패·미설정이면 그 사실을 알린다", () => {
    expect(inboxAlert({ ...base, first: null, scan_status: "not_configured" }, 0).info[0].description).toContain("미설정")
    expect(inboxAlert({ ...base, first: null, scan_status: "failed" }, 0).info[0].description).toContain("인식하지 못함")
    expect(inboxAlert({ ...base, first: { vendor_name: "", total_amount: null } }, 0).info[0].description).toBe("거래처 미인식 · 금액 미인식")
  })
})

describe("청구서 발행 알림", () => {
  it("N건 요약: 월·건수·합계·메일 결과", () => {
    const a = billsIssuedAlert({
      bills: [
        { period: "2026-09", total_amount: "1100000" },
        { period: "2026-09", total_amount: "550000" },
      ],
      corrected: 1,
      sent: 1,
      failed: 0,
      no_email: ["쇼피안"],
    })!
    expect(a.text).toContain("2026-09 2건")
    expect(a.info).toContainEqual({ title: "청구 합계", description: "1,650,000원" })
    expect(a.info).toContainEqual({ title: "메일", description: "발송 1건 · 메일 주소 없음 1곳(쇼피안)" })
    expect(a.info).toContainEqual({ title: "정정 발행", description: "1건" })
  })

  it("여러 달이면 월을 모두 적고, 메일 주소 없는 곳이 많으면 3곳까지만 이름을 적는다", () => {
    const a = billsIssuedAlert({
      bills: [
        { period: "2026-09", total_amount: 1 },
        { period: "2026-08", total_amount: 2 },
      ],
      corrected: 0,
      sent: 0,
      failed: 2,
      no_email: ["가", "나", "다", "라", "마"],
    })!
    expect(a.text).toContain("2026-08, 2026-09 2건")
    expect(a.info.find((i) => i.title === "메일")?.description).toBe("발송 0건 · 실패 2건 · 메일 주소 없음 5곳(가, 나, 다 외 2곳)")
    expect(a.info.some((i) => i.title === "정정 발행")).toBe(false)
  })

  it("발행 0건이면 알림 없음", () => {
    expect(billsIssuedAlert({ bills: [], corrected: 0, sent: 0, failed: 0, no_email: [] })).toBeNull()
  })
})

describe("요청 범위 밖", () => {
  it("notify*()는 throw하지 않고 아무것도 보내지 않는다", async () => {
    const sql = vi.fn() as never
    expect(() => notifyInquiry({ name: "a", company: "", message: "m" })).not.toThrow()
    expect(() => notifyInboxArrival(sql, { id: 1, file_name: "a.pdf", scan_status: "ok", first: null, pending: 1 })).not.toThrow()
    expect(() => notifyBillsIssued({ bills: [{ period: "2026-09", total_amount: 1 }], corrected: 0, sent: 1, failed: 0, no_email: [] })).not.toThrow()
    await new Promise((r) => setTimeout(r, 10))
    expect(postSystemMessage).not.toHaveBeenCalled()
    expect(sql).not.toHaveBeenCalled()
  })
})

describe("요청 안", () => {
  it("응답 뒤(after)에 postSystemMessage로 alerts 토픽에 남긴다", async () => {
    inRequest = true
    try {
      notifyInquiry({ name: "홍길동", company: "", message: "문의" })
      expect(postSystemMessage).not.toHaveBeenCalled() // 응답 전에는 아무것도 안 함
      await afterCallbacks.shift()!()
      expect(postSystemMessage).toHaveBeenCalledTimes(1)
      const arg = postSystemMessage.mock.calls[0][0]
      expect(arg.slug).toBe("alerts")
      expect(arg.text).toContain("홍길동")
    } finally {
      inRequest = false
      postSystemMessage.mockClear()
    }
  })

  it("증빙: 직전 3분 안의 먼저 온 증빙 수를 세어 요약 여부를 정한다", async () => {
    inRequest = true
    const queries: string[] = []
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.push(strings.join("?").replace(/\s+/g, " ").trim())
      expect(values).toEqual([41, 3])
      return Promise.resolve([{ n: 1 }])
    }) as never
    try {
      notifyInboxArrival(sql, { id: 41, file_name: "a.pdf", scan_status: "ok", first: null, pending: 4 })
      await afterCallbacks.shift()!()
      expect(queries[0]).toContain("FROM expense_inbox WHERE id < ? AND created_at > now() - make_interval(mins => ?)")
      expect(postSystemMessage.mock.calls[0][0].text).toBe("증빙 추가 도착 · 확인 대기 **4건**")
    } finally {
      inRequest = false
      postSystemMessage.mockClear()
    }
  })

  it("알림 실패는 삼킨다(본 작업 응답에 영향 없음)", async () => {
    inRequest = true
    postSystemMessage.mockRejectedValueOnce(new Error("db down"))
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      notifyBillsIssued({ bills: [{ period: "2026-09", total_amount: 1 }], corrected: 0, sent: 1, failed: 0, no_email: [] })
      await expect(afterCallbacks.shift()!()).resolves.toBeUndefined()
      expect(err).toHaveBeenCalled()
    } finally {
      inRequest = false
      err.mockRestore()
      postSystemMessage.mockClear()
    }
  })
})
