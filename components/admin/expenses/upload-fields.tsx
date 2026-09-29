"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  CURRENCY_LABELS,
  DOC_TYPE_LABELS,
  EXPENSE_DOC_TYPES,
  SUPPORTED_CURRENCIES,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  formatBizNo,
  formatWon,
  type CurrencyCode,
  type ExpenseDocType,
  type PaymentMethod,
  type ReceiptFields,
  type ReceiptItem,
} from "@/lib/expenses"
import {
  formatForeign,
  formatNumberText,
  formatRate,
  fxDateNote,
  fxSourceText,
  parseQuantityText,
  parseWonText,
  type FxState,
  type UploaderProject,
} from "./upload-model"
import { CELL_TONE_CLASS } from "./ui"

// 증빙 표·검토 창에서 함께 쓰는 입력 칸.
// - low: 인식이 불확실한 칸(확인 필요) · invalid: 저장할 수 없는 값(입력 오류)
// - grid: 표에서 Enter로 아래 행 같은 칸으로 이동하기 위한 좌표(data-grid-row/col)

export type CellState = { low?: boolean; invalid?: boolean }

export function cellClass({ low, invalid }: CellState, extra = ""): string {
  return cn(
    "h-8 rounded-md bg-card px-2 text-sm shadow-none",
    low && !invalid && cn(CELL_TONE_CLASS.review, "focus-visible:ring-[3px] focus-visible:ring-amber-600/40"),
    invalid && CELL_TONE_CLASS.invalid,
    extra
  )
}

export interface GridProps {
  "data-grid-row"?: number
  "data-grid-col"?: string
}

const LOW_TITLE = "인식 불확실 · 원본과 대조하세요"

// ── 금액(천 단위 콤마, 오른쪽 정렬) ──────────────────────────────────────────
// 입력하는 동안에도 콤마를 붙이고, 커서가 튀지 않도록 "커서 앞 숫자 개수"를 기준으로 위치를 되돌린다.
export function MoneyInput({
  value,
  onChange,
  onBlur,
  state = {},
  className,
  grid,
  ...rest
}: {
  value: number | null
  onChange: (v: number | null) => void
  onBlur?: () => void
  state?: CellState
  className?: string
  grid?: GridProps
  "aria-label"?: string
  placeholder?: string
  id?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => formatNumberText(value))
  const caretDigits = useRef<number | null>(null)

  // 바깥에서 값이 바뀌면(검토 창에서 수정·복원 등) 표시 문자열을 맞춘다.
  const [prevValue, setPrevValue] = useState(value)
  if (prevValue !== value) {
    setPrevValue(value)
    if (parseWonText(text) !== value) setText(formatNumberText(value))
  }

  useLayoutEffect(() => {
    const el = ref.current
    const want = caretDigits.current
    if (!el || want === null || document.activeElement !== el) return
    caretDigits.current = null
    let seen = 0
    const s = el.value
    // 붙여넣은 값에서 소수점 아래를 버리면 숫자 수가 줄어든다 — 그때는 끝으로 보낸다.
    let pos = want > 0 ? s.length : 0
    if (want > 0) {
      for (let i = 0; i < s.length; i++) {
        if (/\d/.test(s[i])) seen++
        if (seen === want) {
          pos = i + 1
          break
        }
      }
    } else {
      pos = s.startsWith("-") ? 1 : 0
    }
    el.setSelectionRange(pos, pos)
  }, [text])

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={text}
      title={state.low && !state.invalid ? LOW_TITLE : undefined}
      aria-invalid={state.invalid || undefined}
      onChange={(e) => {
        const raw = e.target.value
        const caret = e.target.selectionStart ?? raw.length
        // 소수점 아래는 버리므로(원 단위) 커서 위치도 정수 부분 기준으로 센다.
        caretDigits.current = raw.slice(0, caret).split(".")[0].replace(/\D/g, "").length
        const n = parseWonText(raw)
        const neg = raw.trim().startsWith("-")
        setText(n === null ? (neg ? "-" : "") : formatNumberText(n))
        onChange(n)
      }}
      onBlur={() => {
        if (text === "-") setText("")
        onBlur?.()
      }}
      className={cellClass(state, cn("text-right tabular-nums", className))}
      {...grid}
      {...rest}
    />
  )
}

