"use client"

import { Fragment, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ChevronDown, FileText, Info, Maximize2, Trash2, TriangleAlert } from "lucide-react"
import { DOC_TYPE_LABELS, type ReceiptFields } from "@/lib/expenses"
import { dateShort, won } from "@/lib/format"
import { FilterTabs, StatusBadge, useUrlState } from "@/components/saas"
import {
  BizNoInput,
  CurrencySelect,
  DateCell,
  DocTypeSelect,
  ForeignAmountInput,
  FxNote,
  ItemsEditor,
  MoneyInput,
  MonthCell,
  PaymentSelect,
  ProjectSelect,
  RateInput,
  TextCell,
  type CellState,
  type GridProps,
} from "./upload-fields"
import {
  DEFAULT_BUDGET_ITEM_SUGGESTIONS,
  TABLE_MATCH_TEXT,
  VIEW_STATUS,
  fieldLabels,
  fileUrl,
  hasTableConflict,
  invalidFields,
  isImageMeta,
  isUploadView,
  rowErrors,
  rowNotices,
  similarReasonLabel,
  type DraftRow,
  type ReasonField,
  type RowAssessment,
  type RowReason,
  type TableMatch,
  type UploaderProject,
  type UploadView,
} from "./upload-model"
import { CELL_TONE_CLASS, DotList, KeyHint, RowNote, TABLE_CLASS } from "./ui"

// 증빙 초안 표(계획서 4.2.1·4.2.2): 행 = 증빙 1건, 상태는 4개(입력 필요·확인 필요·준비 완료·제외) + 사유.
// - 위: 상태 탭(?view=, 탭을 바꿀 때의 목록을 고정해 입력 중인 행이 사라지지 않게) · [모든 칸 보기] · [일괄 작업 ▾]
// - 기본 "간단히": 상태·원본·거래일자·거래처·합계·비목·프로젝트. 나머지 칸은 "모든 칸"이나 검토 창에서 본다(선택은 이 브라우저에 기억).
// - 행 아래: 확인 필요 행에만 사유와 글자 버튼([확인했어요]·[원본 보며 확인]). 제외·안내는 회색 글자.
// - md 미만: 표 대신 카드(상태 배지 + "확인할 것 n가지"), 누르면 검토 창.
// 키보드: Tab 다음 칸 · Enter 아래 행 같은 칸 · Shift+Enter 위 행.

export interface ReceiptTableActions {
  patchFields: (key: string, patch: Partial<ReceiptFields>) => void
  setProject: (key: string, projectId: number) => void
  checkField: (key: string, field: keyof ReceiptFields) => void
  checkAll: (key: string) => void // 그 행의 남은 사유를 모두 확인 처리(selected는 바꾸지 않음)
  acknowledge?: (key: string, reasonId: string) => void // 사유 하나 확인 처리
  setSelected: (key: string, selected: boolean) => void // 저장 대상 포함 스위치
  setSelectedMany: (keys: string[], selected: boolean) => void
  bulkProject: (keys: string[], projectId: number) => void
  removeRows: (keys: string[]) => void
  addRowForFile: (rowKey: string) => void
  // field: 열자마자 포커스할 칸(사유를 눌러 연 경우) · mode: "todo"(확인할 것만 순회) · "all"
  openReview: (key: string, opts?: { field?: ReasonField; mode?: "todo" | "all" }) => void
  refetchFx: (key: string) => void // 외화 행: 결제일 환율 다시 받기(직접 입력한 환율을 버림)
}

export type ColumnMode = "simple" | "all"
const COLUMN_KEY = "puh:expenses:upload-columns"

export function budgetListId(projectId: number | null): string {
  return projectId ? `expense-budget-items-${projectId}` : "expense-budget-items-all"
}

