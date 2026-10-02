"use client"

// 월 마감 "이번 마감" 카드 — 작업 중인 달(사용월 → 청구월), 서버 상태 한 줄, 다음 할 일, 달 바꾸기.
// 단계 상태는 close-status(= getCloseProgress) 값을 그대로 읽는다(새로 고쳐도 같고, 홈 한 줄과 같다).

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MonthPicker } from "@/components/saas"
import { billMonthShort, month, thisMonthKST, usageToBill, won } from "@/lib/format"
import { BILLING_CLOSE_STEP_NOTES } from "@/lib/help/billing-close"
import { isMonthFinished } from "./close-model"
import { statusMeta } from "@/lib/status"
import { cn } from "@/lib/utils"
import type { CloseStatus } from "./types"

export const STEP_LABELS = ["검침 입력", "전기료 배분", "청구서 만들기", "발행"] as const
const NEXT_ACTION = ["검침 입력하기", "전기료 배분하기", "청구서 만들기", "발행 확인하기"] as const

/** 카드 제목: "2026년 9월 사용분 → 10월분 청구서" */
export function closeTitle(usageMonth: string, billMonth: string, today: string): string {
  return `${month(usageMonth)} 사용분 → ${billMonthShort(billMonth, today)} 청구서`
}

export function CloseCard({
  status,
  today,
  step,
  onMonth,
  onGoStep,
}: {
  status: CloseStatus
  today: string
  step: number
  onMonth: (ym: string) => void
  onGoStep: (n: 1 | 2 | 3 | 4) => void
}) {
  const [why, setWhy] = useState(false)
  const { meters, allocation, bills } = status
  const issuedAll = bills.issued + bills.overdue + bills.paid

  const parts: string[] = [`검침 ${meters.total}개 중 ${meters.saved}개 입력${meters.negative > 0 ? ` · 오류 ${meters.negative}개` : ""}`]
  if (allocation.checkOk === false) parts.push("배분 확인 필요")
  else if (allocation.per10Confirmed !== null) parts.push(`배분 확정(10평당 ${won(allocation.per10Confirmed)})`)
  else if (allocation.kepcoTotal === null) parts.push("배분 전")
  else parts.push("10평당 단가 확정 전")
  if (bills.draft > 0) parts.push(`작성 중 ${bills.draft}건 ${won(bills.draftTotal)}`)
  if (bills.manualDraft > 0) parts.push(`수기 작성 중 ${bills.manualDraft}건`)
  parts.push(`발행 ${issuedAll}건`, `납부 ${bills.paid}건`)

  // 발행이 끝난 달(작성 중·정정 중 없음, 발행 뒤 바뀐 값 없음)에서 1·2단계만 '확인 필요'면 그 달을 다시 손대라는 뜻이 아니다.
  // 다음 할 일 대신 "발행 완료 · n단계 … 확인(정정이 필요할 때만)"으로 말하고 이동 버튼을 두지 않는다.
  const finished = isMonthFinished(status)
  const next = finished ? null : status.nextStep
  const finishedNote = finished
    ? status.steps
        .slice(0, 2)
        .map((s, i) => (s.status === "attention" ? `${i + 1}단계 ${i === 1 ? "검산" : "검침"} 확인 필요` : null))
        .filter(Boolean)
        .join(" · ")
    : ""
  const whyNote = BILLING_CLOSE_STEP_NOTES.overview[0]

  return (
    <section aria-labelledby="close-card-title" className="mb-4 rounded-md border border-warm-tan bg-card px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 id="close-card-title" className="text-lg font-semibold leading-snug text-dark [word-break:keep-all]">
            {closeTitle(status.usageMonth, status.billMonth, today)}
          </h2>
          <button
            type="button"
            onClick={() => setWhy((v) => !v)}
            aria-expanded={why}
            aria-controls="close-card-why"
            className="inline-flex min-h-8 items-center text-[15px] text-link underline underline-offset-2 hover:text-dark"
          >
            왜 다르죠?
          </button>
        </div>
        <MonthPicker
          label="전기 사용월"
          value={status.usageMonth}
          onChange={onMonth}
          format={usageToBill}
          describe={(ym) => status.monthNotes[ym] ?? null}
          max={thisMonthKST(today)}
        />
      </div>
      {why && (
        <div id="close-card-why" className="mt-2 space-y-1 rounded-md bg-warm-ivory px-3 py-2 text-[15px] leading-relaxed text-[#3f3f4e] [word-break:keep-all]">
          {whyNote.body.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-80">
          <p className="text-[15px] leading-relaxed text-[#3f3f4e] [word-break:keep-all]">
            <span className="lg:[@media(max-height:760px)]:hidden">{parts.join(" · ")}</span>
            <span className="block text-dark xl:inline">
              <span className="hidden xl:inline lg:[@media(max-height:760px)]:hidden"> · </span>
              {next ? (
                <>
                  다음 할 일: <b className="font-semibold">{next}단계 {STEP_LABELS[next - 1]}</b>
                </>
              ) : issuedAll > 0 ? (
                <>
                  이 달 마감이 끝났어요
                  {finishedNote && <span className="text-[#3f3f4e]"> · {finishedNote}(정정이 필요할 때만 확인해 주세요)</span>}
                </>
              ) : (
                "할 일을 확인하고 있어요"
              )}
            </span>
          </p>
          {bills.correcting > 0 && (
            <p className="text-[15px] font-medium text-amber-800 [word-break:keep-all]">정정 중 {bills.correcting}건 · 4단계에서 다시 발행해야 포털에 보여요</p>
          )}
          {/* 낮은 화면(1280×600 등): 단계 표시를 카드 안 한 줄로 합쳐 단계 본문 첫 칸이 첫 화면에 들어오게 한다 */}
          <ol aria-label="월 마감 단계" className="mt-1.5 hidden flex-wrap gap-1.5 lg:[@media(max-height:760px)]:flex">
            {status.steps.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => onGoStep((i + 1) as 1 | 2 | 3 | 4)}
                  aria-current={step === i + 1 ? "step" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-sm",
                    step === i + 1 ? "border-2 border-dark font-semibold text-dark" : "border-warm-tan text-[#3f3f4e] hover:border-dark",
                  )}
                >
                  {i + 1} {STEP_LABELS[i]} ·{" "}
                  <span className={s.status === "attention" ? "text-amber-800" : s.status === "done" ? "text-green-800" : undefined}>
                    {s.status === "blocked" ? "앞 단계 필요" : statusMeta("closeStep", s.status).label}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        {next && next !== step && (
          <Button type="button" size="sm" variant="outline" className="shrink-0 hover:bg-warm-beige hover:text-dark" onClick={() => onGoStep(next)}>
            {NEXT_ACTION[next - 1]}
            <ChevronRight aria-hidden />
          </Button>
        )}
      </div>
    </section>
  )
}
