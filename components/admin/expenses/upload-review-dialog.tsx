"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Download, ExternalLink, RotateCw, Trash2, ZoomIn, ZoomOut } from "lucide-react"
import { CONFIDENCE_LABELS, type ReceiptFields } from "@/lib/expenses"
import {
  BizNoInput,
  DateCell,
  DocTypeSelect,
  ItemsEditor,
  MoneyInput,
  PaymentSelect,
  ProjectSelect,
  TextCell,
  type CellState,
} from "./upload-fields"
import { CheckNotes, DuplicateNote, SimilarNote, TableMatchNote, budgetListId, type ReceiptTableActions } from "./receipt-table"
import {
  fileUrl,
  invalidFields,
  isImageMeta,
  rowErrors,
  rowNotices,
  type DraftRow,
  type TableMatch,
  type UploaderProject,
} from "./upload-model"
import { RowNote } from "./ui"

// 원본을 크게 보면서 한 건씩 확인·수정하는 창. 이전/다음(←/→)으로 넘기며 검토한다.

function Preview({ row }: { row: DraftRow }) {
  const [zoom, setZoom] = useState(false)
  const [rotate, setRotate] = useState(0)
  const [broken, setBroken] = useState(false)
  const url = fileUrl(row.file.pathname)
  const image = isImageMeta(row.file)

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-dark/[0.04]">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-warm-tan/70 px-3 py-1.5">
        <p className="mr-auto min-w-0 flex-1 truncate text-xs text-text-secondary" title={row.file.name}>
          {row.file.name}
        </p>
        {image && !broken && (
          <>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setZoom((z) => !z)}>
              {zoom ? <ZoomOut className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
              {zoom ? "화면에 맞추기" : "원본 크기"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setRotate((r) => (r + 90) % 360)}>
              <RotateCw className="h-3.5 w-3.5" />
              돌리기
            </Button>
          </>
        )}
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />새 탭
          </a>
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
          <a href={fileUrl(row.file.pathname, { name: row.file.name })}>
            <Download className="h-3.5 w-3.5" />
            받기
          </a>
        </Button>
      </div>
      {/* 모바일: 미리보기 칸이 낮아 글자가 작아지지 않도록 폭에 맞춰 보이고 칸 안에서 세로로 넘긴다. md 이상: 칸에 맞춤. */}
      <div className={cn("min-h-0 flex-1 overflow-auto", !zoom && "flex items-start justify-center p-3 md:items-center")}>
        {image ? (
          broken ? (
            <p className="p-6 text-center text-sm text-text-secondary [word-break:keep-all]">
              미리보기를 불러오지 못했습니다. &lsquo;새 탭&rsquo; 또는 &lsquo;받기&rsquo;로 확인하세요.
            </p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={`${row.file.name} 원본`}
              onClick={() => setZoom((z) => !z)}
              onError={() => setBroken(true)}
              style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined }}
              className={cn(
                "select-none transition-transform",
                zoom
                  ? "max-w-none cursor-zoom-out"
                  : "h-auto w-full cursor-zoom-in md:max-h-full md:w-auto md:max-w-full md:object-contain"
              )}
            />
          )
        ) : (
          <iframe src={url} title={`${row.file.name} 원본`} className="h-full min-h-[60vh] w-full border-0 bg-white" />
        )}
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: React.ReactNode; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-text-secondary">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {children}
    </label>
  )
}

