"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, ChevronDown, Download, ExternalLink, RotateCw, Trash2, X, ZoomIn, ZoomOut } from "lucide-react"
import { CONFIDENCE_LABELS, type ReceiptFields } from "@/lib/expenses"
import { SourceTag, StatusBadge, toastInfo, type ValueSource } from "@/components/saas"
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
} from "./upload-fields"
import {
  DuplicateNote,
  InfoLine,
  ReasonButton,
  SimilarNote,
  TableMatchNote,
  budgetListId,
  excludedText,
  type ReceiptTableActions,
} from "./receipt-table"
import {
  fieldLabels,
  fileUrl,
  invalidFields,
  isImageMeta,
  sanitizeFields,
  type DraftRow,
  type ReasonField,
  type RowAssessment,
  type TableMatch,
  type UploaderProject,
} from "./upload-model"

// 원본 대조(검토) 창(계획서 4.2.3). 원본을 크게 보면서 한 건씩 확인·수정한다.
// R-1 기본은 "확인할 것만"(확인 필요·입력 필요 행) 순회, [전체 보기]로 모든 행. 순회 목록은 열 때 고정한다(확인해도 목록에서 사라지지 않게).
// R-2 사유를 누르면 그 칸으로 이동·포커스(테두리 잠깐 강조), 사유마다 [확인했어요].
// R-3 사람이 정하는 칸이 위: 저장 대상 포함 스위치(머리) · 프로젝트 · 비목 · 적요 → 금액 · 거래일자 · 거래처 → 접힌 "자동 인식 값 더 보기".
//     자동 인식이 채운 칸은 "자동 인식", 사람이 고친 칸은 "직접 입력"(SourceTag). 판독값은 제안일 뿐 저장은 사람이 누른다.
// R-4 주 버튼 "확인했어요 · 다음", 마지막 행은 "확인 끝 · 저장하러 가기"(닫고 저장 버튼에 포커스).

export type ReviewMode = "todo" | "all"

