"use client"

import { useEffect, useRef, useState } from "react"
import { Copy, Loader2, Paperclip, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { CELL_TONE_CLASS } from "@/components/admin/expenses/ui"
import { jsonInit, normalizeName, requestJson, todayStr, wonNumber } from "@/components/admin/expenses/client-helpers"
import { ClientImageError, compressImage, formatBytes, isImageFile } from "@/lib/client-image"
import {
  MAX_SCAN_FILE_BYTES,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  SCAN_ACCEPT,
  isValidDate,
  validateReceiptFields,
  type BudgetItem,
  type PaymentMethod,
  type ReceiptCreateInput,
  type UploadedFileMeta,
} from "@/lib/expenses"
import { cn } from "@/lib/utils"

// 인건비 수기 등록 — 증빙 파일 없이 대상자별 지급 내역을 한 번에 여러 건 입력해 저장한다.
// 저장 형식: doc_type 'payroll', 거래처 = 대상자 성명, 합계 = 지급액(원), 첨부(이체확인증·급여명세서)는 선택.

export interface PayrollProject {
  id: number
  name: string
  budget_items: BudgetItem[]
}

// ── 첨부 올리기(인건비 수기 등록·증빙 수정 공용) ─────────────────────────────
// 사진은 줄여서 보내고, POST /api/admin/expenses/attach 로 보관만 한다(판독 없음).
export async function uploadAttachment(file: File): Promise<{ ok: true; file: UploadedFileMeta } | { ok: false; error: string }> {
  let toSend: File = file
  if (isImageFile(file)) {
    try {
      toSend = await compressImage(file)
    } catch (e) {
      return { ok: false, error: e instanceof ClientImageError ? e.message : "사진을 처리하지 못했습니다. JPG·PNG로 저장해 다시 올리세요." }
    }
  }
  if (toSend.size > MAX_SCAN_FILE_BYTES) {
    return { ok: false, error: `파일 용량 초과(${formatBytes(toSend.size)} / 최대 ${formatBytes(MAX_SCAN_FILE_BYTES)})` }
  }
  const fd = new FormData()
  fd.append("file", toSend, toSend.name)
  const r = await requestJson<{ file: UploadedFileMeta }>("/api/admin/expenses/attach", { method: "POST", body: fd })
  if (!r.ok) return { ok: false, error: r.error }
  if (!r.data.file || typeof r.data.file.pathname !== "string") return { ok: false, error: "첨부 파일을 보관하지 못했습니다. 다시 시도하세요." }
  return { ok: true, file: r.data.file }
}

// ── 행 모델 ─────────────────────────────────────────────────────────────────
interface PayrollRow {
  key: string
  issue_date: string
  vendor_name: string
  amount: number | null
  payroll_month: string
  monthTouched: boolean // 귀속월을 직접 고쳤으면 지급일을 바꿔도 따라가지 않는다
  purpose: string
  purposeTouched: boolean // 적요를 직접 고쳤으면 귀속월을 바꿔도 따라가지 않는다
  payment_method: PaymentMethod
  file: UploadedFileMeta | null
  uploading: boolean
  uploadError: string
  errors: string[]
}

let rowSeq = 0
const nextKey = () => `pr-${Date.now().toString(36)}-${++rowSeq}`

function monthOf(date: string): string {
  return isValidDate(date) ? date.slice(0, 7) : ""
}

function defaultPurpose(month: string): string {
  return month ? `${month} 인건비` : "인건비"
}

function newRow(from?: PayrollRow): PayrollRow {
  const issue_date = from?.issue_date ?? todayStr()
  const payroll_month = from?.payroll_month ?? monthOf(issue_date)
  return {
    key: nextKey(),
    issue_date,
    vendor_name: "",
    amount: null,
    payroll_month,
    monthTouched: from?.monthTouched ?? false,
    purpose: from?.purpose ?? defaultPurpose(payroll_month),
    purposeTouched: from?.purposeTouched ?? false,
    payment_method: from?.payment_method ?? "transfer",
    file: null,
    uploading: false,
    uploadError: "",
    errors: [],
  }
}

function isBlankRow(r: PayrollRow): boolean {
  return !r.vendor_name.trim() && r.amount === null && !r.file
}

function defaultBudgetItem(project: PayrollProject | undefined): string {
  const hit = project?.budget_items.find((b) => b.name.includes("인건비"))
  return hit ? normalizeName(hit.name) : "인건비"
}

function toInput(r: PayrollRow, projectId: number, budgetItem: string): ReceiptCreateInput {
  return {
    doc_type: "payroll",
    issue_date: r.issue_date,
    vendor_name: r.vendor_name.trim(),
    vendor_biz_no: "",
    supply_amount: null,
    vat_amount: null,
    total_amount: r.amount,
    payment_method: r.payment_method,
    approval_no: "",
    items: [],
    budget_item: normalizeName(budgetItem),
    purpose: r.purpose.trim(),
    memo: "",
    currency: "KRW",
    foreign_amount: null,
    exchange_rate: null,
    exchange_rate_date: "",
    exchange_rate_source: "",
    payroll_month: r.payroll_month,
    project_id: projectId,
    file: r.file,
    ai_confidence: null,
    ai_raw: null,
  }
}

function checkRow(r: PayrollRow, input: ReceiptCreateInput): string[] {
  const errs: string[] = []
  if (!isValidDate(r.issue_date)) errs.push("지급일을 입력하세요")
  if (!r.vendor_name.trim()) errs.push("대상자 성명을 입력하세요")
  if (r.amount === null || r.amount <= 0) errs.push("지급액을 입력하세요")
  if (r.payroll_month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.payroll_month)) errs.push("귀속월을 확인하세요")
  if (r.uploading) errs.push("첨부 파일을 올리는 중입니다")
  if (errs.length === 0) errs.push(...validateReceiptFields(input))
  return errs
}

