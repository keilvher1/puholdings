// 화면 안 구획 카드 — 1px warm-tan 테두리, rounded-md, 그림자 없음. 제목(18px/600) + 설명 + 오른쪽 동작.
// 관리자·포털 화면에서 components/ui/card를 직접 쓰지 않는다(기본값이 그림자 카드). 서버·클라이언트 공용.
//
// 사용 예:
//   <Section title="받을 돈" description="청구월과 상관없이 아직 받지 못한 청구서예요" actions={<Button size="sm">내려받기</Button>}>
//     <Table>…</Table>
//   </Section>
//   <Section flush>…</Section>   // 표가 테두리에 붙게(안쪽 여백 없음)

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Section({
  title,
  description,
  actions,
  flush = false,
  as: Tag = "section",
  headingLevel = 2,
  id,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** 본문 안쪽 여백 없음(표·목록을 테두리에 붙일 때) */
  flush?: boolean
  as?: "section" | "div" | "article"
  headingLevel?: 2 | 3
  id?: string
  className?: string
  bodyClassName?: string
  children?: ReactNode
}) {
  const H = headingLevel === 3 ? "h3" : "h2"
  const hasHead = title !== undefined || description !== undefined || actions !== undefined
  return (
    <Tag id={id} className={cn("overflow-hidden rounded-md border border-warm-tan bg-card", className)}>
      {hasHead && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-warm-tan px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title !== undefined && <H className="text-lg font-semibold leading-snug text-dark [word-break:keep-all]">{title}</H>}
            {description !== undefined && (
              <p className="mt-0.5 text-sm leading-relaxed text-text-secondary [word-break:keep-all]">{description}</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(!flush && "px-4 py-4 sm:px-5", bodyClassName)}>{children}</div>
    </Tag>
  )
}