function Preview({ row }: { row: DraftRow }) {
  const [zoom, setZoom] = useState(false)
  const [rotate, setRotate] = useState(0)
  const [broken, setBroken] = useState(false)
  const url = fileUrl(row.file.pathname)
  const image = isImageMeta(row.file)
  const tool = "h-8 px-2 text-sm hover:bg-warm-beige"

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-dark/[0.04]">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-warm-tan/70 px-3 py-1">
        <p className="mr-auto min-w-0 flex-1 truncate text-sm text-text-secondary" title={row.file.name}>
          {row.file.name}
        </p>
        {image && !broken && (
          <>
            <Button type="button" variant="ghost" size="sm" className={tool} onClick={() => setZoom((z) => !z)}>
              {zoom ? <ZoomOut className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
              {zoom ? "화면에 맞추기" : "원본 크기"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className={tool} onClick={() => setRotate((r) => (r + 90) % 360)}>
              <RotateCw className="h-3.5 w-3.5" />
              돌리기
            </Button>
          </>
        )}
        <Button type="button" variant="ghost" size="sm" className={tool} asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />새 탭
          </a>
        </Button>
        <Button type="button" variant="ghost" size="sm" className={tool} asChild>
          <a href={fileUrl(row.file.pathname, { name: row.file.name })}>
            <Download className="h-3.5 w-3.5" />
            받기
          </a>
        </Button>
      </div>
      {/* 휴대폰: 미리보기 칸이 낮아 글자가 작아지지 않도록 폭에 맞춰 보이고 칸 안에서 세로로 넘긴다. md 이상: 칸에 맞춤. */}
      <div className={cn("min-h-0 flex-1 overflow-auto", !zoom && "flex items-start justify-center p-3 md:items-center")}>
        {image ? (
          broken ? (
            <p className="p-6 text-center text-[15px] text-text-secondary [word-break:keep-all]">
              미리보기를 불러오지 못했어요. ‘새 탭’이나 ‘받기’로 확인해 주세요.
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
                zoom ? "max-w-none cursor-zoom-out" : "h-auto w-full cursor-zoom-in md:max-h-full md:w-auto md:max-w-full md:object-contain"
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

// 칸 하나: 레이블(+ 값 출처) + 입력. data-field로 사유 → 칸 이동을 찾는다.
function Field({
  field,
  label,
  required,
  source,
  flash,
  className,
  children,
}: {
  field: ReasonField
  label: ReactNode
  required?: boolean
  source?: ValueSource | null
  flash: ReasonField | null
  className?: string
  children: ReactNode
}) {
  return (
    <label
      data-field={field}
      className={cn("block rounded-md transition-shadow", flash === field && "ring-2 ring-amber-600 ring-offset-2", className)}
    >
      <span className="mb-1 block text-sm font-medium text-dark">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
        <SourceTag source={source} />
      </span>
      {children}
    </label>
  )
}

const MORE_FIELDS: ReasonField[] = ["doc_type", "payment_method", "vendor_biz_no", "supply_amount", "vat_amount", "approval_no", "memo", "payroll_month", "items"]

export function UploadReviewDialog({
  rows,
  openKey,
  order,
  mode,
  focusField = null,
  projects,
  actions,
  matches,
  assessments,
  saving = false,
  onClose,
  onNavigate,
  onModeChange,
  onFinish,
}: {
  rows: DraftRow[]
  openKey: string | null
  /** 순회 목록(열 때 고정, 표 순서) */
  order: string[]
  mode: ReviewMode
  focusField?: ReasonField | null
  projects: UploaderProject[]
  actions: ReceiptTableActions
  matches?: Map<string, TableMatch[]>
  assessments: Map<string, RowAssessment>
  saving?: boolean // 저장 요청 중에는 고칠 수 없게 잠근다
  onClose: () => void
  onNavigate: (key: string) => void
  onModeChange: (mode: ReviewMode) => void
  /** 마지막 행에서 "확인 끝 · 저장하러 가기" */
  onFinish: () => void
}) {
  const live = new Set(rows.map((r) => r.key))
  const list = order.filter((k) => live.has(k))
  const index = openKey ? list.indexOf(openKey) : -1
  const row = openKey ? (rows.find((r) => r.key === openKey) ?? null) : null
  const prevKey = index > 0 ? list[index - 1] : null
  const nextKey = index >= 0 && index < list.length - 1 ? list[index + 1] : null
  const [message, setMessage] = useState("")
  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(() => setMessage(""), 4000)
    return () => window.clearTimeout(t)
  }, [message])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (t.closest("input, textarea, [role=combobox], [role=listbox], [role=switch], [contenteditable=true]")) return
    if (e.key === "ArrowLeft" && prevKey) {
      e.preventDefault()
      onNavigate(prevKey)
    } else if (e.key === "ArrowRight" && nextKey) {
      e.preventDefault()
      onNavigate(nextKey)
    }
  }

  const st = row ? assessments.get(row.key) : undefined
  const confirmAndGo = () => {
    if (!row) return
    const left = st?.reasons.length ?? 0
    if (!saving) actions.checkAll(row.key)
    const note = left > 0 ? `남은 사유 ${left}개도 확인 처리했어요` : ""
    if (nextKey) {
      if (note) setMessage(note)
      onNavigate(nextKey)
    } else {
      // 마지막 행이면 창이 닫히므로 창 안 문구 대신 토스트로 알린다
      if (note) toastInfo(note)
      onFinish()
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        onKeyDown={onKeyDown}
        // 첫 버튼에 포커스 링이 먼저 잡히지 않도록 창 자체에 포커스를 둔다(← → 이동은 그대로 동작). 사유로 열었으면 그 칸으로 간다.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus()
        }}
        className="flex h-[100dvh] max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 shadow-none outline-none sm:h-[92vh] sm:max-w-[min(1200px,calc(100%-2rem))] sm:rounded-md"
        showCloseButton={false}
      >
        {row && (
          <button
            type="button"
            onClick={onClose}
            aria-label="증빙 확인 창 닫기"
            className="absolute right-2 top-2 z-10 inline-flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-warm-beige hover:text-dark"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
        {row && st && (
          <ReviewBody
            key={row.key}
            row={row}
            st={st}
            index={index}
            total={list.length}
            mode={mode}
            onModeChange={onModeChange}
            focusField={focusField}
            projects={projects}
            actions={actions}
            matches={matches?.get(row.key)}
            saving={saving}
          />
        )}
        {row && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-warm-tan bg-card px-3 py-2.5 sm:px-4">
            <Button type="button" variant="outline" size="sm" className="h-9 hover:bg-warm-beige" disabled={!prevKey} onClick={() => prevKey && onNavigate(prevKey)}>
              <ChevronLeft className="h-4 w-4" />
              이전
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-9 hover:bg-warm-beige" disabled={!nextKey} onClick={() => nextKey && onNavigate(nextKey)}>
              다음
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="hidden text-sm text-text-secondary lg:inline">← → 이동</span>
            {message && (
              <span role="status" className="text-sm text-dark">
                {message}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 text-text-secondary hover:bg-destructive/10 hover:text-destructive"
                aria-label="이 행 지우기"
                disabled={saving}
                onClick={() => {
                  const target = nextKey ?? prevKey
                  actions.removeRows([row.key])
                  if (target) onNavigate(target)
                  else onClose()
                }}
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">행 지우기</span>
              </Button>
              <Button type="button" size="sm" className="h-9" onClick={confirmAndGo}>
                {nextKey ? "확인했어요 · 다음" : "확인 끝 · 저장하러 가기"}
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
  st,
  index,
  total,
  mode,
  onModeChange,
  focusField,
  projects,
  actions,
  matches,
  saving,
}: {
  row: DraftRow
  st: RowAssessment
  index: number
  total: number
  mode: ReviewMode
  onModeChange: (mode: ReviewMode) => void
  focusField: ReasonField | null
  projects: UploaderProject[]
  actions: ReceiptTableActions
  matches: TableMatch[] | undefined
  saving: boolean
}) {
  const f = row.fields
  const key = row.key
  const invalid = invalidFields(row)
  const patch = (p: Partial<ReceiptFields>) => actions.patchFields(key, p)
  const seen = (field: keyof ReceiptFields) => () => actions.checkField(key, field)
  const cs = (field: keyof ReceiptFields): CellState => ({
    low: row.lowFields.includes(field) && !row.checkedFields.includes(field),
    invalid: row.showErrors && !!invalid[field],
  })
  const aiSuggested = row.projectSource === "ai" && !!row.project_id
  const foreign = f.currency !== "KRW"
  const panelRef = useRef<HTMLFieldSetElement>(null)
  const [flash, setFlash] = useState<ReasonField | null>(null)

  // 자동 인식 값과 지금 값이 같으면 "자동 인식", 다르면 "직접 입력"
  const original = useMemo(() => (row.aiRaw ? sanitizeFields(row.aiRaw) : null), [row.aiRaw])
  const source = (field: keyof ReceiptFields): ValueSource | null => {
    if (!original) return null
    const a = JSON.stringify(original[field])
    const b = JSON.stringify(f[field])
    if (a === b) return b === '""' || b === "null" || b === "[]" ? null : "auto"
    return "manual"
  }

  // 접힌 "자동 인식 값 더 보기": 그 안에 확인할 칸·빨간 칸·사유가 가리키는 칸이 있으면 펼친다.
  const moreNeeded =
    MORE_FIELDS.some((x) => x !== "items" && x !== "payroll_month" && (cs(x as keyof ReceiptFields).low || cs(x as keyof ReceiptFields).invalid)) ||
    st.reasons.some((r) => r.kind === "amount" || r.fields.some((x) => MORE_FIELDS.includes(x))) ||
    (!!focusField && MORE_FIELDS.includes(focusField))
  const [moreOpen, setMoreOpen] = useState(moreNeeded)

  const goTo = (field: ReasonField | undefined) => {
    if (!field) return
    if (MORE_FIELDS.includes(field)) setMoreOpen(true)
    window.setTimeout(() => {
      const box = panelRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`)
      if (!box) return
      box.scrollIntoView({ block: "center", behavior: "smooth" })
      box.querySelector<HTMLElement>("input, textarea, button[role=combobox]")?.focus({ preventScroll: true })
      setFlash(field)
    }, 30)
  }
  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 1500)
    return () => window.clearTimeout(t)
  }, [flash])
  // 사유를 눌러 열었으면 그 칸으로 바로 간다
  const focusedRef = useRef(false)
  useEffect(() => {
    if (focusedRef.current || !focusField) return
    focusedRef.current = true
    goTo(focusField)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusField])

  const missing = fieldLabels((Object.keys(invalid) as ReasonField[]).filter((k) => invalid[k as keyof typeof invalid]))
  const excluded = st.status === "excluded"

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-warm-tan py-2.5 pl-4 pr-12 sm:pl-5">
        <DialogTitle className="text-lg font-semibold text-dark">
          증빙 확인{" "}
          <span className="font-normal tabular-nums text-text-secondary">
            {index + 1}/{total} · {mode === "todo" ? "확인할 것만" : "전체"}
          </span>
        </DialogTitle>
        <ReasonButton onClick={() => onModeChange(mode === "todo" ? "all" : "todo")}>{mode === "todo" ? "전체 보기" : "확인할 것만 보기"}</ReasonButton>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-[15px] text-dark">
          <Switch checked={row.selected} onCheckedChange={(v) => actions.setSelected(key, v === true)} disabled={saving} aria-describedby={`rv-inc-${key}`} />
          저장 대상에 포함
        </label>
        <DialogDescription id={`rv-inc-${key}`} className="basis-full text-sm text-text-secondary [word-break:keep-all]">
          고친 내용은 표에 바로 반영돼요. 자동 인식 값은 제안이라 저장은 직접 눌러야 해요.
          {saving && <span className="font-medium text-dark"> 저장 중이라 고칠 수 없어요.</span>}
        </DialogDescription>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(34vh,1fr)_auto] overflow-y-auto md:grid-cols-[minmax(0,1fr)_420px] md:grid-rows-1 md:overflow-hidden">
        <Preview row={row} />

        <fieldset
          ref={panelRef}
          disabled={saving}
          aria-busy={saving}
          className={cn("m-0 min-w-0 space-y-3 border-warm-tan p-4 md:overflow-y-auto md:border-l", saving && "opacity-70")}
        >
          {/* 상태 + 사유 */}
          <div className="space-y-1.5 rounded-md border border-warm-tan bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge domain="expenseRow" status={st.status} detail={st.detail ?? undefined} />
              {row.confidence && <span className="text-sm text-text-secondary">인식 신뢰도 {CONFIDENCE_LABELS[row.confidence]}</span>}
            </div>
            {row.serverErrors.map((e, i) => (
              <p key={`s${i}`} className="text-sm text-red-800">
                저장 안 됨: {e}
              </p>
            ))}
            {st.status === "needs_input" && missing.length > 0 && (
              <p className="text-sm text-red-800 [word-break:keep-all]">
                <span className="font-semibold">채울 칸:</span> {missing.join(" · ")}
              </p>
            )}
            {st.reasons.length > 0 && (
              <ul className="space-y-1">
                {st.reasons.map((r) => (
                  <li key={r.id} className="text-sm text-dark [word-break:keep-all]">
                    <span className="flex flex-wrap items-center gap-x-1">
                      {r.fields.length > 0 ? (
                        <button type="button" onClick={() => goTo(r.fields[0])} className="min-h-8 text-left font-medium text-amber-900 underline decoration-amber-600/60 underline-offset-2 hover:decoration-amber-900">
                          {r.text}
                        </button>
                      ) : (
                        <span className="font-medium text-amber-900">{r.text}</span>
                      )}
                      <ReasonButton
                        onClick={() => (actions.acknowledge ? actions.acknowledge(key, r.id) : actions.checkAll(key))}
                        label={`‘${r.text.length > 24 ? `${r.text.slice(0, 24)}…` : r.text}’ 확인했어요`}
                      >
                        확인했어요
                      </ReasonButton>
                    </span>
                    {r.detail.length > 0 && (
                      <span className="block text-sm text-text-secondary">자동 인식: {r.detail.join(" · ")}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {st.acknowledged.length > 0 && (
              <p className="text-sm text-text-secondary">확인함: {st.acknowledged.map((r) => r.text).join(" · ")}</p>
            )}
            <DuplicateNote row={row} />
            <SimilarNote row={row} />
            <TableMatchNote row={row} matches={matches} />
            {excluded && st.duplicateSuspect && <InfoLine>{excludedText(row, matches)} · 다른 거래가 맞으면 ‘저장 대상에 포함’을 켜 주세요</InfoLine>}
            {excluded && !st.duplicateSuspect && <InfoLine>저장 대상에서 뺐어요 · 저장하려면 ‘저장 대상에 포함’을 켜 주세요</InfoLine>}
            {st.infos.map((t) => (
              <InfoLine key={t}>{t}</InfoLine>
            ))}
            {st.status === "ready" && st.reasons.length === 0 && st.infos.length === 0 && <p className="text-sm text-text-secondary">확인할 것이 없어요.</p>}
          </div>

          {/* 사람이 정하는 칸 */}
          <div>
            <Field field="project_id" label="프로젝트" required flash={flash}>
              <ProjectSelect
                value={row.project_id}
                onChange={(id) => actions.setProject(key, id)}
                projects={projects}
                aiSuggestedId={row.aiRaw?.suggested_project_id ?? null}
                suggested={aiSuggested}
                state={{ invalid: row.showErrors && !row.project_id }}
                placeholder="프로젝트 고르기"
                className="h-9 w-full"
              />
            </Field>
            {aiSuggested && <p className="mt-1 text-sm text-text-secondary [word-break:keep-all]">추천 근거: {row.projectReason || "증빙 내용"}</p>}
          </div>
          <Field field="budget_item" label="비목" source={source("budget_item")} flash={flash}>
            <TextCell value={f.budget_item} onChange={(v) => patch({ budget_item: v })} onBlur={seen("budget_item")} state={cs("budget_item")} maxLength={100} list={budgetListId(row.project_id)} className="h-9" />
          </Field>
          <Field field="purpose" label="적요(무엇에 썼는지)" source={source("purpose")} flash={flash}>
            <TextCell value={f.purpose} onChange={(v) => patch({ purpose: v })} onBlur={seen("purpose")} state={cs("purpose")} className="h-9" />
          </Field>

          {/* 금액 · 날짜 · 거래처 */}
          <div className="space-y-1.5">
            <div className={cn("grid gap-2", foreign ? "grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-[88px_minmax(0,1fr)]")}>
              <Field field="currency" label="통화" flash={flash}>
                <CurrencySelect value={f.currency} onChange={(v) => patch({ currency: v })} onSeen={seen("currency")} state={cs("currency")} className="h-9" />
              </Field>
              {foreign ? (
                <>
                  <Field field="foreign_amount" label={`${f.currency} 금액`} required source={source("foreign_amount")} flash={flash}>
                    <ForeignAmountInput currency={f.currency} value={f.foreign_amount} onChange={(v) => patch({ foreign_amount: v })} onBlur={seen("foreign_amount")} state={cs("foreign_amount")} className="h-9 font-semibold" />
                  </Field>
                  <Field field="exchange_rate" label="적용 환율" required flash={flash}>
                    <RateInput value={f.exchange_rate} onChange={(v) => patch({ exchange_rate: v })} onBlur={seen("exchange_rate")} state={cs("exchange_rate")} className="h-9" />
                  </Field>
                </>
              ) : (
                <Field field="total_amount" label="합계" required source={source("total_amount")} flash={flash}>
                  <MoneyInput value={f.total_amount} onChange={(v) => patch({ total_amount: v })} onBlur={seen("total_amount")} state={cs("total_amount")} className="h-9 font-semibold" />
                </Field>
              )}
            </div>
            {foreign && (
              <>
                <Field field="total_amount" label="원화 합계" required source={source("total_amount")} flash={flash}>
                  <MoneyInput value={f.total_amount} onChange={(v) => patch({ total_amount: v })} onBlur={seen("total_amount")} state={cs("total_amount")} className="h-9 font-semibold" />
                </Field>
                <FxNote fields={f} fx={row.fx} onRefetch={() => actions.refetchFx(key)} />
                <p className="text-sm text-text-secondary [word-break:keep-all]">카드 해외결제는 카드 명세서의 원화 금액(수수료 제외)이 있으면 원화 합계에 넣어 주세요. 환율은 ‘직접 입력’으로 바뀌어요.</p>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field field="issue_date" label="거래일자" required source={source("issue_date")} flash={flash}>
              <DateCell value={f.issue_date} onChange={(v) => patch({ issue_date: v })} onBlur={seen("issue_date")} state={cs("issue_date")} className="h-9" />
            </Field>
            <Field field="vendor_name" label="거래처" required source={source("vendor_name")} flash={flash}>
              <TextCell value={f.vendor_name} onChange={(v) => patch({ vendor_name: v })} onBlur={seen("vendor_name")} state={cs("vendor_name")} maxLength={200} className="h-9" />
            </Field>
          </div>

          {/* 자동 인식 값 더 보기 */}
          <div className="rounded-md border border-warm-tan">
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
              className="flex min-h-10 w-full items-start gap-1.5 px-3 py-2 text-left text-[15px] font-medium text-dark hover:bg-warm-beige/60"
            >
              <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-text-secondary transition-transform", !moreOpen && "-rotate-90")} aria-hidden />
              <span className="min-w-0">
                <span className="whitespace-nowrap">자동 인식 값 더 보기</span>
                <span className="block text-sm font-normal text-text-secondary [word-break:keep-all]">문서 종류 · 결제 수단 · 사업자번호 · 공급가액 · 부가세 · 승인번호 · 메모 · 품목</span>
              </span>
            </button>
            {moreOpen && (
              <div className="space-y-3 border-t border-warm-tan p-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field field="doc_type" label="문서 종류" source={source("doc_type")} flash={flash}>
                    <DocTypeSelect value={f.doc_type} onChange={(v) => patch({ doc_type: v })} onSeen={seen("doc_type")} state={cs("doc_type")} className="h-9" />
                  </Field>
                  <Field field="payment_method" label="결제 수단" source={source("payment_method")} flash={flash}>
                    <PaymentSelect value={f.payment_method} onChange={(v) => patch({ payment_method: v })} onSeen={seen("payment_method")} state={cs("payment_method")} className="h-9" />
                  </Field>
                </div>
                <Field field="vendor_biz_no" label="사업자번호(000-00-00000)" source={source("vendor_biz_no")} flash={flash}>
                  <BizNoInput value={f.vendor_biz_no} onChange={(v) => patch({ vendor_biz_no: v })} onBlur={seen("vendor_biz_no")} state={cs("vendor_biz_no")} className="h-9" />
                </Field>
                {!foreign && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field field="supply_amount" label="공급가액" source={source("supply_amount")} flash={flash}>
                      <MoneyInput value={f.supply_amount} onChange={(v) => patch({ supply_amount: v })} onBlur={seen("supply_amount")} state={cs("supply_amount")} className="h-9" />
                    </Field>
                    <Field field="vat_amount" label="부가세" source={source("vat_amount")} flash={flash}>
                      <MoneyInput value={f.vat_amount} onChange={(v) => patch({ vat_amount: v })} onBlur={seen("vat_amount")} state={cs("vat_amount")} className="h-9" />
                    </Field>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field field="approval_no" label="승인번호" source={source("approval_no")} flash={flash}>
                    <TextCell value={f.approval_no} onChange={(v) => patch({ approval_no: v })} onBlur={seen("approval_no")} state={cs("approval_no")} maxLength={50} className="h-9" />
                  </Field>
                  {f.doc_type === "payroll" ? (
                    <Field field="payroll_month" label="귀속월(일한 달)" flash={flash}>
                      <MonthCell value={f.payroll_month} onChange={(v) => patch({ payroll_month: v })} onBlur={seen("payroll_month")} state={cs("payroll_month")} className="h-9" />
                    </Field>
                  ) : (
                    <Field field="memo" label="메모" source={source("memo")} flash={flash}>
                      <TextCell value={f.memo} onChange={(v) => patch({ memo: v })} onBlur={seen("memo")} state={cs("memo")} className="h-9" />
                    </Field>
                  )}
                </div>
                {f.doc_type === "payroll" && (
                  <Field field="memo" label="메모" source={source("memo")} flash={flash}>
                    <TextCell value={f.memo} onChange={(v) => patch({ memo: v })} onBlur={seen("memo")} state={cs("memo")} className="h-9" />
                  </Field>
                )}
                <div data-field="items">
                  <p className="mb-1 text-sm font-medium text-dark">
                    품목
                    <SourceTag source={source("items")} />
                  </p>
                  <ItemsEditor items={f.items} onChange={(items) => patch({ items })} total={f.total_amount} supply={f.supply_amount} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" className="h-8 hover:bg-warm-beige" onClick={() => actions.addRowForFile(key)}>
                    이 파일로 한 건 더
                  </Button>
                </div>
              </div>
            )}
          </div>
        </fieldset>
      </div>
    </>
  )
}
