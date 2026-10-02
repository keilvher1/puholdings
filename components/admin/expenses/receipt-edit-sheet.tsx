"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Calculator, ChevronDown, ChevronLeft, ChevronRight, Download, Loader2, Paperclip, Plus, RefreshCw, Trash2, TriangleAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FieldError } from "@/components/ui/field"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BusyButton, ErrorSummary, FilePreview, Notice, SourceTag, useConfirm, useFieldErrors } from "@/components/saas"
import { cn } from "@/lib/utils"
import { WonInput } from "@/components/admin/expenses/won-input"
import { ForeignAmountInput, RateInput } from "@/components/admin/expenses/upload-fields"
import { applyFieldPatch, formatForeign, formatRate, resetFxRate } from "@/components/admin/expenses/upload-model"
import { uploadAttachment } from "@/components/admin/expenses/payroll-entry"
import { fileUrl, formatBytes, jsonInit, normalizeName, requestJson, wonNumber } from "@/components/admin/expenses/client-helpers"
import { appendDifferentTxMark, CHECK_LABELS, type CheckWarning, type ReceiptCheck } from "@/components/admin/expenses/ledger-check"
import { dateShort } from "@/lib/format"
import { friendlyError, MSG } from "@/lib/messages"
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

// "9월 18일(금) 기준 · 유럽중앙은행" / "직접 입력"
export function fxCaption(r: Pick<ReceiptFields, "exchange_rate_date" | "exchange_rate_source">): string {
  if (r.exchange_rate_source === "manual") return FX_SOURCE_LABELS.manual
  const label = FX_SOURCE_LABELS[r.exchange_rate_source] ?? ""
  return [r.exchange_rate_date ? `${dateShort(r.exchange_rate_date)} 기준` : "", label].filter(Boolean).join(" · ")
}

// 원화 합계를 직접 고쳤을 때의 환율(소수 4자리)
function impliedRate(total: number, foreign: number): number {
  return Math.round((total / foreign) * 10000) / 10000
}

// 증빙 내역에서 행을 누르면 열리는 편집 시트(계획서 4.2.7 S-1~S-5).
// - 데스크톱: 왼쪽 원본(이미지·PDF 내장, FilePreview)·오른쪽 칸. 휴대폰: 위아래.
// - 머리: [‹ 이전] [다음 ›] "38건 중 3번째"(장부의 지금 목록 순서, 점검 시트에서 열면 점검 건만). ←/→ 단축키(입력 중에는 동작하지 않음).
// - 문서 종류별 칸: 인건비는 10칸 이하, 외화는 원화 합계 도움말, 카드전표는 승인번호를 위로, 나머지는 "더 보기".
// - 맨 위에 점검 사유(같은 거래로 보이는 쌍·금액 불일치·비목·기간), 누르면 해당 칸으로.
// - 칸 아래 오류 + 2개 이상이면 맨 위 오류 요약. 서버 오류는 시트 안 Notice(입력값 유지).
// 저장 경로·서버 검증·파일 없는 증빙은 인건비만·다른 프로젝트로 옮길 때 경고는 예전과 같다.

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

type FieldKey =
  | "project_id"
  | "doc_type"
  | "issue_date"
  | "vendor_name"
  | "vendor_biz_no"
  | "payment_method"
  | "currency"
  | "approval_no"
  | "foreign_amount"
  | "exchange_rate"
  | "supply_amount"
  | "vat_amount"
  | "total_amount"
  | "payroll_month"
  | "budget_item"
  | "purpose"
  | "memo"

// 화면 칸 이름(오류 요약에 쓴다). 인건비는 지급일·대상자·지급액으로 부른다.
function fieldLabels(payroll: boolean, foreign: boolean): Record<FieldKey, string> {
  return {
    project_id: "프로젝트",
    doc_type: "문서 종류",
    issue_date: payroll ? "지급일" : "거래일자",
    vendor_name: payroll ? "대상자" : "거래처",
    vendor_biz_no: "사업자등록번호",
    payment_method: "결제 수단",
    currency: "통화",
    approval_no: "승인번호",
    foreign_amount: "외화 금액",
    exchange_rate: "적용 환율",
    supply_amount: "공급가액",
    vat_amount: "부가세",
    total_amount: payroll ? "지급액" : foreign ? "원화 합계" : "합계",
    payroll_month: "귀속월",
    budget_item: "비목",
    purpose: "적요",
    memo: "메모",
  }
}

// lib/expenses의 검증 문장 → (칸, 칸 아래 문구). 검증 규칙 자체는 그대로 쓴다.
function mapValidation(messages: string[], payroll: boolean, currency: CurrencyCode): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {}
  const put = (k: FieldKey, m: string) => {
    if (!out[k]) out[k] = m
  }
  for (const m of messages) {
    if (m.includes("거래일자")) put("issue_date", payroll ? "지급일을 골라 주세요" : "거래일자를 골라 주세요")
    else if (m.includes("거래처명이 너무")) put("vendor_name", "200자 안으로 줄여 주세요")
    else if (m.includes("거래처")) put("vendor_name", payroll ? "대상자 이름을 입력해 주세요" : "거래처 이름을 입력해 주세요")
    else if (m.includes("합계")) put("total_amount", currency !== "KRW" ? "원화 합계를 원 단위로 입력해 주세요" : "금액을 원 단위로 입력해 주세요")
    else if (m.includes("공급가액")) put("supply_amount", "원 단위 정수로 입력해 주세요")
    else if (m.includes("부가세")) put("vat_amount", "원 단위 정수로 입력해 주세요")
    else if (m.includes("사업자등록번호")) put("vendor_biz_no", "숫자 10자리(000-00-00000)로 입력해 주세요")
    else if (m.includes("비목")) put("budget_item", "100자 안으로 줄여 주세요")
    else if (/^[A-Z]{3} 금액/.test(m)) put("foreign_amount", `${currency} 금액을 입력해 주세요`)
    else if (m.includes("환율")) put("exchange_rate", "환율을 입력하거나 [결제일 환율 적용]을 눌러 주세요")
    else if (m.includes("귀속월")) put("payroll_month", "귀속월을 골라 주세요")
    else if (m.includes("결제 수단")) put("payment_method", "결제 수단을 다시 골라 주세요")
    else if (m.includes("통화")) put("currency", "통화를 다시 골라 주세요")
    else put("doc_type", "문서 종류를 다시 골라 주세요")
  }
  return out
}

