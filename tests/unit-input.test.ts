import { describe, expect, it } from "vitest"
import { formatTyping, formatUnitValue, parseUnitValue, sanitizeUnitText } from "@/components/saas/unit-input-model"

// 단위 입력칸 값 계약: 빈칸은 null(0이 아님), 바깥 값은 쉼표 없는 숫자 문자열, decimals만큼 소수 유지.

describe("parseUnitValue", () => {
  it("빈칸은 null", () => {
    expect(parseUnitValue("")).toBeNull()
    expect(parseUnitValue("   ")).toBeNull()
    expect(parseUnitValue(null)).toBeNull()
    expect(parseUnitValue("원")).toBeNull()
    expect(parseUnitValue("-", { allowNegative: true })).toBeNull()
    expect(parseUnitValue(".", { decimals: 1 })).toBeNull()
  })
  it("0은 0(빈칸과 다르다)", () => {
    expect(parseUnitValue("0")).toBe("0")
    expect(parseUnitValue("0.0", { decimals: 1 })).toBe("0")
  })
  it("쉼표·단위를 지운 숫자 문자열", () => {
    expect(parseUnitValue("1,234")).toBe("1234")
    expect(parseUnitValue("1,234,000원")).toBe("1234000")
    expect(parseUnitValue(" 8,400,000 ")).toBe("8400000")
    expect(parseUnitValue("0012")).toBe("12")
  })
  it("정수 칸은 소수를 버린다", () => {
    expect(parseUnitValue("1234.56")).toBe("1234")
  })
  it("kWh 소수 1자리 유지", () => {
    expect(parseUnitValue("63,048.3", { decimals: 1 })).toBe("63048.3")
    expect(parseUnitValue("63048.35", { decimals: 1 })).toBe("63048.3")
    expect(parseUnitValue("63048.", { decimals: 1 })).toBe("63048")
    expect(parseUnitValue("63048.0", { decimals: 1 })).toBe("63048")
    expect(parseUnitValue("8.4", { decimals: 1 })).toBe("8.4")
    expect(parseUnitValue(".5", { decimals: 1 })).toBe("0.5")
  })
  it("음수는 허용할 때만", () => {
    expect(parseUnitValue("-5,000")).toBe("5000")
    expect(parseUnitValue("-5,000", { allowNegative: true })).toBe("-5000")
  })
})

describe("표시", () => {
  it("formatUnitValue", () => {
    expect(formatUnitValue("1234000")).toBe("1,234,000")
    expect(formatUnitValue(1234000)).toBe("1,234,000")
    expect(formatUnitValue("63048.3", 1)).toBe("63,048.3")
    expect(formatUnitValue("8.40", 1)).toBe("8.4")
    expect(formatUnitValue(null)).toBe("")
    expect(formatUnitValue("abc")).toBe("")
    expect(formatUnitValue("-5000")).toBe("-5,000")
  })
  it("입력 중에는 끝의 소수점을 남긴다", () => {
    const clean = sanitizeUnitText("63,048.", { decimals: 1 })
    expect(clean).toBe("63048.")
    expect(formatTyping(clean)).toBe("63,048.")
    expect(formatTyping(sanitizeUnitText("1234567"))).toBe("1,234,567")
  })
})
