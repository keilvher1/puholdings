"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Copy, Loader2, Paperclip, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BusyButton, Notice, SourceTag, toastSuccess, useConfirm } from "@/components/saas"
import { WonInput } from "@/components/admin/expenses/won-input"
import { CELL_TONE_CLASS, HelpDetails } from "@/components/admin/expenses/ui"
import { jsonInit, normalizeName, requestJson, todayStr } from "@/components/admin/expenses/client-helpers"
import { friendlyFieldError, planPayrollImport, screenSafeError, type PayrollImportPlan } from "@/components/admin/expenses/upload-model"
import { ClientImageError, compressImage, formatBytes, isImageFile } from "@/lib/client-image"
import { addMonths, month as formatMonth, todayKST, won } from "@/lib/format"
import { GLOSSARY } from "@/lib/glossary"
import {
  MAX_SCAN_FILE_BYTES,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  SCAN_ACCEPT,
  isValidDate,
  validateReceiptFields,
  type BudgetItem,
  type ExpenseReceipt,
  type PaymentMethod,
  type ReceiptCreateInput,
  type UploadedFileMeta,
} from "@/lib/expenses"
import { cn } from "@/lib/utils"

// 인건비 등록(계획서 4.2.4) — 증빙 파일 없이 대상자별 지급 내역을 한 번에 여러 건 입력해 저장한다.
// 저장 형식: doc_type 'payroll', 거래처 = 대상자 성명, 합계 = 지급액(원), 첨부(이체확인증·급여명세서)는 선택.
// P-1 [지난달 내역 불러오기]: 선택 프로젝트의 가장 최근 귀속월 인건비를 한 달 뒤로 옮겨 채운다(저장은 하지 않는다).
//     한 번 불러오면 버튼을 숨긴다(같은 사람이 두 번 붙지 않게). 가장 최근 귀속월이 이번 달이면 다음 달을 만들지 않고,
//     지난달에만 있던 사람(퇴사·교체일 수 있음)은 기본으로 넣지 않고 [○○ 넣기]로 한 사람씩 고르게 한다(planPayrollImport).
// P-2 프로젝트는 주소·장부에서 넘어왔거나 진행 중 프로젝트가 하나뿐일 때만 미리 고른다. "지난번"은 칩으로 제안만 한다.
// P-4 바닥 줄 "지난달과 같음 n명 · 바뀜 n명 · 새로 n명", 버튼 "n건 등록".

export interface PayrollProject {
  id: number
  name: string
  budget_items: BudgetItem[]
}

const LAST_PROJECT_KEY = "puh:expenses:payroll-last-project"

// ── 첨부 올리기(인건비 등록·증빙 수정 공용) ─────────────────────────────────
// 사진은 줄여서 보내고, POST /api/admin/expenses/attach 로 보관만 한다(판독 없음).
export async function uploadAttachment(file: File): Promise<{ ok: true; file: UploadedFileMeta } | { ok: false; error: string }> {
  let toSend: File = file
  if (isImageFile(file)) {
    try {
      toSend = await compressImage(file)
    } catch (e) {
      return { ok: false, error: e instanceof ClientImageError ? e.message : "사진을 처리하지 못했어요. JPG·PNG로 저장해 다시 올려 주세요." }
    }
  }
  if (toSend.size > MAX_SCAN_FILE_BYTES) {
    return { ok: false, error: `파일이 너무 커요(${formatBytes(toSend.size)} · 최대 ${formatBytes(MAX_SCAN_FILE_BYTES)})` }
  }
  const fd = new FormData()
  fd.append("file", toSend, toSend.name)
  const r = await requestJson<{ file: UploadedFileMeta }>("/api/admin/expenses/attach", { method: "POST", body: fd })
  if (!r.ok) return { ok: false, error: screenSafeError(r.error, "첨부 파일을 보관하지 못했어요. 다시 시도해 주세요.") }
  if (!r.data.file || typeof r.data.file.pathname !== "string") return { ok: false, error: "첨부 파일을 보관하지 못했어요. 다시 시도해 주세요." }
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
  // 지난달 내역에서 불러온 행이면 불러온 값(고쳤는지 비교용)
  prev?: { vendor_name: string; amount: number | null; issue_date: string; payroll_month: string; purpose: string; payment_method: PaymentMethod } | null
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
    purpose: from?.purposeTouched ? from.purpose : defaultPurpose(payroll_month),
    purposeTouched: from?.purposeTouched ?? false,
    payment_method: from?.payment_method ?? "transfer",
    file: null,
    uploading: false,
    uploadError: "",
    errors: [],
    prev: null,
  }
}

