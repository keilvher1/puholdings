"use client"

// 청구서 목록 표(데스크톱) + 카드 목록(휴대폰 sm 미만) — 받을 돈·월별·작성 중 보기가 같이 쓴다.
// 체크박스는 납부 대기·기한 지남 행에만(일괄 납부). 행을 누르면 상세 시트(?bill=ID). 행 끝 ⋯는 RowActions.
// 상태 배지는 billBadge(날짜 판정)로 고르고, 받을 돈 보기에서는 경과 열과 같은 판정이라 배지 보조 글자를 빼고 경과 열에만 쓴다.

import type { ReactNode } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Money, RowActions, SelectAllCheckbox, StatusBadge, ToneBadge, type RowActionItem } from "@/components/saas"
import { billMonthShort, dateShort, due as dueText, todayKST } from "@/lib/format"
import { cn } from "@/lib/utils"
import { badgeOf, elapsedText, isPayable, LONG_UNPAID_MONTHS, stateOf, type BillRow } from "./bill-model"

export type TableVariant = "receivable" | "month" | "draft"

export interface BillsTableProps {
  variant: TableVariant
  rows: BillRow[]
  selected: Set<number>
  onToggle: (id: number, on: boolean) => void
  onToggleAll: (on: boolean) => void
  onOpen: (row: BillRow) => void
  rowActions: (row: BillRow) => RowActionItem[]
  /** 기업별 미수 개월 수(받을 돈 보기) */
  unpaidMonths?: Map<number, number>
  /** 표 아래(빈 상태 등) */
  empty?: ReactNode
  caption: string
}

function MailCell({ row }: { row: BillRow }) {
  if (row.status === "draft") return <span className="text-text-secondary">-</span>
  if (row.mail_status === "sent" || row.mail_status === "failed" || row.mail_status === "queued") {
    return <StatusBadge domain="email" status={row.mail_status} showDefaultDetail={false} />
  }
  return <span className="text-text-secondary">없음</span>
}

function TenantName({ row, unpaidMonths, onOpen }: { row: BillRow; unpaidMonths?: Map<number, number>; onOpen: (r: BillRow) => void }) {
  const months = unpaidMonths?.get(row.tenant_id) ?? 0
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onOpen(row)
        }}
        className="min-h-8 text-left font-medium text-dark underline-offset-2 hover:underline [word-break:keep-all]"
        aria-label={`${row.tenant_name} ${billMonthShort(row.period)} 청구서 열기`}
      >
        {row.tenant_name}
      </button>
      {row.is_manual && <span className="text-sm text-text-secondary">수기</span>}
      {months >= LONG_UNPAID_MONTHS && (
        <ToneBadge tone="danger" title={`납부 대기·기한 지남 청구서가 ${months}개월치 있어요`}>
          {months}개월 미납
        </ToneBadge>
      )}
    </span>
  )
}

