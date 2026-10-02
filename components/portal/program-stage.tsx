"use client"

// 포털 프로그램 '지금 단계' 상자(계획서 4.5.7) — 3단계(신청 → 선정 결과 → 자료 제출) + 지금 할 행동 하나.
// 행동 버튼은 부르는 쪽이 넘긴 콜백·링크로만 움직인다(신청 확인창·제출 폼 위치는 화면이 갖는다).
// 메일 발송이 꺼져 있으면 메일 약속 문구를 하지 않는다(mailEnabled는 서버의 isMailEnabled() 값).
//
// 사용 예:
//   <ProgramStage program={p} mailEnabled={mailEnabled} onApply={() => setApplyOpen(true)} submitHref="#submit" />

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Notice, Stepper, type StepItem } from "@/components/saas"
import { dateShort, dateTime, daysFrom, todayKST } from "@/lib/format"
import { applyDeadlineText, isApplyOpen, isSubmitClosed, monthDay, submitDueText } from "@/components/portal/screens/portal-model"

export interface StageProgram {
  status: string
  apply_start: string | null
  apply_end: string | null
  submit_deadline: string | null
  application_status: string | null
  applied_at: string | null
  submission_id: number | null
  submission_status: string | null
  feedback: string | null
  submitted_at: string | null
  submission_updated_at: string | null
}

/** "10월 20일(화)까지 자료를 내 주세요 · 19일 남음" */
function submitAsk(deadline: string | null, today: string): string {
  if (!deadline) return "자료를 내 주세요."
  const left = daysFrom(deadline, today) ?? 0
  if (left <= 0) return "오늘까지 자료를 내 주세요."
  return `${dateShort(deadline, today)}까지 자료를 내 주세요 · ${left}일 남음`
}

function steps(p: StageProgram, today: string): StepItem[] {
  const app = p.application_status
  const sub = p.submission_status
  const applyStep: StepItem = { key: "apply", label: "신청", status: app ? "done" : "current" }
  let resultStep: StepItem = { key: "result", label: "선정 결과", status: "todo" }
  let submitStep: StepItem = { key: "submit", label: "자료 제출", status: "todo" }
  if (app === "applied") resultStep = { ...resultStep, status: "current", note: "기다리는 중" }
  if (app === "rejected") resultStep = { ...resultStep, status: "done", note: "미선정" }
  if (app === "accepted" || app === "completed") {
    resultStep = { ...resultStep, status: "done", note: "선정" }
    if (app === "completed") submitStep = { ...submitStep, status: "done", note: sub === "approved" ? "승인" : "완료" }
    else if (sub === "approved") submitStep = { ...submitStep, status: "done", note: "승인" }
    else if (sub === "resubmit_requested") submitStep = { ...submitStep, status: "attention", note: "보완 요청" }
    else if (sub === "submitted" || sub === "reviewing") submitStep = { ...submitStep, status: "current", note: "검토 중" }
    else if (sub === "rejected") submitStep = { ...submitStep, status: "attention", note: "반려" }
    else submitStep = { ...submitStep, status: isSubmitClosed(p, today) ? "todo" : "current" }
  }
  return [applyStep, resultStep, submitStep]
}

/** 휴대폰 한 줄("3단계 중 n단계")이 가리킬 단계: 진행 중·확인 필요인 첫 단계, 없으면 마지막으로 끝난 단계 */
export function stageCurrentKey(list: StepItem[]): string | undefined {
  const active = list.find((s) => s.status === "current" || s.status === "attention")
  if (active) return active.key
  const done = list.filter((s) => s.status === "done")
  return done.length ? done[done.length - 1].key : undefined
}

