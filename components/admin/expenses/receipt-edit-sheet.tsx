"use client"

import { useRef, useState, type ReactNode } from "react"
import { Calculator, Download, ExternalLink, Loader2, Paperclip, Plus, RefreshCw, Trash2, TriangleAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { WonInput } from "@/components/admin/expenses/won-input"
import { ForeignAmountInput, RateInput } from "@/components/admin/expenses/upload-fields"
import { applyFieldPatch, formatForeign, formatRate, resetFxRate } from "@/components/admin/expenses/upload-model"
import { uploadAttachment } from "@/components/admin/expenses/payroll-entry"
import { CELL_TONE_CLASS, InlineNotice } from "@/components/admin/expenses/ui"
import { fileUrl, formatBytes, jsonInit, normalizeName, requestJson, wonNumber } from "@/components/admin/expenses/client-helpers"
import {
  CURRENCY_LABELS,
  DOC_TYPE_LABELS,
  EXPENSE_DOC_TYPES,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  SCAN_ACCEPT,
  SUPPORTED_CURRENCIES,
  amountMismatch,
  convertToKrw,
  formatBizNo,
  isValidDate,
  validateReceiptFields,
  type CurrencyCode,
  type ExchangeRateSource,
  type ExpenseDocType,
  type ExpenseProject,
  type ExpenseReceipt,
  type PaymentMethod,
  type ReceiptFields,
  type ReceiptItem,
  type UploadedFileMeta,
} from "@/lib/expenses"

// ── 외화 표기·환율 도우미(증빙 내역 표와 공용) ────────────────────────────────
// 숫자 표기는 업로드 표(upload-model의 formatForeign·formatRate)와 같은 규칙을 쓴다.
// "USD 20.00" — 통화 코드를 붙인 표기. 값이 없으면 "-".
export function foreignWithCode(currency: CurrencyCode, amount: number | null | undefined): string {
  const text = formatForeign(typeof amount === "number" ? amount : null, currency)
  return text ? `${currency} ${text}` : "-"
}

// 1,388.1 → "1,388.10" (소수 2~4자리)
export function formatFxRate(rate: number | null | undefined): string {
  return formatRate(typeof rate === "number" ? rate : null) || "-"
}

export const FX_SOURCE_LABELS: Record<ExchangeRateSource, string> = {
  "": "",
  ecb: "유럽중앙은행",
  koreaexim: "매매기준율",
  manual: "직접 입력",
}

// "2026-09-18 기준 · 유럽중앙은행" / "직접 입력"
export function fxCaption(r: Pick<ReceiptFields, "exchange_rate_date" | "exchange_rate_source">): string {
  if (r.exchange_rate_source === "manual") return FX_SOURCE_LABELS.manual
  const label = FX_SOURCE_LABELS[r.exchange_rate_source] ?? ""
  return [r.exchange_rate_date ? `${r.exchange_rate_date} 기준` : "", label].filter(Boolean).join(" · ")
}

// 원화 합계를 직접 고쳤을 때의 환율(소수 4자리)
function impliedRate(total: number, foreign: number): number {
  return Math.round((total / foreign) * 10000) / 10000
}

// 증빙 내역에서 행을 누르면 열리는 편집 Sheet. 모든 필드와 프로젝트를 바꿀 수 있다.

function pickFields(r: ExpenseReceipt): ReceiptFields {
  return {
    doc_type: r.doc_type,
    issue_date: r.issue_date,
    vendor_name: r.vendor_name,
    vendor_biz_no: r.vendor_biz_no,
    supply_amount: r.supply_amount,
    vat_amount: r.vat_amount,
    total_amount: r.total_amount,
    payment_method: r.payment_method,
    approval_no: r.approval_no,
    items: (r.items ?? []).map((i) => ({ ...i })),
    budget_item: r.budget_item,
    purpose: r.purpose,
    memo: r.memo,
    currency: r.currency ?? "KRW",
    foreign_amount: r.foreign_amount ?? null,
    exchange_rate: r.exchange_rate ?? null,
    exchange_rate_date: r.exchange_rate_date ?? "",
    exchange_rate_source: r.exchange_rate_source ?? "",
    payroll_month: r.payroll_month ?? "",
  }
}

// 검증 메시지 → 빨간 테두리를 칠할 칸
type FieldKey = keyof ReceiptFields | "project_id"
function invalidKeys(messages: string[]): Set<FieldKey> {
  const s = new Set<FieldKey>()
  for (const m of messages) {
    if (m.includes("거래일자")) s.add("issue_date")
    if (m.includes("거래처")) s.add("vendor_name")
    if (m.includes("합계")) s.add("total_amount")
    if (m.includes("공급가액")) s.add("supply_amount")
    if (m.includes("부가세")) s.add("vat_amount")
    if (m.includes("사업자등록번호")) s.add("vendor_biz_no")
    if (m.includes("비목")) s.add("budget_item")
    if (m.includes("프로젝트")) s.add("project_id")
    if (/^[A-Z]{3} 금액/.test(m)) s.add("foreign_amount")
    if (m.includes("환율")) s.add("exchange_rate")
    if (m.includes("귀속월")) s.add("payroll_month")
  }
  return s
}

export function ReceiptEditSheet({
  receipt,
  projects,
  onClose,
  onSaved,
  onRequestDelete,
}: {
  receipt: ExpenseReceipt | null
  projects: ExpenseProject[]
  onClose: () => void
  onSaved: (message: string) => void
  onRequestDelete: (r: ExpenseReceipt) => void
}) {
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const requestClose = () => {
    if (savingRef.current) return
    if (dirtyRef.current) setConfirmClose(true)
    else onClose()
  }

  return (
    <>
      <Sheet open={receipt !== null} onOpenChange={(o) => !o && requestClose()}>
        {/* 열 때 첫 입력칸에 금색 포커스 링이 먼저 잡히지 않게 한다(검토 창과 같은 방식). Tab을 누르면 첫 칸부터 이동한다. */}
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl" onOpenAutoFocus={(e) => e.preventDefault()}>
          {receipt && (
            <EditBody
              key={`${receipt.id}-${receipt.updated_at}`}
              receipt={receipt}
              projects={projects}
              dirtyRef={dirtyRef}
              savingRef={savingRef}
              onCancel={requestClose}
              onSaved={(m) => {
                dirtyRef.current = false
                onSaved(m)
              }}
              onRequestDelete={() => onRequestDelete(receipt)}
            />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>저장하지 않은 수정 내용</AlertDialogTitle>
            <AlertDialogDescription>닫으면 수정 내용이 사라집니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>계속 수정</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                dirtyRef.current = false
                setConfirmClose(false)
                onClose()
              }}
            >
              저장하지 않고 닫기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function EditBody({
  receipt,
  projects,
  dirtyRef,
  savingRef,
  onCancel,
  onSaved,
  onRequestDelete,
}: {
  receipt: ExpenseReceipt
  projects: ExpenseProject[]
  dirtyRef: React.MutableRefObject<boolean>
  savingRef: React.MutableRefObject<boolean>
  onCancel: () => void
  onSaved: (message: string) => void
  onRequestDelete: () => void
}) {
  const [fields, setFields] = useState<ReceiptFields>(() => {
    dirtyRef.current = false
    return pickFields(receipt)
  })
  const [projectId, setProjectId] = useState<number>(receipt.project_id)
  const [errors, setErrors] = useState<string[]>([])
  const [serverError, setServerError] = useState("")
  const [saving, setSaving] = useState(false)
  const [showItems, setShowItems] = useState(receipt.items.length > 0)
  const [fxLoading, setFxLoading] = useState(false)
  const [fxError, setFxError] = useState("")
  const fxSeq = useRef(0)
  const [attached, setAttached] = useState<UploadedFileMeta | null>(null)
  const [attaching, setAttaching] = useState(false)
  const [attachError, setAttachError] = useState("")
  const attachInputRef = useRef<HTMLInputElement>(null)

  const invalid = invalidKeys(errors)
  const project = projects.find((p) => p.id === projectId) ?? null
  // 증빙 올리기와 같이 진행 중 프로젝트만 고를 수 있게 하되, 지금 연결된 프로젝트는(종료됐어도) 목록에 남긴다
  const choices = projects.filter((p) => p.status === "active" || p.id === receipt.project_id)
  const budgetNames = project?.budget_items.map((b) => b.name).filter(Boolean) ?? []
  const budgetKnown = !fields.budget_item.trim() || budgetNames.map(normalizeName).includes(normalizeName(fields.budget_item))
  const mismatch = amountMismatch(fields)
  const hasFile = Boolean(receipt.file_pathname)
  const isImage = hasFile && (receipt.file_type ?? "").startsWith("image/")
  const isForeign = fields.currency !== "KRW"
  const isPayroll = fields.doc_type === "payroll"
  const listId = `budget-names-${receipt.id}`

  const set = <K extends keyof ReceiptFields>(key: K, v: ReceiptFields[K]) => {
    dirtyRef.current = true
    setServerError("")
    setFields((f) => ({ ...f, [key]: v }))
  }
  const setItems = (items: ReceiptItem[]) => set("items", items)
  const patch = (fn: (f: ReceiptFields) => Partial<ReceiptFields>) => {
    dirtyRef.current = true
    setServerError("")
    setFields((f) => ({ ...f, ...fn(f) }))
  }

  // ── 외화: 거래일(결제일) 기준 환율을 받아 원화 합계를 다시 계산한다 ───────────────
  const loadRate = async (currency: CurrencyCode, date: string) => {
    const seq = ++fxSeq.current
    if (currency === "KRW") {
      setFxLoading(false)
      setFxError("")
      return
    }
    if (!isValidDate(date)) {
      setFxLoading(false)
      setFxError("거래일자를 입력하면 그날 환율을 적용합니다.")
      return
    }
    setFxLoading(true)
    setFxError("")
    const r = await requestJson<{ rate: number; rate_date: string; source: "ecb" | "koreaexim" }>(
      `/api/admin/expenses/fx?currency=${currency}&date=${date}`
    )
    if (seq !== fxSeq.current) return
    setFxLoading(false)
    if (!r.ok || typeof r.data.rate !== "number" || !(r.data.rate > 0)) {
      setFxError(r.ok ? "환율을 불러오지 못했습니다. 환율을 직접 입력하세요." : r.error)
      return
    }
    const { rate, rate_date, source } = r.data
    setFields((f) =>
      f.currency !== currency || f.issue_date !== date || f.exchange_rate_source === "manual"
        ? f
        : {
            ...f,
            exchange_rate: rate,
            exchange_rate_date: rate_date,
            exchange_rate_source: source,
            total_amount: typeof f.foreign_amount === "number" ? convertToKrw(f.foreign_amount, rate) : f.total_amount,
          }
    )
  }

  // 거래일자·통화 변경은 업로드 표와 같은 규칙(applyFieldPatch)을 쓴다.
  // 직접 입력 환율이 아니면 예전 결제일 환율·원화 합계를 비우고 새 결제일 환율을 받는다
  // (조회 중이거나 실패했을 때 옛 환율이 남아 그대로 저장되지 않게).
  const setIssueDate = (date: string) => {
    patch((f) => applyFieldPatch(f, { issue_date: date }))
    if (isForeign && fields.exchange_rate_source !== "manual") void loadRate(fields.currency, date)
  }

  const setCurrency = (c: CurrencyCode) => {
    if (c === fields.currency) return
    // 통화가 바뀌면 이전 환율(직접 입력 포함)은 버리고 결제일 환율을 새로 받는다. 외화 증빙에는 한국 부가세가 없다.
    patch((f) => ({ ...applyFieldPatch(f, { currency: c }), ...(c !== "KRW" ? { supply_amount: null, vat_amount: null } : {}) }))
    void loadRate(c, c === "KRW" ? "" : fields.issue_date)
  }

  const setForeignAmount = (v: number | null) =>
    patch((f) => ({
      foreign_amount: v,
      total_amount: v !== null && typeof f.exchange_rate === "number" ? convertToKrw(v, f.exchange_rate) : v === null ? null : f.total_amount,
    }))

  const setRate = (v: number | null) =>
    patch((f) => ({
      exchange_rate: v,
      exchange_rate_date: isValidDate(f.issue_date) ? f.issue_date : "",
      exchange_rate_source: "manual",
      total_amount: v !== null && typeof f.foreign_amount === "number" ? convertToKrw(f.foreign_amount, v) : f.total_amount,
    }))

  const setForeignTotal = (v: number | null) =>
    patch((f) => ({
      total_amount: v,
      exchange_rate_source: "manual",
      exchange_rate_date: isValidDate(f.issue_date) ? f.issue_date : "",
      exchange_rate: v !== null && typeof f.foreign_amount === "number" && f.foreign_amount > 0 ? impliedRate(v, f.foreign_amount) : f.exchange_rate,
    }))

  // 직접 입력한 환율을 버리고 결제일 환율을 다시 받는다(조회가 끝날 때까지 환율·원화 합계는 비워 둔다).
  const reapplyRate = () => {
    patch((f) => ({ ...resetFxRate(f), total_amount: typeof f.foreign_amount === "number" ? null : f.total_amount }))
    void loadRate(fields.currency, fields.issue_date)
  }

  const setDocType = (t: ExpenseDocType) =>
    patch((f) => ({
      doc_type: t,
      payroll_month: t === "payroll" && !f.payroll_month && isValidDate(f.issue_date) ? f.issue_date.slice(0, 7) : f.payroll_month,
    }))

  // ── 수기 등록 행에 첨부 추가 ───────────────────────────────────────────────
  const onAttach = async (file: File | undefined) => {
    if (!file) return
    setAttaching(true)
    setAttachError("")
    const r = await uploadAttachment(file)
    setAttaching(false)
    if (!r.ok) {
      setAttachError(r.error)
      return
    }
    dirtyRef.current = true
    setAttached(r.file)
  }

  const splitVat = () => {
    if (typeof fields.total_amount !== "number") return
    const supply = Math.round(fields.total_amount / 1.1)
    dirtyRef.current = true
    setFields((f) => ({ ...f, supply_amount: supply, vat_amount: (f.total_amount ?? 0) - supply }))
  }

  const save = async () => {
    const clean: ReceiptFields = {
      ...fields,
      vendor_name: fields.vendor_name.trim(),
      vendor_biz_no: fields.vendor_biz_no.trim() ? formatBizNo(fields.vendor_biz_no.trim()) : "",
      approval_no: fields.approval_no.trim(),
      budget_item: normalizeName(fields.budget_item),
      purpose: fields.purpose.trim(),
      memo: fields.memo.trim(),
      items: fields.items.filter((i) => i.name.trim() || i.amount !== null || i.unit_price !== null),
      payroll_month: fields.doc_type === "payroll" ? fields.payroll_month : "",
      ...(fields.currency === "KRW"
        ? { foreign_amount: null, exchange_rate: null, exchange_rate_date: "", exchange_rate_source: "" as const }
        : {}),
    }
    const errs = validateReceiptFields(clean)
    if (!projectId) errs.unshift("프로젝트를 선택하세요")
    if (!hasFile && !attached && clean.doc_type !== "payroll") {
      errs.push("첨부 파일이 없는 증빙은 문서 종류를 ‘인건비 지급’으로 두어야 합니다. 다른 종류로 바꾸려면 파일을 첨부하세요")
    }
    if (attaching) errs.push("첨부 파일을 올리는 중입니다")
    if (clean.currency !== "KRW" && fxLoading) errs.push("결제일 환율을 불러오는 중입니다. 잠시 뒤 저장하세요")
    setErrors(errs)
    if (errs.length > 0) return
    setSaving(true)
    savingRef.current = true
    setServerError("")
    const r = await requestJson("/api/admin/expenses/receipts", jsonInit("PUT", { id: receipt.id, ...clean, project_id: projectId, ...(attached ? { file: attached } : {}) }))
    setSaving(false)
    savingRef.current = false
    if (!r.ok) {
      setServerError(r.error)
      return
    }
    onSaved(
      projectId !== receipt.project_id && project
        ? `증빙을 수정하고 ‘${project.name}’ 프로젝트로 옮겼습니다.`
        : "증빙을 수정했습니다."
    )
  }

  const ring = (k: FieldKey) => (invalid.has(k) ? CELL_TONE_CLASS.invalid : "")

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <SheetHeader className="border-b border-warm-tan pr-12">
        <SheetTitle className="text-dark">증빙 수정</SheetTitle>
        <SheetDescription className="[word-break:keep-all]">
          {receipt.vendor_name} · {receipt.issue_date} · {wonNumber(receipt.total_amount)}원
          {receipt.currency && receipt.currency !== "KRW" && ` (${foreignWithCode(receipt.currency, receipt.foreign_amount)})`}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {/* 원본 미리보기 — 수기 등록(파일 없음)이면 첨부 추가 */}
        {hasFile && receipt.file_pathname ? (
          <FilePreview receipt={receipt} pathname={receipt.file_pathname} isImage={isImage} />
        ) : (
          <div className="rounded-md border border-warm-tan bg-warm-ivory px-3 py-3 text-sm">
            <p className="font-medium text-dark">수기 등록</p>
            <p className="mt-0.5 text-xs text-text-secondary [word-break:keep-all]">
              증빙 파일 없이 입력한 내역입니다. 이체확인증·급여명세서를 첨부할 수 있습니다.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {attaching ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  올리는 중
                </span>
              ) : attached ? (
                <>
                  <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-warm-tan bg-card py-1 pl-2 pr-1 text-xs text-dark">
                    <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="min-w-0 truncate" title={attached.name}>
                      {attached.name} · {formatBytes(attached.size)}
                    </span>
                    <button
                      type="button"
                      aria-label="첨부 빼기"
                      onClick={() => setAttached(null)}
                      className="shrink-0 rounded p-0.5 text-text-secondary hover:text-dark"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <span className="text-xs text-text-secondary">저장하면 첨부됩니다</span>
                </>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => attachInputRef.current?.click()}>
                  <Paperclip className="h-3.5 w-3.5" />
                  첨부 추가
                </Button>
              )}
            </div>
            {attachError && (
              <p role="alert" className="mt-1.5 text-xs text-destructive [word-break:keep-all]">
                {attachError}
              </p>
            )}
            <input
              ref={attachInputRef}
              type="file"
              accept={SCAN_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ""
                void onAttach(f)
              }}
            />
          </div>
        )}
        {receipt.ai_confidence === "low" && (
          <InlineNotice tone="warning" className="mt-2">
            인식 신뢰도 낮음 · 원본 대조 필요
          </InlineNotice>
        )}

        <div className="mt-5 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="re-project">
              프로젝트 <span className="text-destructive">*</span>
            </Label>
            <Select
              value={projectId ? String(projectId) : undefined}
              onValueChange={(v) => {
                dirtyRef.current = true
                setProjectId(Number(v))
              }}
            >
              <SelectTrigger id="re-project" className={cn("w-full", ring("project_id"))}>
                <SelectValue placeholder="프로젝트 선택" />
              </SelectTrigger>
              <SelectContent>
                {choices.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                    {p.status === "closed" && " (종료)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projectId !== receipt.project_id && (
              <p className="text-xs text-amber-800">저장 시 다른 프로젝트로 이동하며 양쪽 집행액이 바뀝니다.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="re-doc">문서 종류</Label>
              <Select value={fields.doc_type} onValueChange={(v) => setDocType(v as ExpenseDocType)}>
                <SelectTrigger id="re-doc" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DOC_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="re-date">
                거래일자 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="re-date"
                type="date"
                value={fields.issue_date}
                className={ring("issue_date")}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="re-vendor">
              {isPayroll ? "대상자(성명)" : "거래처(가맹점)"} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="re-vendor"
              value={fields.vendor_name}
              maxLength={200}
              className={ring("vendor_name")}
              onChange={(e) => set("vendor_name", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="re-biz">사업자등록번호</Label>
              <Input
                id="re-biz"
                value={fields.vendor_biz_no}
                inputMode="numeric"
                placeholder="000-00-00000"
                maxLength={12}
                className={ring("vendor_biz_no")}
                onChange={(e) => set("vendor_biz_no", e.target.value)}
                onBlur={(e) => {
                  const v = formatBizNo(e.target.value.trim())
                  if (v !== fields.vendor_biz_no) set("vendor_biz_no", v)
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="re-pay">결제 수단</Label>
              <Select value={fields.payment_method} onValueChange={(v) => set("payment_method", v as PaymentMethod)}>
                <SelectTrigger id="re-pay" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="re-currency">통화</Label>
              <Select value={fields.currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
                <SelectTrigger id="re-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CURRENCY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isPayroll && (
              <div className="grid gap-1.5">
                <Label htmlFor="re-payroll-month">귀속월</Label>
                <Input
                  id="re-payroll-month"
                  type="month"
                  value={fields.payroll_month}
                  className={ring("payroll_month")}
                  onChange={(e) => set("payroll_month", e.target.value)}
                />
              </div>
            )}
          </div>

          {isForeign ? (
            <div className="grid gap-1.5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="re-foreign" className="text-xs">
                    {fields.currency} 금액 <span className="text-destructive">*</span>
                  </Label>
                  <SuffixField suffix={fields.currency}>
                    <ForeignAmountInput
                      id="re-foreign"
                      currency={fields.currency}
                      value={fields.foreign_amount}
                      state={{ invalid: invalid.has("foreign_amount") }}
                      className={SHEET_DECIMAL_CLASS}
                      onChange={setForeignAmount}
                    />
                  </SuffixField>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="re-rate" className="text-xs">
                    적용 환율 <span className="text-destructive">*</span>
                  </Label>
                  <SuffixField suffix="원">
                    <RateInput
                      id="re-rate"
                      value={fields.exchange_rate}
                      state={{ invalid: invalid.has("exchange_rate") }}
                      className={SHEET_DECIMAL_CLASS}
                      onChange={setRate}
                    />
                  </SuffixField>
                </div>
                <div className="col-span-2 grid gap-1.5 sm:col-span-1">
                  <Label htmlFor="re-total" className="text-xs">
                    원화 합계 <span className="text-destructive">*</span>
                  </Label>
                  <WonInput
                    id="re-total"
                    value={fields.total_amount}
                    allowNegative
                    invalid={invalid.has("total_amount")}
                    className="font-semibold"
                    onChange={setForeignTotal}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
                {fxLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {fields.issue_date} 환율 조회 중
                  </span>
                ) : (
                  <>
                    {typeof fields.foreign_amount === "number" && typeof fields.exchange_rate === "number" && (
                      <span className="tabular-nums text-dark">
                        {foreignWithCode(fields.currency, fields.foreign_amount)} × {formatFxRate(fields.exchange_rate)} ={" "}
                        {typeof fields.total_amount === "number" ? `${wonNumber(fields.total_amount)}원` : "—"}
                      </span>
                    )}
                    {fxCaption(fields) && <span>{fxCaption(fields)}</span>}
                  </>
                )}
                {!fxLoading && (fields.exchange_rate_source === "manual" || fxError || fields.exchange_rate === null) && (
                  <button
                    type="button"
                    onClick={reapplyRate}
                    className="inline-flex items-center gap-1 font-medium text-dark underline-offset-2 hover:underline"
                  >
                    <RefreshCw className="h-3 w-3" />
                    결제일 환율 적용
                  </button>
                )}
              </div>
              {fxError && <p className="text-xs text-amber-800 [word-break:keep-all]">{fxError}</p>}
            </div>
          ) : (
            <div className="grid gap-1.5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="re-supply" className="text-xs">
                    공급가액
                  </Label>
                  <WonInput
                    id="re-supply"
                    value={fields.supply_amount}
                    allowNegative
                    invalid={invalid.has("supply_amount")}
                    onChange={(v) => set("supply_amount", v)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="re-vat" className="text-xs">
                    부가세
                  </Label>
                  <WonInput
                    id="re-vat"
                    value={fields.vat_amount}
                    allowNegative
                    invalid={invalid.has("vat_amount")}
                    onChange={(v) => set("vat_amount", v)}
                  />
                </div>
                <div className="col-span-2 grid gap-1.5 sm:col-span-1">
                  <Label htmlFor="re-total" className="text-xs">
                    합계 <span className="text-destructive">*</span>
                  </Label>
                  <WonInput
                    id="re-total"
                    value={fields.total_amount}
                    allowNegative
                    invalid={invalid.has("total_amount")}
                    className="font-semibold"
                    onChange={(v) => set("total_amount", v)}
                  />
                </div>
              </div>
              {mismatch && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-800">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    금액 불일치: 공급가액+부가세 <b className="tabular-nums">{wonNumber((fields.supply_amount ?? 0) + (fields.vat_amount ?? 0))}원</b> ≠ 합계
                  </span>
                  <button
                    type="button"
                    className="font-medium underline underline-offset-2"
                    onClick={() => set("total_amount", (fields.supply_amount ?? 0) + (fields.vat_amount ?? 0))}
                  >
                    합계 맞추기
                  </button>
                </div>
              )}
              {!mismatch && !isPayroll && fields.supply_amount === null && fields.vat_amount === null && typeof fields.total_amount === "number" && (
                <button
                  type="button"
                  onClick={splitVat}
                  className="inline-flex w-fit items-center gap-1 text-xs text-text-secondary underline-offset-2 hover:text-dark hover:underline"
                >
                  <Calculator className="h-3.5 w-3.5" />
                  합계로 공급가액·부가세(10%) 계산
                </button>
              )}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="re-approval">승인번호</Label>
            <Input
              id="re-approval"
              value={fields.approval_no}
              maxLength={50}
              placeholder="카드 승인번호"
              onChange={(e) => set("approval_no", e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="re-budget">비목</Label>
            <Input
              id="re-budget"
              list={listId}
              value={fields.budget_item}
              maxLength={100}
              placeholder={budgetNames.length > 0 ? "선택 또는 직접 입력" : "예: 재료비, 회의비"}
              className={ring("budget_item")}
              onChange={(e) => set("budget_item", e.target.value)}
            />
            <datalist id={listId}>
              {budgetNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            {budgetNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {budgetNames.map((n) => {
                  const on = normalizeName(n) === normalizeName(fields.budget_item)
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set("budget_item", n)}
                      className={cn(
                        "h-6 rounded-sm border px-2 text-xs transition-colors",
                        on
                          ? "border-dark/60 bg-warm-beige font-semibold text-dark"
                          : "border-warm-tan bg-card text-text-secondary hover:border-dark/40 hover:text-dark"
                      )}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            )}
            {!budgetKnown && budgetNames.length > 0 && (
              <p className="text-xs text-amber-800">예산 외 비목</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="re-purpose">적요(사용 목적)</Label>
            <Textarea
              id="re-purpose"
              rows={2}
              value={fields.purpose}
              placeholder="예: 시제품 제작용 부품 구입"
              onChange={(e) => set("purpose", e.target.value)}
            />
          </div>

          <div className="rounded-md border border-warm-tan">
            <button
              type="button"
              onClick={() => setShowItems((v) => !v)}
              aria-expanded={showItems}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-dark"
            >
              <span>
                품목 <span className="font-normal text-text-secondary">({fields.items.length}개)</span>
              </span>
              <span className="text-xs text-text-secondary">{showItems ? "접기" : "펼치기"}</span>
            </button>
            {showItems && (
              <ItemsEditor
                items={fields.items}
                onChange={setItems}
                total={fields.total_amount}
              />
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="re-memo">메모</Label>
            <Textarea
              id="re-memo"
              rows={2}
              value={fields.memo}
              placeholder="내부 메모"
              onChange={(e) => set("memo", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-warm-tan bg-card px-4 py-3 sm:px-5">
        {errors.length > 0 && (
          <ul className="mb-2 grid gap-0.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {errors.map((e) => (
              <li key={e}>· {e}</li>
            ))}
          </ul>
        )}
        {serverError && (
          <p role="alert" className="mb-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive [word-break:keep-all]">
            {serverError}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onRequestDelete} disabled={saving}>
            <Trash2 className="h-4 w-4" />
            삭제
          </Button>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              취소
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  저장 중…
                </>
              ) : (
                "저장"
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}

function ItemsEditor({
  items,
  onChange,
  total,
}: {
  items: ReceiptItem[]
  onChange: (items: ReceiptItem[]) => void
  total: number | null
}) {
  const update = (i: number, patch: Partial<ReceiptItem>) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const sum = items.reduce((s, it) => s + (typeof it.amount === "number" ? it.amount : 0), 0)
  return (
    <div className="border-t border-warm-tan/60 px-3 py-2.5">
      {items.length === 0 && <p className="pb-2 text-xs text-text-secondary">품목 없음</p>}
      <ul className="grid gap-2.5">
        {items.map((it, i) => (
          <li key={i} className="grid gap-1.5 rounded-md border border-warm-tan/70 p-2">
            <div className="flex gap-1.5">
              <Input
                value={it.name}
                placeholder="품목명"
                aria-label={`${i + 1}번째 품목명`}
                className="h-8 bg-card text-sm"
                onChange={(e) => update(i, { name: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-text-secondary hover:text-destructive"
                aria-label={`${i + 1}번째 품목 삭제`}
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-[4.5rem_1fr_1fr] gap-1.5">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={it.quantity ?? ""}
                placeholder="수량"
                aria-label={`${i + 1}번째 품목 수량`}
                className="h-8 bg-card text-right text-sm"
                onChange={(e) => {
                  const n = e.target.value === "" ? null : Number(e.target.value)
                  update(i, { quantity: n !== null && Number.isFinite(n) ? n : null })
                }}
              />
              <WonInput
                value={it.unit_price}
                placeholder="단가"
                aria-label={`${i + 1}번째 품목 단가`}
                className="h-8 bg-card text-sm"
                onChange={(v) => update(i, { unit_price: v })}
              />
              <WonInput
                value={it.amount}
                allowNegative
                placeholder="금액"
                aria-label={`${i + 1}번째 품목 금액`}
                className="h-8 bg-card text-sm"
                onChange={(v) => update(i, { amount: v })}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, { name: "", quantity: null, unit_price: null, amount: null }])}
        >
          <Plus className="h-3.5 w-3.5" />
          품목 추가
        </Button>
        {items.length > 0 && (
          <span className="text-xs text-text-secondary">
            품목 합계 <b className="tabular-nums text-dark">{wonNumber(sum)}원</b>
            {typeof total === "number" && sum > 0 && sum !== total && (
              <span className="ml-1 text-text-secondary">(합계 {wonNumber(total)}원과 다름)</span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

// 외화 금액·환율 입력칸은 업로드 표와 같은 ForeignAmountInput·RateInput(천 단위 콤마, 칸을 벗어나면 정리)을 쓰고,
// 시트의 다른 입력칸 높이에 맞추고 오른쪽에 단위를 붙인다.
const SHEET_DECIMAL_CLASS = "h-9 px-3 pr-11"

function SuffixField({ suffix, children }: { suffix: string; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-secondary">{suffix}</span>
    </div>
  )
}

function FilePreview({ receipt, pathname, isImage }: { receipt: ExpenseReceipt; pathname: string; isImage: boolean }) {
  return (
    <div className="overflow-hidden rounded-md border border-warm-tan bg-warm-beige/30">
      {isImage ? (
        <a href={fileUrl(pathname)} target="_blank" rel="noreferrer" title="원본 크게 보기">
          {/* next/image는 쿼리스트링 로컬 src에서 SSR 예외가 나므로 일반 img를 쓴다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl(pathname)} alt={`${receipt.file_name} 원본`} className="max-h-72 w-full bg-white object-contain" loading="lazy" />
        </a>
      ) : (
        <p className="px-4 py-5 text-sm text-dark/70">PDF 원본은 새 창에서 확인하세요.</p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-warm-tan/60 bg-card px-3 py-2 text-xs">
        <span className="min-w-0 flex-1 truncate text-text-secondary" title={receipt.file_name}>
          {receipt.file_name} · {formatBytes(receipt.file_size)}
        </span>
        <a href={fileUrl(pathname)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-dark underline-offset-2 hover:underline">
          <ExternalLink className="h-3 w-3" />새 창
        </a>
        <a
          href={fileUrl(pathname, { download: true, name: receipt.file_name })}
          className="inline-flex items-center gap-1 text-dark underline-offset-2 hover:underline"
        >
          <Download className="h-3 w-3" />
          내려받기
        </a>
      </div>
    </div>
  )
}
