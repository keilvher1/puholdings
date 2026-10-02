// 관리자 페이지 공용 프리미티브(예전 이름 유지). 이름과 props는 그대로 두고 모양만 새 공통 부품(components/saas)에 맞췄다.
//   AdminPageHeader → PageHeader 감싸기(actions는 헤더 오른쪽 주 버튼 자리에 그대로 둔다 — 18개 화면이 고치지 않아도 새 헤더를 쓴다)
//   AdminCard → 1px 테두리·그림자 없음(Section과 같은 모양)
//   StepIntro·HelpNote → 차분한 회색·주황 안내, 접힘 표시는 아이콘
// 새 화면은 "@/components/saas"의 PageHeader·Section·Notice·Callout을 직접 쓴다.
//
// 사용 예:
//   <AdminPageHeader title="입주기업" description="입주기업 정보와 계약을 관리해요" actions={<Button>기업 등록</Button>} />
//   <AdminCard className="p-5">…</AdminCard>

import { ChevronRight } from "lucide-react"
import { PageHeader } from "@/components/saas/page-header"
import { cn } from "@/lib/utils"

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return <PageHeader title={title} description={description} primary={actions} />
}

export function AdminCard({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn("overflow-hidden rounded-md border border-warm-tan bg-card", className)}>{children}</div>
}

// ── 설명 프리미티브 ────────────────────────────────────────────────────────────
// 정산 화면이 "무슨 값을 어디서 가져와 넣는 건지 모르겠다"는 피드백을 받아 추가.
// 항상 보이는 요약(StepIntro)과 접히는 상세(HelpNote)를 구분해 화면이 길어지지 않게 한다.

export function StepIntro({
  children,
  tone = "info",
}: {
  children: React.ReactNode
  tone?: "info" | "warn"
}) {
  const cls = tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-warm-tan bg-warm-beige/40 text-[#3f3f4e]"
  return <div className={`mb-5 rounded-md border ${cls} px-4 py-3 text-[15px] leading-relaxed [word-break:keep-all]`}>{children}</div>
}

export function HelpNote({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details open={defaultOpen} className="group mt-3 rounded-md border border-warm-tan bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-sm font-medium text-dark transition-colors hover:bg-warm-ivory [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-text-secondary group-open:rotate-90" aria-hidden />
        {title}
      </summary>
      <div className="border-t border-warm-tan px-3 py-2.5 text-sm leading-[1.85] text-[#3f3f4e] [word-break:keep-all]">{children}</div>
    </details>
  )
}
