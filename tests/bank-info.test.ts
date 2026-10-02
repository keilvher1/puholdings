import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { DEFAULT_BANK_TEXT, getBillingBankInfo, parseBankText } from "@/lib/bank-info"

// 입금 계좌: PDF(lib/invoice-gen.ts)와 화면이 같은 원문을 쓰고, env가 나뉘지 않으면 기본 계좌로 떨어지지 않는다.

// 개편 전 lib/invoice-gen.ts의 DEFAULT_BANK 원문(그대로 복사)
const ORIGINAL_DEFAULT_BANK = "예금주 : ㈜ 포항연합기술지주\n계좌번호 : 910-910009-44304  하나은행"

const saved = process.env.BILLING_BANK_INFO
afterEach(() => {
  if (saved === undefined) delete process.env.BILLING_BANK_INFO
  else process.env.BILLING_BANK_INFO = saved
})

describe("env 없음", () => {
  it("text가 예전 DEFAULT_BANK와 바이트 단위로 같고 분해값이 있다", () => {
    delete process.env.BILLING_BANK_INFO
    const info = getBillingBankInfo()
    expect(Buffer.from(info.text, "utf8").equals(Buffer.from(ORIGINAL_DEFAULT_BANK, "utf8"))).toBe(true)
    expect(Buffer.from(DEFAULT_BANK_TEXT, "utf8").equals(Buffer.from(ORIGINAL_DEFAULT_BANK, "utf8"))).toBe(true)
    expect(info.account).toBe("910-910009-44304")
    expect(info.bank).toBe("하나은행")
    expect(info.holder).toBe("㈜포항연합기술지주")
  })
  it("빈 env도 기본값(PDF의 `||`와 같은 규칙)", () => {
    process.env.BILLING_BANK_INFO = ""
    expect(getBillingBankInfo().text).toBe(ORIGINAL_DEFAULT_BANK)
  })
  it("lib/invoice-gen.ts는 이 상수를 import해 PDF에 같은 문구를 찍는다", () => {
    const src = readFileSync(path.join(process.cwd(), "lib/invoice-gen.ts"), "utf8")
    expect(src).toContain('import { DEFAULT_BANK_TEXT as DEFAULT_BANK } from "./bank-info"')
    expect(src).toContain("bankInfo: process.env.BILLING_BANK_INFO || DEFAULT_BANK,")
    expect(src).not.toMatch(/const DEFAULT_BANK\s*=/)
  })
})

describe("env 있음", () => {
  it("임의 형식이면 원문만 두고 계좌는 null(기본 계좌로 떨어지지 않음)", () => {
    process.env.BILLING_BANK_INFO = "입금 계좌는 창업보육센터에 문의해 주세요"
    const info = getBillingBankInfo()
    expect(info.text).toBe("입금 계좌는 창업보육센터에 문의해 주세요")
    expect(info).toMatchObject({ bank: null, account: null, holder: null })
  })
  it("계좌번호가 둘이면 어느 쪽인지 알 수 없어 null", () => {
    process.env.BILLING_BANK_INFO = "하나은행 910-910009-44304 / 국민은행 123-45-678901 ㈜포항연합기술지주"
    expect(getBillingBankInfo().account).toBeNull()
  })
  it("예금주가 없으면 null", () => {
    expect(parseBankText("하나은행 910-910009-44304").account).toBeNull()
  })
  it("은행명 + 계좌번호 + 예금주 형태는 나눈다", () => {
    process.env.BILLING_BANK_INFO = "국민은행 123-45-678901 (주) 테스트기업"
    expect(getBillingBankInfo()).toMatchObject({ text: "국민은행 123-45-678901 (주) 테스트기업", bank: "국민은행", account: "123-45-678901", holder: "(주)테스트기업" })
    expect(parseBankText("예금주: ㈜ 포항연합기술지주\n계좌: 농협 301-0123-4567-81")).toMatchObject({ bank: "농협", account: "301-0123-4567-81", holder: "㈜포항연합기술지주" })
  })
})
