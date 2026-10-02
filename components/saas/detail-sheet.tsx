"use client"

// 오른쪽 상세 시트 틀(DetailSheet)과 상단 요약 칸(Highlights) — 기업 카드·청구서 상세·증빙 편집이 같이 쓴다.
// 휴대폰에서는 전체 화면. 탭은 주소 값(?card= 등)과 연결할 수 있다(tab·onTabChange). 저장하지 않은 변경(dirty)이 있으면
// 닫을 때 확인한다. 위쪽 [닫기]는 대상 이름을 넣은 aria-label.
//
// 사용 예:
//   const [billId, setBillId] = useUrlState("bill", "")
//   <DetailSheet open={!!billId} onOpenChange={(o) => !o && setBillId(null)}
//     title="(주)솔바람테크 · 2026년 9월분 청구서" badge={<StatusBadge domain="bill" status={b.status} detail={b.detail} />}
//     highlights={[{ label: "청구 금액", value: <Money value={bill.total_amount} /> }, { label: "납부 기한", value: due(bill.due_date) }]}
//     tabs={[{ value: "lines", label: "내역", content: <Lines /> }, { value: "activity", label: "기록", content: <Activity /> }]}
//     tab={tab} onTabChange={setTab} dirty={edited} footer={<BusyButton busy={saving}>저장하기</BusyButton>} size="lg" />
//   머리 오른쪽 동작(닫기 버튼 왼쪽): actions={<RowActions label="(주)솔바람테크" items={[…]} />} — 1~2개만(주 동작은 footer)

import type { ReactNode } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { useConfirm } from "./confirm"

export interface HighlightItem {
  label: ReactNode
  value: ReactNode
}

/** 상단 요약 3~5칸(상태·금액·기한 등). 시트 밖(페이지)에서도 쓸 수 있다 */
export function Highlights({ items, className }: { items: HighlightItem[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <dl className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-md border border-warm-tan bg-warm-tan sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]", className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0 bg-card px-3 py-2.5">
          <dt className="text-sm text-[#3f3f4e]">{it.label}</dt>
          <dd className="mt-0.5 break-words text-base font-semibold tabular-nums text-dark">{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export interface DetailTab {
  value: string
  label: string
  content: ReactNode
}

const SIZE = { md: "sm:max-w-md", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" } as const

export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  badge,
  actions,
  highlights,
  tabs,
  tab,
  onTabChange,
  footer,
  dirty = false,
  size = "lg",
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  badge?: ReactNode
  /** 머리 오른쪽(닫기 버튼 왼쪽) 동작 자리 — ⋯ 메뉴·보조 버튼 1~2개 */
  actions?: ReactNode
  highlights?: HighlightItem[]
  tabs?: DetailTab[]
  /** 지금 탭(주소 값과 연결할 때). 없으면 첫 탭 */
  tab?: string
  onTabChange?: (value: string) => void
  footer?: ReactNode
  /** 저장하지 않은 변경이 있으면 닫기 전에 확인 */
  dirty?: boolean
  size?: "md" | "lg" | "xl"
  /** 탭 없이 쓸 때 본문 */
  children?: ReactNode
}) {
  const ask = useConfirm()
  const requestClose = async () => {
    if (dirty) {
      const ok = await ask({
        title: "저장하지 않은 변경이 있어요. 닫을까요?",
        body: "닫으면 고친 내용이 사라져요.",
        confirmLabel: "저장하지 않고 닫기",
        cancelLabel: "계속 고치기",
        tone: "danger",
      })
      if (!ok) return
    }
    onOpenChange(false)
  }
  const activeTab = tab ?? tabs?.[0]?.value
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (o) onOpenChange(true)
        else void requestClose()
      }}
    >
      <SheetContent
        side="right"
        className={cn("app-shell w-full gap-0 bg-card p-0 sm:w-[92vw] [&>button:last-child]:hidden", SIZE[size])}
      >
        <SheetHeader className="border-b border-warm-tan px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-lg font-semibold leading-snug text-dark [word-break:keep-all]">{title}</SheetTitle>
              {badge && <div className="mt-1.5">{badge}</div>}
              {description ? (
                <SheetDescription className="mt-1 text-sm text-text-secondary">{description}</SheetDescription>
              ) : (
                <SheetDescription className="sr-only">{title} 상세</SheetDescription>
              )}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
            <Button type="button" variant="ghost" size="icon-sm" className="-mr-1 shrink-0 text-[#3f3f4e] hover:bg-warm-beige hover:text-dark" onClick={() => void requestClose()} aria-label={`${title} 닫기`}>
              <X aria-hidden />
            </Button>
          </div>
          {highlights && highlights.length > 0 && <Highlights items={highlights} className="mt-3" />}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tabs && tabs.length > 0 ? (
            <Tabs value={activeTab} onValueChange={(v) => onTabChange?.(v)} className="gap-0">
              <TabsList className="sticky top-0 z-10 h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-warm-tan bg-card px-3 py-0">
                {tabs.map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="-mb-px h-11 flex-none rounded-none border-0 border-b-2 border-transparent px-3 text-[15px] font-medium text-[#3f3f4e] shadow-none data-[state=active]:border-dark data-[state=active]:font-semibold data-[state=active]:text-dark data-[state=active]:shadow-none"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {tabs.map((t) => (
                <TabsContent key={t.value} value={t.value} className="px-5 py-4">
                  {t.content}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <div className="px-5 py-4">{children}</div>
          )}
        </div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-warm-tan bg-card px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div>}
      </SheetContent>
    </Sheet>
  )
}
