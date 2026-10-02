// WP0b: 셸 메뉴 정의·화면 이름·키보드 판정(lib/help/shell.ts) 단위 테스트
import { describe, expect, it } from "vitest"
import { ADMIN_HOME_ITEM, ADMIN_NAV, adminScreenName, findAdminNav, isActiveHref, opensKeyboard, PORTAL_NAV, telHref } from "@/lib/help/shell"

describe("관리자 메뉴 구성(계획서 3.1)", () => {
  it("홈 + 매달 하는 일·입주기업·호실·소통 + 접힌 홈페이지", () => {
    expect(ADMIN_HOME_ITEM.label).toBe("홈")
    expect(ADMIN_NAV.map((g) => g.label)).toEqual(["매달 하는 일", "입주기업·호실", "소통", "홈페이지"])
    expect(ADMIN_NAV.map((g) => g.items.map((i) => i.label))).toEqual([
      ["관리비 정산", "증빙 처리"],
      ["호실 현황", "입주기업", "프로그램"],
      ["메신저", "문의", "메일"],
      ["사이트 콘텐츠", "최신 소식", "팝업", "포트폴리오", "통계"],
    ])
    expect(ADMIN_NAV.filter((g) => g.collapsible).map((g) => g.key)).toEqual(["site"])
  })
  it("경로는 예전 그대로(14개)", () => {
    const hrefs = [ADMIN_HOME_ITEM, ...ADMIN_NAV.flatMap((g) => g.items)].map((i) => i.href).sort()
    expect(hrefs).toEqual([
      "/admin", "/admin/billing", "/admin/emails", "/admin/expenses", "/admin/inquiries", "/admin/messenger", "/admin/news",
      "/admin/popups", "/admin/portfolio", "/admin/programs", "/admin/rooms", "/admin/site", "/admin/stats", "/admin/tenants",
    ])
  })
  it("바뀐 이름에 옛 이름 툴팁", () => {
    const old = Object.fromEntries([ADMIN_HOME_ITEM, ...ADMIN_NAV.flatMap((g) => g.items)].filter((i) => i.oldName).map((i) => [i.label, i.oldName]))
    expect(old).toEqual({ 홈: "대시보드", "증빙 처리": "사업비 정산", 문의: "문의 관리" })
  })
  it("높이 예산: 펼친 항목 9 + 그룹 3 + 접힌 줄 1 → 568px(계획서 3.1의 합 584는 덧셈 오류, 실제 568)", () => {
    const open = ADMIN_NAV.filter((g) => !g.collapsible)
    const h = 56 + 36 + open.reduce((s, g) => s + 32 + 36 * g.items.length, 0) + 36 + 56
    expect(h).toBe(568)
    expect(h + 16 + 8).toBeLessThanOrEqual(600) // nav 위아래 여백 16 + 접힌 그룹 위 간격 8
  })
})

describe("활성 판정·화면 이름", () => {
  it("/admin은 정확히 같을 때만", () => {
    expect(isActiveHref("/admin", "/admin")).toBe(true)
    expect(isActiveHref("/admin/rooms", "/admin")).toBe(false)
    expect(isActiveHref("/admin/news/3", "/admin/news")).toBe(true)
    expect(isActiveHref("/admin/newsletter", "/admin/news")).toBe(false)
    expect(isActiveHref("/portal/bills/87", "/portal/bills")).toBe(true)
    expect(isActiveHref("/portal/bills", "/portal")).toBe(false)
  })
  it("모바일 바 화면 이름", () => {
    expect(adminScreenName("/admin")).toBe("홈")
    expect(adminScreenName("/admin/billing")).toBe("관리비 정산 · 월 마감")
    expect(adminScreenName("/admin/billing/bills")).toBe("관리비 정산 · 청구서")
    expect(adminScreenName("/admin/billing/settings")).toBe("관리비 정산 · 기준 정보")
    expect(adminScreenName("/admin/expenses")).toBe("증빙 처리 · 증빙 올리기")
    expect(adminScreenName("/admin/expenses/receipts/print")).toBe("증빙 처리 · 증빙 내역")
    expect(adminScreenName("/admin/expenses/desktop")).toBe("증빙 처리 · 데스크톱 앱 설치")
    expect(adminScreenName("/admin/rooms")).toBe("호실 현황")
    expect(adminScreenName("/admin/news/12")).toBe("최신 소식")
    expect(adminScreenName("/admin/emails/templates")).toBe("메일 · 템플릿")
    expect(adminScreenName("/admin/unknown")).toBe("관리자")
  })
  it("접힌 그룹 안 화면이면 그룹을 찾는다", () => {
    expect(findAdminNav("/admin/news")?.group?.key).toBe("site")
    expect(findAdminNav("/admin")?.group).toBeNull()
  })
})

describe("포털", () => {
  it("메뉴 5개 이름·경로", () => {
    expect(PORTAL_NAV.map((i) => [i.label, i.href])).toEqual([
      ["홈", "/portal"], ["청구서", "/portal/bills"], ["프로그램", "/portal/programs"], ["메신저", "/portal/messenger"], ["계정", "/portal/settings"],
    ])
  })
  it("tel 링크", () => {
    expect(telHref("054-279-8710")).toBe("tel:0542798710")
  })
  it("키보드가 열리는 칸만 탭을 숨긴다", () => {
    expect(opensKeyboard({ tagName: "INPUT", type: "text" })).toBe(true)
    expect(opensKeyboard({ tagName: "INPUT", type: "password" })).toBe(true)
    expect(opensKeyboard({ tagName: "TEXTAREA" })).toBe(true)
    expect(opensKeyboard({ tagName: "DIV", isContentEditable: true })).toBe(true)
    expect(opensKeyboard({ tagName: "INPUT", type: "checkbox" })).toBe(false)
    expect(opensKeyboard({ tagName: "BUTTON" })).toBe(false)
    expect(opensKeyboard({ tagName: "SELECT" })).toBe(false)
    expect(opensKeyboard(null)).toBe(false)
  })
})
