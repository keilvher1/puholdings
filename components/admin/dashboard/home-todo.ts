// 관리자 홈 "오늘 할 일" 줄 만들기(순수 함수, 서버·테스트 공용) — 계획서 3.2·4.1.3.
// 줄 순서와 0건 숨김은 lib/admin-todo의 visibleTodoLines를 그대로 따른다(사이드바 homeTotal과 같은 기준).
// 링크는 lib/links.ts로만 만든다(3.4 URL 계약). 숫자를 빨갛게 칠하지 않는다.
//
// 사용 예(서버 컴포넌트):
//   const todo = await getAdminTodo(sql)
//   const { items, mailOffNote } = buildHomeTodo(todo)
//   <TodoList state="ready" items={items} />
//   {mailOffNote && <p>{mailOffNote}</p>}

import type { AdminTodo, CloseProgress, TodoLineKey } from "@/lib/admin-todo"
import { visibleTodoLines } from "@/lib/admin-todo"
import { billsHref, billingCloseHref, emailsHref, expensesHref, inquiriesHref, programHref, programsHref, roomsHref } from "@/lib/links"
import { addMonths, billMonthShort, dateShort, daysFrom, due, sinceIssued, won } from "@/lib/format"

export interface HomeTodoLine {
  key: TodoLineKey
  area: string
  title: string
  detail?: string
  href: string
  actionLabel: string
  tone?: "default" | "warning"
}

/** 메일 발송이 꺼져 있을 때 할 일 목록 아래 회색 한 줄(줄 대신) */
export const MAIL_OFF_NOTE = "메일 발송이 설정되지 않아 메일은 나가지 않아요. 청구서는 PDF로 직접 전달해요"

function monthsLabel(months: string[], today: string): string {
  const sorted = [...months].sort()
  if (sorted.length <= 2) return sorted.map((m) => billMonthShort(m, today)).join("·")
  return `${billMonthShort(sorted[0], today)} 등 ${sorted.length}개월`
}