function isBlankRow(r: PayrollRow): boolean {
  return !r.vendor_name.trim() && r.amount === null && !r.file
}

// 불러온 행에서 바뀐 칸(지급일·귀속월은 불러올 때 이미 한 달 옮겼으니 그 뒤 고친 것만)
function changedFields(r: PayrollRow): string[] {
  const p = r.prev
  if (!p) return []
  const out: string[] = []
  if (normalizeName(r.vendor_name) !== normalizeName(p.vendor_name)) out.push("대상자")
  if (r.amount !== p.amount) out.push("지급액")
  if (r.issue_date !== p.issue_date) out.push("지급일")
  if (r.payroll_month !== p.payroll_month) out.push("귀속월")
  if (r.purpose !== p.purpose) out.push("적요")
  if (r.payment_method !== p.payment_method) out.push("결제 수단")
  return out
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
  if (!isValidDate(r.issue_date)) errs.push("지급일을 골라 주세요")
  if (!r.vendor_name.trim()) errs.push("대상자 이름을 입력해 주세요")
  if (r.amount === null || r.amount <= 0) errs.push("지급액을 입력해 주세요")
  if (r.payroll_month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.payroll_month)) errs.push("귀속월을 확인해 주세요")
  if (r.uploading) errs.push("첨부 파일을 올리는 중이에요")
  if (errs.length === 0) errs.push(...validateReceiptFields(input).map(friendlyFieldError))
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