export function BillsTable({ variant, rows, selected, onToggle, onToggleAll, onOpen, rowActions, unpaidMonths, empty, caption }: BillsTableProps) {
  const today = todayKST()
  const payable = rows.filter(isPayable)
  const selectedVisible = payable.filter((r) => selected.has(r.id)).length
  const showCheck = variant !== "draft" && payable.length > 0

  const badge = (r: BillRow) => {
    const b = badgeOf(r, today)
    if (variant === "receivable") return <StatusBadge domain="bill" status={b.status} showDefaultDetail={false} />
    return <StatusBadge domain="bill" status={b.status} detail={b.status === "correcting" ? null : b.detail} showDefaultDetail={false} />
  }

  const checkbox = (r: BillRow) =>
    isPayable(r) ? (
      <Checkbox
        checked={selected.has(r.id)}
        onCheckedChange={(v) => onToggle(r.id, v === true)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`${r.tenant_name} ${billMonthShort(r.period)} 선택`}
      />
    ) : null

  const lateTone = (r: BillRow) => {
    const st = stateOf(r, today)
    return st.kind === "receivable" && st.bucket && st.bucket !== "not_due" && st.bucket !== "no_due"
  }

  return (
    <>
      {/* 데스크톱·태블릿: 표 */}
      <div className="hidden overflow-hidden rounded-md border border-warm-tan bg-card sm:block">
        <Table className="text-[15px]">
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {showCheck && (
                <TableHead className="w-10 pl-4">
                  <SelectAllCheckbox
                    total={payable.length}
                    selected={selectedVisible}
                    onToggle={onToggleAll}
                    label="보이는 납부 대기·기한 지남 청구서 모두 선택"
                  />
                </TableHead>
              )}
              <TableHead className={cn("text-[#3f3f4e]", !showCheck && "pl-4")}>기업</TableHead>
              {variant !== "month" && <TableHead className="text-[#3f3f4e]">청구월</TableHead>}
              {variant === "month" && <TableHead className="text-right text-[#3f3f4e]">임대·관리</TableHead>}
              {variant === "month" && <TableHead className="text-right text-[#3f3f4e]">전기</TableHead>}
              <TableHead className="text-right text-[#3f3f4e]">{variant === "month" ? "합계(원)" : "금액(원)"}</TableHead>
              {variant === "receivable" && <TableHead className="text-[#3f3f4e]">납부 기한</TableHead>}
              {variant === "receivable" && <TableHead className="text-[#3f3f4e]">경과</TableHead>}
              <TableHead className="text-[#3f3f4e]">상태</TableHead>
              {variant === "month" && <TableHead className="text-[#3f3f4e]">발행일</TableHead>}
              {variant === "month" && <TableHead className="text-[#3f3f4e]">메일</TableHead>}
              {variant === "draft" && <TableHead className="text-[#3f3f4e]">종류</TableHead>}
              <TableHead className="w-12 pr-3">
                <span className="sr-only">동작</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.id}
                className={cn("h-12 cursor-pointer hover:bg-warm-ivory", selected.has(r.id) && "bg-warm-beige/60")}
                onClick={() => onOpen(r)}
              >
                {showCheck && <TableCell className="pl-4">{checkbox(r)}</TableCell>}
                <TableCell className={cn("max-w-[18rem] whitespace-normal", !showCheck && "pl-4")}>
                  <TenantName row={r} unpaidMonths={unpaidMonths} onOpen={onOpen} />
                </TableCell>
                {variant !== "month" && <TableCell className="tabular-nums">{billMonthShort(r.period, today)}</TableCell>}
                {variant === "month" && (
                  <TableCell className="text-right">
                    <Money value={Number(r.rent_total) + Number(r.mgmt_total)} unit="none" />
                  </TableCell>
                )}
                {variant === "month" && (
                  <TableCell className="text-right">
                    <Money value={r.elec_amount} unit="none" />
                  </TableCell>
                )}
                <TableCell className="text-right font-medium">
                  <Money value={r.total_amount} unit="none" />
                </TableCell>
                {variant === "receivable" && (
                  <TableCell className="whitespace-nowrap text-[#3f3f4e]">{r.due_date ? dateShort(r.due_date, today) : "기한 없음"}</TableCell>
                )}
                {variant === "receivable" && (
                  <TableCell className={cn("whitespace-nowrap tabular-nums", lateTone(r) ? "font-medium text-red-800" : "text-[#3f3f4e]")}>
                    {elapsedText(r, today)}
                  </TableCell>
                )}
                <TableCell>{badge(r)}</TableCell>
                {variant === "month" && (
                  <TableCell className="whitespace-nowrap text-[#3f3f4e]">{r.issued_at && r.status !== "draft" ? dateShort(r.issued_at, today) : "-"}</TableCell>
                )}
                {variant === "month" && (
                  <TableCell>
                    <MailCell row={r} />
                  </TableCell>
                )}
                {variant === "draft" && <TableCell className="text-[#3f3f4e]">{r.is_manual ? "수기" : "정기"}</TableCell>}
                <TableCell className="pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <RowActions label={`${r.tenant_name} ${billMonthShort(r.period, today)}`} items={rowActions(r)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && empty}
      </div>

      {/* 휴대폰: 카드 목록 */}
      <div className="sm:hidden">
        {showCheck && (
          <div className="mb-2 flex min-h-11 items-center gap-3 px-1">
            <SelectAllCheckbox total={payable.length} selected={selectedVisible} onToggle={onToggleAll} label="보이는 납부 대기·기한 지남 청구서 모두 선택" />
            <span className="text-[15px] text-[#3f3f4e]">보이는 납부 대기·기한 지남 모두 선택</span>
          </div>
        )}
        {rows.length === 0 ? (
          <div className="rounded-md border border-warm-tan bg-card">{empty}</div>
        ) : (
          <ul className="space-y-2" aria-label={caption}>
            {rows.map((r) => {
              const b = badgeOf(r, today)
              return (
                <li
                  key={r.id}
                  className={cn("flex items-start gap-3 rounded-md border border-warm-tan bg-card p-3", selected.has(r.id) && "border-dark")}
                >
                  {isPayable(r) && variant !== "draft" && (
                    // 휴대폰 누름 영역 44×44(계획서 2.4): 체크박스 둘레를 label로 감싸 칸 어디를 눌러도 고른다
                    <label className="-my-1.5 -ml-1.5 flex size-11 shrink-0 cursor-pointer items-center justify-center">{checkbox(r)}</label>
                  )}
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(r)} aria-label={`${r.tenant_name} ${billMonthShort(r.period, today)} 청구서 열기`}>
                    <span className="block font-medium text-dark [word-break:keep-all]">
                      {r.tenant_name}
                      {r.is_manual && <span className="ml-1.5 text-sm font-normal text-text-secondary">수기</span>}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[15px] text-[#3f3f4e]">
                      <span>{billMonthShort(r.period, today)}</span>
                      <span aria-hidden>·</span>
                      <Money value={r.total_amount} strong />
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-2">
                      <StatusBadge domain="bill" status={b.status} showDefaultDetail={false} />
                      <span className={cn("text-sm tabular-nums", lateTone(r) ? "font-medium text-red-800" : "text-[#3f3f4e]")}>
                        {variant === "receivable" ? elapsedText(r, today) : b.status === "correcting" ? "다시 발행해야 포털에 보여요" : (b.detail ?? (r.due_date ? dueText(r.due_date, today) : ""))}
                      </span>
                      {(unpaidMonths?.get(r.tenant_id) ?? 0) >= LONG_UNPAID_MONTHS && (
                        <ToneBadge tone="danger">{unpaidMonths!.get(r.tenant_id)}개월 미납</ToneBadge>
                      )}
                    </span>
                  </button>
                  <RowActions label={`${r.tenant_name} ${billMonthShort(r.period, today)}`} items={rowActions(r)} className="size-11" />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