function line(todo: AdminTodo, key: TodoLineKey): HomeTodoLine | null {
  const t = todo.today
  switch (key) {
    case "correcting": {
      const c = todo.correcting
      if (!c) return null
      const first = [...c.billMonths].sort()[0]
      return {
        key,
        area: "관리비",
        tone: "warning",
        title: `정정 중 · ${monthsLabel(c.billMonths, t)} 청구서 ${c.count}건 · 다시 발행해야 포털에 보여요`,
        href: billingCloseHref(addMonths(first, -1), 3),
        actionLabel: "월 마감 열기",
      }
    }
    case "draftBills": {
      const d = todo.draftBills
      if (!d) return null
      return {
        key,
        area: "관리비",
        title: `${billMonthShort(d.billMonth, t)} 청구서 ${d.count}건 · 작성 중 · 발행 전 · ${won(d.total)}`,
        href: billingCloseHref(d.usageMonth, 4),
        actionLabel: "발행하러 가기",
      }
    }
    case "receivable": {
      const r = todo.receivable
      const parts = [`받을 돈 ${r.count}건 · ${won(r.total)}`]
      // late(isLate)에는 기한이 없는데 발행 후 31일이 넘은 것도 들어간다. 운영처럼 기한이 비어 있으면 "기한 지남"이라 부르지 않는다.
      // getAdminTodo가 채우는 receivableLate(기한 지남 / 기한 없이 31일 넘음)로 나눠 쓰고, 없으면(옛 모양) 가장 오래된 것의 종류로 고른다.
      const split = todo.receivableLate
      if (split && split.pastDue.count + split.noDue.count === r.late.count) {
        if (split.pastDue.count > 0) parts.push(`기한 지남 ${split.pastDue.count}건 ${won(split.pastDue.total)}`)
        if (split.noDue.count > 0) parts.push(`발행 후 31일 넘음 ${split.noDue.count}건 ${won(split.noDue.total)}`)
      } else if (r.late.count > 0) {
        const lateLabel = r.oldest?.kind === "no_due" ? "발행 후 31일 넘음" : "기한 지남"
        parts.push(`${lateLabel} ${r.late.count}건 ${won(r.late.total)}`)
      }
      if (r.oldest) {
        const age = r.oldest.kind === "past_due" ? `${r.oldest.days}일 지남` : sinceIssued(r.oldest.issuedAt, t)
        parts.push(`가장 오래된 ${billMonthShort(r.oldest.billMonth, t)}(${age})`)
      }
      const detail = r.nextDue ? `다음 납부 기한 ${due(r.nextDue.date, t)} · ${r.nextDue.count}건` : undefined
      return {
        key,
        area: "관리비",
        title: parts.join(" · "),
        detail,
        href: billsHref({ view: "receivable", bucket: r.late.count > 0 ? "late" : undefined }),
        // 밀린 것(late)이 있으면 그 구간만 열리므로 버튼 이름도 그 건수로(줄의 "받을 돈 n건"과 다른 숫자가 열려 헷갈리지 않게)
        actionLabel: r.late.count > 0 ? `밀린 ${r.late.count}건 보기` : "받을 돈 보기",
      }
    }
    case "staleDrafts": {
      const s = todo.staleDrafts
      if (!s) return null
      return {
        key,
        area: "관리비",
        title: `정리 안 된 작성 중 청구서 ${s.count}건(${billMonthShort(s.oldestBillMonth, t)}부터)`,
        href: billsHref({ view: "draft" }),
        actionLabel: "청구서 보기",
      }
    }
    case "expenseInbox":
      return {
        key,
        area: "증빙",
        title: `데스크톱 앱에서 온 증빙 ${todo.expenseInbox.count}건이 확인을 기다려요`,
        href: expensesHref({ inbox: true }),
        actionLabel: "확인하기",
      }
    case "leaving": {
      const l = todo.leaving
      const parts = [`퇴실 예정 ${l.count}곳`]
      if (l.nearest) {
        const left = daysFrom(l.nearest.endedAt, t)
        const leftText = left === null ? "" : left === 0 ? " · 오늘" : ` · ${left}일 남음`
        parts.push(`가장 가까운 ${l.nearest.roomCode}호 ${dateShort(l.nearest.endedAt, t)}${leftText}`)
      }
      return { key, area: "호실", title: parts.join(" · "), href: roomsHref({ state: "leaving" }), actionLabel: "호실 보기" }
    }
    case "submissions": {
      const s = todo.submissions
      return {
        key,
        area: "프로그램",
        title: `검토할 제출물 ${s.toReview}건`,
        detail: s.resubmitRequested > 0 ? `입주기업 보완 대기 ${s.resubmitRequested}건은 따로 있어요` : undefined,
        // 검토할 제출물이 한 프로그램에만 있으면 그 상세로 바로 보낸다
        href: todo.reviewProgramIds?.length === 1 ? programHref(todo.reviewProgramIds[0], { tab: "submissions" }) : programsHref(),
        actionLabel: "검토하기",
      }
    }
    case "inquiries":
      return {
        key,
        area: "문의",
        title: `새 문의 ${todo.inquiriesNew.count}건`,
        href: inquiriesHref({ status: "new" }),
        actionLabel: "문의 보기",
      }
    case "mail":
      return {
        key,
        area: "메일",
        title: `보내지 못한 메일 ${todo.mail.failed30d}건(최근 30일)`,
        href: emailsHref({ status: "failed" }),
        actionLabel: "메일 보기",
      }
  }
}

/** 홈 할 일 줄 + 메일 꺼짐 안내(꺼져 있을 때만 문장, 켜져 있으면 null) */
export function buildHomeTodo(todo: AdminTodo): { items: HomeTodoLine[]; mailOffNote: string | null } {
  const items = visibleTodoLines(todo)
    .map((k) => line(todo, k))
    .filter((x): x is HomeTodoLine => x !== null)
  return { items, mailOffNote: todo.mail.enabled ? null : MAIL_OFF_NOTE }
}

export const CLOSE_STEP_LABELS = ["검침 입력", "전기료 배분", "청구서 만들기", "발행"] as const

/** 관리비 마감 한 줄: "4단계 중 3단계 완료"와 이어 하기 링크(getCloseProgress().steps 그대로) */
export function closeSummary(p: CloseProgress): { doneText: string; continueHref: string; continueLabel: string; allDone: boolean } {
  const total = p.steps.length
  const done = p.steps.filter((s) => s.status === "done").length
  const allDone = p.nextStep === null && done === total
  return {
    doneText: allDone ? `${total}단계 모두 완료` : `${total}단계 중 ${done}단계 완료`,
    continueHref: billingCloseHref(p.usageMonth, p.nextStep),
    continueLabel: allDone ? "월 마감 열기" : "이어 하기",
    allDone,
  }
}