// 표와 검토 창이 함께 쓰는 비목 제안 목록(<datalist>)
export function BudgetItemDatalists({ projects }: { projects: UploaderProject[] }) {
  const all = useMemo(() => {
    const set = new Set<string>()
    for (const p of projects) for (const b of p.budget_items) if (b.name.trim()) set.add(b.name.trim())
    for (const d of DEFAULT_BUDGET_ITEM_SUGGESTIONS) set.add(d)
    return Array.from(set)
  }, [projects])
  return (
    <>
      <datalist id={budgetListId(null)}>
        {all.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {projects.map((p) => (
        <datalist key={p.id} id={budgetListId(p.id)}>
          {(p.budget_items.length > 0 ? p.budget_items.map((b) => b.name.trim()).filter(Boolean) : all).map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      ))}
    </>
  )
}

// (예전 '안내 있는 행' 기준 — 다른 화면 호환용으로 남긴다)
export function rowNeedsAttention(row: DraftRow, project: UploaderProject | undefined, matches?: TableMatch[]): boolean {
  return (
    rowErrors(row).length > 0 ||
    row.serverErrors.length > 0 ||
    row.duplicates.length > 0 ||
    row.similar.length > 0 ||
    hasTableConflict(row, matches) ||
    row.warnings.length > 0 ||
    rowNotices(row, project).length > 0 ||
    row.lowFields.some((f) => !row.checkedFields.includes(f))
  )
}

// ── 행 아래 안내(표·검토 창 공용) ────────────────────────────────────────────
// 중복 의심은 상태가 아니라 "제외"의 사유다. 저장 대상에 남아 있을 때만 빨강, 빠져 있으면 회색.

function savedLabel(d: { issue_date: string; vendor_name: string; total_amount: number }): string {
  return [dateShort(d.issue_date), d.vendor_name, won(d.total_amount)].filter(Boolean).join(" · ")
}

// 이미 저장된 증빙과 같은 파일
export function DuplicateNote({ row }: { row: DraftRow }) {
  if (row.duplicates.length === 0) return null
  return (
    <>
      {row.duplicates.slice(0, 3).map((d) => (
        <RowNote key={d.id} label="중복 의심" tone={row.selected ? "danger" : "neutral"}>
          이미 저장한 파일이에요 · <DotList items={[d.project_name, savedLabel(d)]} />
        </RowNote>
      ))}
      {row.duplicates.length > 3 && <p className="text-xs text-text-secondary">외 {row.duplicates.length - 3}건</p>}
    </>
  )
}

// "세금계산서와" · "간이영수증과": 마지막 글자 받침에 따라 와/과를 고른다(한글이 아니면 "와").
function withGwa(word: string): string {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0) - 0xac00
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0
  return `${word}${hasFinal ? "과" : "와"}`
}

// 이미 저장된 증빙 중 같은 거래로 보이는 것(파일은 다름)
export function SimilarNote({ row }: { row: DraftRow }) {
  if (row.similar.length === 0) return null
  return (
    <>
      {row.similar.slice(0, 3).map((d) => (
        <RowNote key={d.id} label="중복 의심" tone={row.selected ? "danger" : "neutral"}>
          이미 저장한 {withGwa(DOC_TYPE_LABELS[d.doc_type] ?? "증빙")} 같은 거래로 보여요({similarReasonLabel(d.reason)}) ·{" "}
          <DotList items={[d.project_name, savedLabel(d)]} />
        </RowNote>
      ))}
      {row.similar.length > 3 && <p className="text-xs text-text-secondary">외 {row.similar.length - 3}건</p>}
    </>
  )
}

// 표 안의 다른 행과 같은 파일·같은 거래로 보일 때
export function TableMatchNote({ row, matches }: { row: DraftRow; matches: TableMatch[] | undefined }) {
  if (!matches || matches.length === 0) return null
  const other = matches.filter((m) => m.otherSelected)
  if (other.length === 0) return null
  if (row.selected) {
    return (
      <>
        {other.map((m) => (
          <RowNote key={m.otherKey} label="중복 의심" tone="danger">
            {m.otherNumber}번 행({m.otherLabel})과 {TABLE_MATCH_TEXT[m.kind]} · 둘 다 저장하면 두 번 계상돼요
          </RowNote>
        ))}
      </>
    )
  }
  const m = other[0]
  return (
    <RowNote label="중복 의심" tone="neutral">
      {m.otherNumber}번 행({m.otherLabel})과 {m.kind === "same_file" ? "같은 파일" : "같은 거래로 보여요"}
    </RowNote>
  )
}

// (호환용) 확인 문장 목록
export function CheckNotes({ items, muted = false }: { items: string[]; muted?: boolean }) {
  if (items.length === 0) return null
  return (
    <>
      {items.map((w, i) => (
        <RowNote key={i} label="확인" tone={muted ? "neutral" : "warning"}>
          {w}
        </RowNote>
      ))}
    </>
  )
}

// 회색 안내 한 줄(상태에 영향 없음)
export function InfoLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-sm text-text-secondary [word-break:keep-all]", className)}>
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

// 제외 사유 한 줄(표·카드·검토 창 공용)
export function excludedText(row: DraftRow, matches: TableMatch[] | undefined): string {
  if (row.duplicates.length > 0) return `이미 저장한 파일이에요(${savedLabel(row.duplicates[0])}) · 같은 증빙이면 그대로 두세요`
  if (row.similar.length > 0) {
    const d = row.similar[0]
    return `이미 저장한 ${withGwa(DOC_TYPE_LABELS[d.doc_type] ?? "증빙")} 같은 거래로 보여요(${savedLabel(d)}) · 한 거래는 한 건만 저장해요`
  }
  const m = matches?.find((x) => x.otherSelected)
  if (m) return `${m.otherNumber}번 행과 ${m.kind === "same_file" ? "같은 파일이에요" : "같은 거래로 보여요"} · 한 거래는 한 건만 저장해요`
  return "저장 대상에서 뺐어요"
}

// 사유 목록 + 글자 버튼. 표에서는 [원본 보며 확인](인식 불확실) 또는 [확인했어요].
function ReasonLine({
  row,
  number,
  st,
  actions,
}: {
  row: DraftRow
  number: number
  st: RowAssessment
  actions: ReceiptTableActions
}) {
  const n = st.reasons.length
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-dark [word-break:keep-all]">
      <span className="font-semibold text-amber-900">확인할 것 {n}가지:</span>
      {st.reasons.map((r, i) => (
        <span key={r.id} className="inline-flex flex-wrap items-center gap-x-1">
          {i > 0 && (
            <span aria-hidden className="text-text-secondary">
              ·
            </span>
          )}
          <span>{r.text}</span>
          {r.needsOriginal ? (
            <ReasonButton onClick={() => actions.openReview(row.key, { field: r.fields[0], mode: "todo" })} label={`${number}번 행 원본 보며 확인`}>
              원본 보며 확인
            </ReasonButton>
          ) : (
            <ReasonButton onClick={() => (actions.acknowledge ? actions.acknowledge(row.key, r.id) : actions.checkAll(row.key))} label={`${number}번 행 ‘${shortText(r)}’ 확인했어요`}>
              확인했어요
            </ReasonButton>
          )}
        </span>
      ))}
    </div>
  )
}

