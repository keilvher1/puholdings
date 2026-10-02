"use client"

import { useMemo } from "react"
import { ChevronDown, FileSpreadsheet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DetailSheet, EmptyState } from "@/components/saas"
import { Money } from "@/components/admin/expenses/ui"
import {
  CHECK_LABELS,
  CHECK_NOTES,
  CHECK_WARNINGS,
  countChecks,
  type CheckReason,
  type ReceiptCheck,
} from "@/components/admin/expenses/ledger-check"
import { dateShort } from "@/lib/format"
import { DOC_TYPE_LABELS, type ExpenseProject, type ExpenseReceipt } from "@/lib/expenses"
import { cn } from "@/lib/utils"

// 정산 전 점검 시트(계획서 4.2.6 L-2). 프로젝트 전체 증빙을 사유별로 묶어 보여 주고,
// [열기]를 누르면 편집 시트가 "점검 건만" 이전/다음으로 이어서 열린다.
// 확인 필요 사유가 0건이면 "점검할 것이 없어요" + [엑셀 내려받기].
// 참고(신뢰도 낮음·환율 직접 입력·원본 없음)는 접힌 묶음으로 아래에 둔다(상태가 아니다).
//
// 사용 예:
//   <SettleCheckSheet open={open} onOpenChange={setOpen} project={p} receipts={projectAll} checks={checks}
//     loading={!projectAll && !error} error={error} onRetry={reload}
//     onOpen={(id, ids) => openSheet(id, ids)} onDownload={() => download("project")} />
// receipts가 null이면(못 불러옴) 0건으로 보이지 않는다 — loading이면 불러오는 중, error면 오류 + [다시 시도].

interface Group {
  reason: CheckReason
  rows: ExpenseReceipt[]
}

