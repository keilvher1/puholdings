import { describe, expect, it } from "vitest"
import type { AdminTodo, CloseProgress } from "@/lib/admin-todo"
import { buildHomeTodo, closeSummary, MAIL_OFF_NOTE } from "@/components/admin/dashboard/home-todo"

// WP1: 관리자 홈 할 일 줄(순수). tests/emails-get.test.ts에서 옮겼다(통합 정리, 내용 그대로).
//   - 운영형 조건(기한 NULL·overdue 0·3개월 전 발행·메일 꺼짐)에서 "발행 후 n일"로 보이고 메일 줄이 없다
//   - 랩형: 4.1.3 순서와 lib/links URL

// ── 홈 할 일 줄(순수, 운영형·랩형) ───────────────────────────────────────────

const TODAY = "2026-10-01"
function todo(over: Partial<AdminTodo> = {}): AdminTodo {
  return {
    today: TODAY,
    draftBills: null,
    staleDrafts: null,
    correcting: null,
    receivable: { count: 0, total: 0, late: { count: 0, total: 0 }, oldest: null, nextDue: null },
    expenseInbox: { count: 0 },
    leaving: { count: 0, nearest: null },
    submissions: { toReview: 0, resubmitRequested: 0 },
    inquiriesNew: { count: 0 },
    mail: { enabled: false, failed30d: 0, notConfigured30d: 0 },
    ...over,
  }
}

describe("관리자 홈 할 일 줄", () => {
  it("운영형(기한 NULL·overdue 0·3개월 전 발행·메일 꺼짐): 받을 돈 줄에 '발행 후 n일', 메일 줄 없음, 회색 안내", () => {
    const { items, mailOffNote } = buildHomeTodo(
      todo({
        receivable: {
          count: 3,
          total: 660000,
          late: { count: 1, total: 330000 },
          oldest: { billMonth: "2026-07", tenantName: "(주)솔바람테크", dueDate: null, issuedAt: "2026-07-01T02:00:00.000Z", days: 92, kind: "no_due" },
          nextDue: null,
        },
        mail: { enabled: false, failed30d: 2, notConfigured30d: 40 },
      }),
    )
    expect(items.map((i) => i.key)).toEqual(["receivable"])
    expect(items[0].title).toBe("받을 돈 3건 · 660,000원 · 발행 후 31일 넘음 1건 330,000원 · 가장 오래된 7월분(발행 후 92일)")
    expect(items[0].href).toBe("/admin/billing/bills?view=receivable&bucket=late")
    expect(items.some((i) => i.key === "mail")).toBe(false)
    expect(mailOffNote).toBe(MAIL_OFF_NOTE)
    expect(JSON.stringify(items)).not.toMatch(/메일이 가요|알려 드려요/)
  })

  it("랩형: 4.1.3 순서와 lib/links URL", () => {
    const { items, mailOffNote } = buildHomeTodo(
      todo({
        correcting: { count: 3, billMonths: ["2026-08"] },
        draftBills: { billMonth: "2026-10", usageMonth: "2026-09", count: 22, total: 10637510 },
        receivable: {
          count: 15,
          total: 8797165,
          late: { count: 4, total: 1260831 },
          oldest: { billMonth: "2026-07", tenantName: "가", dueDate: "2026-08-10", issuedAt: "2026-07-04T05:00:00Z", days: 52, kind: "past_due" },
          nextDue: { date: "2026-10-10", count: 11 },
        },
        staleDrafts: { count: 2, oldestBillMonth: "2026-07" },
        expenseInbox: { count: 6 },
        leaving: { count: 2, nearest: { roomCode: "206", endedAt: "2026-10-31" } },
        submissions: { toReview: 1, resubmitRequested: 1 },
        inquiriesNew: { count: 2 },
        mail: { enabled: true, failed30d: 2, notConfigured30d: 0 },
      }),
    )
    expect(items.map((i) => [i.key, i.href])).toEqual([
      ["correcting", "/admin/billing?month=2026-07&step=3"],
      ["draftBills", "/admin/billing?month=2026-09&step=4"],
      ["receivable", "/admin/billing/bills?view=receivable&bucket=late"],
      ["staleDrafts", "/admin/billing/bills?view=draft"],
      ["expenseInbox", "/admin/expenses?inbox=1"],
      ["leaving", "/admin/rooms?state=leaving"],
      ["submissions", "/admin/programs"],
      ["inquiries", "/admin/inquiries?status=new"],
      ["mail", "/admin/emails?status=failed"],
    ])
    const t = Object.fromEntries(items.map((i) => [i.key, i.title]))
    expect(t.correcting).toBe("정정 중 · 8월분 청구서 3건 · 다시 발행해야 포털에 보여요")
    expect(t.draftBills).toBe("10월분 청구서 22건 · 작성 중 · 발행 전 · 10,637,510원")
    expect(t.receivable).toBe("받을 돈 15건 · 8,797,165원 · 기한 지남 4건 1,260,831원 · 가장 오래된 7월분(52일 지남)")
    expect(t.leaving).toBe("퇴실 예정 2곳 · 가장 가까운 206호 10월 31일(토) · 30일 남음")
    expect(t.mail).toBe("보내지 못한 메일 2건(최근 30일)")
    expect(items.find((i) => i.key === "correcting")?.tone).toBe("warning")
    expect(mailOffNote).toBeNull()
  })

  it("모두 0이면 줄이 없다(화면은 '오늘 처리할 일이 없어요')", () => {
    expect(buildHomeTodo(todo()).items).toEqual([])
  })

  it("관리비 마감 한 줄: steps 그대로 '4단계 중 3단계 완료', 이어 하기 = 다음 단계", () => {
    const p = {
      usageMonth: "2026-09",
      billMonth: "2026-10",
      steps: [
        { key: "meters", status: "done", note: null },
        { key: "allocation", status: "done", note: null },
        { key: "generate", status: "done", note: null },
        { key: "issue", status: "current", note: "발행 전 22건" },
      ],
      nextStep: 4,
    } as unknown as CloseProgress
    expect(closeSummary(p)).toEqual({
      doneText: "4단계 중 3단계 완료",
      continueHref: "/admin/billing?month=2026-09&step=4",
      continueLabel: "이어 하기",
      allDone: false,
    })
    const done = { ...p, steps: p.steps.map((s) => ({ ...s, status: "done" })), nextStep: null } as unknown as CloseProgress
    expect(closeSummary(done)).toMatchObject({ doneText: "4단계 모두 완료", continueHref: "/admin/billing?month=2026-09", allDone: true })
  })
})
