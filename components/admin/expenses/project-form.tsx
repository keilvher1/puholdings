"use client"

import { Plus, Trash2, CheckCircle2, TriangleAlert, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { WonInput } from "@/components/admin/expenses/won-input"
import { daysBetween, fileUrl, formatBytes, normalizeName, wonNumber } from "@/components/admin/expenses/client-helpers"
import { isValidDate, isWholeWon, type ProjectInput } from "@/lib/expenses"
import type { Attachment } from "@/lib/db"

// 프로젝트 등록·수정 폼. 온보딩(직접 입력·자료에서 불러온 초안)과 수정 Dialog가 같은 폼을 쓴다.
// 폼 상태는 부모가 들고 있고(value/onChange), 저장은 부모가 formToInput()으로 바꿔 보낸다.

export interface BudgetRow {
  key: string
  name: string
  amount: number | null
}

export interface ProjectFormState {
  name: string
  program_name: string
  agency: string
  description: string
  start_date: string // '' 또는 'YYYY-MM-DD'
  end_date: string
  total_budget: number | null
  budget_items: BudgetRow[]
  source_files: Attachment[]
}

export type ProjectFormErrors = Partial<
  Record<"name" | "program_name" | "agency" | "start_date" | "end_date" | "total_budget" | "budget_items", string>
>

// 지원사업에서 자주 보이는 비목 — 빠른 추가 버튼과 자동완성에 쓴다(자유 입력도 된다).
export const COMMON_BUDGET_ITEMS = [
  "인건비",
  "재료비",
  "외주용역비",
  "기계장치비",
  "지급수수료",
  "여비",
  "회의비",
  "교육훈련비",
  "광고선전비",
  "특허·지식재산권비",
  "창업활동비",
] as const

let rowSeq = 0
export function newBudgetRow(name = "", amount: number | null = null): BudgetRow {
  rowSeq += 1
  return { key: `b${rowSeq}-${Date.now()}`, name, amount }
}

export function emptyProjectForm(): ProjectFormState {
  return {
    name: "",
    program_name: "",
    agency: "",
    description: "",
    start_date: "",
    end_date: "",
    total_budget: null,
    budget_items: [],
    source_files: [],
  }
}

export function projectToForm(p: ProjectInput): ProjectFormState {
  return {
    name: p.name ?? "",
    program_name: p.program_name ?? "",
    agency: p.agency ?? "",
    description: p.description ?? "",
    start_date: isValidDate(p.start_date) ? p.start_date : "",
    end_date: isValidDate(p.end_date) ? p.end_date : "",
    total_budget: isWholeWon(p.total_budget) ? p.total_budget : null,
    budget_items: (p.budget_items ?? []).map((b) => newBudgetRow(b.name ?? "", isWholeWon(b.amount) ? b.amount : null)),
    source_files: p.source_files ?? [],
  }
}

// 이름·금액이 모두 빈 비목 행은 버린다.
export function formToInput(f: ProjectFormState): ProjectInput {
  return {
    name: f.name.trim(),
    program_name: f.program_name.trim(),
    agency: f.agency.trim(),
    description: f.description.trim(),
    start_date: f.start_date || null,
    end_date: f.end_date || null,
    total_budget: f.total_budget,
    budget_items: f.budget_items
      .filter((b) => b.name.trim() || b.amount !== null)
      .map((b) => ({ name: normalizeName(b.name), amount: b.amount })),
    source_files: f.source_files,
  }
}

export function validateProjectForm(f: ProjectFormState): ProjectFormErrors {
  const e: ProjectFormErrors = {}
  if (!f.name.trim()) e.name = "프로젝트(과제)명을 입력해 주세요"
  else if (f.name.trim().length > 200) e.name = "프로젝트명은 200자 안으로 줄여 주세요"
  if (f.program_name.length > 200) e.program_name = "200자 안으로 줄여 주세요"
  if (f.agency.length > 200) e.agency = "200자 안으로 줄여 주세요"
  if (f.start_date && !isValidDate(f.start_date)) e.start_date = "날짜를 다시 골라 주세요"
  if (f.end_date && !isValidDate(f.end_date)) e.end_date = "날짜를 다시 골라 주세요"
  if (!e.start_date && !e.end_date && f.start_date && f.end_date && f.end_date < f.start_date) {
    e.end_date = "종료일이 시작일보다 빨라요. 날짜를 다시 골라 주세요"
  }
  if (f.total_budget !== null && (!isWholeWon(f.total_budget) || f.total_budget < 0)) {
    e.total_budget = "총사업비를 0 이상의 원 단위로 입력해 주세요"
  }
  const seen = new Set<string>()
  for (const b of f.budget_items) {
    const name = normalizeName(b.name)
    if (!name && b.amount === null) continue
    if (!name) {
      e.budget_items = "금액을 넣은 비목에는 이름을 입력해 주세요"
      break
    }
    if (name.length > 100) {
      e.budget_items = `비목 이름이 너무 길어요: ${name.slice(0, 20)}…`
      break
    }
    if (b.amount !== null && (!isWholeWon(b.amount) || b.amount < 0)) {
      e.budget_items = `'${name}' 금액을 0 이상의 원 단위로 입력해 주세요`
      break
    }
    if (seen.has(name)) {
      e.budget_items = `'${name}' 비목이 두 번 들어 있어요. 하나로 합쳐 주세요`
      break
    }
    seen.add(name)
  }
  return e
}

export function hasErrors(e: ProjectFormErrors): boolean {
  return Object.values(e).some(Boolean)
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p role="alert" className="text-sm text-red-800">{message}</p>
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-text-secondary [word-break:keep-all]">{children}</p>
}

export function ProjectForm({
  value,
  onChange,
  errors = {},
  idPrefix = "pf",
  disabled = false,
}: {
  value: ProjectFormState
  onChange: (next: ProjectFormState) => void
  errors?: ProjectFormErrors
  idPrefix?: string
  disabled?: boolean
}) {
  const set = <K extends keyof ProjectFormState>(key: K, v: ProjectFormState[K]) => onChange({ ...value, [key]: v })
  const id = (s: string) => `${idPrefix}-${s}`

  const period =
    isValidDate(value.start_date) && isValidDate(value.end_date) && value.end_date >= value.start_date
      ? daysBetween(value.start_date, value.end_date) + 1
      : null

  return (
    <div className="grid gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor={id("name")}>
          프로젝트(과제)명 <span className="text-red-800" aria-hidden>*</span>
        </Label>
        <Input
          id={id("name")}
          value={value.name}
          disabled={disabled}
          aria-invalid={Boolean(errors.name) || undefined}
          onChange={(e) => set("name", e.target.value)}
          placeholder="예: 공정 불량 예측 솔루션 사업화"
        />
        <FieldError message={errors.name} />
        {!errors.name && <Hint>증빙을 올릴 때 이 이름으로 골라요</Hint>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={id("program")}>지원사업명</Label>
          <Input
            id={id("program")}
            value={value.program_name}
            disabled={disabled}
            onChange={(e) => set("program_name", e.target.value)}
            placeholder="예: 2026 초기창업패키지"
          />
          <FieldError message={errors.program_name} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("agency")}>주관·전담기관</Label>
          <Input
            id={id("agency")}
            value={value.agency}
            disabled={disabled}
            onChange={(e) => set("agency", e.target.value)}
            placeholder="예: 창업진흥원"
          />
          <FieldError message={errors.agency} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={id("start")}>사업 기간</Label>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Input
            id={id("start")}
            type="date"
            value={value.start_date}
            disabled={disabled}
            aria-label="시작일"
            aria-invalid={Boolean(errors.start_date) || undefined}
            onChange={(e) => set("start_date", e.target.value)}
          />
          <span className="text-sm text-text-secondary">~</span>
          <Input
            id={id("end")}
            type="date"
            value={value.end_date}
            disabled={disabled}
            aria-label="종료일"
            min={value.start_date || undefined}
            aria-invalid={Boolean(errors.end_date) || undefined}
            onChange={(e) => set("end_date", e.target.value)}
          />
        </div>
        <FieldError message={errors.start_date || errors.end_date} />
        {!errors.start_date && !errors.end_date && (
          <Hint>
            {period !== null
              ? `총 ${period.toLocaleString("ko-KR")}일 · 약 ${Math.max(1, Math.round(period / 30.44))}개월`
              : "협약(수행) 기간이에요"}
          </Hint>
        )}
      </div>

      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor={id("total")}>총사업비</Label>
        <WonInput
          id={id("total")}
          value={value.total_budget}
          disabled={disabled}
          invalid={Boolean(errors.total_budget)}
          onChange={(v) => set("total_budget", v)}
          placeholder="0"
        />
        <FieldError message={errors.total_budget} />
        {!errors.total_budget && <Hint>집행률(집행액 ÷ 총사업비)의 기준이에요</Hint>}
      </div>

      <BudgetItemsEditor
        rows={value.budget_items}
        totalBudget={value.total_budget}
        disabled={disabled}
        error={errors.budget_items}
        idPrefix={idPrefix}
        onChange={(rows) => set("budget_items", rows)}
        onFillTotal={(sum) => set("total_budget", sum)}
      />

      <div className="grid gap-1.5">
        <Label htmlFor={id("desc")}>설명 (선택)</Label>
        <Textarea
          id={id("desc")}
          rows={3}
          value={value.description}
          disabled={disabled}
          onChange={(e) => set("description", e.target.value)}
          placeholder="사업 목적, 담당자, 정산 유의사항"
        />
      </div>

      {value.source_files.length > 0 && (
        <div className="grid gap-1.5">
          <Label>함께 보관할 사업 자료</Label>
          <ul className="flex flex-wrap gap-2">
            {value.source_files.map((f) => (
              <li key={f.pathname}>
                <a
                  href={fileUrl(f.pathname, { download: true, name: f.name })}
                  className="inline-flex max-w-[260px] items-center gap-1.5 rounded-md border border-warm-tan bg-card px-2.5 py-1 text-sm text-dark transition-colors hover:border-dark/40 hover:bg-warm-ivory/60"
                  aria-label={`${f.name} 내려받기`}
                >
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 tabular-nums text-text-secondary">{formatBytes(f.size)}</span>
                  <Download className="size-4 shrink-0 text-text-secondary" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// 비목별 예산 표: 행 추가/삭제, 자주 쓰는 비목 빠른 추가, 합계와 총사업비 차이 안내.
function BudgetItemsEditor({
  rows,
  totalBudget,
  disabled,
  error,
  idPrefix,
  onChange,
  onFillTotal,
}: {
  rows: BudgetRow[]
  totalBudget: number | null
  disabled: boolean
  error?: string
  idPrefix: string
  onChange: (rows: BudgetRow[]) => void
  onFillTotal: (sum: number) => void
}) {
  const listId = `${idPrefix}-budget-names`
  const sum = rows.reduce((s, r) => s + (typeof r.amount === "number" ? r.amount : 0), 0)
  const hasAmount = rows.some((r) => r.amount !== null)
  const used = new Set(rows.map((r) => normalizeName(r.name)))
  const quick = COMMON_BUDGET_ITEMS.filter((n) => !used.has(n))

  const update = (key: string, patch: Partial<BudgetRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const remove = (key: string) => onChange(rows.filter((r) => r.key !== key))
  const add = (name = "") => {
    // 비어 있는 행이 있으면 새 행을 만들지 않고 그 행에 이름을 채운다
    const blank = rows.find((r) => !r.name.trim() && r.amount === null)
    if (blank && name) update(blank.key, { name })
    else onChange([...rows, newBudgetRow(name)])
  }

  let status: React.ReactNode = null
  if (hasAmount) {
    if (totalBudget === null) {
      status = (
        <span className="flex flex-wrap items-center gap-2 text-text-secondary">
          총사업비를 아직 넣지 않았어요
          {!disabled && (
            <Button type="button" variant="outline" size="sm" className="h-8 text-sm hover:bg-warm-beige" onClick={() => onFillTotal(sum)}>
              비목 합계({wonNumber(sum)}원)로 채우기
            </Button>
          )}
        </span>
      )
    } else if (sum === totalBudget) {
      status = (
        <span className="flex items-center gap-1 font-medium text-green-800">
          <CheckCircle2 className="size-4" aria-hidden />
          총사업비와 같아요
        </span>
      )
    } else if (sum < totalBudget) {
      status = (
        <span className="text-text-secondary">
          <b className="font-semibold tabular-nums text-dark">{wonNumber(totalBudget - sum)}원</b>을 아직 비목에 나누지 않았어요
        </span>
      )
    } else {
      status = (
        <span className="flex items-center gap-1 font-medium text-amber-800">
          <TriangleAlert className="size-4" aria-hidden />
          비목 합계가 총사업비보다 <span className="tabular-nums">{wonNumber(sum - totalBudget)}원</span> 많아요
        </span>
      )
    }
  }

  return (
    <div className="grid gap-2">
      <div>
        <Label>비목별 예산 (선택)</Label>
        <Hint>넣어 두면 증빙 내역에 비목별 집행률·잔액이 보여요</Hint>
      </div>

      <datalist id={listId}>
        {COMMON_BUDGET_ITEMS.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-md border border-warm-tan">
          <div className="hidden grid-cols-[1fr_11rem_2.25rem] gap-2 border-b border-warm-tan bg-warm-beige px-3 py-1.5 text-sm font-semibold text-dark sm:grid">
            <span>비목</span>
            <span className="text-right">예산</span>
            <span />
          </div>
          <ul className="divide-y divide-warm-tan/60">
            {rows.map((r, i) => (
              <li key={r.key} className="grid grid-cols-[1fr_2.25rem] gap-2 px-3 py-2 sm:grid-cols-[1fr_11rem_2.25rem]">
                <Input
                  list={listId}
                  value={r.name}
                  disabled={disabled}
                  aria-label={`${i + 1}번째 비목 이름`}
                  placeholder="비목 이름 (예: 재료비)"
                  onChange={(e) => update(r.key, { name: e.target.value })}
                  className="h-9"
                />
                <div className="col-start-1 row-start-2 sm:col-start-auto sm:row-start-auto">
                  <WonInput
                    value={r.amount}
                    disabled={disabled}
                    aria-label={`${i + 1}번째 비목 예산`}
                    placeholder="금액"
                    onChange={(v) => update(r.key, { amount: v })}
                    className="h-9"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  className="col-start-2 row-start-1 h-9 w-9 text-text-secondary hover:bg-red-50 hover:text-red-800 sm:col-start-auto sm:row-start-auto"
                  aria-label={`${r.name || `${i + 1}번째`} 비목 삭제`}
                  onClick={() => remove(r.key)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-warm-tan bg-warm-ivory px-3 py-2 text-sm">
            <span className="text-text-secondary">
              비목 합계 <b className="font-semibold tabular-nums text-dark">{wonNumber(sum)}원</b>
            </span>
            {status}
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}

      {!disabled && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" className="hover:bg-warm-beige" onClick={() => add()}>
            <Plus className="size-4" aria-hidden />
            비목 추가
          </Button>
          {quick.length > 0 && (
            <>
              <span className="ml-1 text-sm text-text-secondary">빠른 추가:</span>
              {quick.slice(0, 8).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => add(n)}
                  className="min-h-8 rounded-sm border border-warm-tan bg-card px-2 py-0.5 text-sm text-dark transition-colors hover:border-dark/40 hover:bg-warm-ivory/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  + {n}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