function shortText(r: RowReason): string {
  return r.text.length > 24 ? `${r.text.slice(0, 24)}…` : r.text
}

export function ReasonButton({ onClick, label, children }: { onClick: () => void; label?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-8 items-center rounded-sm px-1 text-sm font-medium text-link underline underline-offset-2 hover:bg-warm-beige disabled:opacity-60"
    >
      {children}
    </button>
  )
}

const TH = cn(TABLE_CLASS.th, "px-1.5 text-[13px] md:sticky md:top-0 md:z-[4]")
const TD = "border-b border-warm-tan/60 px-1.5 py-1.5 align-middle"
const STICKY_LEFT = "md:sticky md:left-0 md:z-[3] md:shadow-[inset_-1px_0_0_var(--color-warm-tan)]"
const STICKY_RIGHT = "md:sticky md:right-0 md:z-[3] md:shadow-[inset_1px_0_0_var(--color-warm-tan)]"

function Thumbnail({ row, filePos, fileCount, onOpen }: { row: DraftRow; filePos: number; fileCount: number; onOpen: () => void }) {
  const [broken, setBroken] = useState(false)
  const image = isImageMeta(row.file)
  return (
    <button
      type="button"
      onClick={onOpen}
      title="원본 보며 확인"
      aria-label={`${row.file.name} 원본 보기`}
      className="group/thumb relative block h-9 w-9 shrink-0 overflow-hidden rounded-md border border-warm-tan bg-warm-beige/50 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {image && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl(row.file.pathname)} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-text-secondary">
          <FileText className="h-4 w-4" />
        </span>
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-dark/40 opacity-0 transition-opacity group-hover/thumb:opacity-100">
        <Maximize2 className="h-3.5 w-3.5 text-white" />
      </span>
      {fileCount > 1 && (
        <span className="absolute bottom-0 right-0 rounded-tl-sm bg-dark/85 px-0.5 text-xs leading-4 text-white tabular-nums">
          {filePos}/{fileCount}
        </span>
      )}
    </button>
  )
}

// 합계 칸. 원화: [합계](모든 칸이면 [KRW] 선택도). 외화: [USD][외화 금액] / × [환율] = [원화 합계]원 / 환율 근거.
function AmountCell({
  row,
  st,
  patch,
  seen,
  grid,
  mismatch,
  showCurrency,
  onRefetch,
}: {
  row: DraftRow
  st: (field: keyof ReceiptFields) => CellState
  patch: (p: Partial<ReceiptFields>) => void
  seen: (field: keyof ReceiptFields) => () => void
  grid: (col: string) => GridProps
  mismatch: boolean
  showCurrency: boolean
  onRefetch: () => void
}) {
  const f = row.fields
  const warn = (
    <span className="flex w-4 shrink-0 justify-center">
      {mismatch && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-help text-amber-700" aria-label="금액이 맞지 않아요: 공급가액+부가세 ≠ 합계">
              <TriangleAlert className="h-3.5 w-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent>금액이 맞지 않아요: 공급가액+부가세 ≠ 합계</TooltipContent>
        </Tooltip>
      )}
    </span>
  )
  const currency = (
    <CurrencySelect
      value={f.currency}
      onChange={(v) => patch({ currency: v })}
      onSeen={seen("currency")}
      state={st("currency")}
      quiet={f.currency === "KRW"}
      className="w-[64px] shrink-0"
      aria-label="통화"
    />
  )
  if (f.currency === "KRW") {
    return (
      <div className="flex items-center justify-end gap-1">
        {warn}
        {showCurrency && currency}
        <MoneyInput value={f.total_amount} onChange={(v) => patch({ total_amount: v })} onBlur={seen("total_amount")} state={st("total_amount")} className="w-[112px] font-semibold" grid={grid("total_amount")} aria-label="합계" />
      </div>
    )
  }
  return (
    <div className="w-[248px] space-y-1">
      <div className="flex items-center gap-1">
        {warn}
        {currency}
        <ForeignAmountInput
          currency={f.currency}
          value={f.foreign_amount}
          onChange={(v) => patch({ foreign_amount: v })}
          onBlur={seen("foreign_amount")}
          state={st("foreign_amount")}
          className="min-w-0 flex-1 font-semibold"
          grid={grid("foreign_amount")}
          aria-label={`${f.currency} 금액`}
        />
      </div>
      <div className="flex items-center gap-1 pl-5 text-xs text-text-secondary">
        <span aria-hidden>×</span>
        <RateInput
          value={f.exchange_rate}
          onChange={(v) => patch({ exchange_rate: v })}
          onBlur={seen("exchange_rate")}
          state={st("exchange_rate")}
          className="w-[76px] shrink-0 px-1.5"
          grid={grid("exchange_rate")}
          aria-label={`적용 환율(1 ${f.currency}당 원)`}
        />
        <span aria-hidden>=</span>
        <MoneyInput value={f.total_amount} onChange={(v) => patch({ total_amount: v })} onBlur={seen("total_amount")} state={st("total_amount")} className="min-w-0 flex-1 px-1.5 font-semibold" grid={grid("total_amount")} aria-label="원화 합계" />
        <span aria-hidden>원</span>
      </div>
      <FxNote fields={f} fx={row.fx} onRefetch={onRefetch} className="pl-5" />
    </div>
  )
}

