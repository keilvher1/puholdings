// 상태 배지·톤 배지·개수 배지. 문구·색은 lib/status.ts 사전에서 읽는다(관리자·포털 공용). 서버·클라이언트 공용.
// 배지는 누를 수 없다(누르는 건 FilterTabs). 상태 배지와 개수 배지를 섞어 쓰지 않는다.
// 경고·문제·완료 배지에만 12px 아이콘(삼각형·원 느낌표·체크)을 붙이고, 중립·진행 배지는 글자만 쓴다.
//
// 사용 예:
//   <StatusBadge domain="submission" status={s.status} />
//   const b = billBadge(bill); <StatusBadge domain="bill" status={b.status} detail={b.detail} />   // "기한 지남 21일 지남"
//   <ToneBadge tone="warning">중복 의심</ToneBadge>
//   <CountBadge count={6} srLabel="확인할 증빙 6건" />            // 0이면 아무것도 그리지 않는다

import type { ReactNode } from "react"
import { Check, CircleAlert, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { statusMeta, TONE_CLASS, type StatusDomain, type Tone } from "@/lib/status"

const BASE = "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 text-xs font-medium leading-none"

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "warning") return <TriangleAlert className="size-3 shrink-0" aria-hidden />
  if (tone === "danger") return <CircleAlert className="size-3 shrink-0" aria-hidden />
  if (tone === "success") return <Check className="size-3 shrink-0" aria-hidden />
  return null
}

/** 사전에 없는 상태용. icon=false면 아이콘을 끈다(기본: 톤에 따라 자동) */
export function ToneBadge({
  tone,
  icon = true,
  title,
  className,
  children,
}: {
  tone: Tone
  icon?: boolean
  title?: string
  className?: string
  children: ReactNode
}) {
  return (
    <span title={title} className={cn(BASE, TONE_CLASS[tone], className)}>
      {icon && <ToneIcon tone={tone} />}
      {children}
    </span>
  )
}

/** lib/status.ts 사전의 상태 배지. detail은 배지 뒤 보조 글자("21일 지남"), 없으면 사전의 기본 detail */
export function StatusBadge({
  domain,
  status,
  detail,
  showDefaultDetail = true,
  className,
}: {
  domain: StatusDomain
  status: string | null | undefined
  detail?: ReactNode
  /** 사전에 정의된 기본 보조 글자(예: 정정 중 → "다시 발행해야 포털에 보여요")를 보일지 */
  showDefaultDetail?: boolean
  className?: string
}) {
  const meta = statusMeta(domain, status)
  if (meta.hidden) return null
  const sub = detail ?? (showDefaultDetail ? meta.detail : undefined)
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}>
      <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>
      {sub ? <span className="text-sm text-text-secondary [word-break:keep-all]">{sub}</span> : null}
    </span>
  )
}

/** 개수 전용 중립 배지(진한 글자 + 베이지 바탕). 0·null이면 그리지 않는다. 빨강을 쓰지 않는다 */
export function CountBadge({
  count,
  srLabel,
  max = 99,
  className,
}: {
  count: number | null | undefined
  /** 화면 읽기 프로그램용 문장(예: "확인할 증빙 6건") */
  srLabel: string
  max?: number
  className?: string
}) {
  if (!count || count <= 0) return null
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-warm-beige px-1.5 text-xs font-semibold tabular-nums leading-none text-[#3f3f4e]",
        className,
      )}
    >
      <span aria-hidden>{count > max ? `${max}+` : count}</span>
      <span className="sr-only">{srLabel}</span>
    </span>
  )
}