export function SettleCheckSheet({
  open,
  onOpenChange,
  project,
  receipts,
  checks,
  loading = false,
  error = "",
  onRetry,
  onOpen,
  onDownload,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: ExpenseProject
  receipts: ExpenseReceipt[] | null
  checks: Map<number, ReceiptCheck>
  loading?: boolean
  /** 프로젝트 전체 목록을 못 불러왔을 때의 문구(있으면 오류 화면) */
  error?: string
  onRetry?: () => void
  /** id: 열 증빙, ids: 이전/다음으로 돌 점검 건 순서 */
  onOpen: (id: number, ids: number[]) => void
  onDownload: () => void
}) {
  const { groups, noteGroups, targetIds, counts } = useMemo(() => {
    // 거래일 오름차순(정산 서류 순서)
    const sorted = [...(receipts ?? [])].sort((a, b) => (a.issue_date === b.issue_date ? a.id - b.id : a.issue_date < b.issue_date ? -1 : 1))
    const byReason = (reason: CheckReason) =>
      sorted.filter((r) => {
        const c = checks.get(r.id)
        return !!c && ((c.warnings as CheckReason[]).includes(reason) || (c.notes as CheckReason[]).includes(reason))
      })
    const groups: Group[] = CHECK_WARNINGS.map((reason) => ({ reason, rows: byReason(reason) }))
    const noteGroups: Group[] = CHECK_NOTES.map((reason) => ({ reason, rows: byReason(reason) }))
    // 이전/다음 순서: 사유 묶음 순서대로, 같은 증빙은 한 번만
    const seen = new Set<number>()
    const targetIds: number[] = []
    for (const g of groups) {
      for (const r of g.rows) {
        if (seen.has(r.id)) continue
        seen.add(r.id)
        targetIds.push(r.id)
      }
    }
    return { groups, noteGroups, targetIds, counts: countChecks(sorted.map((r) => r.id), checks) }
  }, [receipts, checks])

  const row = (r: ExpenseReceipt, reason: CheckReason, openIds: number[]) => (
    <li key={`${reason}-${r.id}`} className="flex items-center gap-3 border-b border-warm-tan/70 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-dark">{r.vendor_name}</p>
        <p className="text-sm text-text-secondary">
          {dateShort(r.issue_date)} · {DOC_TYPE_LABELS[r.doc_type] ?? r.doc_type}
          {r.budget_item ? ` · ${r.budget_item}` : ""}
        </p>
      </div>
      <Money value={r.total_amount} unit className="text-[15px]" />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 hover:bg-warm-beige"
        aria-label={`${r.vendor_name} ${dateShort(r.issue_date)} 증빙 열기`}
        onClick={() => onOpen(r.id, openIds.includes(r.id) ? openIds : [r.id])}
      >
        열기
      </Button>
    </li>
  )

  const groupBlock = (g: Group, defaultOpen: boolean, openIds: number[]) => {
    const n = g.reason === "same_tx" ? counts.pairs : g.rows.length
    return (
      <Collapsible key={g.reason} defaultOpen={defaultOpen && g.rows.length > 0} className="rounded-md border border-warm-tan">
        <CollapsibleTrigger
          disabled={g.rows.length === 0}
          className="group flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2 text-left disabled:cursor-default"
        >
          <span className="text-[15px] font-semibold text-dark">
            {CHECK_LABELS[g.reason].label}{" "}
            <span className={cn("tabular-nums", n > 0 ? "text-dark" : "font-normal text-text-secondary")}>{n}</span>
          </span>
          {g.rows.length > 0 && <ChevronDown className="size-4 text-text-secondary group-data-[state=open]:rotate-180" aria-hidden />}
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-warm-tan px-4 pb-1 pt-2">
          <p className="mb-1 text-sm text-text-secondary [word-break:keep-all]">{CHECK_LABELS[g.reason].hint}</p>
          <ul>{g.rows.map((r) => row(r, g.reason, openIds))}</ul>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  const noteIds = noteGroups.flatMap((g) => g.rows.map((r) => r.id)).filter((id, i, a) => a.indexOf(id) === i)

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="정산 전 점검"
      description={receipts ? `${project.name} · 저장한 증빙 ${receipts.length.toLocaleString("ko-KR")}건 전체` : project.name}
    >
      <div className="grid gap-3 px-5 py-4">
        {!receipts && error ? (
          <EmptyState
            kind="error"
            title="점검할 증빙을 불러오지 못했어요"
            description={`${error} 불러오기 전에는 점검 결과를 알 수 없어요.`}
            onRetry={onRetry}
          />
        ) : loading || !receipts ? (
          <p className="py-6 text-center text-[15px] text-text-secondary">불러오는 중…</p>
        ) : targetIds.length === 0 ? (
          <EmptyState
            kind="first-use"
            title="점검할 것이 없어요"
            description="같은 거래로 보이는 쌍·금액 불일치·비목 미지정·예산 외·기간 밖 거래가 없어요. 엑셀로 내려받아 정산 자료를 만들어요."
            action={
              <Button type="button" onClick={onDownload}>
                <FileSpreadsheet className="size-4" aria-hidden />
                엑셀 내려받기
              </Button>
            }
          />
        ) : (
          <>
            <p className="text-[15px] text-dark [word-break:keep-all]">
              확인할 증빙 <b className="tabular-nums">{counts.receipts}</b>건이 있어요.
            </p>
            <p className="text-sm text-text-secondary [word-break:keep-all]">
              [열기]를 누르면 편집 시트에서 [다음 ›]으로 점검 건만 이어서 볼 수 있어요. 집행액 계산은 바뀌지 않아요.
            </p>
            {groups.map((g) => groupBlock(g, true, targetIds))}
          </>
        )}
        {!loading && receipts && noteIds.length > 0 && (
          <div className="mt-2 grid gap-2">
            <h3 className="text-sm font-semibold text-text-muted-strong">참고(상태가 아니에요)</h3>
            {noteGroups.filter((g) => g.rows.length > 0).map((g) => groupBlock(g, false, noteIds))}
          </div>
        )}
      </div>
    </DetailSheet>
  )
}
