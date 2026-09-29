"use client"

import { Fragment, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ChevronDown, Download, FileText, Filter, Maximize2, Plus, Trash2, TriangleAlert } from "lucide-react"
import {
  CONFIDENCE_LABELS,
  DOC_TYPE_LABELS,
  PAYMENT_LABELS,
  amountMismatch,
  formatWon,
  type ReceiptFields,
} from "@/lib/expenses"
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
  fileUrl,
  formatForeign,
  hasTableConflict,
  invalidFields,
  isImageMeta,
  rowErrors,
  rowNotices,
  similarReasonLabel,
  type DraftRow,
  type TableMatch,
  type UploaderProject,
} from "./upload-model"
import {
  CELL_TONE_CLASS,
  CellSwatch,
  Chip,
  DotList,
  KeyHint,
  Money,
  RecordCard,
  RowNote,
  StatusChip,
  TABLE_CLASS,
  type ExpenseStatus,
} from "./ui"

// 증빙 초안 표: 행 = 증빙 1건. 첫 열(선택·미리보기·상태)과 마지막 열(프로젝트 선택)은 가로 스크롤해도 고정된다(데스크톱).
// 열 순서: 날짜 → 거래처 → 합계 → 비목 → 적요 → (문서 종류·결제·사업자번호·공급가액·부가세) → 프로젝트.
// 키보드: Tab 다음 칸 · Enter 아래 행 같은 칸 · Shift+Enter 위 행. md 미만에서는 표 대신 카드 목록을 보여 준다.

export interface ReceiptTableActions {
  patchFields: (key: string, patch: Partial<ReceiptFields>) => void
  setProject: (key: string, projectId: number) => void
  checkField: (key: string, field: keyof ReceiptFields) => void
  checkAll: (key: string) => void // 그 행의 인식 불확실(노란) 표시를 모두 확인 처리
  setSelected: (key: string, selected: boolean) => void
  setSelectedMany: (keys: string[], selected: boolean) => void
  bulkProject: (keys: string[], projectId: number) => void
  removeRows: (keys: string[]) => void
  addRowForFile: (rowKey: string) => void
  openReview: (key: string) => void
  refetchFx: (key: string) => void // 외화 행: 결제일 환율 다시 받기(직접 입력한 환율을 버림)
}

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

// ── 행 상태(표·모바일 카드 공용) ──────────────────────────────────────────────
// 입력 필요(저장 불가) > 확인 필요 > 저장 가능. 선택 해제된 행은 제외. showErrors와 무관하게 처음부터 보여 준다.

const FIELD_LABEL: Partial<Record<keyof ReceiptFields, string>> = {
  doc_type: "문서 종류",
  issue_date: "거래일자",
  vendor_name: "거래처",
  vendor_biz_no: "사업자번호",
  supply_amount: "공급가액",
  vat_amount: "부가세",
  total_amount: "합계",
  payment_method: "결제 수단",
  budget_item: "비목",
  purpose: "적요",
  approval_no: "승인번호",
  memo: "메모",
  currency: "통화",
  foreign_amount: "외화 금액",
  exchange_rate: "환율",
  payroll_month: "귀속월",
}

// 1440폭 표에서 가로 스크롤 없이 보이는 칸. 나머지 칸의 노란 표시는 화면 밖(가로 스크롤 뒤·접힌 상세)에 있으므로
// 행 아래 안내 줄에 칸 이름을 적어 어디를 봐야 하는지 알린다.
const UPFRONT_FIELDS = new Set<keyof ReceiptFields>([
  "issue_date",
  "vendor_name",
  "total_amount",
  "currency",
  "foreign_amount",
  "exchange_rate",
  "budget_item",
  "purpose",
])
// '상세'(펼침) 안에 있는 칸
const DETAIL_FIELDS = new Set<keyof ReceiptFields>(["approval_no", "memo", "payroll_month"])

function fieldNames(fields: (keyof ReceiptFields)[]): string[] {
  return fields.map((f) => FIELD_LABEL[f]).filter((x): x is string => !!x)
}

function rowStatus(row: DraftRow, attention: boolean, errors: string[]): ExpenseStatus {
  return !row.selected ? "excluded" : errors.length ? "required" : attention ? "review" : "ready"
}

function rowState(row: DraftRow, project: UploaderProject | undefined, matches: TableMatch[] | undefined) {
  const errors = rowErrors(row)
  const notices = rowNotices(row, project)
  const conflict = hasTableConflict(row, matches)
  const pendingLow = row.lowFields.filter((f) => !row.checkedFields.includes(f))
  const attention =
    row.duplicates.length > 0 ||
    row.similar.length > 0 ||
    conflict ||
    row.warnings.length > 0 ||
    notices.length > 0 ||
    row.serverErrors.length > 0 ||
    pendingLow.length > 0
  // 인식한 내용이 전혀 없는 빈 초안에는 "전체를 잘 읽지 못했다"는 안내가 중복이므로 생략한다.
  const readSomething = !!row.aiRaw && !!(row.aiRaw.vendor_name || row.aiRaw.issue_date || row.aiRaw.total_amount !== null)
  const lowOverall = row.confidence === "low" && readSomething
  const matchInfo = !!matches && matches.length > 0 && (conflict || (!row.selected && matches.some((m) => m.otherSelected)))
  return { errors, notices, conflict, pendingLow, attention, lowOverall, matchInfo, status: rowStatus(row, attention, errors) }
}