export function UploadReviewDialog({
  rows,
  openKey,
  projects,
  actions,
  matches,
  saving = false,
  onClose,
  onNavigate,
}: {
  rows: DraftRow[]
  openKey: string | null
  projects: UploaderProject[]
  actions: ReceiptTableActions
  matches?: Map<string, TableMatch[]>
  saving?: boolean // 저장 요청 중에는 고칠 수 없게 잠근다
  onClose: () => void
  onNavigate: (key: string) => void
}) {
  const index = openKey ? rows.findIndex((r) => r.key === openKey) : -1
  const row = index >= 0 ? rows[index] : null
  const prev = index > 0 ? rows[index - 1] : null
  const next = index >= 0 && index < rows.length - 1 ? rows[index + 1] : null

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (t.closest("input, textarea, [role=combobox], [role=listbox], [contenteditable=true]")) return
    if (e.key === "ArrowLeft" && prev) {
      e.preventDefault()
      onNavigate(prev.key)
    } else if (e.key === "ArrowRight" && next) {
      e.preventDefault()
      onNavigate(next.key)
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        onKeyDown={onKeyDown}
        // 첫 버튼(원본 크기)에 포커스 링이 먼저 잡히지 않도록 창 자체에 포커스를 둔다(← → 이동은 그대로 동작).
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus()
        }}
        className="flex h-[92vh] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden rounded-md p-0 shadow-none outline-none sm:max-w-[min(1200px,calc(100%-2rem))]"
      >
        {row && (
          <ReviewBody
            key={row.key}
            row={row}
            index={index}
            total={rows.length}
            projects={projects}
            actions={actions}
            matches={matches?.get(row.key)}
            saving={saving}
          />
        )}
        {row && (
          <div className="flex shrink-0 flex-nowrap items-center gap-2 border-t border-warm-tan bg-card px-4 py-3">
            <Button type="button" variant="outline" size="sm" disabled={!prev} onClick={() => prev && onNavigate(prev.key)}>
              <ChevronLeft className="h-4 w-4" />
              이전
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!next} onClick={() => next && onNavigate(next.key)}>
              다음
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="hidden text-xs text-text-secondary sm:inline">← → 이동</span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-text-secondary hover:text-destructive"
                aria-label="이 행 삭제"
                disabled={saving}
                onClick={() => {
                  const target = next ?? prev
                  actions.removeRows([row.key])
                  if (target) onNavigate(target.key)
                  else onClose()
                }}
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">행 삭제</span>
              </Button>
              <Button
                type="button"
                size="sm"
                title="노란 칸을 모두 확인 완료로 표시"
                onClick={() => {
                  // 원본과 비교해 확인했다는 뜻이므로 노란 표시를 모두 끈다(값이 맞으면 고치지 않아도 된다).
                  if (!saving) actions.checkAll(row.key)
                  if (next) onNavigate(next.key)
                  else onClose()
                }}
              >
                {next ? "확인 · 다음 건" : "확인 · 닫기"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReviewBody({
  row,
  index,
  total,
  projects,
  actions,
  matches,
  saving,
}: {
  row: DraftRow
  index: number
  total: number
  projects: UploaderProject[]
  actions: ReceiptTableActions
  matches: TableMatch[] | undefined
  saving: boolean
}) {
  const f = row.fields
  const key = row.key
  const errors = rowErrors(row)
  const invalid = invalidFields(row)
  const project = row.project_id ? projects.find((p) => p.id === row.project_id) : undefined
  const notices = rowNotices(row, project)
  const patch = (p: Partial<ReceiptFields>) => actions.patchFields(key, p)
  const seen = (field: keyof ReceiptFields) => () => actions.checkField(key, field)
  const st = (field: keyof ReceiptFields): CellState => ({
    low: row.lowFields.includes(field) && !row.checkedFields.includes(field),
    invalid: row.showErrors && !!invalid[field],
  })
  const lowCount = row.lowFields.filter((x) => !row.checkedFields.includes(x)).length
  const matchInfo = !!matches && matches.some((m) => m.otherSelected)
  const aiSuggested = row.projectSource === "ai" && !!row.project_id

  return (
    <>
      <div className="shrink-0 border-b border-warm-tan px-5 py-3 pr-12">
        <DialogTitle className="text-base">
          증빙 확인 <span className="font-normal tabular-nums text-text-secondary">{index + 1}/{total}</span>
        </DialogTitle>
        <DialogDescription className="mt-0.5 text-xs text-text-secondary [word-break:keep-all]">
          수정 내용은 표에 바로 반영됩니다.
          {lowCount > 0 && <span className="font-medium text-amber-800"> 확인 필요 {lowCount}칸.</span>}
          {saving && <span className="font-medium text-dark"> 저장 중(편집 잠금).</span>}
        </DialogDescription>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(34vh,1fr)_auto] overflow-y-auto md:grid-cols-[minmax(0,1fr)_400px] md:grid-rows-1 md:overflow-hidden">
        <Preview row={row} />

        <fieldset
          disabled={saving}
          aria-busy={saving}
          className={cn("m-0 min-w-0 space-y-3 border-warm-tan p-4 md:overflow-y-auto md:border-l", saving && "opacity-70")}
        >
          {(row.serverErrors.length > 0 ||
            (row.showErrors && errors.length > 0) ||
            row.duplicates.length > 0 ||
            row.similar.length > 0 ||
            matchInfo ||
            notices.length > 0 ||
            row.warnings.length > 0) && (
            <div className="space-y-1 rounded-md border border-warm-tan bg-card p-2.5">
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
              <CheckNotes items={[...notices, ...row.warnings]} />
            </div>
          )}

          <div>
            <Field label="프로젝트" required>
              <ProjectSelect
                value={row.project_id}
                onChange={(id) => actions.setProject(key, id)}
                projects={projects}
                aiSuggestedId={row.aiRaw?.suggested_project_id ?? null}
                suggested={aiSuggested}
                state={{ invalid: row.showErrors && !row.project_id }}
                placeholder="프로젝트 선택 필요"
                className="h-9 w-full"
              />
            </Field>
            {aiSuggested && (
              <p className="mt-1 text-xs text-text-secondary [word-break:keep-all]">추천 근거: {row.projectReason || "증빙 내용"}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="문서 종류">
              <DocTypeSelect value={f.doc_type} onChange={(v) => patch({ doc_type: v })} onSeen={seen("doc_type")} state={st("doc_type")} />
            </Field>
            <Field label="거래일자" required>
              <DateCell value={f.issue_date} onChange={(v) => patch({ issue_date: v })} onBlur={seen("issue_date")} state={st("issue_date")} />
            </Field>
          </div>
          <Field label="거래처(가맹점)" required>
            <TextCell value={f.vendor_name} onChange={(v) => patch({ vendor_name: v })} onBlur={seen("vendor_name")} state={st("vendor_name")} maxLength={200} />
          </Field>
          <Field
            label={
              <>
                사업자등록번호 <span className="font-normal text-text-secondary">000-00-00000</span>
              </>
            }
          >
            <BizNoInput value={f.vendor_biz_no} onChange={(v) => patch({ vendor_biz_no: v })} onBlur={seen("vendor_biz_no")} state={st("vendor_biz_no")} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="공급가액">
              <MoneyInput value={f.supply_amount} onChange={(v) => patch({ supply_amount: v })} onBlur={seen("supply_amount")} state={st("supply_amount")} />
            </Field>
            <Field label="부가세">
              <MoneyInput value={f.vat_amount} onChange={(v) => patch({ vat_amount: v })} onBlur={seen("vat_amount")} state={st("vat_amount")} />
            </Field>
            <Field label="합계" required>
              <MoneyInput value={f.total_amount} onChange={(v) => patch({ total_amount: v })} onBlur={seen("total_amount")} state={st("total_amount")} className="font-semibold" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="결제 수단">
              <PaymentSelect value={f.payment_method} onChange={(v) => patch({ payment_method: v })} onSeen={seen("payment_method")} state={st("payment_method")} />
            </Field>
            <Field label="승인번호">
              <TextCell value={f.approval_no} onChange={(v) => patch({ approval_no: v })} onBlur={seen("approval_no")} state={st("approval_no")} maxLength={50} />
            </Field>
          </div>
          <Field label="비목">
            <TextCell value={f.budget_item} onChange={(v) => patch({ budget_item: v })} onBlur={seen("budget_item")} state={st("budget_item")} maxLength={100} list={budgetListId(row.project_id)} placeholder="예: 재료비, 회의비" />
          </Field>
          <Field label="적요(사용 목적)">
            <TextCell value={f.purpose} onChange={(v) => patch({ purpose: v })} onBlur={seen("purpose")} state={st("purpose")} placeholder="예: 시제품 제작용 부품 구입" />
          </Field>
          <Field label="메모">
            <TextCell value={f.memo} onChange={(v) => patch({ memo: v })} onBlur={seen("memo")} state={st("memo")} placeholder="내부 메모" />
          </Field>
          <div>
            <p className="mb-1 text-xs font-medium text-text-secondary">품목</p>
            <ItemsEditor items={f.items} onChange={(items) => patch({ items })} total={f.total_amount} supply={f.supply_amount} />
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-warm-tan/70 pt-3 text-xs text-text-secondary">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-dark">
              <Checkbox checked={row.selected} onCheckedChange={(v) => actions.setSelected(key, v === true)} />
              저장 대상에 포함
            </label>
            {row.confidence && (
              <span className={cn(row.confidence === "low" && "font-medium text-amber-800")}>인식 신뢰도 {CONFIDENCE_LABELS[row.confidence]}</span>
            )}
          </div>
        </fieldset>
      </div>
    </>
  )
}
