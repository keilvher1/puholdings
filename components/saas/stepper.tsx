"use client"

// 단계 표시기(<ol>) — 3단계 이상 순차 절차(월 마감 4단계·퇴실 3단계·포털 프로그램 3단계)에만 쓴다.
// 칸마다 번호 + 1~2단어 라벨 + 상태 글자(완료·진행 중·시작 전·확인 필요·먼저 n단계 필요). 현재 칸 aria-current="step".
// 색만으로 구분하지 않는다(굵기·테두리·아이콘). 휴대폰에서는 "4단계 중 2단계 · 전기료 배분" 한 줄로 줄인다.
// 모든 단계를 누를 수 있게 둔다(onSelect 또는 hrefs). 앞 단계가 안 끝났으면 칸 안에 note("먼저 1단계가 필요해요")가 보인다.
//
// 사용 예:
//   const p = await getCloseProgress(sql)   // 서버
//   <Stepper label="월 마감 단계" steps={p.steps.map((s, i) => ({ ...s, label: ["검침", "전기료 배분", "청구서 만들기", "발행"][i] }))}
//     hrefs={{ meters: billingCloseHref(p.usageMonth, 1), allocation: billingCloseHref(p.usageMonth, 2) }} />
//   <Stepper steps={…} current="allocation" onSelect={(key) => setStep(key)} />
//   <Stepper variant="compact" steps={…} … />   // 낮은 화면(1280×600 등)용 한 줄: 번호·라벨만(상태는 아이콘 + 화면 읽기용 글자, 칸 높이 40px)

import Link from "next/link"
import { Check, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { statusMeta } from "@/lib/status"

export type StepStatus = "done" | "current" | "todo" | "attention" | "blocked"

export interface StepItem {
  key: string
  label: string
  status: StepStatus
  note?: string | null
}

function statusText(s: StepItem): string {
  if (s.status === "blocked") return s.note || statusMeta("closeStep", "blocked").label
  return statusMeta("closeStep", s.status).label
}

export function Stepper({
  steps,
  current,
  onSelect,
  hrefs,
  label = "진행 단계",
  variant = "default",
  className,
}: {
  steps: StepItem[]
  /** 지금 보고 있는 단계(aria-current). 없으면 status가 current·attention인 첫 단계 */
  current?: string
  onSelect?: (key: string, index: number) => void
  hrefs?: Partial<Record<string, string>>
  label?: string
  /** compact: 상태 글자 줄을 숨긴 한 줄 칸(높이 40px). 상태는 아이콘과 화면 읽기용 글자로 */
  variant?: "default" | "compact"
  className?: string
}) {
  const compact = variant === "compact"
  const curKey = current ?? steps.find((s) => s.status === "current" || s.status === "attention")?.key ?? null
  const curIdx = Math.max(0, steps.findIndex((s) => s.key === curKey))
  const cur = steps[curIdx]

  return (
    <nav aria-label={label} className={cn("mb-4", className)}>
      {/* 휴대폰 한 줄 */}
      {cur && (
        <p className="text-[15px] font-medium text-dark sm:hidden">
          {steps.length}단계 중 {curIdx + 1}단계 · {cur.label}
          <span className="ml-1.5 font-normal text-[#3f3f4e]">({statusText(cur)})</span>
        </p>
      )}
      <ol className={cn("hidden sm:grid", compact ? "gap-1.5" : "gap-2")} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const isCur = s.key === curKey
          const body = compact ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                  s.status === "done" ? "border-green-800 bg-green-50 text-green-800" : isCur ? "border-dark bg-dark text-primary-foreground" : "border-warm-tan bg-card text-[#3f3f4e]",
                )}
                aria-hidden
              >
                {s.status === "done" ? <Check className="size-3" /> : i + 1}
              </span>
              <span className={cn("truncate text-[15px]", isCur ? "font-semibold text-dark" : "font-medium text-dark")}>{s.label}</span>
              {s.status === "attention" && <TriangleAlert className="size-3.5 shrink-0 text-amber-800" aria-hidden />}
              <span className="sr-only">
                {" "}
                {i + 1}단계 {statusText(s)}
              </span>
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                    s.status === "done" ? "border-green-800 bg-green-50 text-green-800" : isCur ? "border-dark bg-dark text-primary-foreground" : "border-warm-tan bg-card text-[#3f3f4e]",
                  )}
                  aria-hidden
                >
                  {s.status === "done" ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={cn("truncate text-[15px]", isCur ? "font-semibold text-dark" : "font-medium text-dark")}>{s.label}</span>
              </span>
              <span
                className={cn(
                  "mt-1 flex items-center gap-1 text-sm",
                  s.status === "attention" ? "text-amber-800" : s.status === "done" ? "text-green-800" : "text-[#3f3f4e]",
                )}
              >
                {s.status === "attention" && <TriangleAlert className="size-3.5 shrink-0" aria-hidden />}
                <span className="sr-only">{i + 1}단계 </span>
                {statusText(s)}
                {s.note && s.status !== "blocked" ? <span className="text-[#3f3f4e]"> · {s.note}</span> : null}
              </span>
            </>
          )
          const box = cn(
            compact
              ? "flex h-full min-h-10 w-full items-center rounded-md border bg-card px-2.5 py-1.5 text-left"
              : "flex h-full min-h-16 w-full flex-col justify-center rounded-md border bg-card px-3 py-2 text-left",
            isCur ? "border-2 border-dark" : "border-warm-tan",
            (onSelect || hrefs?.[s.key]) && "hover:border-dark",
          )
          const href = hrefs?.[s.key]
          return (
            <li key={s.key} aria-current={isCur ? "step" : undefined}>
              {href ? (
                <Link href={href} className={box}>
                  {body}
                </Link>
              ) : onSelect ? (
                <button type="button" className={box} onClick={() => onSelect(s.key, i)}>
                  {body}
                </button>
              ) : (
                <div className={box}>{body}</div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
