"use client"

import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Copy,
  Download,
  FileText,
  Filter,
  Maximize2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react"
import { CONFIDENCE_LABELS, amountMismatch, formatWon, type ReceiptFields } from "@/lib/expenses"
import {
  BizNoInput,
  DateCell,
  DocTypeSelect,
  ItemsEditor,
  LowConfidenceMark,
  MoneyInput,
  PaymentSelect,
  ProjectSelect,
  TextCell,
  type CellState,
} from "./upload-fields"
import {
  DEFAULT_BUDGET_ITEM_SUGGESTIONS,
  TABLE_MATCH_TEXT,
  fileUrl,
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

// 증빙 초안 표: 행 = 증빙 1건. 첫 열(선택·미리보기)과 마지막 열(프로젝트 선택)은 가로 스크롤해도 고정된다(데스크톱).
// 키보드: Tab 오른쪽 칸 · Enter 아래 행 같은 칸 · Shift+Enter 위 행.

export interface ReceiptTableActions {
  patchFields: (key: string, patch: Partial<ReceiptFields>) => void
  setProject: (key: string, projectId: number) => void
  checkField: (key: string, field: keyof ReceiptFields) => void
  checkAll: (key: string) => void // 그 행의 AI 불확실(노란) 표시를 모두 확인 처리
  setSelected: (key: string, selected: boolean) => void
  setSelectedMany: (keys: string[], selected: boolean) => void
  bulkProject: (keys: string[], projectId: number) => void
  removeRows: (keys: string[]) => void
  addRowForFile: (rowKey: string) => void
  openReview: (key: string) => void
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

// 이미 저장된 증빙 중 같은 거래로 보이는 것(파일은 다름) — 표와 검토 창이 함께 쓴다.
export function SimilarNote({ row }: { row: DraftRow }) {
  if (row.similar.length === 0) return null
  return (
    <div className="flex gap-1.5 text-destructive">
      <Copy className="mt-px h-3.5 w-3.5 shrink-0" />
      <div>
        <p className="font-medium">
          이미 저장된 증빙 중 같은 거래로 보이는 것이 있습니다 — 같은 거래의 다른 서류(세금계산서·이체확인증 등)라면 이 행은 빼세요. 다른
          거래가 맞으면 체크해서 저장하세요.
        </p>
        <ul className="mt-0.5 text-destructive/90">
          {row.similar.slice(0, 3).map((d) => (
            <li key={d.id}>
              · {d.project_name} · {d.issue_date} · {d.vendor_name} · {formatWon(d.total_amount)} ({similarReasonLabel(d.reason)})
            </li>
          ))}
          {row.similar.length > 3 && <li>· 외 {row.similar.length - 3}건</li>}
        </ul>
      </div>
    </div>
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
          <p key={m.otherKey} className="flex gap-1.5 text-destructive">
            <Copy className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              <b>{m.otherNumber}번 행</b>({m.otherLabel})과 {TABLE_MATCH_TEXT[m.kind]} — 둘 다 저장하면 두 번 계상됩니다. 같은 거래라면
              한쪽의 체크를 해제하세요.
            </span>
          </p>
        ))}
      </>
    )
  }
  const informative = !row.selected ? matches.filter((m) => m.otherSelected) : []
  if (informative.length === 0) return null
  const m = informative[0]
  return (
    <p className="flex gap-1.5 text-text-secondary">
      <Copy className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>
        {m.otherNumber}번 행({m.otherLabel})과 {m.kind === "same_file" ? "같은 파일이라" : "같은 거래로 보여"} 이 행은 저장 대상에서
        뺐습니다. 다른 거래가 맞으면 체크해서 함께 저장하세요.
      </span>
    </p>
  )
}