// ── 수량(소수 허용: 주유 35.12L, 1.5시간 등) ──────────────────────────────────
export function QuantityInput({
  value,
  onChange,
  className,
  ...rest
}: {
  value: number | null
  onChange: (v: number | null) => void
  className?: string
  "aria-label"?: string
}) {
  const [text, setText] = useState(() => (value === null ? "" : String(value)))
  const [prevValue, setPrevValue] = useState(value)
  if (prevValue !== value) {
    setPrevValue(value)
    if (parseQuantityText(text) !== value) setText(value === null ? "" : String(value))
  }
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(e) => {
        const raw = e.target.value
        const n = parseQuantityText(raw)
        if (n === undefined && raw.replace(/[,\s]/g, "") !== "" && !/^-?\d*\.?\d*$/.test(raw.replace(/[,\s]/g, ""))) return // 숫자가 아닌 글자는 받지 않는다
        setText(raw)
        if (n !== undefined) onChange(n)
      }}
      onBlur={() => setText(value === null ? "" : String(value))}
      className={cellClass({}, cn("text-right tabular-nums", className))}
      {...rest}
    />
  )
}

// ── 텍스트 ──────────────────────────────────────────────────────────────────
export function TextCell({
  value,
  onChange,
  onBlur,
  state = {},
  className,
  grid,
  list,
  maxLength,
  placeholder,
  inputMode,
  title,
  ...rest
}: {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  state?: CellState
  className?: string
  grid?: GridProps
  list?: string
  maxLength?: number
  placeholder?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  title?: string
  "aria-label"?: string
  id?: string
}) {
  return (
    <Input
      type="text"
      autoComplete="off"
      value={value}
      list={list}
      maxLength={maxLength}
      placeholder={placeholder}
      inputMode={inputMode}
      title={state.low && !state.invalid ? LOW_TITLE : title}
      aria-invalid={state.invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={cellClass(state, className)}
      {...grid}
      {...rest}
    />
  )
}

// 사업자등록번호: 숫자 10자리를 입력하면 칸을 벗어날 때 000-00-00000으로 맞춘다.
export function BizNoInput(props: Omit<Parameters<typeof TextCell>[0], "inputMode" | "maxLength" | "placeholder" | "title">) {
  return (
    <TextCell
      {...props}
      inputMode="numeric"
      maxLength={12}
      placeholder="-"
      title="000-00-00000"
      className={cn("tabular-nums", props.className)}
      onChange={(v) => props.onChange(v.replace(/[^\d-]/g, ""))}
      onBlur={() => {
        const f = formatBizNo(props.value.trim())
        if (f !== props.value) props.onChange(f)
        props.onBlur?.()
      }}
    />
  )
}

// ── 날짜(브라우저 달력 사용: 휴대폰에서도 편하게 고른다) ─────────────────────
export function DateCell({
  value,
  onChange,
  onBlur,
  state = {},
  className,
  grid,
  ...rest
}: {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  state?: CellState
  className?: string
  grid?: GridProps
  "aria-label"?: string
  id?: string
}) {
  return (
    <Input
      type="date"
      value={value}
      min="2000-01-01"
      max="2099-12-31"
      title={state.low && !state.invalid ? LOW_TITLE : undefined}
      aria-invalid={state.invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={cellClass(state, cn("tabular-nums", className))}
      {...grid}
      {...rest}
    />
  )
}

// ── 선택 칸 ──────────────────────────────────────────────────────────────────
const triggerClass = (state: CellState, extra?: string) =>
  cn(
    "h-8 w-full min-w-0 bg-card px-2 text-sm shadow-none data-[size=default]:h-8",
    state.low && !state.invalid && cn(CELL_TONE_CLASS.review, "focus-visible:ring-[3px] focus-visible:ring-amber-600/40"),
    state.invalid && CELL_TONE_CLASS.invalid,
    extra
  )

// onSeen: 목록을 열었다 닫거나 칸을 벗어나면 "사람이 봤다"로 보고 노란(인식 불확실) 표시를 끈다.
// 같은 값을 다시 고르면 onValueChange가 불리지 않으므로, 인식 값이 맞을 때도 표시를 끌 수 있게 하려는 것이다.
export function DocTypeSelect({
  value,
  onChange,
  onSeen,
  state = {},
  className,
  ...rest
}: {
  value: ExpenseDocType
  onChange: (v: ExpenseDocType) => void
  onSeen?: () => void
  state?: CellState
  className?: string
  "aria-label"?: string
  id?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ExpenseDocType)} onOpenChange={(open) => !open && onSeen?.()}>
      <SelectTrigger
        className={triggerClass(state, className)}
        title={state.low && !state.invalid ? LOW_TITLE : undefined}
        aria-invalid={state.invalid || undefined}
        onBlur={onSeen}
        {...rest}
      >
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
  )
}