function readLastProject(): number | null {
  try {
    const v = Number(window.localStorage.getItem(LAST_PROJECT_KEY))
    return Number.isInteger(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

function writeLastProject(id: number) {
  try {
    window.localStorage.setItem(LAST_PROJECT_KEY, String(id))
  } catch {
    // 저장소를 못 쓰면 제안 칩만 안 보인다
  }
}

// ── 버튼 + 입력 창 ───────────────────────────────────────────────────────────
// onSaved(건수, 합계): 부르는 쪽이 성공 안내(토스트)를 띄운다 — 예: toastSuccess(`인건비 ${n}건(${won(total)})을 등록했어요`)
export function PayrollEntryButton({
  projects,
  defaultProjectId = null,
  onSaved,
  size = "default",
  label = "인건비 등록",
}: {
  projects: PayrollProject[]
  defaultProjectId?: number | null
  onSaved?: (count: number, total?: number) => void
  size?: "sm" | "default"
  label?: string
}) {
  const ask = useConfirm()
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(0) // 열 때마다 새 입력 창
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)

  const requestClose = async () => {
    if (savingRef.current) return
    if (!dirtyRef.current) {
      setOpen(false)
      return
    }
    const ok = await ask({
      title: "입력한 지급 내역을 버리고 닫을까요?",
      body: "닫으면 이 창에 입력한 내용이 사라져요.",
      confirmLabel: "버리고 닫기",
      cancelLabel: "계속 입력",
    })
    if (ok === true) {
      dirtyRef.current = false
      setOpen(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant="outline"
        className="hover:bg-warm-beige"
        disabled={projects.length === 0}
        title={projects.length === 0 ? "진행 중인 프로젝트가 없어요" : "증빙 파일 없이 인건비 지급 내역을 입력해요"}
        onClick={() => {
          dirtyRef.current = false
          setSession((s) => s + 1)
          setOpen(true)
        }}
      >
        <Plus className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : void requestClose())}>
        <DialogContent
          className="flex max-h-[100dvh] max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 shadow-none sm:max-h-[92vh] sm:max-w-[min(1120px,calc(100%-2rem))] sm:rounded-md"
          showCloseButton={false}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {open && (
            <PayrollForm
              key={session}
              projects={projects}
              defaultProjectId={defaultProjectId}
              dirtyRef={dirtyRef}
              savingRef={savingRef}
              onCancel={() => void requestClose()}
              onSaved={(n, total) => {
                dirtyRef.current = false
                setOpen(false)
                onSaved?.(n, total)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// 서버 화면(PageHeader secondary 자리)에서 쓰는 버튼: 저장하면 토스트를 띄우고 화면을 새로 읽는다.
export function PayrollEntryHeaderButton({ projects, defaultProjectId = null }: { projects: PayrollProject[]; defaultProjectId?: number | null }) {
  const router = useRouter()
  return (
    <PayrollEntryButton
      projects={projects}
      defaultProjectId={defaultProjectId}
      onSaved={(n, total) => {
        toastSuccess(`인건비 ${n}건(${won(total ?? 0)})을 등록했어요`)
        router.refresh()
      }}
    />
  )
}

const GRID = "md:grid-cols-[8.75rem_minmax(0,1fr)_9rem_8.5rem_minmax(0,1.3fr)_6.5rem_7.5rem_4.25rem]"

type ImportState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; plan: PayrollImportPlan; budget: string }

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
  onSaved: (count: number, total: number) => void
}) {
  // P-2: 주소·장부에서 넘어온 프로젝트이거나 진행 중 프로젝트가 하나뿐일 때만 미리 고른다.
  const initialProject = projects.find((p) => p.id === defaultProjectId)?.id ?? (projects.length === 1 ? projects[0].id : null)
  const [projectId, setProjectId] = useState<number | null>(initialProject)
  const project = projects.find((p) => p.id === projectId)
  const [lastProject, setLastProject] = useState<PayrollProject | null>(null)
  useEffect(() => {
    if (initialProject) return
    const id = readLastProject()
    setLastProject(projects.find((p) => p.id === id) ?? null)
  }, [initialProject, projects])
  const [budgetItem, setBudgetItem] = useState(() => defaultBudgetItem(project))
  const [budgetTouched, setBudgetTouched] = useState(false)
  const [rows, setRows] = useState<PayrollRow[]>(() => [newRow()])
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)
  const [imp, setImp] = useState<ImportState>({ status: "idle" })
  const [skipped, setSkipped] = useState<PayrollImportPlan["rows"]>([])
  // 불러오기를 이미 썼는지(버튼 숨김) · 이번 달 후보 중 이미 넣은 사람
  const [importDone, setImportDone] = useState<{ count: number } | null>(null)
  const [fillAdded, setFillAdded] = useState<string[]>([])
  const [reloadSeq, setReloadSeq] = useState(0)
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

  // P-1: 프로젝트를 고르면 최근 2개월 인건비를 읽어 불러올 내용을 계산한다(읽기만, 저장 없음).
  useEffect(() => {
    if (!projectId) {
      setImp({ status: "idle" })
      return
    }
    let alive = true
    setImp({ status: "loading" })
    const today = todayKST()
    const from = `${addMonths(today.slice(0, 7), -2)}-01`
    void requestJson<{ receipts: ExpenseReceipt[] }>(`/api/admin/expenses/receipts?project_id=${projectId}&from=${from}`).then((r) => {
      if (!alive) return
      if (!r.ok) {
        setImp({ status: "error", message: "지난달 인건비 내역을 불러오지 못했어요." })
        return
      }
      const list = Array.isArray(r.data.receipts) ? r.data.receipts : []
      const plan = planPayrollImport(
        list.map((x) => ({
          project_id: x.project_id,
          doc_type: x.doc_type,
          issue_date: x.issue_date,
          vendor_name: x.vendor_name,
          total_amount: typeof x.total_amount === "number" ? x.total_amount : x.total_amount === null ? null : Number(x.total_amount),
          payroll_month: x.payroll_month ?? "",
          payment_method: x.payment_method,
          budget_item: x.budget_item ?? "",
          purpose: x.purpose ?? "",
        })),
        projectId,
        today
      )
      const budgets = Array.from(new Set(plan.rows.map((x) => normalizeName(x.budget_item)).filter(Boolean)))
      setImp({ status: "ready", plan, budget: budgets.length === 1 ? budgets[0] : "" })
    })
    return () => {
      alive = false
    }
  }, [projectId, reloadSeq])

  const budgetNames = project?.budget_items.map((b) => normalizeName(b.name)).filter(Boolean) ?? []
  const filled = rows.filter((r) => !isBlankRow(r))
  const total = filled.reduce((s, r) => s + (typeof r.amount === "number" ? r.amount : 0), 0)
  const uploading = rows.some((r) => r.uploading)
  const imported = filled.filter((r) => r.prev)
  const sameCount = imported.filter((r) => changedFields(r).length === 0).length
  const changedCount = imported.length - sameCount
  const newCount = filled.length - imported.length

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
      const copy: PayrollRow = { ...rs[i], key: nextKey(), uploading: false, uploadError: "", errors: [], prev: null }
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
    setSkipped([])
    setImportDone(null)
    setFillAdded([])
    if (!budgetTouched) setBudgetItem(defaultBudgetItem(projects.find((p) => p.id === id)))
  }

  // 불러온 행으로 채운다. 아직 아무것도 입력하지 않은 빈 행은 바꾸고, 입력한 행은 남긴 채 뒤에 붙인다.
  const toRow = (x: PayrollImportPlan["rows"][number]): PayrollRow => ({
    key: nextKey(),
    issue_date: x.issue_date,
    vendor_name: x.vendor_name,
    amount: x.amount,
    payroll_month: x.payroll_month,
    monthTouched: true,
    purpose: x.purpose,
    purposeTouched: true,
    payment_method: x.payment_method,
    file: null,
    uploading: false,
    uploadError: "",
    errors: [],
    prev: { vendor_name: x.vendor_name, amount: x.amount, issue_date: x.issue_date, payroll_month: x.payroll_month, purpose: x.purpose, payment_method: x.payment_method },
  })
  const importPrevious = () => {
    if (imp.status !== "ready" || importDone) return
    touch()
    const add = imp.plan.rows.filter((x) => x.include).map(toRow)
    setRows((rs) => {
      const kept = rs.filter((r) => !isBlankRow(r))
      return kept.length === 0 && add.length === 0 ? rs : [...kept, ...add]
    })
    setSkipped(imp.plan.rows.filter((x) => x.existing))
    setImportDone({ count: add.length })
    if (!budgetTouched && imp.budget) setBudgetItem(imp.budget)
  }
  // 이번 달을 등록하다 만 경우: 지난달에만 있던 사람을 한 명씩 골라 넣는다(기본 제외).
  const addOne = (x: PayrollImportPlan["rows"][number]) => {
    touch()
    setRows((rs) => [...rs.filter((r) => !isBlankRow(r)), toRow(x)])
    setFillAdded((a) => [...a, x.vendor_name])
    if (!budgetTouched && imp.status === "ready" && imp.budget) setBudgetItem(imp.budget)
  }
  const addSkipped = () => {
    touch()
    const add = skipped.map(toRow)
    setRows((rs) => [...rs.filter((r) => !isBlankRow(r)), ...add])
    setSkipped([])
  }

  const save = async () => {
    if (!projectId) {
      setFormError("프로젝트를 골라 주세요")
      return
    }
    if (filled.length === 0) {
      setFormError("등록할 지급 내역을 입력해 주세요")
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
      setFormError(`${errMap.size}건에 확인할 칸이 있어요. 빨간 칸을 고쳐 주세요.`)
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
      writeLastProject(projectId)
      onSaved(inputs.length, total)
      return
    }
    const rowErrors = Array.isArray(res.data?.row_errors) ? (res.data.row_errors as { index: number; errors: string[] }[]) : []
    if (rowErrors.length > 0) {
      const byKey = new Map<string, string[]>()
      for (const e of rowErrors) {
        const target = filled[e.index]
        if (target && Array.isArray(e.errors)) byKey.set(target.key, e.errors.map((x) => friendlyFieldError(String(x))))
      }
      setRows((rs) => rs.map((r) => ({ ...r, errors: byKey.get(r.key) ?? [] })))
    }
    setFormError(screenSafeError(res.error, "등록하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요."))
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

  const plan = imp.status === "ready" ? imp.plan : null
  const importable = plan && plan.mode === "next" && plan.rows.length > 0 && plan.sourceMonth && !importDone
  const fillCandidates = plan?.mode === "fill" ? plan.rows.filter((x) => x.missing && !fillAdded.includes(x.vendor_name)) : []
  const blockedMonth = plan?.blocked === "this_month" ? (plan.mode === "fill" ? plan.targetMonth : plan.sourceMonth) : null
  const linkBtn = "inline-flex h-8 items-center rounded-sm px-1 text-sm font-medium text-link underline underline-offset-2 hover:bg-warm-beige"

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
      <DialogHeader className="relative border-b border-warm-tan px-4 py-3 pr-12 text-left sm:px-5 sm:pr-12">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          aria-label="인건비 등록 창 닫기"
          className="absolute right-2 top-2 inline-flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-warm-beige hover:text-dark disabled:opacity-50"
        >
          <X className="size-4" aria-hidden />
        </button>
        <DialogTitle className="text-lg text-dark">인건비 등록</DialogTitle>
        <DialogDescription className="text-[15px] text-text-secondary [word-break:keep-all]">
          증빙 파일 없이 대상자별 지급 내역을 입력해요. 이체확인증·급여명세서는 행마다 첨부할 수 있어요(선택).
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {/* 공통 항목 */}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="grid content-start gap-1.5">
            <Label htmlFor="pe-project" className="text-[15px]">
              프로젝트 <span className="text-destructive">*</span>
            </Label>
            <Select value={projectId ? String(projectId) : undefined} onValueChange={(v) => changeProject(Number(v))}>
              <SelectTrigger id="pe-project" className={cn("w-full", formError.includes("프로젝트") && CELL_TONE_CLASS.invalid)}>
                <SelectValue placeholder="프로젝트 고르기" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!projectId && lastProject && (
              <p className="flex flex-wrap items-center gap-x-1 text-sm text-text-secondary">
                지난번:
                <button type="button" className={linkBtn} onClick={() => changeProject(lastProject.id)}>
                  {lastProject.name}
                </button>
              </p>
            )}
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="pe-budget" className="text-[15px]">
              비목
            </Label>
            <Input
              id="pe-budget"
              list="pe-budget-names"
              value={budgetItem}
              maxLength={100}
              aria-describedby="pe-budget-hint"
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
                        "h-8 rounded-sm border px-2 text-sm transition-colors",
                        on ? "border-dark/60 bg-warm-beige font-semibold text-dark" : "border-warm-tan bg-card text-text-secondary hover:border-dark/40 hover:text-dark"
                      )}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            )}
            <p id="pe-budget-hint" className="text-sm text-text-secondary">
              {project && budgetNames.length > 0 && budgetItem.trim() && !budgetNames.includes(normalizeName(budgetItem)) ? (
                <span className="text-amber-900">이 프로젝트 예산에 없는 비목이에요</span>
              ) : (
                GLOSSARY.budgetItem.hint
              )}
            </p>
          </div>
        </div>

        {/* P-1 지난달 내역 불러오기 */}
        {projectId && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[15px]">
            {imp.status === "loading" && <span className="text-sm text-text-secondary">지난달 인건비를 찾는 중…</span>}
            {imp.status === "error" && (
              <span className="flex flex-wrap items-center gap-x-1 text-sm text-text-secondary">
                {imp.message}
                <button type="button" className={linkBtn} onClick={() => setReloadSeq((n) => n + 1)}>
                  다시 시도
                </button>
              </span>
            )}
            {importable && plan && (
              <Button type="button" variant="outline" className="h-9 hover:bg-warm-beige" onClick={importPrevious}>
                지난달 내역 불러오기 ({formatMonth(plan.sourceMonth)} 귀속 {plan.rows.length}명)
              </Button>
            )}
            {importable && plan && plan.targetMonth && (
              <span className="text-sm text-text-secondary">{formatMonth(plan.targetMonth)} 귀속으로 채워요 · 저장은 [등록]을 눌러야 돼요</span>
            )}
            {importDone && plan?.sourceMonth && plan.targetMonth && (
              <span className="text-sm text-text-secondary">
                {formatMonth(plan.sourceMonth)} 귀속 {importDone.count}명을 {formatMonth(plan.targetMonth)} 귀속으로 채웠어요 · 저장은 [등록]을 눌러야 돼요
              </span>
            )}
            {blockedMonth && <span className="text-sm text-text-secondary">이번 달 인건비가 이미 있어요({formatMonth(blockedMonth)} 귀속)</span>}
          </div>
        )}
        {fillCandidates.length > 0 && plan?.sourceMonth && (
          <div className="mt-2 rounded-md border border-warm-tan bg-warm-ivory px-3 py-2 text-sm text-dark">
            <p className="[word-break:keep-all]">
              {formatMonth(plan.sourceMonth)}에만 있던 {fillCandidates.length}명은 넣지 않았어요. 그만두거나 바뀐 사람이면 그대로 두세요.
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2">
              {fillCandidates.map((x) => (
                <button key={x.vendor_name} type="button" className={linkBtn} onClick={() => addOne(x)} aria-label={`${x.vendor_name} ${formatMonth(x.payroll_month)} 귀속으로 넣기`}>
                  {x.vendor_name} 넣기
                </button>
              ))}
            </div>
          </div>
        )}
        {skipped.length > 0 && (
          <Notice tone="info" className="mt-3">
            <span className="flex flex-wrap items-center gap-x-1">
              이미 {formatMonth(skipped[0].payroll_month)} 귀속으로 등록된 {skipped.length}명({skipped.map((x) => x.vendor_name).join(", ")})은 넣지 않았어요.
              <button type="button" className={linkBtn} onClick={addSkipped}>
                그래도 넣기
              </button>
            </span>
          </Notice>
        )}

        {/* 지급 내역 */}
        <div className="mt-4 rounded-md border border-warm-tan">
          <div className={cn("hidden gap-2 border-b border-warm-tan bg-warm-beige px-3 py-2 text-[13px] font-semibold text-dark md:grid", GRID)}>
            <span>
              지급일 <span className="text-destructive">*</span>
            </span>
            <span>
              대상자(이름) <span className="text-destructive">*</span>
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
            <Button type="button" variant="outline" size="sm" className="h-8 hover:bg-warm-beige" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" />
              사람 추가
            </Button>
            <span className="text-[15px] text-dark">
              합계 {filled.length.toLocaleString("ko-KR")}명 · <b className="tabular-nums">{won(total)}</b>
            </span>
          </div>
        </div>
        <p className="mt-2 text-sm text-text-secondary">귀속월(일한 달): {GLOSSARY.attributionMonth.hint}</p>
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
        <HelpDetails
          title="인건비 증빙 서류 안내"
          className="mt-3"
          items={[
            "처음 등록할 때: 4대보험 가입확인서, 근로계약서(또는 참여 확약서)",
            "매달: 급여대장(참여율 표시), 급여 송금증(이체확인증)",
            "과제가 끝날 때: 원천징수영수증",
            "자세한 기준은 그 사업의 운영 지침을 따라 주세요",
          ]}
        />
      </div>

      <DialogFooter className="flex-col gap-2 border-t border-warm-tan bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0 text-sm">
          {formError ? (
            <p role="alert" className="text-red-800 [word-break:keep-all]">
              {formError}
            </p>
          ) : imported.length > 0 ? (
            <p className="text-dark">
              지난달과 같음 {sameCount}명 · 바뀜 {changedCount}명{newCount > 0 && ` · 새로 ${newCount}명`}
            </p>
          ) : (
            <p className="text-text-secondary">문서 종류 ‘인건비 지급’, 원화로 저장돼요.</p>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2">
          <Button type="button" variant="outline" className="hover:bg-warm-beige" onClick={onCancel} disabled={saving}>
            닫기
          </Button>
          <BusyButton type="submit" busy={saving} busyLabel="등록 중…" disabled={uploading}>
            {filled.length > 0 ? `${filled.length}건 등록` : "등록"}
          </BusyButton>
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
  const mobileLabel = "text-sm text-text-secondary md:sr-only"
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
            <span className="sr-only">{n}번째 </span>대상자(이름)
          </Label>
          <Input
            id={id("name")}
            {...cell("name")}
            value={row.vendor_name}
            maxLength={200}
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
              올리는 중…
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
      {row.prev && (
        <p className="mt-1 text-sm text-text-secondary">
          <SourceTag source="previous" className="ml-0" />
          {changedFields(row).length > 0 && <span> · 고친 칸: {changedFields(row).join(" · ")}</span>}
        </p>
      )}
      {(row.errors.length > 0 || row.uploadError) && (
        <p role="alert" className="mt-1.5 text-sm text-red-800 [word-break:keep-all]">
          {[...row.errors, ...(row.uploadError ? [`첨부: ${row.uploadError}`] : [])].join(" · ")}
        </p>
      )}
    </li>
  )
}