const TH =
  "whitespace-nowrap border-b border-warm-tan bg-warm-beige px-1.5 py-2 text-left text-xs font-semibold text-text-secondary md:sticky md:top-0 md:z-[4]"
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
      title="크게 보며 확인하기"
      aria-label={`${row.file.name} 크게 보기`}
      className="group/thumb relative block h-11 w-11 shrink-0 overflow-hidden rounded-md border border-warm-tan bg-warm-beige/50 outline-none focus-visible:ring-[3px] focus-visible:ring-gold/50"
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
        <span className="flex h-full w-full flex-col items-center justify-center text-text-secondary">
          <FileText className="h-4 w-4" />
          <span className="text-[8px] font-semibold">{/\.pdf$/i.test(row.file.name) || row.file.type === "application/pdf" ? "PDF" : "파일"}</span>
        </span>
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-dark/40 opacity-0 transition-opacity group-hover/thumb:opacity-100">
        <Maximize2 className="h-4 w-4 text-white" />
      </span>
      {fileCount > 1 && (
        <span className="absolute bottom-0 right-0 rounded-tl bg-dark/80 px-1 text-[9px] leading-tight text-white">
          {filePos}/{fileCount}
        </span>
      )}
    </button>
  )
}

function StatusIcon({ errors, showErrors, attention }: { errors: string[]; showErrors: boolean; attention: boolean }) {
  const ready = errors.length === 0
  const Icon = ready ? (attention ? AlertTriangle : CheckCircle2) : showErrors ? AlertCircle : CircleDashed
  const color = ready ? (attention ? "text-amber-500" : "text-green-600") : showErrors ? "text-destructive" : "text-text-tertiary"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={-1} className={cn("inline-flex cursor-help", color)}>
          <Icon className="h-4 w-4" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        {ready ? (
          attention ? "저장할 수 있습니다. 아래 노란 안내만 한 번 확인하세요." : "저장 준비 완료"
        ) : (
          <div>
            <p className="font-semibold">저장하려면 입력이 더 필요합니다</p>
            <ul className="mt-1 list-disc pl-4">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

const SOURCE_LABEL: Record<string, string> = {
  default: "지정한 기본 프로젝트",
  single: "프로젝트가 하나라서 자동 선택",
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
  const errors = rowErrors(row)
  const invalid = invalidFields(row)
  const notices = rowNotices(row, project)
  const conflict = hasTableConflict(row, matches)
  const matchInfo = !!matches && matches.length > 0 && (conflict || (!row.selected && matches.some((m) => m.otherSelected)))
  const attention =
    row.duplicates.length > 0 ||
    row.similar.length > 0 ||
    conflict ||
    row.warnings.length > 0 ||
    notices.length > 0 ||
    row.serverErrors.length > 0 ||
    row.lowFields.some((f) => !row.checkedFields.includes(f))
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

  const bg = row.selected ? "bg-card" : "bg-warm-ivory"
  const stripe =
    !row.selected
      ? "before:bg-transparent"
      : errors.length > 0
        ? row.showErrors
          ? "before:bg-destructive"
          : "before:bg-warm-tan"
        : attention
          ? "before:bg-amber-400"
          : "before:bg-green-500"

  // AI가 아무것도 못 읽은 빈 초안에는 "전체를 잘 읽지 못했다"는 안내가 중복이므로 생략한다.
  const aiReadSomething = !!row.aiRaw && !!(row.aiRaw.vendor_name || row.aiRaw.issue_date || row.aiRaw.total_amount !== null)
  const lowOverall = row.confidence === "low" && aiReadSomething
  const showNotes =
    row.serverErrors.length > 0 ||
    (row.showErrors && errors.length > 0) ||
    row.duplicates.length > 0 ||
    row.similar.length > 0 ||
    matchInfo ||
    row.warnings.length > 0 ||
    notices.length > 0 ||
    lowOverall

  const lowCell = (field: keyof ReceiptFields, node: React.ReactNode) => (
    <div className="relative">
      {node}
      <LowConfidenceMark show={st(field).low} />
    </div>
  )

  return (
    <>
      <tr data-row-key={key} className={cn(bg, !row.selected && "text-text-secondary")}>
        {/* 선택 · 미리보기 (왼쪽 고정) */}
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
            <Checkbox
              checked={row.selected}
              onCheckedChange={(v) => actions.setSelected(key, v === true)}
              aria-label={`${number}번 행 저장 대상으로 선택`}
            />
            <Thumbnail row={row} filePos={filePos} fileCount={fileCount} onOpen={() => actions.openReview(key)} />
            <div className="flex w-5 flex-col items-center gap-0.5">
              <StatusIcon errors={errors} showErrors={row.showErrors} attention={attention} />
              <span className="text-[10px] tabular-nums text-text-tertiary">{number}</span>
            </div>
          </div>
        </td>
        <td className={TD}>
          {lowCell(
            "doc_type",
            <DocTypeSelect value={f.doc_type} onChange={(v) => patch({ doc_type: v })} onSeen={seen("doc_type")} state={st("doc_type")} className="w-[124px]" aria-label="문서 종류" />
          )}
        </td>
        <td className={TD}>
          {lowCell(
            "issue_date",
            <DateCell value={f.issue_date} onChange={(v) => patch({ issue_date: v })} onBlur={seen("issue_date")} state={st("issue_date")} className="w-[142px]" grid={grid("issue_date")} aria-label="거래일자" />
          )}
        </td>
        <td className={TD}>
          {lowCell(
            "vendor_name",
            <TextCell value={f.vendor_name} onChange={(v) => patch({ vendor_name: v })} onBlur={seen("vendor_name")} state={st("vendor_name")} maxLength={200} placeholder="거래처명" className="w-[176px]" grid={grid("vendor_name")} aria-label="거래처" />
          )}
        </td>
        <td className={TD}>
          {lowCell(
            "vendor_biz_no",
            <BizNoInput value={f.vendor_biz_no} onChange={(v) => patch({ vendor_biz_no: v })} onBlur={seen("vendor_biz_no")} state={st("vendor_biz_no")} className="w-[128px]" grid={grid("vendor_biz_no")} aria-label="사업자등록번호" />
          )}
        </td>
        <td className={TD}>
          {lowCell(
            "supply_amount",
            <MoneyInput value={f.supply_amount} onChange={(v) => patch({ supply_amount: v })} onBlur={seen("supply_amount")} state={st("supply_amount")} className="w-[112px]" grid={grid("supply_amount")} aria-label="공급가액" />
          )}
        </td>
        <td className={TD}>
          {lowCell(
            "vat_amount",
            <MoneyInput value={f.vat_amount} onChange={(v) => patch({ vat_amount: v })} onBlur={seen("vat_amount")} state={st("vat_amount")} className="w-[100px]" grid={grid("vat_amount")} aria-label="부가세" />
          )}
        </td>
        <td className={TD}>
          <div className="relative flex items-center gap-1">
            {mismatch && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-amber-500" aria-label="공급가액+부가세가 합계와 다릅니다">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>공급가액+부가세가 합계와 다릅니다</TooltipContent>
              </Tooltip>
            )}
            <MoneyInput value={f.total_amount} onChange={(v) => patch({ total_amount: v })} onBlur={seen("total_amount")} state={st("total_amount")} className="w-[118px] font-semibold" grid={grid("total_amount")} aria-label="합계" />
            <LowConfidenceMark show={st("total_amount").low} />
          </div>
        </td>
        <td className={TD}>
          {lowCell(
            "payment_method",
            <PaymentSelect value={f.payment_method} onChange={(v) => patch({ payment_method: v })} onSeen={seen("payment_method")} state={st("payment_method")} className="w-[96px]" aria-label="결제 수단" />
          )}
        </td>
        <td className={TD}>
          {lowCell(
            "budget_item",
            <TextCell value={f.budget_item} onChange={(v) => patch({ budget_item: v })} onBlur={seen("budget_item")} state={st("budget_item")} maxLength={100} list={budgetListId(row.project_id)} placeholder="비목" className="w-[128px]" grid={grid("budget_item")} aria-label="비목" />
          )}
        </td>
        <td className={TD}>
          <div className="flex items-center gap-1">
            {lowCell(
              "purpose",
              <TextCell value={f.purpose} onChange={(v) => patch({ purpose: v })} onBlur={seen("purpose")} state={st("purpose")} placeholder="사용 목적(적요)" className="w-[200px]" grid={grid("purpose")} aria-label="적요" />
            )}
            <button
              type="button"
              onClick={() => onToggleExpand(key)}
              aria-expanded={expanded}
              title="승인번호·메모·품목 보기"
              className={cn(
                "flex h-8 shrink-0 items-center gap-0.5 rounded-md border px-1.5 text-[11px] transition-colors",
                expanded ? "border-gold bg-gold/10 text-dark" : "border-warm-tan text-text-secondary hover:bg-warm-beige"
              )}
            >
              {f.items.length > 0 ? `품목 ${f.items.length}` : "상세"}
              <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
            </button>
          </div>
        </td>
        {/* 프로젝트 선택 · 삭제 (오른쪽 고정) */}
        <td className={cn(TD, bg, STICKY_RIGHT, "pr-2")}>
          <div className="flex items-center gap-1">
            {row.projectSource === "ai" && row.project_id ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 cursor-help items-center gap-0.5 rounded bg-gold/15 px-1 py-0.5 text-[10px] font-medium text-dark">
                    <Sparkles className="h-2.5 w-2.5 text-gold" />
                    AI 추천
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  {row.projectReason ? `AI 추천 근거: ${row.projectReason}` : "AI가 내용을 보고 추천했습니다. 맞는지 확인하세요."}
                </TooltipContent>
              </Tooltip>
            ) : row.projectSource && SOURCE_LABEL[row.projectSource] && row.project_id ? (
              <span className="sr-only">{SOURCE_LABEL[row.projectSource]}</span>
            ) : null}
            <ProjectSelect
              value={row.project_id}
              onChange={(id) => actions.setProject(key, id)}
              projects={projects}
              aiSuggestedId={row.aiRaw?.suggested_project_id ?? null}
              state={{ invalid: row.showErrors && !row.project_id }}
              className={cn("w-[196px]", !row.project_id && "border-dashed")}
              aria-label="어느 프로젝트의 증빙인지 선택"
            />
            <button
              type="button"
              onClick={() => actions.removeRows([key])}
              title="이 행 빼기"
              aria-label={`${number}번 행 빼기`}
              className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>

      {showNotes && (
        <tr className={bg}>
          <td colSpan={COLUMN_COUNT} className="border-b border-warm-tan/60 p-0">
            <div className="sticky left-0 w-[var(--table-view-w,100%)] space-y-0.5 px-3 pb-2 pt-1 text-xs [word-break:keep-all]">
              {row.serverErrors.map((e, i) => (
                <p key={`s${i}`} className="flex gap-1.5 text-destructive">
                  <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                  서버 확인 결과: {e}
                </p>
              ))}
              {row.showErrors &&
                errors.map((e) => (
                  <p key={e} className="flex gap-1.5 text-destructive">
                    <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                    {e}
                  </p>
                ))}
              {row.duplicates.length > 0 && (
                <div className="flex gap-1.5 text-destructive">
                  <Copy className="mt-px h-3.5 w-3.5 shrink-0" />
                  <div>
                    <p className="font-medium">이미 저장된 증빙과 같은 파일입니다 — 같은 증빙이면 이 행을 빼고, 다른 증빙이면 체크해서 저장하세요.</p>
                    <ul className="mt-0.5 text-destructive/90">
                      {row.duplicates.slice(0, 3).map((d) => (
                        <li key={d.id}>
                          · {d.project_name} · {d.issue_date} · {d.vendor_name} · {formatWon(d.total_amount)}
                        </li>
                      ))}
                      {row.duplicates.length > 3 && <li>· 외 {row.duplicates.length - 3}건</li>}
                    </ul>
                  </div>
                </div>
              )}
              <SimilarNote row={row} />
              <TableMatchNote row={row} matches={matches} />
              {lowOverall && (
                <p className="flex gap-1.5 text-amber-800">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                  AI가 이 증빙 전체를 잘 읽지 못했습니다. 사진을 눌러 원본과 꼭 비교하세요.
                </p>
              )}
              {[...notices, ...row.warnings].map((w, i) => (
                <p key={`w${i}`} className="flex gap-1.5 text-amber-800">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                  {w}
                </p>
              ))}
            </div>
          </td>
        </tr>
      )}

      {expanded && (
        <tr className={bg}>
          <td colSpan={COLUMN_COUNT} className="border-b border-warm-tan/60 p-0">
            <div className="sticky left-0 w-[var(--table-view-w,100%)] px-3 pb-3 pt-1">
              <div className="grid gap-4 rounded-lg border border-warm-tan/70 bg-warm-ivory/50 p-3 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                <div className="space-y-2.5">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-text-secondary">승인번호</span>
                    {lowCell(
                      "approval_no",
                      <TextCell value={f.approval_no} onChange={(v) => patch({ approval_no: v })} onBlur={seen("approval_no")} state={st("approval_no")} maxLength={50} placeholder="카드 승인번호 등" />
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-text-secondary">메모</span>
                    {lowCell(
                      "memo",
                      <TextCell value={f.memo} onChange={(v) => patch({ memo: v })} onBlur={seen("memo")} state={st("memo")} placeholder="내부 참고용 메모" />
                    )}
                  </label>
                  <div className="space-y-1 text-xs text-text-secondary">
                    {row.confidence && (
                      <p>
                        AI 판독 신뢰도: <b className="text-dark">{CONFIDENCE_LABELS[row.confidence]}</b>
                      </p>
                    )}
                    {row.manual && <p>AI 없이 직접 입력하는 행입니다.</p>}
                    <p className="truncate" title={row.file.name}>
                      원본: {row.file.name}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => actions.openReview(key)}>
                      <Maximize2 className="h-3.5 w-3.5" />
                      크게 보며 확인
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" asChild>
                      <a href={fileUrl(row.file.pathname, { name: row.file.name })}>
                        <Download className="h-3.5 w-3.5" />
                        원본 받기
                      </a>
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => actions.addRowForFile(key)}>
                      <Plus className="h-3.5 w-3.5" />
                      이 파일로 증빙 한 건 더
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
  // '확인할 행만 보기': 켤 때의 목록을 고정한다. 입력하는 도중 확인이 끝났다고 행이 사라지면
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

  // 필터를 켠 뒤 새로 들어온 행(분석 완료·"한 건 더")을 고정 목록에 합친다.
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
        <p role="status" className="border-b border-warm-tan bg-gold/10 px-4 py-1.5 text-xs text-dark">
          저장하는 중입니다 — 끝날 때까지 표를 잠시 잠가 둡니다.
        </p>
      )}
      <BudgetItemDatalists projects={projects} />

      {/* 툴바: 선택 · 일괄 지정 · 합계 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warm-tan px-4 py-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-dark">
          <Checkbox
            checked={allChecked ? true : someChecked ? "indeterminate" : false}
            onCheckedChange={(v) => actions.setSelectedMany(visibleKeys, v === true)}
            aria-label="보이는 행 전체 선택"
          />
          전체 선택
        </label>
        <span className="text-xs text-text-secondary">
          {selectedAll.length}/{rows.length}건 선택
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value=""
            onValueChange={(v) => actions.bulkProject(selectedAll.map((r) => r.key), Number(v))}
            disabled={selectedAll.length === 0}
          >
            <SelectTrigger className="h-8 w-[240px] bg-card text-sm" aria-label="선택한 행의 프로젝트를 한 번에 지정">
              <SelectValue placeholder={selectedAll.length > 0 ? `선택한 ${selectedAll.length}건 프로젝트 일괄 지정` : "행을 선택하면 프로젝트 일괄 지정"} />
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
            className="h-8 text-xs text-text-secondary hover:text-destructive"
            disabled={selectedAll.length === 0}
            onClick={() => actions.removeRows(selectedAll.map((r) => r.key))}
          >
            <Trash2 className="h-3.5 w-3.5" />
            선택한 행 빼기
          </Button>
          <Button
            type="button"
            size="sm"
            variant={onlyAttention ? "secondary" : "ghost"}
            className={cn("h-8 text-xs", onlyAttention && "border border-gold/60")}
            onClick={toggleAttention}
            aria-pressed={onlyAttention}
          >
            <Filter className="h-3.5 w-3.5" />
            {onlyAttention ? `확인할 행만 보는 중 (남은 ${attentionKeys.size}건)` : `확인할 행만 보기 (${attentionKeys.size})`}
          </Button>
          {onlyAttention && resolvedVisible > 0 && (
            <Button type="button" size="sm" variant="ghost" className="h-8 text-xs text-green-800" onClick={refreshAttention}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              확인 끝난 {resolvedVisible}건 목록에서 숨기기
            </Button>
          )}
        </div>

        <p className="ml-auto text-sm text-text-secondary">
          선택 합계 <b className="tabular-nums text-dark">{formatWon(selectedSum)}</b>
        </p>
      </div>
      <p className="border-b border-warm-tan/60 bg-warm-ivory/40 px-4 py-1.5 text-[11px] leading-relaxed text-text-secondary [word-break:keep-all]">
        칸을 눌러 바로 고치면 됩니다 · <b>Tab</b> 오른쪽 칸 · <b>Enter</b> 아래 행 · <span className="rounded border border-amber-400 bg-amber-50 px-1">노란 칸</span>은 AI가 확신하지 못한 값 ·
        사진을 누르면 원본을 크게 보며 고칠 수 있습니다
        <span className="md:hidden">(휴대폰에서는 이 방법이 편합니다)</span>
      </p>

      <div
        ref={scrollRef}
        onKeyDown={onKeyDown}
        className="relative overflow-x-auto md:max-h-[70vh] md:overflow-y-auto"
        style={viewW ? ({ "--table-view-w": `${viewW}px` } as React.CSSProperties) : undefined}
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className={cn(TH, "pl-3 md:left-0 md:z-[5] md:shadow-[inset_-1px_0_0_var(--color-warm-tan)]")}>
                <span className="sr-only">선택·미리보기</span>
                <span aria-hidden>증빙</span>
              </th>
              <th className={TH}>문서 종류</th>
              <th className={TH}>
                거래일자 <span className="text-destructive">*</span>
              </th>
              <th className={TH}>
                거래처 <span className="text-destructive">*</span>
              </th>
              <th className={TH}>사업자번호</th>
              <th className={cn(TH, "text-right")}>공급가액</th>
              <th className={cn(TH, "text-right")}>부가세</th>
              <th className={cn(TH, "text-right")}>
                합계 <span className="text-destructive">*</span>
              </th>
              <th className={TH}>결제 수단</th>
              <th className={TH}>비목</th>
              <th className={TH}>적요</th>
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
        {visible.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-text-secondary">
            {onlyAttention ? (
              <>
                <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-green-600" />
                따로 확인할 행이 없습니다.{" "}
                <button type="button" className="font-medium text-dark underline underline-offset-2" onClick={() => setAttentionFilter(null)}>
                  전체 보기
                </button>
              </>
            ) : (
              "표가 비어 있습니다."
            )}
          </div>
        )}
      </div>
    </fieldset>
  )
}