export function ProgramStage({
  program: p,
  mailEnabled,
  onApply,
  submitHref = "#submit",
  today = todayKST(),
}: {
  program: StageProgram
  mailEnabled: boolean
  onApply: () => void
  submitHref?: string
  today?: string
}) {
  const app = p.application_status
  const sub = p.submission_status
  const deadline = p.submit_deadline
  const stepList = steps(p, today)
  let body: ReactNode = null

  if (!app) {
    if (isApplyOpen(p, today)) {
      body = (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base text-dark">{applyDeadlineText(p.apply_end, today)}</p>
          <Button type="button" className="h-11 w-full text-base sm:w-auto" onClick={onApply}>
            이 프로그램에 신청하기
          </Button>
        </div>
      )
    } else if (p.status === "open" && p.apply_start && today < p.apply_start) {
      body = <p className="text-base text-dark">아직 신청 기간이 아니에요. 신청은 {monthDay(p.apply_start, today)}부터예요.</p>
    } else {
      body = <p className="text-base text-dark">모집이 마감됐어요.</p>
    }
  } else if (app === "applied") {
    body = (
      <p className="text-base text-dark [word-break:keep-all]">
        {p.applied_at ? `${dateShort(p.applied_at, today)}에 신청했어요. ` : "신청했어요. "}
        선정 결과는 {mailEnabled ? "메일과 이 화면에서" : "이 화면에서"} 볼 수 있어요.
      </p>
    )
  } else if (app === "rejected") {
    body = <p className="text-base text-dark">이번에는 선정되지 않았어요.</p>
  } else if (app === "completed") {
    // 센터가 '완료'로 닫은 신청 — 제출 버튼·마감 안내 없이 결과만 말한다(제출물이 없어도 같음).
    body = (
      <div className="text-base text-dark [word-break:keep-all]">
        <p>이 프로그램은 완료됐어요.</p>
        {p.feedback && <p className="mt-1 whitespace-pre-line text-[15px]">{p.feedback}</p>}
      </div>
    )
  } else if (sub === "resubmit_requested" && !isSubmitClosed(p, today)) {
    body = (
      <Notice
        tone="warning"
        title="보완 요청이 왔어요"
        action={
          <Button asChild className="h-11 w-full text-base sm:w-auto">
            <a href={submitHref}>다시 제출하기</a>
          </Button>
        }
      >
        {p.feedback && <p className="whitespace-pre-line">{p.feedback}</p>}
        {deadline && <p className="mt-1 text-[15px]">제출 마감: {submitDueText(deadline, today)}</p>}
      </Notice>
    )
  } else if (!sub || sub === "resubmit_requested") {
    body = isSubmitClosed(p, today) ? (
      <p className="text-base text-dark [word-break:keep-all]">제출 마감일이 지나 제출할 수 없어요. 꼭 내야 하면 센터에 연락해 주세요.</p>
    ) : (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base text-dark [word-break:keep-all]">
          {submitAsk(deadline, today)}
        </p>
        <Button asChild className="h-11 w-full text-base sm:w-auto">
          <a href={submitHref}>자료 제출하기</a>
        </Button>
      </div>
    )
  } else if (sub === "submitted") {
    const at = p.submission_updated_at || p.submitted_at
    body = (
      <p className="text-base text-dark [word-break:keep-all]">
        {at ? `${dateTime(at, today)}에 제출했어요. ` : "제출했어요. "}
        검토 결과는 이 화면에 보여요.
        {deadline && !isSubmitClosed(p, today) ? ` 마감(${monthDay(deadline, today)}) 전까지는 고칠 수 있어요.` : ""}
      </p>
    )
  } else if (sub === "reviewing") {
    body = <p className="text-base text-dark">담당자가 제출 자료를 검토하고 있어요. 결과는 이 화면에 보여요.</p>
  } else if (sub === "approved") {
    body = (
      <Notice tone="success" title="제출 자료가 승인됐어요">
        {p.feedback && <p className="whitespace-pre-line">{p.feedback}</p>}
      </Notice>
    )
  } else if (sub === "rejected") {
    body = (
      <Notice tone="danger" title="제출 자료가 반려됐어요">
        {p.feedback ? <p className="whitespace-pre-line">{p.feedback}</p> : "궁금한 점은 센터에 연락해 주세요."}
      </Notice>
    )
  }

  return (
    <section aria-labelledby="stage-title" className="rounded-md border border-warm-tan bg-card px-4 py-4 sm:px-5">
      <h2 id="stage-title" className="sr-only">
        지금 단계
      </h2>
      <Stepper label="프로그램 진행 단계" steps={stepList} current={stageCurrentKey(stepList)} className="mb-3" />
      {body}
    </section>
  )
}