export function PaymentSelect({
  value,
  onChange,
  onSeen,
  state = {},
  className,
  ...rest
}: {
  value: PaymentMethod
  onChange: (v: PaymentMethod) => void
  onSeen?: () => void
  state?: CellState
  className?: string
  "aria-label"?: string
  id?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as PaymentMethod)} onOpenChange={(open) => !open && onSeen?.()}>
      <SelectTrigger
        className={triggerClass(state, className)}
        title={state.low && !state.invalid ? LOW_TITLE : undefined}
        aria-invalid={state.invalid || undefined}
        onBlur={onSeen}
        {...rest}
      >
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
  )
}

export function projectLabel(p: Pick<UploaderProject, "name" | "program_name">): string {
  return p.program_name ? `${p.name} · ${p.program_name}` : p.name
}

// 프로젝트 선택(필수). suggested: 선택값이 자동 추천이면 이름 뒤에 '추천'. 비어 있으면 빨간 테두리로 입력 필요를 알린다.
export function ProjectSelect({
  value,
  onChange,
  projects,
  state = {},
  placeholder = "프로젝트 선택",
  className,
  aiSuggestedId,
  suggested = false,
  title,
  ...rest
}: {
  value: number | null
  onChange: (id: number) => void
  projects: UploaderProject[]
  state?: CellState
  placeholder?: string
  className?: string
  aiSuggestedId?: number | null
  suggested?: boolean
  title?: string
  "aria-label"?: string
  id?: string
}) {
  const selected = value ? projects.find((p) => p.id === value) : undefined
  return (
    <Select value={selected ? String(selected.id) : ""} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger
        className={triggerClass(
          state,
          cn(
            !selected && "data-[placeholder]:font-medium data-[placeholder]:text-dark",
            !selected && !state.invalid && "border-destructive/60",
            className
          )
        )}
        title={title}
        aria-invalid={state.invalid || undefined}
        {...rest}
      >
        {/* 칸이 좁으므로 선택된 값은 프로젝트명만 보여 준다 */}
        <SelectValue placeholder={placeholder}>
          {selected ? (
            <>
              <span className="min-w-0 truncate">{selected.name}</span>
              {suggested && <span className="shrink-0 text-xs text-text-secondary">추천</span>}
            </>
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-w-[min(90vw,420px)]">
        <SelectGroup>
          <SelectLabel>프로젝트</SelectLabel>
          {projects.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              <span className="flex min-w-0 flex-col items-start">
                <span className="max-w-[320px] truncate">{p.name}</span>
                {(p.program_name || p.agency) && (
                  <span className="max-w-[320px] truncate text-xs text-text-secondary">
                    {[p.program_name, p.agency].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              {aiSuggestedId === p.id && <span className="ml-1 shrink-0 text-xs text-text-secondary">(추천)</span>}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

// ── 품목(영수증의 줄 단위 내역) ──────────────────────────────────────────────
export function ItemsEditor({
  items,
  onChange,
  total,
  supply,
}: {
  items: ReceiptItem[]
  onChange: (items: ReceiptItem[]) => void
  total?: number | null
  supply?: number | null
}) {
  const patch = (i: number, p: Partial<ReceiptItem>) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...p } : it)))
  const sum = items.reduce((acc, it) => acc + (typeof it.amount === "number" ? it.amount : 0), 0)
  const hasAmounts = items.some((it) => typeof it.amount === "number")
  // 품목 금액은 부가세 포함(합계) 또는 별도(공급가액)로 적히므로 둘 중 하나와 맞으면 정상으로 본다.
  const mismatch = typeof total === "number" && sum !== total && !(typeof supply === "number" && sum === supply)
  return (
    <div className="space-y-1.5">
      {items.length === 0 ? (
        <p className="text-xs text-text-secondary">품목 없음(선택 입력)</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[340px] text-xs">
            <thead className="text-text-secondary">
              <tr>
                <th className="pb-1 text-left font-medium">품목명</th>
                <th className="w-12 pb-1 text-right font-medium">수량</th>
                <th className="w-[88px] pb-1 text-right font-medium">단가</th>
                <th className="w-[88px] pb-1 text-right font-medium">금액</th>
                <th className="w-7 pb-1" />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="py-0.5 pr-1">
                    <TextCell value={it.name} onChange={(v) => patch(i, { name: v })} aria-label={`품목 ${i + 1} 이름`} />
                  </td>
                  <td className="py-0.5 pr-1">
                    <QuantityInput value={it.quantity} onChange={(v) => patch(i, { quantity: v })} className="px-1.5" aria-label={`품목 ${i + 1} 수량`} />
                  </td>
                  <td className="py-0.5 pr-1">
                    <MoneyInput value={it.unit_price} onChange={(v) => patch(i, { unit_price: v })} className="px-1.5" aria-label={`품목 ${i + 1} 단가`} />
                  </td>
                  <td className="py-0.5 pr-1">
                    <MoneyInput value={it.amount} onChange={(v) => patch(i, { amount: v })} className="px-1.5" aria-label={`품목 ${i + 1} 금액`} />
                  </td>
                  <td className="py-0.5 text-right">
                    <button
                      type="button"
                      onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                      aria-label={`품목 ${i + 1} 지우기`}
                      className="rounded p-1 text-text-secondary hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onChange([...items, { name: "", quantity: null, unit_price: null, amount: null }])}
        >
          <Plus className="h-3.5 w-3.5" />
          품목 추가
        </Button>
        {hasAmounts && (
          <span className={cn("text-xs tabular-nums", mismatch ? "text-amber-700" : "text-text-secondary")}>
            품목 금액 합계 {formatWon(sum)}
            {mismatch && ` · 합계 ${formatWon(total)}와 다름`}
          </span>
        )}
      </div>
    </div>
  )
}

// ── 외화 금액·환율(소수 허용, 천 단위 콤마) ─────────────────────────────────────
// 입력 중에는 친 그대로 두고, 칸을 벗어나면 format으로 맞춘다. 음수는 받지 않는다(외화 금액·환율은 0보다 커야 한다).
export function parseDecimalText(text: string, decimals: number): number | null | undefined {
  const s = text.replace(/[,\s]/g, "")
  if (s === "") return null
  if (!/^\d*\.?\d*$/.test(s) || !/\d/.test(s)) return undefined
  const [int, frac = ""] = s.split(".")
  const n = Number(`${int || "0"}.${frac.slice(0, decimals) || "0"}`)
  return Number.isFinite(n) && n < 1e12 ? n : undefined
}

export function DecimalInput({
  value,
  onChange,
  onBlur,
  decimals,
  format,
  state = {},
  className,
  grid,
  ...rest
}: {
  value: number | null
  onChange: (v: number | null) => void
  onBlur?: () => void
  decimals: number
  format: (n: number | null) => string
  state?: CellState
  className?: string
  grid?: GridProps
  "aria-label"?: string
  placeholder?: string
  id?: string
}) {
  const [text, setText] = useState(() => format(value))
  const [prevValue, setPrevValue] = useState(value)
  if (prevValue !== value) {
    setPrevValue(value)
    if (parseDecimalText(text, decimals) !== value) setText(format(value))
  }
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      title={state.low && !state.invalid ? LOW_TITLE : undefined}
      aria-invalid={state.invalid || undefined}
      onChange={(e) => {
        const raw = e.target.value
        const n = parseDecimalText(raw, decimals)
        if (n === undefined) return // 숫자·점·콤마 외의 글자는 받지 않는다
        const frac = raw.replace(/[,\s]/g, "").split(".")[1]
        if (frac && frac.length > decimals) return // 소수 자릿수 초과
        setText(raw)
        onChange(n)
      }}
      onBlur={() => {
        setText(format(value))
        onBlur?.()
      }}
      className={cellClass(state, cn("text-right tabular-nums", className))}
      {...grid}
      {...rest}
    />
  )
}

// 통화 선택. quiet: 원화 행에서는 눈에 덜 띄게(외화로 바꿀 때만 쓰는 칸).
export function CurrencySelect({
  value,
  onChange,
  onSeen,
  state = {},
  quiet = false,
  className,
  ...rest
}: {
  value: CurrencyCode
  onChange: (v: CurrencyCode) => void
  onSeen?: () => void
  state?: CellState
  quiet?: boolean
  className?: string
  "aria-label"?: string
  id?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as CurrencyCode)} onOpenChange={(open) => !open && onSeen?.()}>
      <SelectTrigger
        className={triggerClass(
          state,
          cn(
            "gap-1 px-1.5 text-xs font-medium tabular-nums [&_svg:not([class*='size-'])]:size-3.5",
            quiet && !state.low && !state.invalid && "border-transparent text-text-secondary hover:border-warm-tan",
            className
          )
        )}
        title={state.low && !state.invalid ? LOW_TITLE : CURRENCY_LABELS[value]}
        aria-invalid={state.invalid || undefined}
        onBlur={onSeen}
        {...rest}
      >
        <SelectValue>{value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_CURRENCIES.map((c) => (
          <SelectItem key={c} value={c}>
            {CURRENCY_LABELS[c]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// 외화 금액 칸(통화별 소수 자리)
export function ForeignAmountInput(props: Omit<Parameters<typeof DecimalInput>[0], "decimals" | "format"> & { currency: CurrencyCode }) {
  const { currency, ...rest } = props
  return <DecimalInput {...rest} decimals={2} format={(n) => formatForeign(n, currency)} placeholder={rest.placeholder ?? `${currency} 금액`} />
}

// 환율 칸(1 외화당 원, 소수 4자리)
export function RateInput(props: Omit<Parameters<typeof DecimalInput>[0], "decimals" | "format">) {
  return <DecimalInput {...props} decimals={4} format={formatRate} placeholder={props.placeholder ?? "환율"} />
}

// 환율 근거 한 줄: "2026-09-18 기준 · 유럽중앙은행" · 조회 중 · 조회 실패 · 직접 입력.
// onRefetch: 결제일 환율 다시 받기(직접 입력한 환율을 버림)
export function FxNote({
  fields,
  fx,
  onRefetch,
  className,
}: {
  fields: Pick<ReceiptFields, "currency" | "issue_date" | "exchange_rate" | "exchange_rate_date" | "exchange_rate_source">
  fx?: FxState | null
  onRefetch?: () => void
  className?: string
}) {
  if (fields.currency === "KRW") return null
  const btn = (label: string) =>
    onRefetch ? (
      <button
        type="button"
        onClick={onRefetch}
        className="inline-flex items-center gap-0.5 font-medium text-dark underline-offset-2 hover:underline disabled:no-underline disabled:opacity-60"
      >
        <RotateCcw className="h-3 w-3" aria-hidden />
        {label}
      </button>
    ) : null
  let body: React.ReactNode
  if (fx?.status === "loading") {
    body = (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        결제일 환율 조회 중
      </span>
    )
  } else if (fields.exchange_rate_source === "manual") {
    body = (
      <>
        <span>{fxSourceText(fields)}</span>
        {btn("결제일 환율 적용")}
      </>
    )
  } else if (fields.exchange_rate !== null && fields.exchange_rate_source) {
    const note = fxDateNote(fields)
    body = (
      <span title={note || undefined}>
        {fxSourceText(fields)}
        {note && " (직전 영업일)"}
      </span>
    )
  } else if (fx?.status === "error") {
    body = (
      <>
        <span className="text-amber-800" title="환율 칸에 직접 입력할 수 있습니다">
          {fx.message}
        </span>
        {btn("다시 조회")}
      </>
    )
  } else if (!fields.issue_date) {
    body = <span>거래일자 입력 시 결제일 환율 적용</span>
  } else {
    body = <span>환율 없음 · 직접 입력하세요</span>
  }
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-4 text-text-secondary", className)} aria-live="polite">
      {body}
    </p>
  )
}

// 인건비 귀속월('YYYY-MM')
export function MonthCell({
  value,
  onChange,
  onBlur,
  state = {},
  className,
  ...rest
}: {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  state?: CellState
  className?: string
  "aria-label"?: string
  id?: string
}) {
  return (
    <Input
      type="month"
      value={value}
      min="2000-01"
      max="2099-12"
      aria-invalid={state.invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={cellClass(state, cn("tabular-nums", className))}
      {...rest}
    />
  )
}