function StatusCell({ status, errors, pendingLow }: { status: ExpenseStatus; errors: string[]; pendingLow: (keyof ReceiptFields)[] }) {
  const lowNames = fieldNames(pendingLow)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={-1} className="inline-flex cursor-help">
          <StatusChip status={status} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        {status === "required" ? (
          <div>
            <p className="font-semibold">입력 필요</p>
            <ul className="mt-1 list-disc pl-4">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : status === "review" ? (
          lowNames.length > 0 ? `확인 필요: ${lowNames.join(" · ")}` : "행 아래 안내 확인"
        ) : status === "ready" ? (
          "저장 가능"
        ) : (
          "저장 대상 아님"
        )}
      </TooltipContent>
    </Tooltip>
  )
}

// ── 행 아래 안내 줄(표·검토 창 공용) ──────────────────────────────────────────
// 빨강은 저장 대상에 남아 이중 계상될 수 있는 것에만 쓴다. 이미 선택 해제된 중복은 회색으로 둔다.

// 이미 저장된 증빙과 같은 파일
export function DuplicateNote({ row }: { row: DraftRow }) {
  if (row.duplicates.length === 0) return null
  return (
    <>
      {row.duplicates.slice(0, 3).map((d) => (
        <RowNote
          key={d.id}
          label={row.selected ? "중복" : "중복 · 제외"}
          tone={row.selected ? "danger" : "neutral"}
          title="같은 증빙이면 저장하지 마세요. 다른 증빙이면 체크해서 저장하세요."
        >
          <DotList items={["이미 저장된 파일", d.project_name, d.issue_date, d.vendor_name, formatWon(d.total_amount)]} />
        </RowNote>
      ))}
      {row.duplicates.length > 3 && <p className="text-xs text-text-secondary">중복 외 {row.duplicates.length - 3}건</p>}
    </>
  )
}

// 이미 저장된 증빙 중 같은 거래로 보이는 것(파일은 다름) — 표와 검토 창이 함께 쓴다.
export function SimilarNote({ row }: { row: DraftRow }) {
  if (row.similar.length === 0) return null
  return (
    <>
      {row.similar.slice(0, 3).map((d) => (
        <RowNote
          key={d.id}
          label={row.selected ? "중복 의심" : "중복 의심 · 제외"}
          tone={row.selected ? "danger" : "neutral"}
          title="같은 거래의 다른 서류(세금계산서·이체확인증 등)면 한 건만 저장하세요."
        >
          <DotList items={[d.project_name, d.issue_date, d.vendor_name, formatWon(d.total_amount), similarReasonLabel(d.reason)]} />
        </RowNote>
      ))}
      {row.similar.length > 3 && <p className="text-xs text-text-secondary">중복 의심 외 {row.similar.length - 3}건</p>}
    </>
  )
}

// 표 안의 다른 행과 같은 파일·같은 거래로 보일 때. 둘 다 선택돼 있으면 경고, 이 행만 빠져 있으면 이유를 조용히 알려 준다.
export function TableMatchNote({ row, matches }: { row: DraftRow; matches: TableMatch[] | undefined }) {
  if (!matches || matches.length === 0) return null
  const conflict = row.selected ? matches.filter((m) => m.otherSelected) : []
  if (conflict.length > 0) {
    return (
      <>
        {conflict.map((m) => (
          <RowNote key={m.otherKey} label="중복 의심" tone="danger" title="같은 거래라면 한쪽의 체크를 해제하세요.">
            <b className="font-semibold">{m.otherNumber}번 행</b>({m.otherLabel})과 {TABLE_MATCH_TEXT[m.kind]} · 둘 다 저장 시 중복 계상
          </RowNote>
        ))}
      </>
    )
  }
  const informative = !row.selected ? matches.filter((m) => m.otherSelected) : []
  if (informative.length === 0) return null
  const m = informative[0]
  return (
    <RowNote label="제외" tone="neutral" title="다른 거래가 맞으면 체크해서 함께 저장하세요.">
      {m.otherNumber}번 행({m.otherLabel})과 {m.kind === "same_file" ? "같은 파일" : "같은 거래로 보임"}
    </RowNote>
  )
}