interface RowProps {
  row: DraftRow
  st: RowAssessment
  index: number // 보이는 행 기준(키보드 이동용)
  number: number // 전체 표 기준 번호(1부터)
  projects: UploaderProject[]
  actions: ReceiptTableActions
  expanded: boolean
  onToggleExpand: (key: string) => void
  filePos: number
  fileCount: number
  matches: TableMatch[] | undefined
  mode: ColumnMode
  fromApp: boolean
  columnCount: number
}

const ReceiptRow = memo(function ReceiptRow({
  row,
  st,
  index,
  number,
  projects,
  actions,
  expanded,
  onToggleExpand,
  filePos,
  fileCount,
  matches,
  mode,
  fromApp,
  columnCount,
}: RowProps) {
  const invalid = invalidFields(row)
  const f = row.fields
  const key = row.key
  const all = mode === "all"

  const excluded = st.status === "excluded"
  // 저장 대상에서 뺀 행(제외)은 칸을 확인 필요 색으로 칠하지 않는다(저장하지 않는 행에 눈이 가지 않게). 다시 넣으면 색이 돌아온다.
  const cellState = (field: keyof ReceiptFields): CellState => ({
    low: !excluded && row.lowFields.includes(field) && !row.checkedFields.includes(field),
    invalid: row.showErrors && !!invalid[field],
  })
  const grid = (col: string) => ({ "data-grid-row": index, "data-grid-col": col })
  const patch = (p: Partial<ReceiptFields>) => actions.patchFields(key, p)
  const seen = (field: keyof ReceiptFields) => () => actions.checkField(key, field)
  const mismatch = st.reasons.some((r) => r.kind === "amount")
  const detailLow = ["approval_no", "memo", "payroll_month"].some((x) => cellState(x as keyof ReceiptFields).low)

  const bg = excluded ? "bg-warm-ivory" : "bg-card"
  // 왼쪽 4px 띠: 입력 필요(빨강) · 확인 필요(amber-600). 준비 완료·제외는 없음.
  const stripe =
    st.status === "needs_input" ? "before:bg-destructive" : st.status === "needs_review" ? "before:bg-amber-600" : "before:bg-transparent"
  const aiSuggested = row.projectSource === "ai" && !!row.project_id
  const missing = fieldLabels(
    (Object.keys(invalid) as ReasonField[]).filter((k) => invalid[k as keyof typeof invalid])
  )

  const showNotes =
    st.status === "needs_review" ||
    (st.status === "needs_input" && (missing.length > 0 || row.serverErrors.length > 0)) ||
    excluded ||
    st.infos.length > 0 ||
    (!excluded && st.acknowledged.length > 0)

  return (
    <>
      <tr data-row-key={key} className={cn(bg, excluded && "text-text-secondary")}>
        <td
          className={cn(
            TD,
            bg,
            all && STICKY_LEFT,
            "relative pl-3 before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
            stripe
          )}
        >
          <div className="flex items-center gap-1.5">
            <span className="w-4 shrink-0 text-right text-xs font-medium tabular-nums text-text-secondary">{number}</span>
            <StatusBadge domain="expenseRow" status={st.status} detail={undefined} />
          </div>
        </td>
        <td className={cn(TD, all && "md:sticky md:left-[132px] md:z-[3]", bg)}>
          <div className="flex items-center gap-1">
            <Thumbnail row={row} filePos={filePos} fileCount={fileCount} onOpen={() => actions.openReview(key, { mode: st.status === "needs_review" || st.status === "needs_input" ? "todo" : "all" })} />
            {fromApp && <span className="text-xs text-text-secondary" title="데스크톱 앱에서 온 증빙">앱</span>}
          </div>
        </td>
        <td className={TD}>
          <DateCell value={f.issue_date} onChange={(v) => patch({ issue_date: v })} onBlur={seen("issue_date")} state={cellState("issue_date")} className="w-[132px]" grid={grid("issue_date")} aria-label="거래일자" />
        </td>
        <td className={TD}>
          <TextCell value={f.vendor_name} onChange={(v) => patch({ vendor_name: v })} onBlur={seen("vendor_name")} state={cellState("vendor_name")} maxLength={200} className={all ? "w-[168px]" : "w-[150px]"} grid={grid("vendor_name")} aria-label="거래처" />
        </td>
        <td className={TD}>
          <AmountCell row={row} st={cellState} patch={patch} seen={seen} grid={grid} mismatch={mismatch} showCurrency={all} onRefetch={() => actions.refetchFx(key)} />
        </td>
        <td className={TD}>
          <TextCell value={f.budget_item} onChange={(v) => patch({ budget_item: v })} onBlur={seen("budget_item")} state={cellState("budget_item")} maxLength={100} list={budgetListId(row.project_id)} className="w-[116px]" grid={grid("budget_item")} aria-label="비목" />
        </td>
        {all && (
          <>
            <td className={TD}>
              <div className="flex items-center gap-1">
                <TextCell value={f.purpose} onChange={(v) => patch({ purpose: v })} onBlur={seen("purpose")} state={cellState("purpose")} className="w-[200px]" grid={grid("purpose")} aria-label="적요" />
                <button
                  type="button"
                  onClick={() => onToggleExpand(key)}
                  aria-expanded={expanded}
                  aria-label={`${number}번 행 승인번호·메모·품목 ${expanded ? "접기" : "펼치기"}`}
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-0.5 rounded-md border px-1.5 text-xs transition-colors",
                    expanded
                      ? "border-dark/40 bg-warm-beige text-dark"
                      : detailLow
                        ? cn(CELL_TONE_CLASS.review, "font-medium text-amber-800 hover:bg-amber-100")
                        : "border-warm-tan text-text-secondary hover:bg-warm-beige hover:text-dark"
                  )}
                >
                  {f.items.length > 0 ? `품목 ${f.items.length}` : "상세"}
                  <ChevronDown className={cn("h-3 w-3", expanded && "rotate-180")} />
                </button>
              </div>
            </td>
            <td className={TD}>
              <DocTypeSelect value={f.doc_type} onChange={(v) => patch({ doc_type: v })} onSeen={seen("doc_type")} state={cellState("doc_type")} className="w-[112px]" aria-label="문서 종류" />
            </td>
            <td className={TD}>
              <PaymentSelect value={f.payment_method} onChange={(v) => patch({ payment_method: v })} onSeen={seen("payment_method")} state={cellState("payment_method")} className="w-[96px]" aria-label="결제 수단" />
            </td>
            <td className={TD}>
              <BizNoInput value={f.vendor_biz_no} onChange={(v) => patch({ vendor_biz_no: v })} onBlur={seen("vendor_biz_no")} state={cellState("vendor_biz_no")} className="w-[128px]" grid={grid("vendor_biz_no")} aria-label="사업자등록번호" />
            </td>
            <td className={TD}>
              <MoneyInput value={f.supply_amount} onChange={(v) => patch({ supply_amount: v })} onBlur={seen("supply_amount")} state={cellState("supply_amount")} className="w-[112px]" grid={grid("supply_amount")} aria-label="공급가액" />
            </td>
            <td className={TD}>
              <MoneyInput value={f.vat_amount} onChange={(v) => patch({ vat_amount: v })} onBlur={seen("vat_amount")} state={cellState("vat_amount")} className="w-[100px]" grid={grid("vat_amount")} aria-label="부가세" />
            </td>
          </>
        )}
        <td className={cn(TD, bg, all && STICKY_RIGHT, "pr-2")}>
          <div className="flex items-center gap-1">
            <ProjectSelect
              value={row.project_id}
              onChange={(id) => actions.setProject(key, id)}
              projects={projects}
              aiSuggestedId={row.aiRaw?.suggested_project_id ?? null}
              suggested={aiSuggested}
              title={aiSuggested ? (row.projectReason ? `추천 근거: ${row.projectReason}` : "증빙 내용으로 추천했어요 · 확인해 주세요") : undefined}
              state={{ invalid: row.showErrors && !row.project_id }}
              placeholder="프로젝트 고르기"
              className={all ? "w-[208px]" : "w-[196px]"}
              aria-label="프로젝트"
            />
            {all && (
              <button
                type="button"
                onClick={() => actions.removeRows([key])}
                title="행 지우기"
                aria-label={`${number}번 행 지우기`}
                className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </td>
      </tr>

      {showNotes && (
        <tr className={bg}>
          <td colSpan={columnCount} className="border-b border-warm-tan/60 p-0">
            <div className={cn("space-y-1 px-3 pb-2 pt-0.5", all && "sticky left-0 w-[var(--table-view-w,100%)]")}>
              {row.serverErrors.map((e, i) => (
                <RowNote key={`s${i}`} label="저장 안 됨" tone="danger">
                  {e}
                </RowNote>
              ))}
              {st.status === "needs_input" && missing.length > 0 && (
                <p className="text-sm text-red-800 [word-break:keep-all]">
                  <span className="font-semibold">채울 칸:</span> {missing.join(" · ")}
                </p>
              )}
              {st.status === "needs_review" && <ReasonLine row={row} number={number} st={st} actions={actions} />}
              {excluded && <InfoLine>{st.duplicateSuspect ? `중복 의심 · ${excludedText(row, matches)}` : "저장 대상에서 뺐어요 · 원본을 열어 다시 넣을 수 있어요"}</InfoLine>}
              {st.infos.map((t) => (
                <InfoLine key={t}>{t}</InfoLine>
              ))}
              {!excluded && st.acknowledged.length > 0 && (
                <p className="text-sm text-text-secondary" title={st.acknowledged.map((r) => r.text).join("\n")}>
                  확인함 {st.acknowledged.length}가지 · {st.acknowledged.map((r) => r.text).join(" · ")}
                </p>
              )}
            </div>
          </td>
        </tr>
      )}

      {all && expanded && (
        <tr className={bg}>
          <td colSpan={columnCount} className="border-b border-warm-tan/60 p-0">
            <div className="sticky left-0 w-[var(--table-view-w,100%)] px-3 pb-3 pt-1">
              <div className="grid gap-4 rounded-md border border-warm-tan p-3 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                <div className="space-y-2.5">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-dark">승인번호</span>
                    <TextCell value={f.approval_no} onChange={(v) => patch({ approval_no: v })} onBlur={seen("approval_no")} state={cellState("approval_no")} maxLength={50} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-dark">메모</span>
                    <TextCell value={f.memo} onChange={(v) => patch({ memo: v })} onBlur={seen("memo")} state={cellState("memo")} />
                  </label>
                  {f.doc_type === "payroll" && (
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-dark">귀속월</span>
                      <MonthCell value={f.payroll_month} onChange={(v) => patch({ payroll_month: v })} onBlur={seen("payroll_month")} state={cellState("payroll_month")} aria-label="귀속월" />
                    </label>
                  )}
                  <p className="truncate text-sm text-text-secondary" title={row.file.name}>
                    원본: {row.file.name}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" size="sm" variant="outline" className="h-8 hover:bg-warm-beige" asChild>
                      <a href={fileUrl(row.file.pathname, { name: row.file.name })}>원본 받기</a>
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 hover:bg-warm-beige" onClick={() => actions.addRowForFile(key)}>
                      이 파일로 한 건 더
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium text-dark">품목</p>
                  <ItemsEditor items={f.items} onChange={(items) => patch({ items })} total={f.total_amount} supply={f.supply_amount} />
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
})

// md 미만: 표 대신 행 카드. 상태 배지와 "확인할 것 n가지"만 보이고, 누르면 검토 창(전체 화면)이 열린다.
function MobileRowCard({
  row,
  st,
  number,
  project,
  actions,
  fromApp,
}: {
  row: DraftRow
  st: RowAssessment
  number: number
  project: UploaderProject | undefined
  actions: ReceiptTableActions
  fromApp: boolean
}) {
  const f = row.fields
  const todo = st.status === "needs_review" || st.status === "needs_input"
  const cue =
    st.status === "needs_review"
      ? `확인할 것 ${st.reasons.length}가지`
      : st.status === "needs_input"
        ? `채울 칸 ${Math.max(1, st.errors.length)}개`
        : st.status === "excluded" && st.duplicateSuspect
          ? "중복 의심"
          : null
  return (
    <button
      type="button"
      onClick={() => actions.openReview(row.key, { mode: todo ? "todo" : "all" })}
      aria-label={`${number}번 ${f.vendor_name || "거래처 미입력"} 증빙 원본 보며 확인`}
      className={cn(
        "relative block w-full overflow-hidden rounded-md border border-warm-tan bg-card py-2.5 pl-4 pr-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
        st.status === "needs_input" ? "before:bg-destructive" : st.status === "needs_review" ? "before:bg-amber-600" : "before:bg-transparent",
        st.status === "excluded" && "bg-warm-ivory"
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate text-base font-semibold text-dark">{f.vendor_name || "거래처 미입력"}</span>
        <span className="shrink-0 text-base font-bold tabular-nums text-dark">{won(f.total_amount)}</span>
      </span>
      <span className="mt-0.5 block truncate text-sm text-text-secondary">
        <DotList
          items={[
            `${number}번`,
            f.issue_date ? dateShort(f.issue_date) : "날짜 미입력",
            f.currency !== "KRW" ? f.currency : null,
            project ? project.name : "프로젝트 미선택",
            fromApp ? "앱" : null,
          ]}
        />
      </span>
      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusBadge domain="expenseRow" status={st.status} />
        {cue && <span className="text-sm text-dark">{cue}</span>}
      </span>
    </button>
  )
}

export interface TableCounts {
  all: number
  review: number
  input: number
  ready: number
  excluded: number
}

export function ReceiptTable({
  rows,
  projects,
  actions,
  matches,
  assessments,
  counts,
  saving = false,
  inboxFileKeys,
  inboxOnly = false,
  onShowAll,
  undoBar,
  flashBar,
}: {
  rows: DraftRow[]
  projects: UploaderProject[]
  actions: ReceiptTableActions
  matches?: Map<string, TableMatch[]> // 표 안의 같은 파일·같은 거래 표시(findTableMatches)
  assessments: Map<string, RowAssessment>
  counts: TableCounts
  saving?: boolean // 저장 요청 중에는 표를 잠근다(그사이 고친 값이 버려지지 않도록)
  inboxFileKeys?: Set<string> // 데스크톱 앱에서 온 파일(표의 "앱" 표시 · ?inbox=1 거르기)
  inboxOnly?: boolean
  onShowAll?: () => void
  undoBar?: ReactNode
  flashBar?: ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewW, setViewW] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [mode, setMode] = useState<ColumnMode>("simple")
  const [rawView, setView] = useUrlState("view", "all")
  const view: UploadView = isUploadView(rawView) ? rawView : "all"

  // 보기 선택(간단히/모든 칸)은 이 브라우저에 기억한다(없거나 막혀도 간단히로 동작).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLUMN_KEY) === "all") setMode("all")
    } catch {
      // 저장소를 못 쓰면 기본값
    }
  }, [])
  const toggleMode = () => {
    const next: ColumnMode = mode === "all" ? "simple" : "all"
    setMode(next)
    try {
      window.localStorage.setItem(COLUMN_KEY, next)
    } catch {
      // 무시
    }
  }

  // 설명 줄(사유·상세)을 화면 폭에 맞춰 고정하기 위해 스크롤 영역 폭을 잰다.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => setViewW(el.clientWidth))
    ro.observe(el)
    setViewW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const toggleExpand = useMemo(
    () => (key: string) =>
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      }),
    []
  )

  // 같은 파일에서 나온 행이 여러 개면 썸네일에 1/2, 2/2 표시
  const filePosition = useMemo(() => {
    const total = new Map<string, number>()
    for (const r of rows) total.set(r.file.pathname, (total.get(r.file.pathname) ?? 0) + 1)
    const seen = new Map<string, number>()
    const pos = new Map<string, { pos: number; count: number }>()
    for (const r of rows) {
      const n = (seen.get(r.file.pathname) ?? 0) + 1
      seen.set(r.file.pathname, n)
      pos.set(r.key, { pos: n, count: total.get(r.file.pathname) ?? 1 })
    }
    return pos
  }, [rows])

  // ── 상태 탭: 탭을 고를 때의 목록을 고정한다 ─────────────────────────────────
  // 입력하는 도중 상태가 바뀌었다고 행이 사라지면 포커스와 입력이 날아가므로, 탭을 고른 순간 맞는 행을 기억해 둔다.
  // 그 뒤 새로 들어온 행(인식 완료·한 건 더)은 지금 상태가 맞으면 보여 준다.
  const matchesView = (key: string, v: UploadView) => v === "all" || assessments.get(key)?.status === VIEW_STATUS[v]
  const [pinned, setPinned] = useState<{ view: UploadView; known: Set<string>; keep: Set<string> } | null>(null)
  const pin = (v: UploadView) =>
    setPinned({ view: v, known: new Set(rows.map((r) => r.key)), keep: new Set(rows.filter((r) => matchesView(r.key, v)).map((r) => r.key)) })
  if (pinned === null || pinned.view !== view) {
    // 처음 그릴 때·주소로 들어온 탭(렌더 중 상태 맞추기 — 효과보다 먼저 맞춰 깜빡임이 없다)
    setPinned({ view, known: new Set(rows.map((r) => r.key)), keep: new Set(rows.filter((r) => matchesView(r.key, view)).map((r) => r.key)) })
  }
  const keep = pinned && pinned.view === view ? pinned : null
  const byView = (r: DraftRow) =>
    view === "all" || !keep ? matchesView(r.key, view) : keep.keep.has(r.key) || (!keep.known.has(r.key) && matchesView(r.key, view))
  const visible = rows.filter((r) => byView(r) && (!inboxOnly || (!!r.fileKey && !!inboxFileKeys?.has(r.fileKey))))
  const stale = view === "all" ? 0 : visible.filter((r) => !matchesView(r.key, view)).length

  const numberOf = new Map(rows.map((r, i) => [r.key, i + 1]))
  const selectedAll = rows.filter((r) => r.selected)
  const excludedKeys = rows.filter((r) => !r.selected).map((r) => r.key)
  // 프로젝트 한 번에 지정의 범위(검토 S11): 행 체크박스가 없으므로 범위를 메뉴에서 고른다.
  //   프로젝트 없는 행만 · 지금 보이는 행(탭·앱 거르기 적용) · 저장 대상 전부. 저장 대상(selected)만 바꾼다.
  const bulkScopes = [
    { id: "empty", label: "프로젝트 없는 행", keys: selectedAll.filter((r) => !r.project_id).map((r) => r.key) },
    ...(view !== "all" || inboxOnly ? [{ id: "visible", label: "지금 보이는 행", keys: visible.filter((r) => r.selected).map((r) => r.key) }] : []),
    { id: "all", label: "저장 대상 전부", keys: selectedAll.map((r) => r.key) },
  ]
  const all = mode === "all"
  const columnCount = all ? 13 : 7

  const options = [
    { value: "all", label: "전체", count: counts.all },
    { value: "review", label: "확인 필요", count: counts.review },
    { value: "input", label: "입력 필요", count: counts.input },
    { value: "ready", label: "준비 완료", count: counts.ready },
    { value: "excluded", label: "제외", count: counts.excluded },
  ].filter((o) => o.value === "all" || o.value === view || o.count > 0 || o.value === "review")

  // 스프레드시트처럼 Enter로 아래 행 같은 칸, Shift+Enter로 위 행으로 이동
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return
    const t = e.target as HTMLElement
    if (t.tagName !== "INPUT") return
    const r = t.getAttribute("data-grid-row")
    const col = t.getAttribute("data-grid-col")
    if (r === null || !col) return
    e.preventDefault()
    const next = Number(r) + (e.shiftKey ? -1 : 1)
    const el = scrollRef.current?.querySelector<HTMLInputElement>(`[data-grid-row="${next}"][data-grid-col="${col}"]`)
    if (el) {
      el.focus()
      if (el.type === "text") el.select()
    }
  }

  return (
    // 저장 요청 중에는 모든 입력·선택·버튼을 잠근다(fieldset disabled). 링크(원본 받기)는 그대로 쓸 수 있다.
    <fieldset disabled={saving} aria-busy={saving} className={cn("m-0 min-w-0 border-0 p-0", saving && "opacity-70")}>
      {saving && (
        <p role="status" className="border-b border-warm-tan bg-warm-beige px-4 py-1.5 text-sm text-dark">
          저장 중… 끝날 때까지 표를 잠가요
        </p>
      )}
      <BudgetItemDatalists projects={projects} />

      {/* 상태 탭 · 보기 · 일괄 작업 */}
      <div className="flex items-center gap-x-3 border-b border-warm-tan px-3 py-2 sm:px-4 sm:py-2.5">
        <FilterTabs
          label="행 상태"
          options={options}
          value={view}
          onValueChange={(v) => {
            setView(v === "all" ? null : v)
            pin(isUploadView(v) ? v : "all")
          }}
          className="min-w-0 flex-1"
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="hidden h-9 hover:bg-warm-beige md:inline-flex" aria-pressed={all} onClick={toggleMode}>
            {all ? "간단히 보기" : "모든 칸 보기"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="h-9 hover:bg-warm-beige" disabled={rows.length === 0}>
                일괄 작업
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="pb-0 text-sm font-semibold text-dark">프로젝트 한 번에 지정</DropdownMenuLabel>
              {bulkScopes.map((scope) => (
                <DropdownMenuSub key={scope.id}>
                  <DropdownMenuSubTrigger disabled={scope.keys.length === 0} className="min-h-9 text-[15px]">
                    {scope.label} {scope.keys.length}건
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-w-[min(90vw,360px)]">
                    <DropdownMenuLabel className="text-sm font-normal text-text-secondary">
                      {scope.label} {scope.keys.length}건을 이 프로젝트로
                    </DropdownMenuLabel>
                    {projects.map((p) => (
                      <DropdownMenuItem key={p.id} className="min-h-9 text-[15px]" onSelect={() => actions.bulkProject(scope.keys, p.id)}>
                        <span className="truncate">{p.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={excludedKeys.length === 0}
                className="min-h-9 text-[15px]"
                onSelect={() => actions.removeRows(excludedKeys)}
              >
                제외한 {excludedKeys.length}건 표에서 지우기
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={selectedAll.length === 0}
                className="min-h-9 text-[15px] text-red-800 focus:bg-red-50 focus:text-red-800"
                onSelect={() => actions.removeRows(selectedAll.map((r) => r.key))}
              >
                저장 대상 {selectedAll.length}건 표에서 지우기
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {inboxOnly && (
        <div className="flex flex-wrap items-center gap-x-2 border-b border-warm-tan bg-warm-ivory px-4 py-1.5 text-sm text-dark">
          <span>데스크톱 앱에서 온 증빙만 보고 있어요</span>
          <ReasonButton onClick={() => onShowAll?.()}>모두 보기</ReasonButton>
        </div>
      )}
      {stale > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 border-b border-warm-tan bg-warm-ivory px-4 py-1.5 text-sm text-dark" role="status">
          <span>처리한 {stale}건은 다른 탭으로 옮겨 갔어요</span>
          <ReasonButton onClick={() => pin(view)}>목록 새로 고치기</ReasonButton>
        </div>
      )}
      {undoBar}
      {flashBar}

      {/* 데스크톱 표 */}
      <div
        ref={scrollRef}
        onKeyDown={onKeyDown}
        className={cn("relative hidden md:block", all && "overflow-x-auto md:max-h-[70vh] md:overflow-y-auto", visible.length === 0 && "md:hidden")}
        style={viewW ? ({ "--table-view-w": `${viewW}px` } as React.CSSProperties) : undefined}
      >
        <table className={cn("border-separate border-spacing-0 text-[15px]", all ? "w-max min-w-full" : "w-full")}>
          <thead>
            <tr>
              <th className={cn(TH, "w-[128px] pl-3", all && "md:left-0 md:z-[5]")}>상태</th>
              <th className={cn(TH, "w-[52px]", all && "md:left-[132px] md:z-[5]")}>원본</th>
              <th className={TH}>
                거래일자 <span className="text-destructive">*</span>
              </th>
              <th className={TH}>
                거래처 <span className="text-destructive">*</span>
              </th>
              <th className={cn(TH, "text-right")}>
                합계(원) <span className="text-destructive">*</span>
              </th>
              <th className={TH}>비목</th>
              {all && (
                <>
                  <th className={TH}>적요</th>
                  <th className={TH}>문서 종류</th>
                  <th className={TH}>결제 수단</th>
                  <th className={TH}>사업자번호</th>
                  <th className={cn(TH, "text-right")}>공급가액</th>
                  <th className={cn(TH, "text-right")}>부가세</th>
                </>
              )}
              <th className={cn(TH, all && "md:right-0 md:z-[5] md:shadow-[inset_1px_0_0_var(--color-warm-tan)]")}>
                프로젝트 <span className="text-destructive">*</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => {
              const fp = filePosition.get(row.key)
              const st = assessments.get(row.key)
              if (!st) return null
              return (
                <Fragment key={row.key}>
                  <ReceiptRow
                    row={row}
                    st={st}
                    index={i}
                    number={numberOf.get(row.key) ?? i + 1}
                    projects={projects}
                    actions={actions}
                    expanded={expanded.has(row.key)}
                    onToggleExpand={toggleExpand}
                    filePos={fp?.pos ?? 1}
                    fileCount={fp?.count ?? 1}
                    matches={matches?.get(row.key)}
                    mode={mode}
                    fromApp={!!row.fileKey && !!inboxFileKeys?.has(row.fileKey)}
                    columnCount={columnCount}
                  />
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {all && (
          <p className="hidden gap-3 px-4 py-2 text-sm text-text-secondary md:flex">
            <span>
              <KeyHint>Tab</KeyHint> 다음 칸
            </span>
            <span>
              <KeyHint>Enter</KeyHint> 아래 행
            </span>
          </p>
        )}
      </div>

      {/* 휴대폰 카드 */}
      {visible.length > 0 && (
        <ul className="space-y-2 p-3 md:hidden">
          {visible.map((row, i) => {
            const st = assessments.get(row.key)
            if (!st) return null
            return (
              <li key={row.key} data-row-key={row.key}>
                <MobileRowCard
                  row={row}
                  st={st}
                  number={numberOf.get(row.key) ?? i + 1}
                  project={row.project_id ? projectById.get(row.project_id) : undefined}
                  actions={actions}
                  fromApp={!!row.fileKey && !!inboxFileKeys?.has(row.fileKey)}
                />
              </li>
            )
          })}
        </ul>
      )}

      {visible.length === 0 && (
        <div className="px-4 py-8 text-center text-[15px] text-text-secondary">
          {view === "all" && !inboxOnly ? (
            "표에 행이 없어요."
          ) : (
            <>
              <p>조건에 맞는 증빙이 없어요.</p>
              <div className="mt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="hover:bg-warm-beige"
                  onClick={() => {
                    setView(null)
                    pin("all")
                    if (inboxOnly) onShowAll?.()
                  }}
                >
                  전체 보기
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </fieldset>
  )
}
