import { afterAll, beforeAll, describe, expect, it } from "vitest"
import * as programs from "@/lib/programs"
import {
  addMonths,
  billMonth,
  billMonthShort,
  date,
  dateShort,
  dateTime,
  daysFrom,
  due,
  month,
  num,
  relative,
  sinceIssued,
  todayKST,
  toKstDate,
  usageToBill,
  won,
  wonNum,
} from "@/lib/format"

// lib/format.ts — 화면 표시 함수. 서버가 UTC로 돌아도(TZ=UTC) 한국 날짜로 보이는지까지 확인한다.

const TODAY = "2026-10-01" // 목요일

describe("금액·숫자", () => {
  it("won: 원 붙임, null은 -", () => {
    expect(won(1234000)).toBe("1,234,000원")
    expect(won("1234000")).toBe("1,234,000원") // NUMERIC 문자열
    expect(won(null)).toBe("-")
    expect(won(undefined)).toBe("-")
    expect(won("")).toBe("-")
    expect(won(0)).toBe("0원")
    expect(won(-5000)).toBe("-5,000원")
  })
  it("wonNum: 단위 없음", () => {
    expect(wonNum(1234000)).toBe("1,234,000")
    expect(wonNum(null)).toBe("-")
  })
  it("num: 뒤쪽 0 지움 / 자리수 고정", () => {
    expect(num(235820.0)).toBe("235,820")
    expect(num("8.40")).toBe("8.4")
    expect(num(63048.3, 1)).toBe("63,048.3")
    expect(num(63048, 1)).toBe("63,048.0")
    expect(num(null)).toBe("-")
  })
})

describe("월", () => {
  it("month·billMonth·usageToBill", () => {
    expect(month("2026-10")).toBe("2026년 10월")
    expect(billMonth("2026-09")).toBe("2026년 9월분")
    expect(usageToBill("2026-09")).toBe("9월 사용분 → 10월 청구")
    expect(usageToBill("2026-12")).toBe("12월 사용분 → 1월 청구")
    expect(addMonths("2026-12", 1)).toBe("2027-01")
    expect(addMonths("2026-01", -1)).toBe("2025-12")
  })
  it("billMonthShort: 올해면 연도 생략", () => {
    expect(billMonthShort("2026-10", TODAY)).toBe("10월분")
    expect(billMonthShort("2025-12", TODAY)).toBe("2025년 12월분")
  })
})

describe("날짜", () => {
  it("date·dateShort", () => {
    expect(date("2026-10-25")).toBe("2026. 10. 25.(일)")
    expect(dateShort("2026-10-25", TODAY)).toBe("10월 25일(일)")
    expect(dateShort("2027-01-05", TODAY)).toBe("2027. 1. 5.(화)")
    expect(date(null)).toBe("-")
  })
  it("due: 남음·오늘·지남·없음", () => {
    expect(due("2026-10-10", TODAY)).toBe("10월 10일(토)까지 · 9일 남음")
    expect(due("2026-10-01", TODAY)).toBe("오늘까지")
    expect(due("2026-09-10", TODAY)).toBe("9월 10일(목) · 21일 지남")
    expect(due(null)).toBe("납부 기한 없음")
    expect(due(null, TODAY)).toBe("납부 기한 없음")
  })
  it("daysFrom·sinceIssued", () => {
    expect(daysFrom("2026-10-10", TODAY)).toBe(9)
    expect(daysFrom("2026-09-10", TODAY)).toBe(-21)
    expect(sinceIssued("2026-08-10T01:00:00Z", TODAY)).toBe("발행 후 52일")
    expect(sinceIssued(null, TODAY)).toBe("-")
  })
  it("dateTime·relative", () => {
    expect(dateTime("2026-10-01T05:20:30Z", TODAY)).toBe("10월 1일 오후 2:20")
    expect(dateTime("2026-09-30T15:05:00Z", TODAY)).toBe("10월 1일 오전 12:05")
    expect(dateTime("2025-10-01T05:20:00Z", TODAY)).toBe("2025년 10월 1일 오후 2:20")
    const now = Date.parse("2026-10-01T05:20:00Z")
    expect(relative("2026-10-01T05:19:40Z", now)).toBe("방금 전")
    expect(relative("2026-10-01T05:00:00Z", now)).toBe("20분 전")
    expect(relative("2026-09-28T05:20:00Z", now)).toBe("3일 전")
    expect(relative("2026-08-01T05:20:00Z", now)).toBe("2026. 8. 1.(토)")
  })
  it("todayKST는 lib/programs.ts의 함수를 다시 내보낸 것(기준일 한 벌)", () => {
    expect(todayKST).toBe(programs.todayKST)
    expect(todayKST()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("TZ=UTC 서버에서도 한국 날짜", () => {
  const saved = process.env.TZ
  beforeAll(() => {
    process.env.TZ = "UTC"
  })
  afterAll(() => {
    if (saved === undefined) delete process.env.TZ
    else process.env.TZ = saved
  })
  it("오전 9시 전(KST) 타임스탬프가 하루 앞 날짜로 보이지 않는다", () => {
    expect(new Date("2026-09-30T16:30:00Z").getHours()).toBe(16) // 지금 TZ가 UTC임을 확인
    // paid_at = NOW()가 KST 10월 1일 01:30에 저장된 경우
    expect(toKstDate("2026-09-30T16:30:00Z")).toBe("2026-10-01")
    expect(toKstDate(new Date("2026-09-30T16:30:00Z"))).toBe("2026-10-01")
    expect(date(new Date("2026-09-30T16:30:00Z"))).toBe("2026. 10. 1.(목)")
    expect(dateTime(new Date("2026-09-30T16:30:00Z"), TODAY)).toBe("10월 1일 오전 1:30")
    expect(due("2026-10-10", TODAY)).toBe("10월 10일(토)까지 · 9일 남음")
  })
  it("다른 시간대(미국 서부)에서도 같은 글자", () => {
    process.env.TZ = "America/Los_Angeles"
    expect(date(new Date("2026-09-30T16:30:00Z"))).toBe("2026. 10. 1.(목)")
    expect(dateTime("2026-10-01T05:20:00Z", TODAY)).toBe("10월 1일 오후 2:20")
    process.env.TZ = "UTC"
  })
})