// 저장은 막지 않는 확인 사항(금액 불일치·기간 밖·예산 외·인식 경고). 3개 이상이면 앞 2개만 보이고 나머지는 접는다.
// muted: 이미 저장 대상에서 빠진 행 — 경고색 대신 회색으로 낮춘다.
export function CheckNotes({ items, muted = false }: { items: string[]; muted?: boolean }) {
  if (items.length === 0) return null
  const head = items.length >= 3 ? items.slice(0, 2) : items
  const rest = items.length >= 3 ? items.slice(2) : []
  const tone = muted ? "neutral" : "warning"
  return (
    <>
      {head.map((w, i) => (
        <RowNote key={`w${i}`} label="확인" tone={tone}>
          {w}
        </RowNote>
      ))}
      {rest.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-xs font-medium text-dark">확인 {rest.length}건 더</summary>
          <div className="mt-1 space-y-1">
            {rest.map((w, i) => (
              <RowNote key={`r${i}`} label="확인" tone={tone}>
                {w}
              </RowNote>
            ))}
          </div>
        </details>
      )}
    </>
  )
}

const TH = cn(TABLE_CLASS.th, "px-1.5 md:sticky md:top-0 md:z-[4]")
const TD = "border-b border-warm-tan/60 px-1.5 py-1.5 align-middle"
// 고정 열은 불투명 배경이 있어야 뒤로 지나가는 칸이 비치지 않는다.
const STICKY_LEFT = "md:sticky md:left-0 md:z-[3] md:shadow-[inset_-1px_0_0_var(--color-warm-tan)]"
const STICKY_RIGHT = "md:sticky md:right-0 md:z-[3] md:shadow-[inset_1px_0_0_var(--color-warm-tan)]"

