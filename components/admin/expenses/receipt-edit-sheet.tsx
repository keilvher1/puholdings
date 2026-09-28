"use client"

import { useRef, useState } from "react"
import { Calculator, Download, ExternalLink, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react"
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
import { CELL_TONE_CLASS, InlineNotice } from "@/components/admin/expenses/ui"
import { fileUrl, formatBytes, jsonInit, normalizeName, requestJson, wonNumber } from "@/components/admin/expenses/client-helpers"
import {
  DOC_TYPE_LABELS,
  EXPENSE_DOC_TYPES,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  amountMismatch,
  formatBizNo,
  validateReceiptFields,
  type ExpenseDocType,
  type ExpenseProject,
  type ExpenseReceipt,
  type PaymentMethod,
  type ReceiptFields,
  type ReceiptItem,
} from "@/lib/expenses"

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

  const invalid = invalidKeys(errors)
  const project = projects.find((p) => p.id === projectId) ?? null
  // 증빙 올리기와 같이 진행 중 프로젝트만 고를 수 있게 하되, 지금 연결된 프로젝트는(종료됐어도) 목록에 남긴다
  const choices = projects.filter((p) => p.status === "active" || p.id === receipt.project_id)
  const budgetNames = project?.budget_items.map((b) => b.name).filter(Boolean) ?? []
  const budgetKnown = !fields.budget_item.trim() || budgetNames.map(normalizeName).includes(normalizeName(fields.budget_item))
  const mismatch = amountMismatch(fields)
  const isImage = receipt.file_type.startsWith("image/")
  const listId = `budget-names-${receipt.id}`

  const set = <K extends keyof ReceiptFields>(key: K, v: ReceiptFields[K]) => {
    dirtyRef.current = true
    setServerError("")
    setFields((f) => ({ ...f, [key]: v }))
  }
  const setItems = (items: ReceiptItem[]) => set("items", items)

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
    }
    const errs = validateReceiptFields(clean)
    if (!projectId) errs.unshift("프로젝트를 선택하세요")
    setErrors(errs)
    if (errs.length > 0) return
    setSaving(true)
    savingRef.current = true
    setServerError("")
    const r = await requestJson("/api/admin/expenses/receipts", jsonInit("PUT", { id: receipt.id, ...clean, project_id: projectId }))
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
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {/* 원본 미리보기 */}
        <div className="overflow-hidden rounded-md border border-warm-tan bg-warm-beige/30">
          {isImage ? (
            <a href={fileUrl(receipt.file_pathname)} target="_blank" rel="noreferrer" title="원본 크게 보기">
              {/* next/image는 쿼리스트링 로컬 src에서 SSR 예외가 나므로 일반 img를 쓴다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl(receipt.file_pathname)}
                alt={`${receipt.file_name} 원본`}
                className="max-h-72 w-full bg-white object-contain"
                loading="lazy"
              />
            </a>
          ) : (
            <p className="px-4 py-5 text-sm text-dark/70">PDF 원본은 새 창에서 확인하세요.</p>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-warm-tan/60 bg-card px-3 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-text-secondary" title={receipt.file_name}>
              {receipt.file_name} · {formatBytes(receipt.file_size)}
            </span>
            <a
              href={fileUrl(receipt.file_pathname)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-dark underline-offset-2 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />새 창
            </a>
            <a
              href={fileUrl(receipt.file_pathname, { download: true, name: receipt.file_name })}
              className="inline-flex items-center gap-1 text-dark underline-offset-2 hover:underline"
            >
              <Download className="h-3 w-3" />
              내려받기
            </a>
          </div>
        </div>
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
              <Select value={fields.doc_type} onValueChange={(v) => set("doc_type", v as ExpenseDocType)}>
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
                onChange={(e) => set("issue_date", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="re-vendor">
              거래처(가맹점) <span className="text-destructive">*</span>
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
            {!mismatch && fields.supply_amount === null && fields.vat_amount === null && typeof fields.total_amount === "number" && (
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
