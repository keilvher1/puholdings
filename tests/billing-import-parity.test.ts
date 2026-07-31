import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { parseSettlement } from "@/lib/billing-import"

// 실제 정산 엑셀 원본이 있을 때만 도는 임포트 파서 전수 검증.
// 원본 경로는 환경변수로 바꿀 수 있다 (개인정보 포함 파일이라 저장소에는 넣지 않는다).
const XLSX_PATH =
  process.env.SETTLEMENT_XLSX_PATH ||
  "/Users/mac/Downloads/창업보육센터 임대료 정산 내역 면적별 2605(작성본).xlsx"

const hasFile = existsSync(XLSX_PATH)

describe.skipIf(!hasFile)("parseSettlement — 2605 정산 엑셀 원본 전수 대조", () => {
  const result = hasFile ? parseSettlement(new Uint8Array(readFileSync(XLSX_PATH))) : null!

  it("경고 없이 27개 기업 + 공실 2실 추출", () => {
    expect(result.warnings).toEqual([])
    expect(result.tenants.length).toBe(27)
    expect(result.vacantRooms.map((r) => r.code).sort()).toEqual(["202", "306"])
  })

  it("평당 단가: 갱신·신규입주 21,000 / 비갱신 기존계약 20,000 (시트 M열 그대로)", () => {
    // '비갱신' 표기라도 2026년 신규 입주(포세나·브레인허브 등)는 21,000원 단가.
    const unit21 = new Set(["101", "104", "203", "F101", "303", "406", "106", "105", "403", "410", "301", "206", "402", "F102"])
    for (const t of result.tenants) {
      for (const c of t.contracts) {
        expect(c.rent_unit_price, `호실 ${c.room_code} 단가`).toBe(unit21.has(c.room_code) ? 21000 : 20000)
        if (c.renewal_type === "renewal") expect(c.rent_unit_price).toBe(21000)
        expect(c.mgmt_fee).toBe(15000)
      }
    }
  })

  it("공장동(F*) 호실은 전부 실사용(metered), 본관은 면적별(area)", () => {
    for (const t of result.tenants) {
      for (const c of t.contracts) {
        expect(c.elec_method).toBe(/^F\d/i.test(c.room_code) ? "metered" : "area")
      }
    }
  })

  it("포어텔마이헬스 = 203(20평 갱신) + F101(30평 실사용) 2건", () => {
    const t = result.tenants.find((x) => x.name.includes("포어텔"))!
    expect(t.contracts.map((c) => c.room_code).sort()).toEqual(["203", "F101"])
    const r203 = t.contracts.find((c) => c.room_code === "203")!
    expect(r203.pyeong_billed).toBe(20)
    expect(r203.rent_unit_price).toBe(21000)
    expect(r203.renewal_type).toBe("renewal")
    const f101 = t.contracts.find((c) => c.room_code === "F101")!
    expect(f101.pyeong_billed).toBe(30)
    expect(f101.elec_method).toBe("metered")
  })

  it("에코앤라이프 소계 행(301호 반복)이 중복 계약으로 추출되지 않는다", () => {
    const t = result.tenants.filter((x) => x.name.includes("에코앤라이프"))
    expect(t.length).toBe(1)
    expect(t[0].contracts.length).toBe(1)
    expect(t[0].contracts[0].room_code).toBe("301")
    expect(t[0].contracts[0].pyeong_billed).toBe(13)
  })

  it("부과 평형 전수 대조 (호실 → 평형)", () => {
    const byRoom = new Map<string, number | null>()
    for (const t of result.tenants) for (const c of t.contracts) byRoom.set(c.room_code, c.pyeong_billed)
    const expected: Record<string, number> = {
      "101": 17, "104": 10, "203": 20, F101: 30, "303": 20, "406": 10, "106": 10, "105": 10,
      "405": 10, "103": 10, "407": 10, "403": 10, "201": 20, "410": 10, "204": 20, "205": 20,
      "301": 13, "401": 10, "404": 10, "409": 13, "206": 13, F103: 30, "408": 10, "302": 20,
      "402": 10, "305": 20, "411": 10, F102: 40,
    }
    expect(byRoom.size).toBe(Object.keys(expected).length)
    for (const [room, py] of Object.entries(expected)) expect(byRoom.get(room), `호실 ${room}`).toBe(py)
  })

  it("면적별 계약 부과평형 총합 = 336평 (전기료 분모 검증용 기준값)", () => {
    let sum = 0
    for (const t of result.tenants)
      for (const c of t.contracts) if (c.elec_method === "area") sum += c.pyeong_billed ?? 0
    expect(sum).toBe(336)
  })
})