function Thumbnail({ row, filePos, fileCount, onOpen }: { row: DraftRow; filePos: number; fileCount: number; onOpen: () => void }) {
  const [broken, setBroken] = useState(false)
  const image = isImageMeta(row.file)
  return (
    <button
      type="button"
      onClick={onOpen}
      title="원본 보기"
      aria-label={`${row.file.name} 원본 보기`}
      className="group/thumb relative block h-8 w-8 shrink-0 overflow-hidden rounded-md border border-warm-tan bg-warm-beige/50 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {image && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fileUrl(row.file.pathname)}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
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

// 합계 칸. 원화: [KRW][합계]. 외화: [USD][외화 금액] / × [환율] = [원화 합계]원 / 환율 기준일·출처.
// 외화 행에서도 원화 합계를 고칠 수 있다(그러면 환율은 '직접 입력').
function AmountCell({
  row,
  st,
  patch,
  seen,
  grid,
  mismatch,
  onRefetch,
}: {
  row: DraftRow
  st: (field: keyof ReceiptFields) => CellState
  patch: (p: Partial<ReceiptFields>) => void
  seen: (field: keyof ReceiptFields) => () => void
  grid: (col: string) => GridProps
  mismatch: boolean
  onRefetch: () => void
}) {
  const f = row.fields
  const warn = (
    <span className="flex w-4 shrink-0 justify-center">
      {mismatch && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-help text-amber-700" aria-label="금액 불일치: 공급가액+부가세 ≠ 합계">
              <TriangleAlert className="h-3.5 w-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent>금액 불일치: 공급가액+부가세 ≠ 합계</TooltipContent>
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
      <div className="flex items-center gap-1">
        {warn}
        {currency}
        <MoneyInput value={f.total_amount} onChange={(v) => patch({ total_amount: v })} onBlur={seen("total_amount")} state={st("total_amount")} className="w-[112px] font-semibold" grid={grid("total_amount")} aria-label="합계" />
      </div>
    )
  }
  return (
    <div className="w-[276px] space-y-1">
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
          className="w-[84px] shrink-0 px-1.5"
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

const SOURCE_LABEL: Record<string, string> = {
  default: "기본 프로젝트",
  single: "유일한 프로젝트",
  bulk: "일괄 지정",
}

const COLUMN_COUNT = 12

interface RowProps {
  row: DraftRow
  index: number // 보이는 행 기준(키보드 이동용)
  number: number // 전체 표 기준 번호(1부터)
  project: UploaderProject | undefined
  projects: UploaderProject[]
  actions: ReceiptTableActions
  expanded: boolean
  onToggleExpand: (key: string) => void
  filePos: number
  fileCount: number
  matches: TableMatch[] | undefined // 표 안의 다른 행과 같은 파일·같은 거래로 보임
}

const ReceiptRow = memo(function ReceiptRow({
  row,
  index,
  number,
  project,
  projects,
  actions,
  expanded,
  onToggleExpand,
  filePos,
  fileCount,
  matches,
}: RowProps) {
  const { errors, notices, pendingLow, attention, lowOverall, matchInfo, status } = rowState(row, project, matches)
  const invalid = invalidFields(row)
  const f = row.fields
  const key = row.key

  const st = (field: keyof ReceiptFields): CellState => ({
    low: row.lowFields.includes(field) && !row.checkedFields.includes(field),
    invalid: row.showErrors && !!invalid[field],
  })
  const grid = (col: string) => ({ "data-grid-row": index, "data-grid-col": col })
  const patch = (p: Partial<ReceiptFields>) => actions.patchFields(key, p)
  const seen = (field: keyof ReceiptFields) => () => actions.checkField(key, field)
  const mismatch = amountMismatch(f)
  // 화면 밖(가로 스크롤 뒤·접힌 상세)에 있는 노란 칸
  const hiddenLow = pendingLow.filter((field) => !UPFRONT_FIELDS.has(field))
  const detailLow = pendingLow.some((field) => DETAIL_FIELDS.has(field))

  const bg = row.selected ? "bg-card" : "bg-warm-ivory"
  // 왼쪽 4px 띠: 입력 필요(빨강) · 확인 필요(amber-600). 저장 가능·제외는 없음.
  const stripe = !row.selected
    ? "before:bg-transparent"
    : errors.length > 0
      ? "before:bg-destructive"
      : attention
        ? "before:bg-amber-600"
        : "before:bg-transparent"

  const showNotes =
    row.serverErrors.length > 0 ||
    (row.showErrors && errors.length > 0) ||
    row.duplicates.length > 0 ||
    row.similar.length > 0 ||
    matchInfo ||
    row.warnings.length > 0 ||
    notices.length > 0 ||
    lowOverall ||
    hiddenLow.length > 0

  const aiSuggested = row.projectSource === "ai" && !!row.project_id

  return (
    <>
      <tr data-row-key={key} className={cn(bg, !row.selected && "text-text-secondary")}>
        {/* 번호 · 선택 · 미리보기 · 상태 (왼쪽 고정) */}
        <td
          className={cn(
            TD,
            bg,
            STICKY_LEFT,
            "relative pl-3 before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
            stripe
          )}
        >
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right text-xs font-medium tabular-nums text-text-secondary">{number}</span>
            <Checkbox
              checked={row.selected}
              onCheckedChange={(v) => actions.setSelected(key, v === true)}
              aria-label={`${number}번 행 저장 대상으로 선택`}
            />
            <Thumbnail row={row} filePos={filePos} fileCount={fileCount} onOpen={() => actions.openReview(key)} />
            <StatusCell status={status} errors={errors} pendingLow={pendingLow} />
          </div>
        </td>
        <td className={TD}>
          <DateCell value={f.issue_date} onChange={(v) => patch({ issue_date: v })} onBlur={seen("issue_date")} state={st("issue_date")} className="w-[128px]" grid={grid("issue_date")} aria-label="거래일자" />
        </td>
        <td className={TD}>
          <TextCell value={f.vendor_name} onChange={(v) => patch({ vendor_name: v })} onBlur={seen("vendor_name")} state={st("vendor_name")} maxLength={200} placeholder="거래처명" className="w-[168px]" grid={grid("vendor_name")} aria-label="거래처" />
        </td>
        <td className={TD}>
          <AmountCell row={row} st={st} patch={patch} seen={seen} grid={grid} mismatch={mismatch} onRefetch={() => actions.refetchFx(key)} />
        </td>
        <td className={TD}>
          <TextCell value={f.budget_item} onChange={(v) => patch({ budget_item: v })} onBlur={seen("budget_item")} state={st("budget_item")} maxLength={100} list={budgetListId(row.project_id)} placeholder="비목" className="w-[120px]" grid={grid("budget_item")} aria-label="비목" />
        </td>
        <td className={TD}>
          <div className="flex items-center gap-1">
            <TextCell value={f.purpose} onChange={(v) => patch({ purpose: v })} onBlur={seen("purpose")} state={st("purpose")} placeholder="적요" className="w-[200px]" grid={grid("purpose")} aria-label="적요" />
            <button
              type="button"
              onClick={() => onToggleExpand(key)}
              aria-expanded={expanded}
              title={detailLow ? "승인번호 · 메모 · 품목 (확인 필요 칸 있음)" : "승인번호 · 메모 · 품목"}
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
          <DocTypeSelect value={f.doc_type} onChange={(v) => patch({ doc_type: v })} onSeen={seen("doc_type")} state={st("doc_type")} className="w-[112px]" aria-label="문서 종류" />
        </td>
        <td className={TD}>
          <PaymentSelect value={f.payment_method} onChange={(v) => patch({ payment_method: v })} onSeen={seen("payment_method")} state={st("payment_method")} className="w-[96px]" aria-label="결제 수단" />
        </td>
        <td className={TD}>
          <BizNoInput value={f.vendor_biz_no} onChange={(v) => patch({ vendor_biz_no: v })} onBlur={seen("vendor_biz_no")} state={st("vendor_biz_no")} className="w-[128px]" grid={grid("vendor_biz_no")} aria-label="사업자등록번호" />
        </td>
        <td className={TD}>
          <MoneyInput value={f.supply_amount} onChange={(v) => patch({ supply_amount: v })} onBlur={seen("supply_amount")} state={st("supply_amount")} className="w-[112px]" grid={grid("supply_amount")} aria-label="공급가액" />
        </td>
        <td className={TD}>
          <MoneyInput value={f.vat_amount} onChange={(v) => patch({ vat_amount: v })} onBlur={seen("vat_amount")} state={st("vat_amount")} className="w-[100px]" grid={grid("vat_amount")} aria-label="부가세" />
        </td>
        {/* 프로젝트 선택 · 삭제 (오른쪽 고정) */}
        <td className={cn(TD, bg, STICKY_RIGHT, "pr-2")}>
          <div className="flex items-center gap-1">
            {row.projectSource && row.projectSource !== "ai" && SOURCE_LABEL[row.projectSource] && row.project_id ? (
              <span className="sr-only">{SOURCE_LABEL[row.projectSource]}</span>
            ) : null}
            <ProjectSelect
              value={row.project_id}
              onChange={(id) => actions.setProject(key, id)}
              projects={projects}
              aiSuggestedId={row.aiRaw?.suggested_project_id ?? null}
              suggested={aiSuggested}
              title={aiSuggested ? (row.projectReason ? `추천 근거: ${row.projectReason}` : "증빙 내용 기준 추천 · 확인 필요") : undefined}
              state={{ invalid: row.showErrors && !row.project_id }}
              placeholder="프로젝트 선택 필요"
              className="w-[208px]"
              aria-label="프로젝트 선택"
            />
            <button
              type="button"
              onClick={() => actions.removeRows([key])}
              title="행 삭제"
              aria-label={`${number}번 행 삭제`}
              className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>

      {showNotes && (
        <tr className={bg}>
          <td colSpan={COLUMN_COUNT} className="border-b border-warm-tan/60 p-0">
            <div className="sticky left-0 w-[var(--table-view-w,100%)] space-y-1 px-3 pb-2 pt-1">
              {row.serverErrors.map((e, i) => (
                <RowNote key={`s${i}`} label="서버 확인" tone="danger">
                  {e}
                </RowNote>
              ))}
              {row.showErrors && errors.length > 0 && (
                <RowNote label="입력 필요" tone="danger">
                  {errors.join(" · ")}
                </RowNote>
              )}
              <DuplicateNote row={row} />
              <SimilarNote row={row} />
              <TableMatchNote row={row} matches={matches} />
              {hiddenLow.length > 0 && (
                <RowNote
                  label="확인 필요"
                  tone={row.selected ? "warning" : "neutral"}
                  title={detailLow ? "승인번호·메모는 적요 옆 '상세'를 펼치면 보입니다." : "표를 오른쪽으로 넘기면 보입니다."}
                >
                  {fieldNames(hiddenLow).join(" · ")} 칸 원본 대조
                </RowNote>
              )}
              {lowOverall && (
                <RowNote label="신뢰도 낮음" tone={row.selected ? "warning" : "neutral"}>
                  원본과 전체 대조 필요
                </RowNote>
              )}
              <CheckNotes items={[...notices, ...row.warnings]} muted={!row.selected} />
            </div>
          </td>
        </tr>
      )}

      {expanded && (
        <tr className={bg}>
          <td colSpan={COLUMN_COUNT} className="border-b border-warm-tan/60 p-0">
            <div className="sticky left-0 w-[var(--table-view-w,100%)] px-3 pb-3 pt-1">
              <div className="grid gap-4 rounded-md border border-warm-tan p-3 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                <div className="space-y-2.5">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-text-secondary">승인번호</span>
                    <TextCell value={f.approval_no} onChange={(v) => patch({ approval_no: v })} onBlur={seen("approval_no")} state={st("approval_no")} maxLength={50} placeholder="카드 승인번호" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-text-secondary">메모</span>
                    <TextCell value={f.memo} onChange={(v) => patch({ memo: v })} onBlur={seen("memo")} state={st("memo")} placeholder="내부 메모" />
                  </label>
                  {f.doc_type === "payroll" && (
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-secondary">귀속월</span>
                      <MonthCell value={f.payroll_month} onChange={(v) => patch({ payroll_month: v })} onBlur={seen("payroll_month")} state={st("payroll_month")} aria-label="귀속월" />
                    </label>
                  )}
                  <div className="space-y-1 text-xs text-text-secondary">
                    {row.confidence && (
                      <p>
                        인식 신뢰도: <b className="text-dark">{CONFIDENCE_LABELS[row.confidence]}</b>
                      </p>
                    )}
                    {row.manual && <p>직접 입력 행</p>}
                    <p className="truncate" title={row.file.name}>
                      원본: {row.file.name}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => actions.openReview(key)}>
                      <Maximize2 className="h-3.5 w-3.5" />
                      원본 대조
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" asChild>
                      <a href={fileUrl(row.file.pathname, { name: row.file.name })}>
                        <Download className="h-3.5 w-3.5" />
                        원본 받기
                      </a>
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => actions.addRowForFile(key)}>
                      <Plus className="h-3.5 w-3.5" />
                      이 파일로 행 추가
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-text-secondary">품목</p>
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

// 모바일 카드의 안내 칩: 가장 구체적인 것 하나만 칩으로 보이고 나머지는 개수로만 알린다(자세한 내용은 검토 창).
// 순서는 심각도 순. 이미 저장 대상에서 빠진 행은 모두 회색으로 낮춘다.
function mobileCues(
  row: DraftRow,
  st: ReturnType<typeof rowState>,
  matches: TableMatch[] | undefined
): { tone: "danger" | "warning" | "neutral"; text: string; title?: string }[] {
  const sel = row.selected
  const cues: { tone: "danger" | "warning" | "neutral"; text: string; title?: string }[] = []
  if (row.serverErrors.length > 0) cues.push({ tone: "danger", text: "서버 확인", title: row.serverErrors.join(" · ") })
  // 제외된 행은 상태 칩이 이미 '제외'이므로 사유만 적는다.
  if (row.duplicates.length > 0) cues.push({ tone: sel ? "danger" : "neutral", text: "중복", title: "이미 저장된 파일" })
  if (row.similar.length > 0 || st.conflict) cues.push({ tone: sel ? "danger" : "neutral", text: "중복 의심" })
  else if (st.matchInfo && !sel) {
    const m = matches?.find((x) => x.otherSelected)
    if (m) cues.push({ tone: "neutral", text: `${m.otherNumber}번과 ${m.kind === "same_file" ? "같은 파일" : "같은 거래"}` })
  }
  if (st.pendingLow.length > 0) {
    const names = fieldNames(st.pendingLow)
    const shown = names.slice(0, 2).join(" · ") + (names.length > 2 ? ` 외 ${names.length - 2}` : "")
    cues.push({ tone: sel ? "warning" : "neutral", text: `확인: ${shown}`, title: `확인 필요: ${names.join(" · ")}` })
  }
  if (st.lowOverall) cues.push({ tone: sel ? "warning" : "neutral", text: "신뢰도 낮음" })
  const checks = st.notices.length + row.warnings.length
  if (checks > 0)
    cues.push({ tone: sel ? "warning" : "neutral", text: `확인 ${checks}건`, title: [...st.notices, ...row.warnings].join(" · ") })
  return cues
}

// md 미만: 표 대신 행 카드. 누르면 검토 창(원본 + 입력칸)이 열린다.
function MobileRowCard({
  row,
  number,
  project,
  matches,
  actions,
}: {
  row: DraftRow
  number: number
  project: UploaderProject | undefined
  matches: TableMatch[] | undefined
  actions: ReceiptTableActions
}) {
  const st = rowState(row, project, matches)
  const { status } = st
  const f = row.fields
  const cues = mobileCues(row, st, matches)
  const cue: ReactNode = cues.length > 0 && (
    <>
      <Chip tone={cues[0].tone} title={cues[0].title}>
        {cues[0].text}
      </Chip>
      {cues.length > 1 && (
        <span className="text-text-secondary" title={cues.slice(1).map((c) => c.text).join(" · ")}>
          외 {cues.length - 1}건
        </span>
      )}
    </>
  )
  const suggested = row.projectSource === "ai" && !!row.project_id
  return (
    <RecordCard
      tone={status === "required" ? "danger" : status === "review" ? "warning" : status === "excluded" ? "muted" : "default"}
      leading={
        <Checkbox
          checked={row.selected}
          onCheckedChange={(v) => actions.setSelected(row.key, v === true)}
          aria-label={`${number}번 행 저장 대상으로 선택`}
        />
      }
      title={f.vendor_name || "거래처 미입력"}
      amount={<Money value={f.total_amount} unit />}
      meta={
        <DotList
          items={[
            `${number}번`,
            f.issue_date || "날짜 미입력",
            f.currency !== "KRW" ? `${f.currency} ${formatForeign(f.foreign_amount, f.currency) || "금액 미입력"}` : null,
            DOC_TYPE_LABELS[f.doc_type],
            PAYMENT_LABELS[f.payment_method],
          ]}
        />
      }
      footer={
        <>
          <StatusChip status={status} />
          {cue}
          {project ? (
            <span className="min-w-0 truncate font-medium">
              {project.name}
              {suggested && <span className="font-normal text-text-secondary"> (추천)</span>}
            </span>
          ) : (
            <Chip tone={row.selected ? "danger" : "neutral"}>프로젝트 선택 필요</Chip>
          )}
        </>
      }
      onOpen={() => actions.openReview(row.key)}
      openLabel={`${number}번 행 원본 보며 확인`}
    />
  )
}

export function ReceiptTable({
  rows,
  projects,
  actions,
  matches,
  saving = false,
}: {
  rows: DraftRow[]
  projects: UploaderProject[]
  actions: ReceiptTableActions
  matches?: Map<string, TableMatch[]> // 표 안의 같은 파일·같은 거래 표시(findTableMatches)
  saving?: boolean // 저장 요청 중에는 표를 잠근다(그사이 고친 값이 버려지지 않도록)
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewW, setViewW] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  // '확인 필요만 보기': 켤 때의 목록을 고정한다. 입력하는 도중 확인이 끝났다고 행이 사라지면
  // 포커스와 나머지 입력이 날아가고(합계 '15000'이 '1'로 잘림) 키보드 위치도 잃기 때문이다.
  // known: 켤 때 표에 있던 행 · keep: 그중 보여 줄 행. 켠 뒤에 새로 들어온 행은 확인이 필요하면 보여 준다.
  const [attentionFilter, setAttentionFilter] = useState<{ known: Set<string>; keep: Set<string> } | null>(null)
  const onlyAttention = attentionFilter !== null

  // 설명 줄(경고·상세)을 화면 폭에 맞춰 고정하기 위해 스크롤 영역 폭을 잰다.
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

  const attentionKeys = useMemo(
    () =>
      new Set(
        rows
          .filter((r) => rowNeedsAttention(r, r.project_id ? projectById.get(r.project_id) : undefined, matches?.get(r.key)))
          .map((r) => r.key)
      ),
    [rows, projectById, matches]
  )

  // 필터를 켠 뒤 새로 들어온 행(인식 완료·"행 추가")을 고정 목록에 합친다.
  useEffect(() => {
    if (!attentionFilter) return
    const fresh = rows.filter((r) => !attentionFilter.known.has(r.key))
    if (fresh.length === 0) return
    setAttentionFilter((prev) => {
      if (!prev) return prev
      const known = new Set(prev.known)
      const keep = new Set(prev.keep)
      for (const r of fresh) {
        known.add(r.key)
        if (attentionKeys.has(r.key)) keep.add(r.key)
      }
      return { known, keep }
    })
  }, [rows, attentionFilter, attentionKeys])

  const toggleAttention = () =>
    setAttentionFilter((prev) => (prev ? null : { known: new Set(rows.map((r) => r.key)), keep: new Set(attentionKeys) }))
  const refreshAttention = () => setAttentionFilter({ known: new Set(rows.map((r) => r.key)), keep: new Set(attentionKeys) })

  const visible = attentionFilter
    ? rows.filter((r) => attentionFilter.keep.has(r.key) || (!attentionFilter.known.has(r.key) && attentionKeys.has(r.key)))
    : rows
  // 필터 중에 확인을 마친 행(목록에는 그대로 둔다)
  const resolvedVisible = attentionFilter ? visible.filter((r) => !attentionKeys.has(r.key)).length : 0
  const numberOf = new Map(rows.map((r, i) => [r.key, i + 1]))
  const visibleKeys = visible.map((r) => r.key)
  const selectedVisible = visible.filter((r) => r.selected)
  const allChecked = visible.length > 0 && selectedVisible.length === visible.length
  const someChecked = selectedVisible.length > 0 && !allChecked
  const selectedAll = rows.filter((r) => r.selected)
  const selectedSum = selectedAll.reduce((acc, r) => acc + (typeof r.fields.total_amount === "number" ? r.fields.total_amount : 0), 0)
  const selectedWithoutProject = selectedAll.some((r) => !r.project_id)

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
        <p role="status" className="border-b border-warm-tan bg-warm-beige px-4 py-1.5 text-xs text-dark">
          저장 중… (편집 잠금)
        </p>
      )}
      <BudgetItemDatalists projects={projects} />

      {/* 툴바: 선택 · 일괄 지정 · 합계 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warm-tan px-4 py-2.5">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-dark">
          <Checkbox
            checked={allChecked ? true : someChecked ? "indeterminate" : false}
            onCheckedChange={(v) => actions.setSelectedMany(visibleKeys, v === true)}
            aria-label="보이는 행 전체 선택"
          />
          전체 선택
        </label>
        <span className="text-sm tabular-nums text-text-secondary">
          {selectedAll.length}/{rows.length}건 선택
        </span>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select
            value=""
            onValueChange={(v) => actions.bulkProject(selectedAll.map((r) => r.key), Number(v))}
            disabled={selectedAll.length === 0}
          >
            <SelectTrigger
              className={cn("h-8 w-full bg-card text-sm sm:w-[240px]", selectedWithoutProject && "border-destructive/60")}
              aria-label="선택한 행의 프로젝트를 한 번에 지정"
            >
              <SelectValue placeholder={selectedAll.length > 0 ? `프로젝트 일괄 지정(${selectedAll.length}건)` : "프로젝트 일괄 지정"} />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-sm text-text-secondary hover:text-destructive"
            disabled={selectedAll.length === 0}
            onClick={() => actions.removeRows(selectedAll.map((r) => r.key))}
          >
            <Trash2 className="h-3.5 w-3.5" />
            선택 행 삭제
          </Button>
          <Button
            type="button"
            size="sm"
            variant={onlyAttention ? "secondary" : "ghost"}
            className={cn("h-8 text-sm", onlyAttention && "border border-dark/30")}
            onClick={toggleAttention}
            aria-pressed={onlyAttention}
          >
            <Filter className="h-3.5 w-3.5" />
            {onlyAttention ? `안내 있는 행만 보는 중 · 남은 ${attentionKeys.size}건` : `안내 있는 행 ${attentionKeys.size}건만 보기`}
          </Button>
          {onlyAttention && resolvedVisible > 0 && (
            <Button type="button" size="sm" variant="ghost" className="h-8 text-sm text-dark" onClick={refreshAttention}>
              처리한 {resolvedVisible}건 숨기기
            </Button>
          )}
        </div>

        <p className="ml-auto text-sm text-text-secondary">
          선택 {selectedAll.length}건 · <b className="whitespace-nowrap font-semibold tabular-nums text-dark">{formatWon(selectedSum)}</b>
        </p>
      </div>

      {/* 범례(데스크톱) */}
      <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 border-b border-warm-tan px-4 py-2 text-xs text-text-secondary md:flex">
        <span className="inline-flex items-center gap-1">
          <CellSwatch kind="review" />
          확인 필요
        </span>
        <span className="inline-flex items-center gap-1">
          <CellSwatch kind="invalid" />
          입력 오류
        </span>
        <span>
          <KeyHint>Tab</KeyHint> 다음 칸
        </span>
        <span>
          <KeyHint>Enter</KeyHint> 아래 행
        </span>
        <span>썸네일 클릭: 원본 대조</span>
      </div>

      <div
        ref={scrollRef}
        onKeyDown={onKeyDown}
        className={cn("relative hidden overflow-x-auto md:block md:max-h-[70vh] md:overflow-y-auto", visible.length === 0 && "md:hidden")}
        style={viewW ? ({ "--table-view-w": `${viewW}px` } as React.CSSProperties) : undefined}
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className={cn(TH, "pl-3 md:left-0 md:z-[5] md:shadow-[inset_-1px_0_0_var(--color-warm-tan)]")}>
                <span className="sr-only">번호·선택·미리보기·상태</span>
                <span aria-hidden>증빙</span>
              </th>
              <th className={TH}>
                거래일자 <span className="text-destructive">*</span>
              </th>
              <th className={TH}>
                거래처 <span className="text-destructive">*</span>
              </th>
              <th className={cn(TH, "text-right")}>
                합계 <span className="text-destructive">*</span>
              </th>
              <th className={TH}>비목</th>
              <th className={TH}>적요</th>
              <th className={TH}>문서 종류</th>
              <th className={TH}>결제 수단</th>
              <th className={TH}>사업자번호</th>
              <th className={cn(TH, "text-right")}>공급가액</th>
              <th className={cn(TH, "text-right")}>부가세</th>
              <th className={cn(TH, "md:right-0 md:z-[5] md:shadow-[inset_1px_0_0_var(--color-warm-tan)]")}>
                프로젝트 <span className="text-destructive">*</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => {
              const fp = filePosition.get(row.key)
              return (
                <Fragment key={row.key}>
                  <ReceiptRow
                    row={row}
                    index={i}
                    number={numberOf.get(row.key) ?? i + 1}
                    project={row.project_id ? projectById.get(row.project_id) : undefined}
                    projects={projects}
                    actions={actions}
                    expanded={expanded.has(row.key)}
                    onToggleExpand={toggleExpand}
                    filePos={fp?.pos ?? 1}
                    fileCount={fp?.count ?? 1}
                    matches={matches?.get(row.key)}
                  />
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {visible.length > 0 && (
        <ul className="space-y-2 p-3 md:hidden">
          {visible.map((row, i) => (
            <li key={row.key} data-row-key={row.key}>
              <MobileRowCard
                row={row}
                number={numberOf.get(row.key) ?? i + 1}
                project={row.project_id ? projectById.get(row.project_id) : undefined}
                matches={matches?.get(row.key)}
                actions={actions}
              />
            </li>
          ))}
        </ul>
      )}

      {visible.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-text-secondary">
          {onlyAttention ? (
            <>
              안내 있는 행 없음 ·{" "}
              <button type="button" className="font-medium text-dark underline underline-offset-2" onClick={() => setAttentionFilter(null)}>
                전체 보기
              </button>
            </>
          ) : (
            "표에 행이 없습니다."
          )}
        </p>
      )}
    </fieldset>
  )
}
