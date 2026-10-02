"use client"

// [도움말] 버튼 → 오른쪽 시트: 이 화면 절차 3~5줄, 용어 풀이(lib/glossary.ts), 문의처.
// 화면별 내용은 HelpTopic 객체로 받는다(각 WP가 자기 lib/help/<영역>.ts에 쓴다). 헤더 오른쪽 같은 자리에 둔다(PageHeader help prop).
//
// 사용 예:
//   <PageHeader title="월 마감" help={BILLING_CLOSE_HELP} helpContact={getSupportContact()} />
//   <HelpButton topic={PORTAL_HELP} contact="창업보육센터 054-279-8710" />
//
// contact가 null이면 문의처 줄을 숨긴다(관리자: getSupportContact() 값, 포털: 센터 전화).

import { CircleHelp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { GLOSSARY } from "@/lib/glossary"
import type { HelpTopic } from "@/lib/help/types"

export function HelpButton({ topic, contact = null, label = "도움말" }: { topic: HelpTopic; contact?: string | null; label?: string }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        {/* 휴대폰(640px 미만)은 누름 영역 44px, 그 이상 32px */}
        <Button type="button" variant="outline" size="sm" className="h-11 hover:bg-warm-beige hover:text-dark sm:h-8">
          <CircleHelp aria-hidden />
          {label}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="app-shell w-full gap-0 overflow-y-auto bg-card p-0 sm:max-w-md [&>button:last-child]:hidden">
        <SheetHeader className="border-b border-warm-tan px-5 py-4">
          <SheetTitle className="text-lg font-semibold text-dark">{topic.title} 도움말</SheetTitle>
          <SheetDescription className="text-sm text-text-secondary">이 화면에서 하는 일과 용어를 정리했어요.</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-5 py-5 text-base leading-relaxed text-dark [word-break:keep-all]">
          {topic.steps.length > 0 && (
            <section>
              <h3 className="mb-2 text-base font-semibold">순서</h3>
              <ol className="list-decimal space-y-1.5 pl-5">
                {topic.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </section>
          )}
          {topic.terms.length > 0 && (
            <section>
              <h3 className="mb-2 text-base font-semibold">용어</h3>
              <dl className="space-y-3">
                {topic.terms.map((key) => {
                  const g = GLOSSARY[key]
                  if (!g) return null
                  return (
                    <div key={key}>
                      <dt className="font-medium">{g.term}</dt>
                      <dd className="text-[15px] text-[#3f3f4e]">{g.definition}</dd>
                    </div>
                  )
                })}
              </dl>
            </section>
          )}
          {contact && (
            <section>
              <h3 className="mb-1 text-base font-semibold">문의</h3>
              <p className="text-[15px]">{contact}</p>
            </section>
          )}
        </div>
        <div className="sticky bottom-0 mt-auto border-t border-warm-tan bg-card px-5 py-3">
          <SheetClose asChild>
            <Button type="button" variant="outline" className="w-full hover:bg-warm-beige hover:text-dark">
              닫기
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  )
}

