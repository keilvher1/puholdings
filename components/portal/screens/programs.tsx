"use client"

// 포털 프로그램 목록 본문(WP8, 계획서 4.5.6). 데이터는 서버 page가 세션 tenant_id로 읽어 넘긴다.
//   한 화면 안 상태별 묶음: 해야 할 일 → 신청할 수 있어요(마감 임박순) → 신청한 프로그램 → 지난 프로그램(기본 접힘)
//   카드마다 상태 배지 하나(lib/status portalProgram 사전), 분류는 회색 글자, 날짜는 줄바꿈 없이.
//   빈 상태에 알림 약속 문구를 쓰지 않는다(알림 기능이 없다).

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { StatusBadge } from "@/components/saas"
import { todayKST } from "@/lib/format"
import { cn } from "@/lib/utils"
import { groupPrograms, type PortalProgramRow, type ProgramCard } from "./portal-model"

function Card({ c }: { c: ProgramCard }) {
  const p = c.program
  const href = `/portal/programs/${p.id}`
  return (
    <li className="flex flex-col gap-2 border-b border-warm-tan px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <Link href={href} className="group flex min-h-11 min-w-0 flex-1 items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge domain={c.badge.domain} status={c.badge.status} showDefaultDetail={false} />
            {p.category && <span className="text-sm text-text-secondary">{p.category}</span>}
          </span>
          <span className="mt-1 block text-base font-medium text-dark group-hover:underline group-hover:underline-offset-2 [word-break:keep-all]">
            {p.title}
          </span>
          <span className={cn("mt-0.5 block text-sm whitespace-nowrap", c.group === "todo" ? "font-medium text-amber-800" : "text-text-secondary")}>
            {c.line}
          </span>
          {p.submission_status === "resubmit_requested" && p.feedback && (
            <span className="mt-0.5 line-clamp-2 block text-sm text-text-secondary [word-break:keep-all]">“{p.feedback}”</span>
          )}
        </span>
        {!c.actionLabel && <ChevronRight className="size-4 shrink-0 text-text-secondary" aria-hidden />}
      </Link>
      {c.actionLabel && (
        <Button asChild className="h-11 w-full shrink-0 text-base sm:w-auto">
          <Link href={`${href}#submit`}>{c.actionLabel}</Link>
        </Button>
      )}
    </li>
  )
}

function Group({ title, cards, empty, id }: { title: string; cards: ProgramCard[]; empty?: string; id: string }) {
  if (cards.length === 0 && !empty) return null
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-md border border-warm-tan bg-card">
      <h2 id={id} className="border-b border-warm-tan px-4 py-3 text-lg font-semibold text-dark sm:px-5">
        {title}
        {cards.length > 0 && <span className="ml-1.5 text-base font-normal tabular-nums text-text-secondary">{cards.length}</span>}
      </h2>
      {cards.length > 0 ? (
        <ul>
          {cards.map((c) => (
            <Card key={c.program.id} c={c} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-base text-text-secondary [word-break:keep-all] sm:px-5">{empty}</p>
      )}
    </section>
  )
}

export function PortalPrograms({ programs, today = todayKST() }: { programs: PortalProgramRow[]; today?: string }) {
  const g = groupPrograms(programs, today)
  const [pastOpen, setPastOpen] = useState(false)
  return (
    <div className="space-y-4">
      <Group id="g-todo" title="해야 할 일" cards={g.todo} />
      <Group id="g-available" title="신청할 수 있어요" cards={g.available} empty="지금 모집 중인 프로그램이 없어요. 새 공고는 이 화면에 올라와요." />
      <Group id="g-applied" title="신청한 프로그램" cards={g.applied} />
      {g.past.length > 0 && (
        <Collapsible open={pastOpen} onOpenChange={setPastOpen} className="overflow-hidden rounded-md border border-warm-tan bg-card">
          <CollapsibleTrigger className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-warm-beige/60 sm:px-5">
            <span className="text-lg font-semibold text-dark">
              지난 프로그램
              <span className="ml-1.5 text-base font-normal tabular-nums text-text-secondary">{g.past.length}</span>
            </span>
            <ChevronDown className={cn("size-4 shrink-0 text-text-secondary transition-transform", pastOpen && "rotate-180")} aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="border-t border-warm-tan">
              {g.past.map((c) => (
                <Card key={c.program.id} c={c} />
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
