// 화면 안 알림(Notice)과 작업 전 안내(Callout).
//   Notice: info·success는 role="status", warning·danger는 role="alert". 문제 알림은 해결될 때까지 남는다(자동으로 사라지지 않음).
//           서버 오류는 해당 폼·시트·대화상자 안에 Notice(danger)로 보이고 입력값은 지우지 않는다. 서버·클라이언트 공용.
//   Callout: 회색 안내, storageKey가 있으면 닫은 것을 기억한다(callout.tsx, 클라이언트).
//
// 사용 예:
//   <Notice tone="danger" title="저장하지 못했어요">{friendlyError(status, body.error)}</Notice>
//   <Notice tone="warning" action={<Button size="sm" variant="outline">검침 입력하기</Button>}>9월 검침이 1개 빠졌어요</Notice>
//   <Notice tone="success" onClose={() => setDone(false)}>22건을 발행했어요</Notice>

import type { ReactNode } from "react"
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { TONE_SURFACE_CLASS } from "@/lib/status"

export { Callout } from "./callout"

export type NoticeTone = "info" | "success" | "warning" | "danger"

const ICON = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert } as const

export function Notice({
  tone = "info",
  title,
  action,
  onClose,
  closeLabel = "알림 닫기",
  className,
  children,
}: {
  tone?: NoticeTone
  title?: ReactNode
  action?: ReactNode
  onClose?: () => void
  closeLabel?: string
  className?: string
  children?: ReactNode
}) {
  const Icon = ICON[tone]
  return (
    <div
      role={tone === "warning" || tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-2.5 rounded-md border px-4 py-3 text-base", TONE_SURFACE_CLASS[tone === "info" ? "neutral" : tone], className)}
    >
      <Icon className={cn("mt-1 size-4 shrink-0", tone === "info" && "text-text-secondary")} aria-hidden />
      <div className="min-w-0 flex-1 leading-relaxed [word-break:keep-all]">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5")}>{children}</div>}
        {action && <div className="mt-2 flex flex-wrap items-center gap-2">{action}</div>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md opacity-80 hover:bg-black/5 hover:opacity-100"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}
