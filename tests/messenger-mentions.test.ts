import { describe, expect, it, vi } from "vitest"

// 멘션 토큰 파싱: 본문에는 '@[이름](m:ID)' / '@[전체](m:all)'로 저장한다(lib/messenger-types.ts MENTION_RE).
vi.mock("@/lib/auth", () => ({ getSession: async () => null, getPortalSession: async () => null }))

import { MENTION_RE } from "@/lib/messenger-types"
import { parseMentions, resolveMentions } from "@/lib/messenger"

describe("MENTION_RE", () => {
  it("이름과 id(또는 all)를 뽑는다", () => {
    const found = [..."안녕 @[김철수](m:12) 님, @[전체](m:all) 확인".matchAll(MENTION_RE)].map((m) => [m[1], m[2]])
    expect(found).toEqual([
      ["김철수", "12"],
      ["전체", "all"],
    ])
  })

  it("형식이 다르면 멘션이 아니다", () => {
    for (const s of ["@김철수", "@[김철수](12)", "@[김철수](m:)", "@[](m:3)", "@[김](m:abc)", "[김](m:3)"]) {
      expect([...s.matchAll(MENTION_RE)]).toHaveLength(0)
    }
  })

  it("g 플래그 정규식을 여러 번 써도 lastIndex 때문에 결과가 달라지지 않는다", () => {
    const body = "@[가](m:1)"
    expect(parseMentions(body)).toEqual([1])
    expect(parseMentions(body)).toEqual([1])
    MENTION_RE.lastIndex = 5 // 누가 전역 정규식을 exec로 쓰다 남긴 상태
    expect(parseMentions(body)).toEqual([1])
  })
})

describe("parseMentions", () => {
  it("@전체는 -1, 중복은 한 번만, 등장 순서 유지", () => {
    expect(parseMentions("@[나](m:7) @[전체](m:all) @[가](m:3) @[나](m:7)")).toEqual([7, -1, 3])
  })

  it("0·거대한 수 같은 잘못된 id는 버린다", () => {
    expect(parseMentions("@[영](m:0) @[큰](m:99999999999999999999)")).toEqual([])
  })

  it("빈 본문", () => {
    expect(parseMentions("")).toEqual([])
  })

  it("코드 블록 안의 토큰도 본문 그대로 읽는다(화면 표시와 같은 기준)", () => {
    expect(parseMentions("`@[가](m:4)`")).toEqual([4])
  })
})

describe("resolveMentions — 방 참여자만", () => {
  it("방에 없는 사람 멘션은 버리고 @전체는 남긴다", () => {
    expect(resolveMentions("@[가](m:1) @[밖](m:99) @[전체](m:all)", undefined, [1, 2])).toEqual([1, -1])
  })

  it("요청의 mentions 배열도 합치되 같은 규칙으로 거른다", () => {
    expect(resolveMentions("@[가](m:1)", [2, "all", 99, "x", 1], [1, 2])).toEqual([1, 2, -1])
  })

  it("게스트가 id를 지어내도 다른 방 사람에게 멘션 알림이 가지 않는다", () => {
    expect(resolveMentions("@[관리자](m:500)", [501], [10, 11])).toEqual([])
  })
})
