// 단계 아래 접힌 설명(lib/help/billing-close.ts의 문장) — 예전 마법사의 StepIntro·HelpNote를 옮긴 자리. 서버·클라이언트 공용.
//
// 사용 예:
//   <StepHelp notes={BILLING_CLOSE_STEP_NOTES.meters} />

import { ChevronRight } from "lucide-react"
import type { StepNote } from "@/lib/help/billing-close"
import { cn } from "@/lib/utils"

export function StepHelp({ notes, className }: { notes: StepNote[]; className?: string }) {
  if (notes.length === 0) return null
  return (
    <div className={cn("space-y-2", className)}>
      {notes.map((note) => (
        <details key={note.title} className="group rounded-md border border-warm-tan bg-card">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[15px] font-medium text-dark [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 shrink-0 text-text-secondary group-open:rotate-90" aria-hidden />
            {note.title}
          </summary>
          <div className="space-y-1.5 border-t border-warm-tan px-4 py-3 text-[15px] leading-relaxed text-[#3f3f4e] [word-break:keep-all]">
            {note.body.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}
