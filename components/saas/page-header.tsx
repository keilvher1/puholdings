// 정형 페이지 헤더(PageHeader)·하위 탭(SubNav)·작업 맥락 한 줄(ContextBar) — 계획서 2.1·4.1.2.
// PageHeader는 서버 컴포넌트에서 부르므로 이 파일에는 "use client"를 붙이지 않는다.
//   배치: 1줄 브레드크럼(상위는 링크) → 제목(h1 24px/700) + 오른쪽 [도움말][보조][주 버튼][⋯] → 한 줄 설명(16px, 해요체)
//   주 버튼은 0~1개(채움). 보조는 외곽선. 휴대폰에서는 보조 버튼을 ⋯ 안으로 접는다.
//   more는 링크만(함수 없음). 클릭 동작이 필요한 메뉴는 클라이언트 컴포넌트가 만든 RowActions 등을 moreMenu 슬롯으로 넘긴다.
//
// 사용 예(서버 컴포넌트):
//   <PageHeader
//     title="청구서"
//     description="받을 돈과 월별 청구서를 확인해요"
//     breadcrumbs={[{ label: "관리비 정산", href: "/admin/billing" }, { label: "청구서" }]}
//     help={BILLS_HELP} helpContact={getSupportContact()}
//     secondary={<DownloadButton />}
//     primary={<Button asChild><Link href={billingCloseHref()}>월 마감 열기</Link></Button>}
//     more={[{ label: "월별 정산표 내려받기", href: "/api/admin/billing/export?period=2026-10" }]}
//   />
//   <SubNav items={[…]} />
//   <ContextBar>작업 중: 9월 사용분 → 10월 청구 · 납기 10월 31일</ContextBar>

import { Fragment, type ReactNode } from "react"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import type { HelpTopic } from "@/lib/help/types"
import { cn } from "@/lib/utils"
import { HeaderSecondary, type HeaderMoreLink } from "./header-actions"
import { HelpButton } from "./help-sheet"

export { SubNav, type SubNavItem } from "./sub-nav"

export interface BreadcrumbEntry {
  label: string
  href?: string
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  primary,
  secondary,
  more,
  moreMenu,
  help,
  helpContact = null,
  className,
  children,
}: {
  title: string
  description?: ReactNode
  breadcrumbs?: BreadcrumbEntry[]
  /** 주 버튼 0~1개(헤더 오른쪽 끝, 채움) */
  primary?: ReactNode
  /** 보조 버튼(외곽선). 휴대폰에서는 ⋯ 안으로 접힌다 */
  secondary?: ReactNode
  /** ⋯ 메뉴의 링크(함수 없음). danger는 맨 아래 빨간 글자 */
  more?: HeaderMoreLink[]
  /** ⋯ 자리에 그대로 그릴 클라이언트 메뉴(RowActions 등) */
  moreMenu?: ReactNode
  /** [도움말] 시트 내용 */
  help?: HelpTopic
  /** 도움말 시트의 문의처(관리자: getSupportContact(), 없으면 null로 숨김) */
  helpContact?: string | null
  className?: string
  /** 설명 아래에 붙는 내용(필터 요약 등) */
  children?: ReactNode
}) {
  const hasActions = help || secondary || primary || (more && more.length > 0) || moreMenu
  return (
    <header className={cn("mb-6", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb className="mb-1.5" aria-label="이동 경로">
          <BreadcrumbList className="text-sm text-text-secondary">
            {breadcrumbs.map((b, i) => {
              const last = i === breadcrumbs.length - 1
              // 구분자(li)는 항목(li)과 같은 단계에 둔다 — li 안에 li를 넣으면 하이드레이션 오류가 난다.
              return (
                <Fragment key={`${b.label}-${i}`}>
                  <BreadcrumbItem>
                    {b.href && !last ? (
                      <BreadcrumbLink asChild className="text-link underline underline-offset-2 hover:text-dark">
                        <Link href={b.href}>{b.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="text-text-secondary">{b.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {!last && <BreadcrumbSeparator />}
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <h1 className="min-w-0 text-2xl font-bold leading-tight text-dark [word-break:keep-all]">{title}</h1>
        {hasActions && (
          // 클라이언트 컴포넌트(도움말·⋯·화면이 넘긴 버튼)는 형제 없는 display: contents 감싸개 안에 둔다.
          // JS 조각이 하이드레이션 때 늦게 오면 React가 그 배열의 부모를 다시 그리는데, 부모가 형제 배열의 한 칸이면
          // 그 아래 useId(도움말 시트 aria-controls 등)가 서버와 달라진다(components/admin/admin-shell.tsx 머리 주석).
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="contents">
              {help && <HelpButton topic={help} contact={helpContact} />}
              <HeaderSecondary secondary={secondary} more={more} title={title} />
              {primary}
              {moreMenu}
            </div>
          </div>
        )}
      </div>
      {description && <p className="mt-1.5 text-base leading-relaxed text-text-secondary [word-break:keep-all]">{description}</p>}
      {children}
    </header>
  )
}

/** 헤더 아래 고정 한 줄(작업 맥락). 휴대폰에서는 관리자 상단 바(56px) 아래에 붙는다 */
export function ContextBar({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "sticky top-14 z-20 -mx-4 mb-4 border-b border-warm-tan bg-warm-ivory px-4 py-2 text-[15px] font-medium text-dark [word-break:keep-all] sm:-mx-0 sm:rounded-md sm:border lg:top-0 print:static",
        className,
      )}
    >
      {children}
    </div>
  )
}