// 점검 사유를 누르면 옮겨 갈 칸
const REASON_FIELD: Record<CheckWarning, FieldKey> = {
  same_tx: "memo",
  amount_mismatch: "total_amount",
  unassigned: "budget_item",
  off_budget: "budget_item",
  out_of_period: "issue_date",
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return !!el.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="option"], [role="menu"], [role="menuitem"]')
}

export interface ReceiptSheetNav {
  /** 0부터 */
  index: number
  total: number
  onPrev?: () => void
  onNext?: () => void
  /** "점검 건" 처럼 무엇을 도는지(없으면 "지금 목록") */
  scope?: string
}

export function ReceiptEditSheet({
  receipt,
  projects,
  onClose,
  onSaved,
  onRequestDelete,
  nav,
  check,
  findReceipt,
  onOpenReceipt,
}: {
  receipt: ExpenseReceipt | null
  projects: ExpenseProject[]
  onClose: () => void
  onSaved: (message: string) => void
  onRequestDelete: (r: ExpenseReceipt) => void
  nav?: ReceiptSheetNav | null
  /** 이 증빙의 점검 결과(장부에서 계산) */
  check?: ReceiptCheck | null
  /** 같은 거래 상대 증빙 찾기 */
  findReceipt?: (id: number) => ExpenseReceipt | undefined
  /** [그 증빙 열기] */
  onOpenReceipt?: (id: number) => void
}) {
  const ask = useConfirm()
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)

  // 저장하지 않은 수정이 있으면 이동·닫기 전에 묻는다
  const guard = useCallback(
    async (fn: () => void) => {
      if (savingRef.current) return
      if (dirtyRef.current) {
        const ok = await ask({
          title: "저장하지 않은 수정 내용이 있어요",
          body: "이동하면 고친 내용이 사라져요.",
          confirmLabel: "저장하지 않고 이동",
          cancelLabel: "계속 고치기",
        })
        if (!ok) return
        dirtyRef.current = false
      }
      fn()
    },
    [ask],
  )

  return (
    <Sheet open={receipt !== null} onOpenChange={(o) => !o && void guard(onClose)}>
      {/* 열 때 첫 입력칸에 포커스 링이 먼저 잡히지 않게 한다(검토 창과 같은 방식). Tab을 누르면 첫 칸부터 이동한다. */}
      <SheetContent
        side="right"
        className="app-shell w-full gap-0 bg-card p-0 sm:w-[94vw] sm:max-w-5xl [&>button:last-child]:hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {receipt && (
          <EditBody
            key={`${receipt.id}-${receipt.updated_at}`}
            receipt={receipt}
            projects={projects}
            dirtyRef={dirtyRef}
            savingRef={savingRef}
            nav={nav ?? null}
            check={check ?? null}
            findReceipt={findReceipt}
            onGuard={guard}
            onClose={() => void guard(onClose)}
            onOpenReceipt={onOpenReceipt}
            onSaved={(m) => {
              dirtyRef.current = false
              onSaved(m)
            }}
            onRequestDelete={() => onRequestDelete(receipt)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function EditBody({
  receipt,
  projects,
  dirtyRef,
  savingRef,
  nav,
  check,
  findReceipt,
  onGuard,
  onClose,
  onOpenReceipt,
  onSaved,
  onRequestDelete,
}: {
  receipt: ExpenseReceipt
  projects: ExpenseProject[]
  dirtyRef: React.MutableRefObject<boolean>
  savingRef: React.MutableRefObject<boolean>
  nav: ReceiptSheetNav | null
  check: ReceiptCheck | null
  findReceipt?: (id: number) => ExpenseReceipt | undefined
  onGuard: (fn: () => void) => Promise<void>
  onClose: () => void
  onOpenReceipt?: (id: number) => void
  onSaved: (message: string) => void
  onRequestDelete: () => void
}) {
  const [fields, setFields] = useState<ReceiptFields>(() => {
    dirtyRef.current = false
    return pickFields(receipt)
  })
  const [projectId, setProjectId] = useState<number>(receipt.project_id)
  const [formError, setFormError] = useState("")
  const [serverError, setServerError] = useState("")
  const [saving, setSaving] = useState<"save" | "mark" | null>(null)
  const [showItems, setShowItems] = useState(receipt.items.length > 0)
  const [fxLoading, setFxLoading] = useState(false)
  const [fxError, setFxError] = useState("")
  const fxSeq = useRef(0)
  const [attached, setAttached] = useState<UploadedFileMeta | null>(null)
  const [attaching, setAttaching] = useState(false)
  const [attachError, setAttachError] = useState("")
  const attachInputRef = useRef<HTMLInputElement>(null)

  const project = projects.find((p) => p.id === projectId) ?? null
  // 증빙 올리기와 같이 진행 중 프로젝트만 고를 수 있게 하되, 지금 연결된 프로젝트는(종료됐어도) 목록에 남긴다
  const choices = projects.filter((p) => p.status === "active" || p.id === receipt.project_id)
  const budgetNames = project?.budget_items.map((b) => b.name).filter(Boolean) ?? []
  const budgetKnown = !fields.budget_item.trim() || budgetNames.map(normalizeName).includes(normalizeName(fields.budget_item))
  const mismatch = amountMismatch(fields)
  const hasFile = Boolean(receipt.file_pathname)
  const isForeign = fields.currency !== "KRW"
  const isPayroll = fields.doc_type === "payroll"
  const isCard = fields.doc_type === "card_slip"
  const listId = `budget-names-${receipt.id}`

  const fe = useFieldErrors(fieldLabels(isPayroll, isForeign))

  // 문서 종류별로 "더 보기"에 접어 둘 칸
  const moreKeys: FieldKey[] = isPayroll
    ? ["doc_type"]
    : isForeign
      ? ["vendor_biz_no", ...(isCard ? [] : (["approval_no"] as FieldKey[])), "memo"]
      : ["vendor_biz_no", "currency", ...(isCard ? [] : (["approval_no"] as FieldKey[])), "memo"]
  const [moreOpen, setMoreOpen] = useState(false)
  const moreHasError = moreKeys.some((k) => fe.errors[k])
  const showMore = moreOpen || moreHasError
  const filledInMore = moreKeys.filter((k) => {
    const v = (fields as unknown as Record<string, unknown>)[k]
    return k === "currency" ? false : typeof v === "string" && v.trim() !== ""
  }).length + (!isPayroll && fields.items.length > 0 ? 1 : 0)

  const touch = () => {
    dirtyRef.current = true
    setServerError("")
    setFormError("")
  }
  const set = <K extends keyof ReceiptFields>(key: K, v: ReceiptFields[K]) => {
    touch()
    if ((fe.errors as Record<string, string | undefined>)[key]) fe.clear(key as FieldKey)
    setFields((f) => ({ ...f, [key]: v }))
  }
  const setItems = (items: ReceiptItem[]) => set("items", items)
  const patch = (fn: (f: ReceiptFields) => Partial<ReceiptFields>) => {
    touch()
    setFields((f) => ({ ...f, ...fn(f) }))
  }

  // ←/→ 로 이전·다음(입력칸·목록 상자에 포커스가 있거나 확인창이 떠 있으면 동작하지 않음)
  useEffect(() => {
    if (!nav) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return
      if (document.querySelector('[role="alertdialog"]')) return
      const go = e.key === "ArrowLeft" ? nav.onPrev : nav.onNext
      if (!go) return
      e.preventDefault()
      void onGuard(go)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [nav, onGuard])

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
      setFxError("거래일자를 넣으면 그날 환율을 적용해요.")
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
      setFxError("환율을 불러오지 못했어요. 환율을 직접 입력해 주세요.")
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
    fe.clear("issue_date")
    patch((f) => applyFieldPatch(f, { issue_date: date }))
    if (isForeign && fields.exchange_rate_source !== "manual") void loadRate(fields.currency, date)
  }

  const setCurrency = (c: CurrencyCode) => {
    if (c === fields.currency) return
    // 통화가 바뀌면 이전 환율(직접 입력 포함)은 버리고 결제일 환율을 새로 받는다. 외화 증빙에는 한국 부가세가 없다.
    patch((f) => ({ ...applyFieldPatch(f, { currency: c }), ...(c !== "KRW" ? { supply_amount: null, vat_amount: null } : {}) }))
    void loadRate(c, c === "KRW" ? "" : fields.issue_date)
  }

  const setForeignAmount = (v: number | null) => {
    fe.clear("foreign_amount")
    patch((f) => ({
      foreign_amount: v,
      total_amount: v !== null && typeof f.exchange_rate === "number" ? convertToKrw(v, f.exchange_rate) : v === null ? null : f.total_amount,
    }))
  }

  const setRate = (v: number | null) => {
    fe.clear("exchange_rate")
    patch((f) => ({
      exchange_rate: v,
      exchange_rate_date: isValidDate(f.issue_date) ? f.issue_date : "",
      exchange_rate_source: "manual",
      total_amount: v !== null && typeof f.foreign_amount === "number" ? convertToKrw(f.foreign_amount, v) : f.total_amount,
    }))
  }

  const setForeignTotal = (v: number | null) => {
    fe.clear("total_amount")
    patch((f) => ({
      total_amount: v,
      exchange_rate_source: "manual",
      exchange_rate_date: isValidDate(f.issue_date) ? f.issue_date : "",
      exchange_rate: v !== null && typeof f.foreign_amount === "number" && f.foreign_amount > 0 ? impliedRate(v, f.foreign_amount) : f.exchange_rate,
    }))
  }

  // 직접 입력한 환율을 버리고 결제일 환율을 다시 받는다(조회가 끝날 때까지 환율·원화 합계는 비워 둔다).
  const reapplyRate = () => {
    patch((f) => ({ ...resetFxRate(f), total_amount: typeof f.foreign_amount === "number" ? null : f.total_amount }))
    void loadRate(fields.currency, fields.issue_date)
  }

  const setDocType = (t: ExpenseDocType) => {
    fe.clear("doc_type")
    patch((f) => ({
      doc_type: t,
      payroll_month: t === "payroll" && !f.payroll_month && isValidDate(f.issue_date) ? f.issue_date.slice(0, 7) : f.payroll_month,
    }))
  }

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
    fe.clear("doc_type")
    setAttached(r.file)
  }

  const splitVat = () => {
    if (typeof fields.total_amount !== "number") return
    const supply = Math.round(fields.total_amount / 1.1)
    dirtyRef.current = true
    setFields((f) => ({ ...f, supply_amount: supply, vat_amount: (f.total_amount ?? 0) - supply }))
  }

  const focusField = (k: FieldKey) => {
    if (moreKeys.includes(k)) setMoreOpen(true)
    requestAnimationFrame(() => {
      const el = document.getElementById(fe.fieldId(k))
      if (el) {
        el.focus()
        el.scrollIntoView({ block: "center" })
      }
    })
  }

  const save = async (opts: { markDifferent?: number } = {}) => {
    const clean: ReceiptFields = {
      ...fields,
      vendor_name: fields.vendor_name.trim(),
      vendor_biz_no: fields.vendor_biz_no.trim() ? formatBizNo(fields.vendor_biz_no.trim()) : "",
      approval_no: fields.approval_no.trim(),
      budget_item: normalizeName(fields.budget_item),
      purpose: fields.purpose.trim(),
      memo: typeof opts.markDifferent === "number" ? appendDifferentTxMark(fields.memo, opts.markDifferent) : fields.memo.trim(),
      items: fields.items.filter((i) => i.name.trim() || i.amount !== null || i.unit_price !== null),
      payroll_month: fields.doc_type === "payroll" ? fields.payroll_month : "",
      ...(fields.currency === "KRW"
        ? { foreign_amount: null, exchange_rate: null, exchange_rate_date: "", exchange_rate_source: "" as const }
        : {}),
    }
    const errs = mapValidation(validateReceiptFields(clean), clean.doc_type === "payroll", clean.currency)
    if (!projectId) errs.project_id = "프로젝트를 골라 주세요"
    if (!hasFile && !attached && clean.doc_type !== "payroll") {
      errs.doc_type = "원본 파일이 없는 증빙은 ‘인건비 지급’으로만 저장할 수 있어요. 다른 종류로 바꾸려면 파일을 먼저 첨부해 주세요"
    }
    if (Object.keys(errs).some((k) => moreKeys.includes(k as FieldKey))) setMoreOpen(true)
    if (!fe.check(errs)) return
    if (attaching) {
      setFormError("첨부 파일을 올리는 중이에요. 끝나면 다시 저장해 주세요.")
      return
    }
    if (clean.currency !== "KRW" && fxLoading) {
      setFormError("결제일 환율을 불러오는 중이에요. 잠시 뒤 다시 저장해 주세요.")
      return
    }
    setSaving(typeof opts.markDifferent === "number" ? "mark" : "save")
    savingRef.current = true
    setServerError("")
    setFormError("")
    const r = await requestJson("/api/admin/expenses/receipts", jsonInit("PUT", { id: receipt.id, ...clean, project_id: projectId, ...(attached ? { file: attached } : {}) }))
    setSaving(null)
    savingRef.current = false
    if (!r.ok) {
      setServerError(friendlyError(r.status, r.error, MSG.saveFailed))
      return
    }
    onSaved(
      typeof opts.markDifferent === "number"
        ? "다른 거래로 표시했어요. 이 쌍은 점검에서 빠져요."
        : projectId !== receipt.project_id && project
          ? `증빙을 고치고 ‘${project.name}’ 프로젝트로 옮겼어요.`
          : "증빙을 고쳤어요."
    )
  }

  const busy = saving !== null
  const amountLabel = isPayroll ? "지급액" : "합계"

  // ── 칸 조각 ─────────────────────────────────────────────────────────────────
  const err = (k: FieldKey) =>
    fe.errors[k] ? (
      <FieldError id={fe.errorId(k)} className="text-sm">
        {fe.errors[k]}
      </FieldError>
    ) : null
  const req = <span className="text-red-800" aria-hidden> *</span>

  const projectField = (
    <div className="grid gap-1.5">
      <Label htmlFor={fe.fieldId("project_id")}>프로젝트{req}</Label>
      <Select
        value={projectId ? String(projectId) : undefined}
        onValueChange={(v) => {
          dirtyRef.current = true
          fe.clear("project_id")
          setProjectId(Number(v))
        }}
      >
        <SelectTrigger {...fe.field("project_id")} className="w-full">
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
      {err("project_id")}
      {projectId !== receipt.project_id && (
        <p className="text-sm text-amber-800 [word-break:keep-all]">저장하면 다른 프로젝트로 옮겨지고 양쪽 집행액이 바뀌어요.</p>
      )}
    </div>
  )

  const docTypeField = (
    <div className="grid gap-1.5">
      <Label htmlFor={fe.fieldId("doc_type")}>문서 종류</Label>
      <Select value={fields.doc_type} onValueChange={(v) => setDocType(v as ExpenseDocType)}>
        <SelectTrigger {...fe.field("doc_type")} className="w-full">
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
      {err("doc_type")}
    </div>
  )

  const dateField = (
    <div className="grid gap-1.5">
      <Label htmlFor={fe.fieldId("issue_date")}>
        {isPayroll ? "지급일" : "거래일자"}
        {req}
      </Label>
      <Input {...fe.field("issue_date")} type="date" value={fields.issue_date} onChange={(e) => setIssueDate(e.target.value)} />
      {err("issue_date")}
    </div>
  )

  const vendorField = (
    <div className="grid gap-1.5">
      <Label htmlFor={fe.fieldId("vendor_name")}>
        {isPayroll ? "대상자(성명)" : "거래처(가맹점)"}
        {req}
      </Label>
      <Input {...fe.field("vendor_name")} value={fields.vendor_name} maxLength={200} onChange={(e) => set("vendor_name", e.target.value)} />
      {err("vendor_name")}
    </div>
  )

  const bizField = (
    <div className="grid gap-1.5">
      <Label htmlFor={fe.fieldId("vendor_biz_no")}>사업자등록번호</Label>
      <Input
        {...fe.field("vendor_biz_no")}
        value={fields.vendor_biz_no}
        inputMode="numeric"
        placeholder="000-00-00000"
        maxLength={12}
        onChange={(e) => set("vendor_biz_no", e.target.value)}
        onBlur={(e) => {
          const v = formatBizNo(e.target.value.trim())
          if (v !== fields.vendor_biz_no) set("vendor_biz_no", v)
        }}
      />
      {err("vendor_biz_no")}
    </div>
  )

  const paymentField = (
    <div className="grid gap-1.5">
      <Label htmlFor={fe.fieldId("payment_method")}>결제 수단</Label>
      <Select value={fields.payment_method} onValueChange={(v) => set("payment_method", v as PaymentMethod)}>
        <SelectTrigger {...fe.field("payment_method")} className="w-full">
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
      {err("payment_method")}
    </div>
  )

  const currencyField = (
    <div className="grid gap-1.5">
      <Label htmlFor={fe.fieldId("currency")}>통화</Label>
      <Select value={fields.currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
        <SelectTrigger {...fe.field("currency")} className="w-full">
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
      {err("currency")}
    </div>
  )

  const approvalField = (
    <div className="grid gap-1.5">
      <Label htmlFor={fe.fieldId("approval_no")}>{isCard ? "카드 승인번호" : "승인번호"}</Label>
      <Input {...fe.field("approval_no")} value={fields.approval_no} maxLength={50} onChange={(e) => set("approval_no", e.target.value)} />
    </div>
  )

  const payrollMonthField = (
    <div className="grid gap-1.5">
      <Label htmlFor={fe.fieldId("payroll_month")}>귀속월(일한 달)</Label>
      <Input {...fe.field("payroll_month")} type="month" value={fields.payroll_month} onChange={(e) => set("payroll_month", e.target.value)} />
      {err("payroll_month") ?? <p className="text-sm text-text-secondary">급여를 다음 달에 주면 일한 달로 고쳐 주세요</p>}
    </div>
  )

  const foreignFields = (
    <div className="grid gap-3">
      {currencyField}
      <div className="grid grid-cols-2 items-start gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={fe.fieldId("foreign_amount")}>
            {fields.currency} 금액{req}
          </Label>
          <SuffixField suffix={fields.currency}>
            <ForeignAmountInput
              id={fe.fieldId("foreign_amount")}
              currency={fields.currency}
              value={fields.foreign_amount}
              state={{ invalid: !!fe.errors.foreign_amount }}
              className={SHEET_DECIMAL_CLASS}
              onChange={setForeignAmount}
            />
          </SuffixField>
          {err("foreign_amount")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={fe.fieldId("exchange_rate")}>
            적용 환율{req}
            <SourceTag source={fields.exchange_rate_source === "manual" ? "manual" : null} />
          </Label>
          <SuffixField suffix="원">
            <RateInput
              id={fe.fieldId("exchange_rate")}
              value={fields.exchange_rate}
              state={{ invalid: !!fe.errors.exchange_rate }}
              className={SHEET_DECIMAL_CLASS}
              onChange={setRate}
            />
          </SuffixField>
          {err("exchange_rate")}
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={fe.fieldId("total_amount")}>원화 합계{req}</Label>
        <WonInput
          {...fe.field("total_amount")}
          value={fields.total_amount}
          allowNegative
          invalid={!!fe.errors.total_amount}
          className="font-semibold"
          onChange={setForeignTotal}
        />
        {err("total_amount")}
        <p className="text-sm text-text-secondary [word-break:keep-all]">
          카드 해외거래내역서의 원화 금액이 있으면 그 금액을 넣어 주세요(환율은 ‘직접 입력’으로 바뀌어요).
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
        {fxLoading ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {dateShort(fields.issue_date)} 환율을 불러오는 중…
          </span>
        ) : (
          <>
            {typeof fields.foreign_amount === "number" && typeof fields.exchange_rate === "number" && (
              <span className="tabular-nums text-dark">
                {foreignWithCode(fields.currency, fields.foreign_amount)} × {formatFxRate(fields.exchange_rate)} ={" "}
                {typeof fields.total_amount === "number" ? `${wonNumber(fields.total_amount)}원` : "-"}
              </span>
            )}
            {fxCaption(fields) && <span>{fxCaption(fields)}</span>}
          </>
        )}
        {!fxLoading && (fields.exchange_rate_source === "manual" || fxError || fields.exchange_rate === null) && (
          <button
            type="button"
            onClick={reapplyRate}
            className="inline-flex min-h-8 items-center gap-1 font-medium text-link underline underline-offset-2"
          >
            <RefreshCw className="size-4" aria-hidden />
            결제일 환율 적용
          </button>
        )}
      </div>
      {fxError && <p className="text-sm text-amber-800 [word-break:keep-all]">{fxError}</p>}
    </div>
  )

  const krwAmountFields = isPayroll ? (
    <div className="grid gap-1.5">
      <Label htmlFor={fe.fieldId("total_amount")}>지급액{req}</Label>
      <WonInput
        {...fe.field("total_amount")}
        value={fields.total_amount}
        allowNegative
        invalid={!!fe.errors.total_amount}
        className="font-semibold"
        onChange={(v) => set("total_amount", v)}
      />
      {err("total_amount")}
    </div>
  ) : (
    <div className="grid gap-1.5">
      <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor={fe.fieldId("supply_amount")}>공급가액</Label>
          <WonInput
            {...fe.field("supply_amount")}
            value={fields.supply_amount}
            allowNegative
            invalid={!!fe.errors.supply_amount}
            onChange={(v) => set("supply_amount", v)}
          />
          {err("supply_amount")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={fe.fieldId("vat_amount")}>부가세</Label>
          <WonInput {...fe.field("vat_amount")} value={fields.vat_amount} allowNegative invalid={!!fe.errors.vat_amount} onChange={(v) => set("vat_amount", v)} />
          {err("vat_amount")}
        </div>
        <div className="col-span-2 grid gap-1.5 sm:col-span-1">
          <Label htmlFor={fe.fieldId("total_amount")}>
            {amountLabel}
            {req}
          </Label>
          <WonInput
            {...fe.field("total_amount")}
            value={fields.total_amount}
            allowNegative
            invalid={!!fe.errors.total_amount}
            className="font-semibold"
            onChange={(v) => set("total_amount", v)}
          />
          {err("total_amount")}
        </div>
      </div>
      {mismatch && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-amber-800">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <span>
            금액이 맞지 않아요: 공급가액 + 부가세 <b className="tabular-nums">{wonNumber((fields.supply_amount ?? 0) + (fields.vat_amount ?? 0))}원</b> ≠ 합계
          </span>
          <button
            type="button"
            className="min-h-8 font-medium text-link underline underline-offset-2"
            onClick={() => set("total_amount", (fields.supply_amount ?? 0) + (fields.vat_amount ?? 0))}
          >
            합계 맞추기
          </button>
        </div>
      )}
      {!mismatch && fields.supply_amount === null && fields.vat_amount === null && typeof fields.total_amount === "number" && (
        <button
          type="button"
          onClick={splitVat}
          className="inline-flex min-h-8 w-fit items-center gap-1 text-sm text-link underline underline-offset-2"
        >
          <Calculator className="size-4" aria-hidden />
          합계로 공급가액·부가세(10%) 계산
        </button>
      )}
    </div>
  )

  const budgetField = (
    <div className="grid gap-1.5">
      <Label htmlFor={fe.fieldId("budget_item")}>비목</Label>
      <Input
        {...fe.field("budget_item")}
        list={listId}
        value={fields.budget_item}
        maxLength={100}
        placeholder={budgetNames.length > 0 ? "고르거나 직접 입력" : "예: 재료비, 회의비"}
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
                  "h-8 rounded-sm border px-2.5 text-sm transition-colors",
                  on ? "border-dark/60 bg-warm-beige font-semibold text-dark" : "border-warm-tan bg-card text-text-muted-strong hover:border-dark/40 hover:text-dark",
                )}
              >
                {n}
              </button>
            )
          })}
        </div>
      )}
      {err("budget_item")}
      {!budgetKnown && budgetNames.length > 0 && <p className="text-sm text-amber-800">프로젝트 예산에 없는 비목이에요</p>}
    </div>
  )

  const purposeField = (
    <div className="grid gap-1.5">
      <Label htmlFor={fe.fieldId("purpose")}>적요(사용 목적)</Label>
      <Textarea
        {...fe.field("purpose")}
        rows={2}
        value={fields.purpose}
        placeholder={isPayroll ? "예: 2026년 9월 급여(참여율 50%)" : "예: 시제품 제작용 부품 구입"}
        onChange={(e) => set("purpose", e.target.value)}
      />
    </div>
  )

  const memoField = (
    <div className="grid gap-1.5">
      <Label htmlFor={fe.fieldId("memo")}>메모</Label>
      <Textarea {...fe.field("memo")} rows={2} value={fields.memo} placeholder="내부 메모" onChange={(e) => set("memo", e.target.value)} />
    </div>
  )

  const itemsBox = (
    <div className="rounded-md border border-warm-tan">
      <button
        type="button"
        onClick={() => setShowItems((v) => !v)}
        aria-expanded={showItems}
        className="flex min-h-10 w-full items-center justify-between px-3 py-2 text-[15px] font-medium text-dark"
      >
        <span>
          품목 <span className="font-normal text-text-secondary">({fields.items.length}개)</span>
        </span>
        <span className="text-sm text-text-secondary">{showItems ? "접기" : "펼치기"}</span>
      </button>
      {showItems && <ItemsEditor items={fields.items} onChange={setItems} total={fields.total_amount} />}
    </div>
  )

  const fieldOf: Partial<Record<FieldKey, ReactNode>> = {
    doc_type: docTypeField,
    vendor_biz_no: bizField,
    currency: currencyField,
    approval_no: approvalField,
    memo: memoField,
  }
  const moreLabels = moreKeys.map((k) => fieldLabels(isPayroll, isForeign)[k]).concat(isPayroll ? [] : ["품목"])

  // 문서 종류별 기본 칸(나머지는 "더 보기")
  const primary: ReactNode = isPayroll ? (
    <>
      {projectField}
      <div className="grid grid-cols-2 items-start gap-3">
        {dateField}
        {payrollMonthField}
      </div>
      {vendorField}
      {krwAmountFields}
      {paymentField}
      {budgetField}
      {purposeField}
      {memoField}
    </>
  ) : (
    <>
      {projectField}
      <div className="grid grid-cols-2 items-start gap-3">
        {docTypeField}
        {dateField}
      </div>
      {vendorField}
      {isCard && approvalField}
      {isForeign ? foreignFields : krwAmountFields}
      {paymentField}
      {budgetField}
      {purposeField}
    </>
  )

  // ── 점검 사유 머리말(S-4) ──────────────────────────────────────────────────
  const reasons = check?.warnings ?? []
  const notes = check?.notes ?? []
  const reasonBox =
    reasons.length > 0 || notes.length > 0 ? (
      <div className="grid gap-2">
        {reasons.length > 0 && (
          <Notice tone="warning" title={`확인할 것 ${reasons.length}개`}>
            <ul className="grid gap-1.5 text-[15px]">
              {reasons.map((w) =>
                w === "same_tx" ? (
                  (check?.pairs ?? []).map((p) => {
                    const other = findReceipt?.(p.otherId)
                    return (
                      <li key={`pair-${p.otherId}`} className="[word-break:keep-all]">
                        같은 거래로 보여요
                        {other ? (
                          <>
                            : {dateShort(other.issue_date)} {DOC_TYPE_LABELS[other.doc_type] ?? other.doc_type} {other.vendor_name}{" "}
                            <b className="tabular-nums">{wonNumber(other.total_amount)}원</b>
                          </>
                        ) : null}
                        <span className="mt-1 flex flex-wrap gap-2">
                          {onOpenReceipt && (
                            <Button type="button" size="sm" variant="outline" className="bg-card hover:bg-warm-beige" onClick={() => void onGuard(() => onOpenReceipt(p.otherId))}>
                              그 증빙 열기
                            </Button>
                          )}
                          <BusyButton
                            type="button"
                            size="sm"
                            variant="outline"
                            className="bg-card hover:bg-warm-beige"
                            busy={saving === "mark"}
                            disabled={busy}
                            onClick={() => void save({ markDifferent: p.otherId })}
                          >
                            다른 거래로 표시하고 저장
                          </BusyButton>
                        </span>
                      </li>
                    )
                  })
                ) : (
                  <li key={w}>
                    <button
                      type="button"
                      onClick={() => focusField(w === "out_of_period" && isPayroll ? "payroll_month" : REASON_FIELD[w])}
                      className="text-left underline underline-offset-2 [word-break:keep-all]"
                    >
                      {CHECK_LABELS[w].label}
                    </button>
                    <span className="text-amber-900"> — {CHECK_LABELS[w].hint}</span>
                  </li>
                ),
              )}
            </ul>
          </Notice>
        )}
        {notes.length > 0 && (
          <p className="text-sm text-text-secondary [word-break:keep-all]">
            참고: {notes.map((n) => CHECK_LABELS[n].label).join(" · ")}
            {notes.includes("low_confidence") && " — 원본과 한 번 대조해 보세요"}
          </p>
        )}
      </div>
    ) : null

  // ── 원본(왼쪽) ─────────────────────────────────────────────────────────────
  const original =
    hasFile && receipt.file_pathname ? (
      <div className="grid gap-2">
        <FilePreview
          url={fileUrl(receipt.file_pathname)}
          type={receipt.file_type}
          name={receipt.file_name}
          height="calc(100dvh - 15rem)"
          className="[&_img]:max-h-72 md:[&_img]:max-h-[calc(100dvh-15rem)]"
        />
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
          <span className="min-w-0 truncate">{formatBytes(receipt.file_size)}</span>
          <a
            href={fileUrl(receipt.file_pathname, { download: true, name: receipt.file_name })}
            className="inline-flex min-h-8 items-center gap-1 text-link underline underline-offset-2"
          >
            <Download className="size-4" aria-hidden />
            원본 받기
          </a>
        </p>
      </div>
    ) : (
      <div className="rounded-md border border-warm-tan bg-warm-ivory px-4 py-4">
        <p className="text-[15px] font-medium text-dark">원본 없음(직접 등록)</p>
        <p className="mt-0.5 text-sm text-text-secondary [word-break:keep-all]">
          증빙 파일 없이 입력한 내역이에요. 이체확인증·급여명세서를 첨부할 수 있어요.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {attaching ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              올리는 중…
            </span>
          ) : attached ? (
            <>
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-warm-tan bg-card py-1 pl-2 pr-1 text-sm text-dark">
                <Paperclip className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 truncate" title={attached.name}>
                  {attached.name} · {formatBytes(attached.size)}
                </span>
                <button
                  type="button"
                  aria-label={`${attached.name} 첨부 빼기`}
                  onClick={() => setAttached(null)}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-warm-beige hover:text-dark"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </span>
              <span className="text-sm text-text-secondary">저장하면 첨부돼요</span>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" className="hover:bg-warm-beige" onClick={() => attachInputRef.current?.click()}>
              <Paperclip className="size-4" aria-hidden />
              첨부 추가
            </Button>
          )}
        </div>
        {attachError && (
          <p role="alert" className="mt-1.5 text-sm text-red-800 [word-break:keep-all]">
            {attachError}
          </p>
        )}
        <input
          ref={attachInputRef}
          type="file"
          accept={SCAN_ACCEPT}
          className="hidden"
          aria-label="첨부 파일 고르기"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ""
            void onAttach(f)
          }}
        />
      </div>
    )

  // <form>을 쓰지 않는다: Radix Select가 form 안에서 숨은 <select>를 따로 그려 칸 수·화면 읽기에 잡히기 때문.
  // 대신 한 줄 입력칸에서 Enter를 누르면 저장한다(예전 form 제출과 같은 동작).
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.nativeEvent.isComposing || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
        const t = e.target as HTMLElement
        if (!(t instanceof HTMLInputElement) || t.type === "file" || t.closest('[role="combobox"]')) return
        e.preventDefault()
        if (!busy) void save()
      }}
    >
      <SheetHeader className="gap-1 border-b border-warm-tan px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-lg font-semibold text-dark">증빙 수정</SheetTitle>
            <SheetDescription className="text-sm text-text-secondary [word-break:keep-all]">
              {receipt.vendor_name} · {dateShort(receipt.issue_date)} · {wonNumber(receipt.total_amount)}원
              {receipt.currency && receipt.currency !== "KRW" && ` (${foreignWithCode(receipt.currency, receipt.foreign_amount)})`}
            </SheetDescription>
          </div>
          {nav && nav.total > 1 && (
            <div className="order-last flex w-full shrink-0 items-center gap-1 sm:order-none sm:w-auto">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="px-2 hover:bg-warm-beige"
                disabled={!nav.onPrev || busy}
                onClick={() => nav.onPrev && void onGuard(nav.onPrev)}
                aria-label="이전 증빙"
                title="이전 증빙(←)"
              >
                <ChevronLeft className="size-4" aria-hidden />
                <span className="hidden sm:inline">이전</span>
              </Button>
              <span className="px-1 text-sm tabular-nums text-text-muted-strong" aria-live="polite">
                <span className="sr-only">{nav.scope ?? "지금 목록"} </span>
                {nav.total}건 중 {nav.index + 1}번째
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="px-2 hover:bg-warm-beige"
                disabled={!nav.onNext || busy}
                onClick={() => nav.onNext && void onGuard(nav.onNext)}
                aria-label="다음 증빙"
                title="다음 증빙(→)"
              >
                <span className="hidden sm:inline">다음</span>
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-text-muted-strong hover:bg-warm-beige hover:text-dark"
            onClick={onClose}
            aria-label="증빙 수정 닫기"
          >
            <X aria-hidden />
          </Button>
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-5 px-4 py-4 sm:px-5 md:grid-cols-2 md:gap-6">
          <div className="md:sticky md:top-0 md:self-start md:pt-0">{original}</div>
          <div className="grid content-start gap-4">
            {reasonBox}
            <ErrorSummary errors={fe.summary} />
            {primary}
            {/* 나머지 칸 — 문서 종류별로 덜 쓰는 칸 */}
            {(moreKeys.length > 0 || !isPayroll) && (
              <div className="rounded-md border border-warm-tan">
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={showMore}
                  className="flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-left text-[15px] font-medium text-dark"
                >
                  <span className="min-w-0 [word-break:keep-all]">
                    더 보기 <span className="font-normal text-text-secondary">({moreLabels.join(" · ")})</span>
                    {filledInMore > 0 && <span className="font-normal text-text-secondary"> · {filledInMore}개 입력됨</span>}
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 text-text-secondary", showMore && "rotate-180")} aria-hidden />
                </button>
                {showMore && (
                  <div className="grid gap-4 border-t border-warm-tan/60 px-3 py-3">
                    {moreKeys.map((k) => (
                      <div key={k}>{fieldOf[k]}</div>
                    ))}
                    {!isPayroll && itemsBox}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-warm-tan bg-card px-4 py-3 sm:px-5">
        {(serverError || formError) && (
          <Notice tone="danger" className="mb-2">
            {serverError || formError}
          </Notice>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="text-red-800 hover:bg-red-50 hover:text-red-800"
            onClick={onRequestDelete}
            disabled={busy}
          >
            <Trash2 className="size-4" aria-hidden />
            삭제
          </Button>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" className="hover:bg-warm-beige" onClick={onClose} disabled={busy}>
              닫기
            </Button>
            <BusyButton type="button" busy={saving === "save"} disabled={busy} onClick={() => void save()}>
              저장
            </BusyButton>
          </div>
        </div>
      </div>
    </div>
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
      {items.length === 0 && <p className="pb-2 text-sm text-text-secondary">품목이 없어요</p>}
      <ul className="grid gap-2.5">
        {items.map((it, i) => (
          <li key={i} className="grid gap-1.5 rounded-md border border-warm-tan/70 p-2">
            <div className="flex gap-1.5">
              <Input
                value={it.name}
                placeholder="품목명"
                aria-label={`${i + 1}번째 품목명`}
                className="h-9 bg-card"
                onChange={(e) => update(i, { name: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 text-text-secondary hover:bg-red-50 hover:text-red-800"
                aria-label={`${i + 1}번째 품목 삭제`}
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="size-4" aria-hidden />
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
                className="h-9 bg-card text-right"
                onChange={(e) => {
                  const n = e.target.value === "" ? null : Number(e.target.value)
                  update(i, { quantity: n !== null && Number.isFinite(n) ? n : null })
                }}
              />
              <WonInput
                value={it.unit_price}
                placeholder="단가"
                aria-label={`${i + 1}번째 품목 단가`}
                className="h-9 bg-card"
                onChange={(v) => update(i, { unit_price: v })}
              />
              <WonInput
                value={it.amount}
                allowNegative
                placeholder="금액"
                aria-label={`${i + 1}번째 품목 금액`}
                className="h-9 bg-card"
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
          className="hover:bg-warm-beige"
          onClick={() => onChange([...items, { name: "", quantity: null, unit_price: null, amount: null }])}
        >
          <Plus className="size-4" aria-hidden />
          품목 추가
        </Button>
        {items.length > 0 && (
          <span className="text-sm text-text-secondary">
            품목 합계 <b className="tabular-nums text-dark">{wonNumber(sum)}원</b>
            {typeof total === "number" && sum > 0 && sum !== total && <span className="ml-1">(합계 {wonNumber(total)}원과 달라요)</span>}
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
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-text-secondary">{suffix}</span>
    </div>
  )
}