// 행 오류 → 빨간 테두리를 칠할 칸
function badCells(errors: string[]) {
  const has = (...words: string[]) => errors.some((e) => words.some((w) => e.includes(w)))
  return {
    date: has("지급일", "거래일자"),
    name: has("대상자", "거래처"),
    amount: has("지급액", "합계"),
    month: has("귀속월"),
  }
}

// ── 버튼 + 입력 창 ───────────────────────────────────────────────────────────
export function PayrollEntryButton({
  projects,
  defaultProjectId = null,
  onSaved,
  size = "default",
}: {
  projects: PayrollProject[]
  defaultProjectId?: number | null
  onSaved?: (count: number) => void
  size?: "sm" | "default"
}) {
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(0) // 열 때마다 새 입력 창
  const [confirmClose, setConfirmClose] = useState(false)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)

  const requestClose = () => {
    if (savingRef.current) return
    if (dirtyRef.current) setConfirmClose(true)
    else setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant="outline"
        disabled={projects.length === 0}
        title={projects.length === 0 ? "진행 중인 프로젝트가 없습니다" : "증빙 파일 없이 인건비 지급 내역 입력"}
        onClick={() => {
          dirtyRef.current = false
          setSession((s) => s + 1)
          setOpen(true)
        }}
      >
        <Plus className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        인건비 직접 등록
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : requestClose())}>
        <DialogContent
          className="flex max-h-[92vh] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden rounded-md p-0 shadow-none sm:max-w-[min(1120px,calc(100%-2rem))]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {open && (
            <PayrollForm
              key={session}
              projects={projects}
              defaultProjectId={defaultProjectId}
              dirtyRef={dirtyRef}
              savingRef={savingRef}
              onCancel={requestClose}
              onSaved={(n) => {
                dirtyRef.current = false
                setOpen(false)
                onSaved?.(n)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>저장하지 않은 입력 내용</AlertDialogTitle>
            <AlertDialogDescription>닫으면 입력한 지급 내역이 사라집니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>계속 입력</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                dirtyRef.current = false
                setConfirmClose(false)
                setOpen(false)
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

const GRID = "md:grid-cols-[8.75rem_minmax(0,1fr)_9rem_8.5rem_minmax(0,1.3fr)_6.5rem_7.5rem_4.25rem]"

function PayrollForm({
  projects,
  defaultProjectId,
  dirtyRef,
  savingRef,
  onCancel,
  onSaved,
}: {
  projects: PayrollProject[]
  defaultProjectId: number | null
  dirtyRef: React.MutableRefObject<boolean>
  savingRef: React.MutableRefObject<boolean>
  onCancel: () => void
  onSaved: (count: number) => void
}) {
  const initialProject =
    projects.find((p) => p.id === defaultProjectId)?.id ?? (projects.length === 1 ? projects[0].id : null)
  const [projectId, setProjectId] = useState<number | null>(initialProject)
  const project = projects.find((p) => p.id === projectId)
  const [budgetItem, setBudgetItem] = useState(() => defaultBudgetItem(project))
  const [budgetTouched, setBudgetTouched] = useState(false)
  const [rows, setRows] = useState<PayrollRow[]>(() => [newRow()])
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pickKeyRef = useRef<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const pendingFocusRef = useRef<{ row: number; col: string } | null>(null)

  // Enter로 새 행을 붙였으면, 그 행이 그려진 뒤 같은 칸으로 옮긴다.
  useEffect(() => {
    const want = pendingFocusRef.current
    if (!want) return
    pendingFocusRef.current = null
    focusCell(formRef.current, want.row, want.col)
  }, [rows.length])

  const budgetNames = project?.budget_items.map((b) => normalizeName(b.name)).filter(Boolean) ?? []
  const filled = rows.filter((r) => !isBlankRow(r))
  const total = filled.reduce((s, r) => s + (typeof r.amount === "number" ? r.amount : 0), 0)
  const uploading = rows.some((r) => r.uploading)

  const touch = () => {
    dirtyRef.current = true
    setFormError("")
  }

  const patchRow = (key: string, patch: Partial<PayrollRow> | ((r: PayrollRow) => Partial<PayrollRow>)) => {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r
        const p = typeof patch === "function" ? patch(r) : patch
        return { ...r, ...p, errors: [] }
      })
    )
  }

  const edit = (key: string, patch: Partial<PayrollRow> | ((r: PayrollRow) => Partial<PayrollRow>)) => {
    touch()
    patchRow(key, patch)
  }

  const setDate = (key: string, date: string) =>
    edit(key, (r) => {
      const month = r.monthTouched ? r.payroll_month : monthOf(date) || r.payroll_month
      return {
        issue_date: date,
        payroll_month: month,
        purpose: r.purposeTouched ? r.purpose : defaultPurpose(month),
      }
    })

  const setMonth = (key: string, month: string) =>
    edit(key, (r) => ({
      payroll_month: month,
      monthTouched: true,
      purpose: r.purposeTouched ? r.purpose : defaultPurpose(month),
    }))

  const addRow = () => {
    touch()
    setRows((rs) => [...rs, newRow(rs[rs.length - 1])])
  }

  const duplicateRow = (key: string) => {
    touch()
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key)
      if (i < 0) return rs
      const copy: PayrollRow = { ...rs[i], key: nextKey(), uploading: false, uploadError: "", errors: [] }
      return [...rs.slice(0, i + 1), copy, ...rs.slice(i + 1)]
    })
  }

  const removeRow = (key: string) => {
    touch()
    setRows((rs) => (rs.length <= 1 ? [newRow(rs[0])] : rs.filter((r) => r.key !== key)))
  }

  const pickFile = (key: string) => {
    pickKeyRef.current = key
    fileInputRef.current?.click()
  }

  const onFileChosen = async (file: File | undefined) => {
    const key = pickKeyRef.current
    pickKeyRef.current = null
    if (!file || !key) return
    edit(key, { uploading: true, uploadError: "" })
    const r = await uploadAttachment(file)
    patchRow(key, r.ok ? { uploading: false, file: r.file } : { uploading: false, uploadError: r.error })
  }

  const changeProject = (id: number) => {
    touch()
    setProjectId(id)
    if (!budgetTouched) setBudgetItem(defaultBudgetItem(projects.find((p) => p.id === id)))
  }

  const save = async () => {
    if (!projectId) {
      setFormError("프로젝트를 선택하세요")
      return
    }
    if (filled.length === 0) {
      setFormError("저장할 지급 내역을 입력하세요")
      return
    }
    const inputs = filled.map((r) => toInput(r, projectId, budgetItem))
    const errMap = new Map<string, string[]>()
    filled.forEach((r, i) => {
      const errs = checkRow(r, inputs[i])
      if (errs.length > 0) errMap.set(r.key, errs)
    })
    if (errMap.size > 0) {
      setRows((rs) => rs.map((r) => ({ ...r, errors: errMap.get(r.key) ?? [] })))
      setFormError(`${errMap.size}건에 확인이 필요한 항목이 있습니다.`)
      return
    }

    setSaving(true)
    savingRef.current = true
    setFormError("")
    const res = await requestJson<{ ids: number[]; skipped: number[] }>(
      "/api/admin/expenses/receipts",
      jsonInit("POST", { receipts: inputs })
    )
    setSaving(false)
    savingRef.current = false
    if (res.ok) {
      onSaved(inputs.length)
      return
    }
    const rowErrors = Array.isArray(res.data?.row_errors) ? (res.data.row_errors as { index: number; errors: string[] }[]) : []
    if (rowErrors.length > 0) {
      const byKey = new Map<string, string[]>()
      for (const e of rowErrors) {
        const target = filled[e.index]
        if (target && Array.isArray(e.errors)) byKey.set(target.key, e.errors.map(String))
      }
      setRows((rs) => rs.map((r) => ({ ...r, errors: byKey.get(r.key) ?? [] })))
    }
    setFormError(res.error)
  }

  // 입력칸에서 Enter는 저장이 아니라 다음 행의 같은 칸으로 이동(Shift+Enter는 위 행). 마지막 행이면 행을 하나 붙인다.
  // 저장은 저장 버튼으로만 한다(업로드 표와 같은 동작).
  const onKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229 || e.altKey || e.ctrlKey || e.metaKey) return
    const t = e.target as HTMLElement
    if (t.tagName !== "INPUT") return
    e.preventDefault()
    const r = t.getAttribute("data-pe-row")
    const col = t.getAttribute("data-pe-col")
    if (r === null || !col) return
    const next = Number(r) + (e.shiftKey ? -1 : 1)
    if (next < 0) return
    if (next >= rows.length) {
      pendingFocusRef.current = { row: next, col }
      addRow()
      return
    }
    focusCell(formRef.current, next, col)
  }

  return (
    <form
      ref={formRef}
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={onKeyDown}
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <DialogHeader className="border-b border-warm-tan px-4 py-3 pr-12 text-left sm:px-5">
        <DialogTitle className="text-dark">인건비 직접 등록</DialogTitle>
        <DialogDescription className="[word-break:keep-all]">
          증빙 파일 없이 대상자별 지급 내역을 입력합니다. 이체확인증·급여명세서는 행마다 첨부할 수 있습니다(선택).
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {/* 공통 항목 */}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="grid gap-1.5">
            <Label htmlFor="pe-project">
              프로젝트 <span className="text-destructive">*</span>
            </Label>
            <Select value={projectId ? String(projectId) : undefined} onValueChange={(v) => changeProject(Number(v))}>
              <SelectTrigger id="pe-project" className={cn("w-full", formError.includes("프로젝트") && CELL_TONE_CLASS.invalid)}>
                <SelectValue placeholder="프로젝트 선택" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pe-budget">비목</Label>
            <Input
              id="pe-budget"
              list="pe-budget-names"
              value={budgetItem}
              maxLength={100}
              onChange={(e) => {
                touch()
                setBudgetTouched(true)
                setBudgetItem(e.target.value)
              }}
            />
            <datalist id="pe-budget-names">
              {budgetNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            {budgetNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {budgetNames.map((n) => {
                  const on = n === normalizeName(budgetItem)
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        touch()
                        setBudgetTouched(true)
                        setBudgetItem(n)
                      }}
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
            {project && budgetNames.length > 0 && budgetItem.trim() && !budgetNames.includes(normalizeName(budgetItem)) && (
              <p className="text-xs text-amber-800">예산 외 비목</p>
            )}
          </div>
        </div>

        {/* 지급 내역 */}
        <div className="mt-5 rounded-md border border-warm-tan">
          <div
            className={cn(
              "hidden gap-2 border-b border-warm-tan bg-warm-beige px-3 py-2 text-xs font-semibold text-dark md:grid",
              GRID
            )}
          >
            <span>
              지급일 <span className="text-destructive">*</span>
            </span>
            <span>
              대상자(성명) <span className="text-destructive">*</span>
            </span>
            <span className="text-right">
              지급액 <span className="text-destructive">*</span>
            </span>
            <span>귀속월</span>
            <span>적요</span>
            <span>결제 수단</span>
            <span>첨부</span>
            <span className="sr-only">행 동작</span>
          </div>
          <ol className="divide-y divide-warm-tan/70">
            {rows.map((r, i) => (
              <PayrollRowEditor
                key={r.key}
                row={r}
                index={i}
                onDate={(v) => setDate(r.key, v)}
                onName={(v) => edit(r.key, { vendor_name: v })}
                onAmount={(v) => edit(r.key, { amount: v })}
                onMonth={(v) => setMonth(r.key, v)}
                onPurpose={(v) => edit(r.key, { purpose: v, purposeTouched: true })}
                onPayment={(v) => edit(r.key, { payment_method: v })}
                onPickFile={() => pickFile(r.key)}
                onClearFile={() => edit(r.key, { file: null, uploadError: "" })}
                onDuplicate={() => duplicateRow(r.key)}
                onRemove={() => removeRow(r.key)}
              />
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-warm-tan bg-warm-ivory px-3 py-2">
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" />
              행 추가
            </Button>
            <span className="text-sm text-dark">
              합계 {filled.length.toLocaleString("ko-KR")}건 · <b className="tabular-nums">{wonNumber(total)}원</b>
            </span>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={SCAN_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ""
            void onFileChosen(f)
          }}
        />
      </div>

      <DialogFooter className="flex-col gap-2 border-t border-warm-tan bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0 text-xs">
          {formError ? (
            <p role="alert" className="text-destructive [word-break:keep-all]">
              {formError}
            </p>
          ) : (
            <p className="text-text-secondary">문서 종류 ‘인건비 지급’, 원화로 저장됩니다.</p>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            취소
          </Button>
          <Button type="submit" disabled={saving || uploading}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                저장 중…
              </>
            ) : (
              `${filled.length > 0 ? `${filled.length}건 ` : ""}저장`
            )}
          </Button>
        </div>
      </DialogFooter>
    </form>
  )
}

function focusCell(root: HTMLElement | null, row: number, col: string) {
  const el = root?.querySelector<HTMLInputElement>(`[data-pe-row="${row}"][data-pe-col="${col}"]`)
  if (!el) return
  el.focus()
  if (el.type === "text") el.select()
}

function PayrollRowEditor({
  row,
  index,
  onDate,
  onName,
  onAmount,
  onMonth,
  onPurpose,
  onPayment,
  onPickFile,
  onClearFile,
  onDuplicate,
  onRemove,
}: {
  row: PayrollRow
  index: number
  onDate: (v: string) => void
  onName: (v: string) => void
  onAmount: (v: number | null) => void
  onMonth: (v: string) => void
  onPurpose: (v: string) => void
  onPayment: (v: PaymentMethod) => void
  onPickFile: () => void
  onClearFile: () => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const n = index + 1
  const bad = badCells(row.errors)
  const id = (k: string) => `pe-${row.key}-${k}`
  const cell = (k: string) => ({ "data-pe-row": index, "data-pe-col": k })
  const mobileLabel = "text-xs text-text-secondary md:sr-only"
  return (
    <li className="px-3 py-2.5">
      <div className={cn("grid grid-cols-2 gap-2 md:items-center", GRID)}>
        <div className="grid gap-1">
          <Label htmlFor={id("date")} className={mobileLabel}>
            <span className="sr-only">{n}번째 </span>지급일
          </Label>
          <Input
            id={id("date")}
            {...cell("date")}
            type="date"
            value={row.issue_date}
            className={cn("h-9 bg-card", bad.date && CELL_TONE_CLASS.invalid)}
            onChange={(e) => onDate(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={id("name")} className={mobileLabel}>
            <span className="sr-only">{n}번째 </span>대상자(성명)
          </Label>
          <Input
            id={id("name")}
            {...cell("name")}
            value={row.vendor_name}
            maxLength={200}
            placeholder="성명"
            className={cn("h-9 bg-card", bad.name && CELL_TONE_CLASS.invalid)}
            onChange={(e) => onName(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={id("amount")} className={mobileLabel}>
            <span className="sr-only">{n}번째 </span>지급액
          </Label>
          <WonInput id={id("amount")} {...cell("amount")} value={row.amount} invalid={bad.amount} className={cn("h-9 bg-card", bad.amount && CELL_TONE_CLASS.invalid)} onChange={onAmount} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={id("month")} className={mobileLabel}>
            <span className="sr-only">{n}번째 </span>귀속월
          </Label>
          <Input
            id={id("month")}
            {...cell("month")}
            type="month"
            value={row.payroll_month}
            className={cn("h-9 bg-card", bad.month && CELL_TONE_CLASS.invalid)}
            onChange={(e) => onMonth(e.target.value)}
          />
        </div>
        <div className="col-span-2 grid gap-1 md:col-span-1">
          <Label htmlFor={id("purpose")} className={mobileLabel}>
            <span className="sr-only">{n}번째 </span>적요
          </Label>
          <Input id={id("purpose")} {...cell("purpose")} value={row.purpose} maxLength={500} className="h-9 bg-card" onChange={(e) => onPurpose(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={id("pay")} className={mobileLabel}>
            <span className="sr-only">{n}번째 </span>결제 수단
          </Label>
          <Select value={row.payment_method} onValueChange={(v) => onPayment(v as PaymentMethod)}>
            <SelectTrigger id={id("pay")} className="h-9 w-full bg-card">
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
        <div className="grid gap-1">
          <span className={mobileLabel}><span className="sr-only">{n}번째 </span>첨부</span>
          {row.uploading ? (
            <span className="inline-flex h-9 items-center gap-1.5 text-xs text-text-secondary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              올리는 중
            </span>
          ) : row.file ? (
            <span className="inline-flex h-9 min-w-0 items-center gap-1 rounded-md border border-warm-tan bg-warm-ivory pl-2 pr-1 text-xs text-dark">
              <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate" title={row.file.name}>
                {row.file.name}
              </span>
              <button
                type="button"
                aria-label={`${n}번째 행 첨부 빼기`}
                onClick={onClearFile}
                className="shrink-0 rounded p-0.5 text-text-secondary hover:text-dark"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <Button type="button" variant="outline" size="sm" className="h-9 justify-start" onClick={onPickFile}>
              <Paperclip className="h-3.5 w-3.5" />
              첨부
            </Button>
          )}
        </div>
        <div className="col-span-2 flex justify-end gap-0.5 md:col-span-1">
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-text-secondary hover:text-dark" aria-label={`${n}번째 행 복제`} title="행 복제" onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-text-secondary hover:bg-destructive/10 hover:text-destructive"
            aria-label={`${n}번째 행 삭제`}
            title="행 삭제"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {(row.errors.length > 0 || row.uploadError) && (
        <p role="alert" className="mt-1.5 text-xs text-destructive [word-break:keep-all]">
          {[...row.errors, ...(row.uploadError ? [`첨부: ${row.uploadError}`] : [])].join(" · ")}
        </p>
      )}
    </li>
  )
}
