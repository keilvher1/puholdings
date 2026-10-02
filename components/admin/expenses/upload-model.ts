// 증빙 올리기 화면(ReceiptUploader)의 상태 모양과 순수 도우미.
// React에 의존하지 않는 계산만 둔다(행 생성·검증·저장 요청 변환·임시 보관 직렬화).

import {
  EXPENSE_DOC_TYPES,
  PAYMENT_METHODS,
  SUPPORTED_CURRENCIES,
  amountMismatch,
  convertToKrw,
  emptyReceiptFields,
  formatBizNo,
  formatWon,
  isValidDate,
  isWholeWon,
  validateReceiptFields,
  type Confidence,
  type CurrencyCode,
  type DuplicateReceipt,
  type ExchangeRateSource,
  type FxRateResponse,
  type ExpenseProject,
  type InboxItem,
  type ReceiptCreateInput,
  type ReceiptDraft,
  type ReceiptFields,
  type ReceiptItem,
  type UploadedFileMeta,
} from "@/lib/expenses"
import {
  DOC_TYPE_PRIORITY,
  SAME_TX_REASON_LABELS,
  normalizeApproval,
  sameTransactionReason,
  type SameTxReason,
  type SimilarReceipt,
} from "@/lib/expense-dedupe"

import { addMonths, date as formatDate, dateShort, won } from "@/lib/format"
import { statusMeta } from "@/lib/status"

export type { SimilarReceipt } from "@/lib/expense-dedupe"

// 화면에 필요한 프로젝트 정보만. ExpenseProject를 그대로 넘겨도 된다(구조적으로 호환).
export type UploaderProject = Pick<
  ExpenseProject,
  "id" | "name" | "program_name" | "agency" | "start_date" | "end_date" | "budget_items"
>

// ── 파일(업로드 대기열) ────────────────────────────────────────────────────────
export type UploadStatus = "queued" | "compressing" | "scanning" | "done" | "error"

export interface UploadItem {
  key: string
  file: File // 사용자가 고른 원본
  prepared: File | null // 압축을 마친 전송용 파일(다시 시도할 때 재사용)
  originalHash: string | null // 줄이기 전 원본의 sha256(같은 사진을 다른 기기에서 올려도 같은 파일로 알아보기 위함)
  name: string
  size: number
  kind: "image" | "pdf" | "other"
  localUrl: string | null // 썸네일용 object URL(이미지만)
  status: UploadStatus
  error: string
  retryable: boolean
  startedAt: number | null // 분석 시작 시각(경과 시간 표시)
  uploaded: UploadedFileMeta | null
  draftCount: number
  duplicateCount: number
  aiSkipped: boolean // AI 없이 빈 행만 만든 경우(AI 미설정·직접 입력 선택)
  // AI 판독은 실패했지만 원본은 서버에 보관된 경우 — '직접 입력'으로 빈 행을 만들 수 있다.
  fallback: { file: UploadedFileMeta; duplicates: DuplicateReceipt[] } | null
  // 데스크톱 앱이 올려 확인 대기함(expense_inbox)에 있던 파일이면 그 번호. 행을 모두 저장하면 대기함에서 빠진다.
  inboxId?: number | null
}

// ── 표의 한 행(증빙 초안 1건) ─────────────────────────────────────────────────
// ai: AI 추천 · default: 주소(?project_id)로 지정 · single: 프로젝트가 1개뿐 · bulk: 일괄 지정 · user: 직접 선택
export type ProjectSource = "ai" | "default" | "single" | "bulk" | "user" | null

export interface DraftRow {
  key: string
  fileKey: string | null // 같은 화면의 UploadItem.key(복원한 행은 null)
  file: UploadedFileMeta
  fields: ReceiptFields
  project_id: number | null
  projectSource: ProjectSource
  projectReason: string
  selected: boolean
  confidence: Confidence | null
  lowFields: (keyof ReceiptFields)[] // AI가 확신하지 못한 칸
  checkedFields: (keyof ReceiptFields)[] // 사람이 들여다본(포커스했다가 벗어난) 칸 — 노란 표시를 끈다
  warnings: string[]
  duplicates: DuplicateReceipt[]
  // 파일은 다르지만 같은 거래로 보이는 저장된 증빙(서버 /scan의 possible_duplicates) — 세금계산서+이체확인증 이중 계상 방지
  similar: SimilarReceipt[]
  aiRaw: ReceiptDraft | null // 저장 시 ai_raw로 보낸다(감사용)
  manual: boolean // AI 없이 만든 빈 행
  showErrors: boolean // 저장을 한 번 시도한 뒤부터 빨간 칸을 보여 준다
  serverErrors: string[]
  // 외화 행의 결제일 환율 조회 상태(화면 전용, 임시 보관하지 않는다)
  fx?: FxState | null
  // [확인했어요]로 확인 처리한 사유의 id(RowReason.id). 화면 상태일 뿐 DB에 쓰지 않는다. 저장 대상(selected)은 바꾸지 않는다.
  ackReasons?: string[]
}

export type FxState = { status: "loading" } | { status: "error"; message: string }

export function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function fileUrl(pathname: string, download?: { name: string }): string {
  const base = `/api/file?pathname=${encodeURIComponent(pathname)}`
  return download ? `${base}&download=1&name=${encodeURIComponent(download.name)}` : base
}

export function isImageMeta(meta: Pick<UploadedFileMeta, "type" | "name">): boolean {
  return meta.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(meta.name)
}

// ── AI 초안 방어적 정리 ────────────────────────────────────────────────────────
// 서버가 스키마를 지키더라도 화면이 깨지지 않도록 타입을 한 번 더 맞춘다.
function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s원]/g, ""))
  return Number.isFinite(n) ? Math.round(n) : null
}

function toStr(v: unknown): string {
  return typeof v === "string" ? v : v === null || v === undefined ? "" : String(v)
}

const FIELD_KEYS: (keyof ReceiptFields)[] = [
  "doc_type",
  "issue_date",
  "vendor_name",
  "vendor_biz_no",
  "supply_amount",
  "vat_amount",
  "total_amount",
  "payment_method",
  "approval_no",
  "items",
  "budget_item",
  "purpose",
  "memo",
  "currency",
  "foreign_amount",
  "exchange_rate",
  "exchange_rate_date",
  "exchange_rate_source",
  "payroll_month",
]

function sanitizeItems(v: unknown): ReceiptItem[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
    .map((it) => ({
      name: toStr(it.name),
      quantity: it.quantity === null || it.quantity === undefined ? null : Number(it.quantity) || null,
      unit_price: toIntOrNull(it.unit_price),
      amount: toIntOrNull(it.amount),
    }))
}

function toDecimalOrNull(v: unknown, digits: number): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""))
  if (!Number.isFinite(n)) return null
  const f = 10 ** digits
  return Math.round(n * f) / f
}

const FX_SOURCES: ExchangeRateSource[] = ["", "ecb", "koreaexim", "manual"]

export function sanitizeFields(d: Partial<ReceiptFields> | null | undefined): ReceiptFields {
  const base = emptyReceiptFields()
  if (!d) return base
  const docType = EXPENSE_DOC_TYPES.includes(d.doc_type as never) ? (d.doc_type as ReceiptFields["doc_type"]) : "other"
  const pay = PAYMENT_METHODS.includes(d.payment_method as never)
    ? (d.payment_method as ReceiptFields["payment_method"])
    : base.payment_method
  const date = toStr(d.issue_date).trim()
  return {
    doc_type: d.doc_type ? docType : base.doc_type,
    issue_date: isValidDate(date) ? date : "",
    vendor_name: toStr(d.vendor_name).slice(0, 200),
    vendor_biz_no: formatBizNo(toStr(d.vendor_biz_no).trim()),
    supply_amount: toIntOrNull(d.supply_amount),
    vat_amount: toIntOrNull(d.vat_amount),
    total_amount: toIntOrNull(d.total_amount),
    payment_method: pay,
    approval_no: toStr(d.approval_no).slice(0, 50),
    items: sanitizeItems(d.items),
    budget_item: toStr(d.budget_item).slice(0, 100),
    purpose: toStr(d.purpose),
    memo: toStr(d.memo),
    ...sanitizeFx(d),
    payroll_month: /^\d{4}-(0[1-9]|1[0-2])$/.test(toStr(d.payroll_month).trim()) ? toStr(d.payroll_month).trim() : "",
  }
}

// 통화·환율 칸 정리. 원화면 환율 칸은 비운다.
function sanitizeFx(
  d: Partial<ReceiptFields>
): Pick<ReceiptFields, "currency" | "foreign_amount" | "exchange_rate" | "exchange_rate_date" | "exchange_rate_source"> {
  const currency = SUPPORTED_CURRENCIES.includes(d.currency as never) ? (d.currency as CurrencyCode) : "KRW"
  if (currency === "KRW") return { currency, foreign_amount: null, exchange_rate: null, exchange_rate_date: "", exchange_rate_source: "" }
  const rate = toDecimalOrNull(d.exchange_rate, 6)
  const rateDate = toStr(d.exchange_rate_date).trim()
  const source = FX_SOURCES.includes(d.exchange_rate_source as never) ? (d.exchange_rate_source as ExchangeRateSource) : ""
  return {
    currency,
    foreign_amount: toDecimalOrNull(d.foreign_amount, 2),
    exchange_rate: rate !== null && rate > 0 ? rate : null,
    exchange_rate_date: rate !== null && isValidDate(rateDate) ? rateDate : "",
    exchange_rate_source: rate !== null ? source : "",
  }
}

// ── 외화(결제일 환율) ─────────────────────────────────────────────────────────
// 외화 행: 원화 합계(total_amount) = 외화 금액 × 결제일(issue_date) 환율.
// 환율은 /api/admin/expenses/fx로 받는다. 사용자가 환율이나 원화 합계를 직접 고치면 source 'manual' — 이후 날짜를 바꿔도 환율을 유지한다.

export function isForeign(f: Pick<ReceiptFields, "currency">): boolean {
  return f.currency !== "KRW"
}

// 표·검토 창·편집 시트가 공통으로 쓰는 수정 규칙. patch를 적용한 새 필드를 돌려준다.
// - 통화를 원화로: 환율 칸을 비우고 원화 합계는 그대로
// - 통화를 외화로 바꾸거나 거래일자가 바뀜(직접 입력 환율이 아닐 때): 환율을 비워 다시 받게 한다(needsFxFetch)
// - 외화 금액·환율이 바뀜: 원화 합계 재계산
// - 환율 직접 입력: source 'manual'
// - 외화 행의 원화 합계 직접 입력: source 'manual', 환율 = 합계 ÷ 외화 금액(소수 4자리)
export function applyFieldPatch(prev: ReceiptFields, patch: Partial<ReceiptFields>): ReceiptFields {
  const next: ReceiptFields = { ...prev, ...patch }
  if (next.currency === "KRW") {
    if (prev.currency !== "KRW") {
      next.foreign_amount = null
      next.exchange_rate = null
      next.exchange_rate_date = ""
      next.exchange_rate_source = ""
    }
    return next
  }
  const currencyChanged = "currency" in patch && patch.currency !== prev.currency
  const dateChanged = "issue_date" in patch && patch.issue_date !== prev.issue_date
  const rateTyped = "exchange_rate" in patch && patch.exchange_rate !== prev.exchange_rate
  const totalTyped = "total_amount" in patch && patch.total_amount !== prev.total_amount

  if (rateTyped) {
    // 지우는 중(null)에도 manual로 둔다 — 비었다고 곧바로 조회 환율이 채워지면 입력이 끊긴다.
    next.exchange_rate_source = "manual"
    next.exchange_rate_date = next.exchange_rate !== null && isValidDate(next.issue_date) ? next.issue_date : ""
  } else if (totalTyped) {
    if (typeof next.total_amount === "number" && typeof next.foreign_amount === "number" && next.foreign_amount > 0) {
      next.exchange_rate = Math.round((next.total_amount / next.foreign_amount) * 10000) / 10000
      next.exchange_rate_source = "manual"
      next.exchange_rate_date = isValidDate(next.issue_date) ? next.issue_date : ""
    }
    return next
  } else if (currencyChanged || (dateChanged && next.exchange_rate_source !== "manual")) {
    // 통화가 바뀌면 직접 입력한 환율도 의미가 없다.
    next.exchange_rate = null
    next.exchange_rate_date = ""
    next.exchange_rate_source = ""
  } else if (dateChanged && next.exchange_rate_source === "manual") {
    next.exchange_rate_date = isValidDate(next.issue_date) ? next.issue_date : ""
  }
  if (currencyChanged && prev.currency === "KRW") {
    // 원화 → 외화: 외화 증빙에는 한국 부가세가 없다. 기존 원화 합계는 환산될 때까지 그대로 둔다.
    next.supply_amount = null
    next.vat_amount = null
  }
  if (typeof next.foreign_amount === "number" && typeof next.exchange_rate === "number") {
    next.total_amount = convertToKrw(next.foreign_amount, next.exchange_rate)
  } else if (next.exchange_rate === null && typeof next.foreign_amount === "number" && (currencyChanged || dateChanged)) {
    next.total_amount = null // 새 환율로 다시 계산될 때까지 비운다(예전 환율의 원화가 남지 않게)
  }
  return next
}

// 서버가 판독 시 붙이는 환산 안내("USD 20.00 × 1,388.10원(… 기준, …) = 27,762원")는 표의 금액 칸이 같은 내용을
// 실시간으로 보여 주므로 뺀다(환율·금액을 고치면 옛 값이 남아 헷갈린다). 환율 조회 실패 경고는 그대로 둔다.
export function isFxFormulaWarning(w: string): boolean {
  return /^[A-Z]{3} [\d,.]+ × [\d,.]+원?\s*\(.*\)\s*= [\d,]+원$/.test(w.trim())
}

// 서버가 판독 때 환율을 못 붙였다는 경고(거래일자 없음·조회 실패). 화면이 결제일 환율을 받아 오면 더는 맞지 않으므로 뺀다.
export function isFxFailureWarning(w: string): boolean {
  return /환율을 가져오지 못했습니다|거래일자가 없어 환율을 적용하지 못했습니다/.test(w)
}

// 결제일 환율을 받아야 하는 행이면 요청 키('USD|2026-09-18'), 아니면 null
export function fxRequestKey(f: ReceiptFields): string | null {
  if (f.currency === "KRW" || f.exchange_rate_source === "manual" || f.exchange_rate !== null) return null
  if (!isValidDate(f.issue_date)) return null
  return `${f.currency}|${f.issue_date}`
}

// 조회한 환율을 적용한다(요청 뒤 통화·날짜가 바뀌었거나 직접 입력으로 바뀌었으면 그대로 둔다).
export function applyFxRate(f: ReceiptFields, res: Extract<FxRateResponse, { success: true }>, requestedDate: string): ReceiptFields {
  if (f.currency !== res.currency || f.issue_date !== requestedDate || f.exchange_rate_source === "manual") return f
  return {
    ...f,
    exchange_rate: res.rate,
    exchange_rate_date: res.rate_date,
    exchange_rate_source: res.source,
    total_amount: typeof f.foreign_amount === "number" ? convertToKrw(f.foreign_amount, res.rate) : f.total_amount,
  }
}

// 직접 입력한 환율을 버리고 결제일 환율을 다시 받게 한다.
export function resetFxRate(f: ReceiptFields): ReceiptFields {
  return { ...f, exchange_rate: null, exchange_rate_date: "", exchange_rate_source: "" }
}

export function formatForeign(n: number | null, currency: CurrencyCode): string {
  if (n === null || !Number.isFinite(n)) return ""
  const min = currency === "JPY" ? 0 : 2
  return n.toLocaleString("ko-KR", { minimumFractionDigits: min, maximumFractionDigits: 2 })
}

export function formatRate(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return ""
  return n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

// "USD 20.00 × 1,388.10 = 27,762원"
export function fxFormula(f: ReceiptFields): string {
  if (f.currency === "KRW") return ""
  const head = `${f.currency} ${formatForeign(f.foreign_amount, f.currency) || "—"}`
  if (f.exchange_rate === null) return head
  return `${head} × ${formatRate(f.exchange_rate)} = ${f.total_amount !== null ? formatWon(f.total_amount) : "—"}`
}

// 환율 근거 한 줄: "2026-09-18 기준 · 유럽중앙은행" / "… · 매매기준율" / "직접 입력"
export function fxSourceText(f: Pick<ReceiptFields, "exchange_rate_date" | "exchange_rate_source">): string {
  if (f.exchange_rate_source === "manual") return f.exchange_rate_date ? `${f.exchange_rate_date} · 직접 입력` : "직접 입력"
  const src = f.exchange_rate_source === "ecb" ? "유럽중앙은행" : f.exchange_rate_source === "koreaexim" ? "매매기준율" : ""
  if (!src) return ""
  return f.exchange_rate_date ? `${f.exchange_rate_date} 기준 · ${src}` : src
}

// 결제일 고시가 없어 직전 영업일 환율을 쓴 경우 안내
export function fxDateNote(f: Pick<ReceiptFields, "issue_date" | "exchange_rate_date" | "exchange_rate_source">): string {
  if (f.exchange_rate_source !== "ecb" && f.exchange_rate_source !== "koreaexim") return ""
  if (!f.exchange_rate_date || !isValidDate(f.issue_date) || f.exchange_rate_date === f.issue_date) return ""
  return f.exchange_rate_date < f.issue_date
    ? `결제일(${f.issue_date}) 고시가 없어 직전 영업일 환율 적용`
    : `결제일(${f.issue_date})이 아직 고시 전이라 최근 고시 환율 적용`
}

// /fx 응답 해석
export function parseFxResponse(data: unknown): FxRateResponse {
  if (!data || typeof data !== "object") return { success: false, error: "환율 응답을 읽지 못했어요" }
  const o = data as Record<string, unknown>
  if (o.success === true && typeof o.rate === "number" && o.rate > 0 && typeof o.rate_date === "string") {
    const source = o.source === "koreaexim" ? "koreaexim" : "ecb"
    return {
      success: true,
      currency: SUPPORTED_CURRENCIES.includes(o.currency as never) ? (o.currency as CurrencyCode) : "USD",
      requested_date: toStr(o.requested_date),
      rate_date: o.rate_date,
      rate: o.rate,
      source,
    }
  }
  return { success: false, error: typeof o.error === "string" && o.error ? o.error : "환율을 받지 못했어요" }
}

// ── 프로젝트 초기 선택 ─────────────────────────────────────────────────────────
export function pickInitialProject(
  suggested: number | null | undefined,
  projects: UploaderProject[],
  defaultProjectId: number | null
): { project_id: number | null; source: ProjectSource } {
  if (suggested && projects.some((p) => p.id === suggested)) return { project_id: suggested, source: "ai" }
  if (defaultProjectId && projects.some((p) => p.id === defaultProjectId)) {
    return { project_id: defaultProjectId, source: "default" }
  }
  if (projects.length === 1) return { project_id: projects[0].id, source: "single" }
  return { project_id: null, source: null }
}

function baseRow(fileKey: string | null, file: UploadedFileMeta): Omit<DraftRow, "fields" | "project_id" | "projectSource"> {
  return {
    key: newKey(),
    fileKey,
    file,
    projectReason: "",
    selected: true,
    confidence: null,
    lowFields: [],
    checkedFields: [],
    warnings: [],
    duplicates: [],
    similar: [],
    aiRaw: null,
    manual: false,
    showErrors: false,
    serverErrors: [],
  }
}

// 직접 입력용 빈 행(AI 미설정·AI가 아무것도 못 찾음·"이 파일로 한 건 더")
export function blankRow(
  fileKey: string | null,
  file: UploadedFileMeta,
  projects: UploaderProject[],
  defaultProjectId: number | null,
  opts: { warning?: string; duplicates?: DuplicateReceipt[]; project_id?: number | null } = {}
): DraftRow {
  const pick =
    opts.project_id !== undefined && opts.project_id !== null
      ? { project_id: opts.project_id, source: "user" as ProjectSource }
      : pickInitialProject(null, projects, defaultProjectId)
  const duplicates = opts.duplicates ?? []
  return {
    ...baseRow(fileKey, file),
    fields: emptyReceiptFields(),
    project_id: pick.project_id,
    projectSource: pick.source,
    manual: true,
    warnings: opts.warning ? [opts.warning] : [],
    duplicates,
    selected: duplicates.length === 0,
  }
}

export function rowsFromScan(
  fileKey: string,
  file: UploadedFileMeta,
  drafts: ReceiptDraft[],
  duplicates: DuplicateReceipt[],
  projects: UploaderProject[],
  defaultProjectId: number | null,
  similar: SimilarReceipt[][] = []
): DraftRow[] {
  if (drafts.length === 0) {
    return [
      blankRow(fileKey, file, projects, defaultProjectId, {
        warning: "인식한 내용이 없어요 · 직접 입력하거나 행을 지워 주세요",
        duplicates,
      }),
    ]
  }
  return drafts.map((d, i) => {
    const pick = pickInitialProject(d.suggested_project_id, projects, defaultProjectId)
    const sim = toSimilarList(similar[i])
    const low = Array.isArray(d.low_confidence_fields)
      ? d.low_confidence_fields.filter((f): f is keyof ReceiptFields => FIELD_KEYS.includes(f))
      : []
    return {
      ...baseRow(fileKey, file),
      fields: sanitizeFields(d),
      project_id: pick.project_id,
      projectSource: pick.source,
      projectReason: toStr(d.project_reason),
      confidence: d.confidence === "high" || d.confidence === "medium" || d.confidence === "low" ? d.confidence : null,
      lowFields: low,
      warnings: Array.isArray(d.warnings) ? d.warnings.map(toStr).filter((w) => w && !isFxFormulaWarning(w)) : [],
      duplicates,
      similar: sim,
      aiRaw: d,
      // 이미 저장된 파일과 같거나 같은 거래로 보이는 증빙이 있으면 실수로 두 번 계상하지 않도록 기본 선택을 해제한다.
      selected: duplicates.length === 0 && sim.length === 0,
    }
  })
}

// ── 확인 대기함(데스크톱 앱) 항목 → 파일 카드 + 표 행 ─────────────────────────────
// 인식 성공: /scan 응답과 같은 변환(rowsFromScan). 앱에서 고른 기본 프로젝트가 진행 중이면 그 프로젝트로 미리 선택.
// 인식 미설정: 빈 행 1개(직접 입력). 인식 실패: 행 없이 실패 카드('직접 입력' 가능).
export function inboxPreferredProject(item: Pick<InboxItem, "preferred_project_id">, projects: UploaderProject[]): number | null {
  const id = item.preferred_project_id
  return id !== null && projects.some((p) => p.id === id) ? id : null
}

export function rowsFromInbox(
  fileKey: string,
  item: InboxItem,
  projects: UploaderProject[],
  defaultProjectId: number | null
): DraftRow[] {
  if (item.scan_status === "failed") return []
  const file = normalizeFileMeta(item.file)
  const preferred = inboxPreferredProject(item, projects)
  const duplicates = Array.isArray(item.duplicates) ? item.duplicates : []
  if (item.scan_status === "not_configured") {
    return [blankRow(fileKey, file, projects, preferred ?? defaultProjectId, { duplicates })]
  }
  const similar = Array.isArray(item.possible_duplicates) ? item.possible_duplicates.map(toSimilarList) : []
  const rows = rowsFromScan(fileKey, file, Array.isArray(item.drafts) ? item.drafts : [], duplicates, projects, defaultProjectId, similar)
  if (preferred === null) return rows
  return rows.map((r) => ({ ...r, project_id: preferred, projectSource: "default" as ProjectSource }))
}

// 파일 카드. 원본은 서버에 있으므로 file·prepared는 빈 자리표시(다시 인식하지 않는다).
export function uploadItemFromInbox(key: string, item: InboxItem): UploadItem {
  const file = normalizeFileMeta(item.file)
  const image = isImageMeta(file)
  const recognized = (Array.isArray(item.drafts) ? item.drafts : []).filter(
    (d) => !!d && (!!d.vendor_name || !!d.issue_date || (d.total_amount !== null && d.total_amount !== undefined))
  ).length
  const failed = item.scan_status === "failed"
  const duplicates = Array.isArray(item.duplicates) ? item.duplicates : []
  return {
    key,
    file: new File([], file.name, { type: file.type }),
    prepared: null,
    originalHash: file.hash || null,
    name: file.name || "이름 없는 파일",
    size: file.size,
    kind: image ? "image" : file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? "pdf" : "other",
    localUrl: image ? fileUrl(file.pathname) : null,
    status: failed ? "error" : "done",
    error: failed ? item.error || "인식 실패 · 직접 입력 가능" : "",
    retryable: false,
    startedAt: null,
    uploaded: failed ? null : file,
    draftCount: item.scan_status === "ok" ? recognized : 0,
    duplicateCount: duplicates.length,
    aiSkipped: item.scan_status === "not_configured",
    fallback: failed ? { file, duplicates } : null,
    inboxId: item.id,
  }
}

// 서버 응답의 possible_duplicates 한 칸을 방어적으로 정리한다.
export function toSimilarList(v: unknown): SimilarReceipt[] {
  if (!Array.isArray(v)) return []
  const out: SimilarReceipt[] = []
  for (const x of v) {
    if (!x || typeof x !== "object") continue
    const o = x as Record<string, unknown>
    if (typeof o.id !== "number") continue
    out.push({
      id: o.id,
      project_name: toStr(o.project_name),
      issue_date: toStr(o.issue_date),
      vendor_name: toStr(o.vendor_name),
      total_amount: typeof o.total_amount === "number" ? o.total_amount : Number(o.total_amount) || 0,
      doc_type: EXPENSE_DOC_TYPES.includes(o.doc_type as never) ? (o.doc_type as SimilarReceipt["doc_type"]) : "other",
      reason: o.reason === "approval" ? "approval" : "amount_party_date",
    })
  }
  return out
}

// 표 안내 줄에 붙는 짧은 근거(SAME_TX_REASON_LABELS의 문장형 대신 명사형)
const SIMILAR_REASON_SHORT: Record<SameTxReason, string> = {
  approval: "승인번호 일치",
  amount_party_date: "거래처·합계 일치, 날짜 근접",
}

export function similarReasonLabel(reason: SameTxReason): string {
  return SIMILAR_REASON_SHORT[reason] ?? SAME_TX_REASON_LABELS[reason]
}

// ── 표 안의 행끼리 같은 증빙·같은 거래 찾기(이중 계상 방지) ─────────────────────
// same_file: 같은 파일(내용 해시 동일)을 표에 두 번 올림 — 나중에 올린 쪽 행에만 표시한다.
// approval / amount_party_date: 파일은 다르지만 같은 거래로 보임(세금계산서 + 이체확인증 등) — 양쪽 행에 표시한다.
// 같은 파일에서 나온 행끼리(AI가 한 파일 속 여러 증빙을 나눈 것)는 비교하지 않는다.
export type TableMatchKind = "same_file" | SameTxReason

export interface TableMatch {
  kind: TableMatchKind
  otherKey: string
  otherNumber: number // 표 기준 번호(1부터)
  otherLabel: string // "세금계산서 · 2026-09-10 · (주)에이비씨 · 99,000원"
  otherSelected: boolean
}

// "{N}번 행과 ___" 뒤에 붙는 설명
export const TABLE_MATCH_TEXT: Record<TableMatchKind, string> = {
  same_file: "같은 파일",
  approval: "같은 거래로 보임(승인번호 일치)",
  amount_party_date: "같은 거래로 보임(거래처·합계 일치, 날짜 근접)",
}

function rowLabel(r: DraftRow): string {
  const f = r.fields
  return [DOC_TYPE_LABEL_SHORT[f.doc_type], f.issue_date, f.vendor_name.trim(), f.total_amount !== null ? formatWon(f.total_amount) : ""]
    .filter(Boolean)
    .join(" · ")
}

const DOC_TYPE_LABEL_SHORT: Record<ReceiptFields["doc_type"], string> = {
  receipt: "영수증",
  card_slip: "카드전표",
  tax_invoice: "세금계산서",
  invoice: "거래명세서",
  transfer: "이체확인증",
  payroll: "인건비",
  other: "기타",
}

export function findTableMatches(rows: DraftRow[]): Map<string, TableMatch[]> {
  const out = new Map<string, TableMatch[]>()
  const push = (row: DraftRow, other: DraftRow, otherIndex: number, kind: TableMatchKind) => {
    const list = out.get(row.key) ?? []
    if (list.some((m) => m.otherKey === other.key)) return
    list.push({ kind, otherKey: other.key, otherNumber: otherIndex + 1, otherLabel: rowLabel(other), otherSelected: other.selected })
    out.set(row.key, list)
  }

  // 1) 같은 파일: 해시별로 처음 나온 경로를 원본으로 보고, 다른 경로의 행에 원본 첫 행을 가리키는 표시를 단다.
  const firstByHash = new Map<string, number>()
  rows.forEach((r, i) => {
    const h = r.file.hash
    if (!h) return
    const first = firstByHash.get(h)
    if (first === undefined) firstByHash.set(h, i)
    else if (rows[first].file.pathname !== r.file.pathname) push(r, rows[first], first, "same_file")
  })

  // 2) 같은 거래: 합계·승인번호가 같은 행끼리만 견준다(행이 많아도 빠르게).
  const buckets = new Map<string, number[]>()
  rows.forEach((r, i) => {
    const keys: string[] = []
    if (typeof r.fields.total_amount === "number" && r.fields.total_amount !== 0) keys.push(`t:${r.fields.total_amount}`)
    const ap = normalizeApproval(r.fields.approval_no)
    if (ap.length >= 6) keys.push(`a:${ap}`)
    for (const k of keys) {
      const list = buckets.get(k)
      if (list) list.push(i)
      else buckets.set(k, [i])
    }
  })
  const seen = new Set<string>()
  for (const list of buckets.values()) {
    if (list.length < 2) continue
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const i = list[x]
        const j = list[y]
        const pair = `${i}|${j}`
        if (seen.has(pair)) continue
        seen.add(pair)
        const a = rows[i]
        const b = rows[j]
        if (a.file.pathname === b.file.pathname) continue
        if (a.file.hash && a.file.hash === b.file.hash) continue // 같은 파일은 위에서 표시
        const reason = sameTransactionReason(normalizeFields(a.fields), normalizeFields(b.fields))
        if (!reason) continue
        push(a, b, j, reason)
        push(b, a, i, reason)
      }
    }
  }
  return out
}

// 둘 다 선택되어 있어 그대로 저장하면 두 번 계상되는 표시가 있는지
export function hasTableConflict(row: DraftRow, matches: TableMatch[] | undefined): boolean {
  return !!row.selected && !!matches && matches.some((m) => m.otherSelected)
}

// 새 행을 표에 넣기 전에(파일 분석 완료·임시 보관 불러오기) 같은 파일·같은 거래로 보이는 행의 선택을 정리한다.
// - 같은 파일을 다시 올린 행: 새 행의 선택을 해제
// - 같은 거래의 다른 서류: 증빙으로서 약한 쪽(세금계산서 > 카드전표 > 영수증 > 이체확인증 > 거래명세서) 선택을 해제,
//   같으면 새 행을 해제
// 반환: 정리된 기존 행·새 행과 선택을 해제한 건수
export function resolveInsertConflicts(prev: DraftRow[], added: DraftRow[]): { prev: DraftRow[]; added: DraftRow[]; deselected: number } {
  const before = new Map(prev.map((r) => [r.key, r]))
  const next = prev.slice()
  const indexOf = new Map(prev.map((r, i) => [r.key, i]))
  const incoming = added.map((r) => ({ ...r }))
  let deselected = 0
  const pool = () => [...next, ...incoming]

  for (const a of incoming) {
    if (!a.selected) continue
    const others = pool().filter((o) => o.key !== a.key && o.selected && o.file.pathname !== a.file.pathname)
    if (a.file.hash && others.some((o) => o.file.hash === a.file.hash)) {
      a.selected = false
      deselected++
      continue
    }
    const af = normalizeFields(a.fields)
    for (const o of others) {
      if (o.file.hash && o.file.hash === a.file.hash) continue
      if (!sameTransactionReason(af, normalizeFields(o.fields))) continue
      if (DOC_TYPE_PRIORITY[a.fields.doc_type] <= DOC_TYPE_PRIORITY[o.fields.doc_type]) {
        a.selected = false
        deselected++
        break
      }
      const idx = indexOf.get(o.key)
      if (idx !== undefined) next[idx] = { ...next[idx], selected: false }
      else o.selected = false
      deselected++
    }
  }
  const changed = next.some((r) => r !== before.get(r.key))
  return { prev: changed ? next : prev, added: incoming, deselected }
}

// ── 검증 ──────────────────────────────────────────────────────────────────────
export function normalizeFields(f: ReceiptFields): ReceiptFields {
  const krw = f.currency === "KRW"
  return {
    ...f,
    foreign_amount: krw ? null : f.foreign_amount,
    exchange_rate: krw ? null : f.exchange_rate,
    exchange_rate_date: krw || f.exchange_rate === null ? "" : f.exchange_rate_date,
    exchange_rate_source: krw || f.exchange_rate === null ? "" : f.exchange_rate_source,
    payroll_month: f.payroll_month.trim(),
    issue_date: f.issue_date.trim(),
    vendor_name: f.vendor_name.trim(),
    vendor_biz_no: formatBizNo(f.vendor_biz_no.trim()),
    approval_no: f.approval_no.trim(),
    budget_item: f.budget_item.trim(),
    purpose: f.purpose.trim(),
    memo: f.memo.trim(),
    items: f.items.filter((it) => it.name.trim() || it.amount !== null),
  }
}

export const PROJECT_REQUIRED = "프로젝트를 골라 주세요"

export function rowErrors(row: DraftRow): string[] {
  const errors = validateReceiptFields(normalizeFields(row.fields))
  if (!row.project_id) errors.push(PROJECT_REQUIRED)
  return errors
}

// lib/expenses의 검증 문구(개발 형식 "YYYY-MM-DD" 등)를 화면 문구(해요체)로 바꾼다. 모르는 문구는 그대로.
const FRIENDLY_ERRORS: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/^거래일자를 YYYY-MM-DD 형식으로 입력하세요$/, "거래일자를 골라 주세요"],
  [/^거래처명을 입력하세요$/, "거래처를 입력해 주세요"],
  [/^거래처명이 너무 깁니다$/, "거래처 이름이 너무 길어요(200자까지)"],
  [/^합계 금액을 원 단위 정수로 입력하세요$/, "합계를 원 단위로 입력해 주세요"],
  [/^공급가액은 원 단위 정수여야 합니다$/, "공급가액을 원 단위로 입력해 주세요"],
  [/^부가세는 원 단위 정수여야 합니다$/, "부가세를 원 단위로 입력해 주세요"],
  [/^사업자등록번호 형식이 올바르지 않습니다$/, "사업자번호를 000-00-00000 모양으로 입력해 주세요"],
  [/^비목이 너무 깁니다$/, "비목 이름이 너무 길어요(100자까지)"],
  [/^([A-Z]{3}) 금액을 입력하세요$/, (m) => `${m[1]} 금액을 입력해 주세요`],
  [/^적용 환율을 입력하세요$/, "적용 환율을 입력해 주세요"],
  [/^귀속월은 YYYY-MM 형식이어야 합니다$/, "귀속월을 골라 주세요"],
]

export function friendlyFieldError(e: string): string {
  for (const [re, to] of FRIENDLY_ERRORS) {
    const m = e.match(re)
    if (m) return typeof to === "string" ? to : to(m)
  }
  return e
}

export type InvalidMap = Partial<Record<keyof ReceiptFields | "project_id", boolean>>

// 어느 칸을 빨갛게 칠할지(validateReceiptFields와 같은 기준)
export function invalidFields(row: DraftRow): InvalidMap {
  const f = normalizeFields(row.fields)
  return {
    issue_date: !isValidDate(f.issue_date),
    vendor_name: !f.vendor_name || f.vendor_name.length > 200,
    total_amount: !isWholeWon(f.total_amount),
    supply_amount: f.supply_amount !== null && !isWholeWon(f.supply_amount),
    vat_amount: f.vat_amount !== null && !isWholeWon(f.vat_amount),
    vendor_biz_no: !!f.vendor_biz_no && !/^\d{3}-?\d{2}-?\d{5}$/.test(f.vendor_biz_no),
    budget_item: f.budget_item.length > 100,
    project_id: !row.project_id,
    foreign_amount: f.currency !== "KRW" && !(typeof f.foreign_amount === "number" && f.foreign_amount > 0),
    exchange_rate: f.currency !== "KRW" && !(typeof f.exchange_rate === "number" && f.exchange_rate > 0),
  }
}

// 저장은 막지 않지만 눈여겨볼 점(노란 안내)
export function rowNotices(row: DraftRow, project: UploaderProject | undefined): string[] {
  const notes: string[] = []
  const f = row.fields
  if (amountMismatch(f)) {
    const sum = (f.supply_amount ?? 0) + (f.vat_amount ?? 0)
    notes.push(`금액 불일치: 공급가액+부가세 ${formatWon(sum)} ≠ 합계 ${formatWon(f.total_amount)}`)
  }
  if (project && isValidDate(f.issue_date)) {
    if (project.start_date && f.issue_date < project.start_date) {
      notes.push(`사업 기간 전 거래(시작일 ${project.start_date})`)
    } else if (project.end_date && f.issue_date > project.end_date) {
      notes.push(`사업 기간 후 거래(종료일 ${project.end_date})`)
    }
  }
  if (project && f.budget_item.trim() && project.budget_items.length > 0) {
    const names = project.budget_items.map((b) => b.name.trim())
    if (!names.includes(f.budget_item.trim())) {
      notes.push(`예산 외 비목: ${f.budget_item.trim()}`)
    }
  }
  return notes
}

export function toCreateInput(row: DraftRow): ReceiptCreateInput {
  return {
    ...normalizeFields(row.fields),
    project_id: row.project_id as number,
    file: row.file,
    ai_confidence: row.confidence,
    ai_raw: row.aiRaw,
  }
}

// ── 금액 입력 ─────────────────────────────────────────────────────────────────
export function formatNumberText(n: number | null): string {
  return n === null || !Number.isFinite(n) ? "" : n.toLocaleString("ko-KR")
}

// "1,234,000원" → 1234000, "" → null. 음수(환불)는 앞의 '-'만 인정한다.
// 소수점 아래는 버린다("12,000.00" → 12000) — 원 단위 정수이고, 프로젝트 폼의 WonInput과 같은 규칙이다.
export function parseWonText(text: string): number | null {
  const intPart = text.split(".")[0] ?? ""
  const neg = intPart.trim().startsWith("-")
  const digits = intPart.replace(/\D/g, "").replace(/^0+(?=\d)/, "")
  if (!digits) return null
  const n = Number(digits.slice(0, 13))
  return neg ? -n : n
}

// 품목 수량: 소수 허용("1.5", "35.12"). ""이면 null, 아직 입력 중("1.", "-")이거나 숫자가 아니면 undefined(값을 바꾸지 않음).
export function parseQuantityText(text: string): number | null | undefined {
  const s = text.replace(/[,\s]/g, "")
  if (s === "") return null
  if (!/^-?\d*\.?\d*$/.test(s) || !/\d/.test(s)) return undefined
  const n = Number(s.endsWith(".") ? s.slice(0, -1) : s)
  return Number.isFinite(n) && Math.abs(n) < 1e9 ? n : undefined
}

export const DEFAULT_BUDGET_ITEM_SUGGESTIONS = [
  "재료비",
  "인건비",
  "외주용역비",
  "여비",
  "회의비",
  "장비·시설비",
  "활동비",
  "홍보비",
  "교육훈련비",
  "지식재산권 출원·등록비",
  "수수료",
]

// ── 응답 해석 ─────────────────────────────────────────────────────────────────
export function isUploadedFileMeta(v: unknown): v is UploadedFileMeta {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return typeof o.pathname === "string" && o.pathname.length > 0 && typeof o.name === "string"
}

export function normalizeFileMeta(v: UploadedFileMeta): UploadedFileMeta {
  return {
    pathname: v.pathname,
    name: v.name,
    type: typeof v.type === "string" ? v.type : "",
    size: typeof v.size === "number" ? v.size : 0,
    hash: typeof v.hash === "string" ? v.hash : "",
  }
}

export function httpErrorMessage(status: number, fallback?: string): string {
  if (status === 401) return "로그인이 끝났어요. 새 탭에서 관리자 로그인을 다시 한 뒤 이 화면에서 다시 눌러 주세요(입력한 내용은 그대로 있어요)."
  if (status === 413) return "파일이 너무 커서 받지 못했어요. 4MB 이하로 줄여 다시 올려 주세요."
  if (status === 504 || status === 524) return "인식 시간이 너무 길어 멈췄어요. 다시 시도해 주세요."
  if (status === 429) return "요청이 많아 잠시 막혔어요. 1분 뒤 다시 시도해 주세요."
  const safe = fallback && isScreenSafeText(fallback) ? fallback : undefined
  if (status >= 500) return safe || "처리하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."
  return safe || `요청을 처리하지 못했어요(오류 ${status}). 다시 시도해 주세요.`
}

// 서버·자동 인식 오류 문구를 화면에 그대로 보여도 되는지(환경변수 이름·"시스템 관리자" 같은 개발 안내가 없을 때만).
// 자동 인식 키 문제 등은 lib/expense-ai.ts가 개발 안내를 섞어 보내므로, 그런 문구는 화면 문구로 바꾼다(계획서 2.5).
export function isScreenSafeText(text: string): boolean {
  return !/[A-Z][A-Z0-9]*_[A-Z0-9_]+|시스템 (관리자|담당자)|OpenAI|API 키|\(설정:/.test(text)
}

// 자동 인식이 꺼져 있거나(키 없음·만료) 쓸 수 없을 때 화면에 보이는 문구
export const AI_OFF_TEXT = "자동 인식을 쓸 수 없어요. 파일은 보관됐으니 표에 직접 입력해 주세요."

export function screenSafeError(text: string | null | undefined, fallback = AI_OFF_TEXT): string {
  const t = (text ?? "").trim()
  return t && isScreenSafeText(t) ? t : fallback
}

// ── 임시 보관(새로고침·실수로 닫았을 때 복구) ──────────────────────────────────
export const BACKUP_KEY = "puh:expenses:upload-draft:v1"
const BACKUP_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 2주 지난 임시 보관은 버린다

export interface UploadBackup {
  savedAt: number
  rows: DraftRow[]
}

export function serializeBackup(rows: DraftRow[]): string {
  const slim = rows.map((r) => ({ ...r, fileKey: null, showErrors: false, serverErrors: [], fx: null }))
  return JSON.stringify({ savedAt: Date.now(), rows: slim } satisfies UploadBackup)
}

export function parseBackup(raw: string | null, projects: UploaderProject[]): UploadBackup | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as Partial<UploadBackup>
    if (!data || typeof data.savedAt !== "number" || !Array.isArray(data.rows)) return null
    if (Date.now() - data.savedAt > BACKUP_TTL_MS) return null
    const ids = new Set(projects.map((p) => p.id))
    const rows: DraftRow[] = []
    for (const r of data.rows as Partial<DraftRow>[]) {
      if (!r || !isUploadedFileMeta(r.file)) continue
      const projectOk = typeof r.project_id === "number" && ids.has(r.project_id)
      rows.push({
        key: newKey(),
        fileKey: null,
        file: normalizeFileMeta(r.file),
        fields: sanitizeFields(r.fields),
        project_id: projectOk ? (r.project_id as number) : null,
        projectSource: projectOk ? (r.projectSource ?? "user") : null,
        projectReason: toStr(r.projectReason),
        selected: r.selected !== false,
        confidence: r.confidence ?? null,
        lowFields: Array.isArray(r.lowFields) ? r.lowFields : [],
        checkedFields: Array.isArray(r.checkedFields) ? r.checkedFields : [],
        warnings: Array.isArray(r.warnings) ? r.warnings.map(toStr) : [],
        duplicates: Array.isArray(r.duplicates) ? r.duplicates : [],
        similar: toSimilarList(r.similar),
        aiRaw: (r.aiRaw as ReceiptDraft | null) ?? null,
        manual: !!r.manual,
        showErrors: false,
        serverErrors: [],
        ackReasons: Array.isArray(r.ackReasons) ? r.ackReasons.map(toStr).filter(Boolean) : [],
      })
    }
    return rows.length > 0 ? { savedAt: data.savedAt, rows } : null
  } catch {
    return null
  }
}

// ── 행 상태 4개 + 사유(계획서 4.2.1) ──────────────────────────────────────────
// 상태는 넷뿐이다: 입력 필요(저장 불가) · 확인 필요(저장은 되지만 사람이 한 번 봐야 함) · 준비 완료 · 제외(저장 안 함).
// - "확인 필요"의 사유: 인식 신뢰도 낮음(노란 칸), 금액 불일치, 사업 기간 밖, 예산 외 비목, 비목 빈칸, 그 밖의 자동 인식 경고.
//   같은 주제(금액·날짜·사업자번호·환율)의 화면 검사 문장과 자동 인식 문장은 한 사유로 합친다.
// - 사유마다 [확인했어요]가 있고, 누르면 그 사유는 회색으로 접힌다(ackReasons). 확인 처리는 selected를 바꾸지 않는다.
// - 중복 의심(이미 저장된 증빙·표 안의 다른 행과 같은 파일·같은 거래)은 "확인 필요"가 아니다. 저장 대상에서 자동으로
//   빠지므로(selected=false) "제외 · 중복 의심"이고, 다시 넣는 길은 검토 창의 "저장 대상 포함" 스위치(setIncluded)뿐이다.
// - 안내(회색, 상태와 무관): "이 파일 속 증빙 1/2", 주말·휴일 직전 영업일 환율.

export type RowStatusKey = "needs_input" | "needs_review" | "ready" | "excluded"
export type ReasonField = keyof ReceiptFields | "project_id"

export interface RowReason {
  /** 확인 처리를 기억하는 고정 키(low · amount · period · budget:<이름> · budget_empty · ai:<문장>) */
  id: string
  kind: "low" | "amount" | "period" | "budget_outside" | "budget_empty" | "ai"
  /** 사유 한 문장(해요체) */
  text: string
  /** 같은 주제로 합친 자동 인식 문장 */
  detail: string[]
  /** 누르면 포커스할 칸(앞이 먼저) */
  fields: ReasonField[]
  /** 원본을 봐야 판단할 수 있는 사유(인식 불확실) — 표에서는 [원본 보며 확인] */
  needsOriginal: boolean
}

export interface RowAssessment {
  status: RowStatusKey
  /** "입력 필요" · "확인 필요" · "준비 완료" · "제외" */
  label: string
  /** 제외 사유("중복 의심") — 배지 옆 보조 글자 */
  detail: string | null
  duplicateSuspect: boolean
  /** 입력 필요(저장 불가) 사유 */
  errors: string[]
  /** 남은 확인 사유 */
  reasons: RowReason[]
  /** [확인했어요]로 접은 사유 */
  acknowledged: RowReason[]
  /** 회색 안내(상태에 영향 없음) */
  infos: string[]
}

export const RECEIPT_FIELD_LABELS: Record<ReasonField, string> = {
  doc_type: "문서 종류",
  issue_date: "거래일자",
  vendor_name: "거래처",
  vendor_biz_no: "사업자번호",
  supply_amount: "공급가액",
  vat_amount: "부가세",
  total_amount: "합계",
  payment_method: "결제 수단",
  approval_no: "승인번호",
  items: "품목",
  budget_item: "비목",
  purpose: "적요",
  memo: "메모",
  currency: "통화",
  foreign_amount: "외화 금액",
  exchange_rate: "환율",
  exchange_rate_date: "환율 기준일",
  exchange_rate_source: "환율 출처",
  payroll_month: "귀속월",
  project_id: "프로젝트",
}

export function fieldLabels(fields: ReasonField[]): string[] {
  return fields.map((f) => RECEIPT_FIELD_LABELS[f]).filter(Boolean)
}

type WarningTopic = "info" | "amount" | "biz" | "date" | "fx" | "quality" | "other"

// 자동 인식 경고 문장을 주제로 나눈다(같은 주제는 화면 검사 사유 하나로 합치기 위해).
export function warningTopic(w: string): WarningTopic {
  const t = w.trim()
  if (/이 파일 속 증빙|건으로 나눴|인식한 내용이 없어요|인식된 내용 없음|직전 영업일|주말|공휴일|고시 전/.test(t)) return "info"
  if (isFxFailureWarning(t) || /환율|금액을 읽지 못했습니다/.test(t)) return "fx"
  if (/공급가액|부가세|합계|면세|봉사료/.test(t)) return "amount"
  if (/사업자/.test(t)) return "biz"
  if (/거래일자|날짜/.test(t)) return "date"
  if (/흐려|흐릿|해상도|기울|추정|잘려|잘린|읽지 못|불확실|번져|번짐|가려/.test(t)) return "quality"
  return "other"
}

// 결제일 고시가 없어 직전 영업일(또는 최근 고시) 환율을 쓴 경우의 회색 안내
export function fxInfoText(f: Pick<ReceiptFields, "issue_date" | "exchange_rate_date" | "exchange_rate_source">): string {
  if (!fxDateNote(f)) return ""
  return f.exchange_rate_date < f.issue_date
    ? `주말·휴일이라 직전 영업일인 ${dateShort(f.exchange_rate_date)} 환율을 썼어요`
    : `결제일 환율이 아직 고시 전이라 최근 고시일인 ${dateShort(f.exchange_rate_date)} 환율을 썼어요`
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs))
}

// 표 안의 다른 행과 같은 파일·같은 거래로 보여 이 행이 빠져 있는지(다른 쪽이 저장 대상)
function tableMatchExcluded(row: DraftRow, matches: TableMatch[] | undefined): boolean {
  return !row.selected && !!matches && matches.some((m) => m.otherSelected)
}

export function isDuplicateSuspect(row: DraftRow, matches?: TableMatch[]): boolean {
  if (row.duplicates.length > 0 || row.similar.length > 0) return true
  if (!matches || matches.length === 0) return false
  return row.selected ? matches.some((m) => m.otherSelected) : tableMatchExcluded(row, matches)
}

export function assessRow(row: DraftRow, project: UploaderProject | undefined, matches?: TableMatch[]): RowAssessment {
  const f = row.fields
  const ack = new Set(row.ackReasons ?? [])
  const errors = uniq([...rowErrors(row).map(friendlyFieldError), ...row.serverErrors])
  const infos: string[] = []
  const all: RowReason[] = []

  // 1) 인식 불확실(노란 칸) + 전체 신뢰도 낮음 → 한 사유
  const pendingLow = row.lowFields.filter((x) => !row.checkedFields.includes(x))
  const readSomething = !!row.aiRaw && !!(row.aiRaw.vendor_name || row.aiRaw.issue_date || row.aiRaw.total_amount !== null)
  const lowOverall = row.confidence === "low" && readSomething
  const lowAll = new Set<ReasonField>(row.lowFields)
  const hasLow = row.lowFields.length > 0 || lowOverall
  const lowReason: RowReason | null = hasLow
    ? {
        id: "low",
        kind: "low",
        text: "",
        detail: [],
        fields: pendingLow.length > 0 ? pendingLow : row.lowFields,
        needsOriginal: true,
      }
    : null
  if (lowReason) {
    const names = fieldLabels(lowReason.fields).join("·")
    lowReason.text = lowOverall ? `인식 신뢰도가 낮아요${names ? ` · ${names} 칸 확인` : " · 원본과 전체 대조"}` : `${names} 칸 확인`
  }

  // 2) 금액 불일치(화면 검사)
  const mismatch = amountMismatch(f)
  const amountReason: RowReason | null = mismatch
    ? {
        id: "amount",
        kind: "amount",
        text: `금액이 맞지 않아요: 공급가액+부가세 ${won((f.supply_amount ?? 0) + (f.vat_amount ?? 0))} ≠ 합계 ${won(f.total_amount)}`,
        detail: [],
        fields: ["total_amount", "supply_amount", "vat_amount"],
        needsOriginal: false,
      }
    : null

  // 3) 자동 인식 경고를 주제별로 합친다
  const extra: RowReason[] = []
  const fxNote = fxInfoText(f)
  if (fxNote) infos.push(fxNote)
  const fxError = errors.some((e) => /환율|금액을 입력/.test(e))
  for (const raw of row.warnings) {
    const w = raw.trim()
    if (!w) continue
    switch (warningTopic(w)) {
      case "info":
        // 환율 날짜 안내는 위에서 화면 계산으로 한 번만 쓴다
        if (/직전 영업일|주말|공휴일|고시 전/.test(w)) {
          if (!fxNote) infos.push(w)
        } else infos.push(w)
        break
      case "amount":
        // 화면 검사 문장과 같은 말(공급가액+부가세 ≠ 합계)은 버리고, 면세·봉사료 같은 설명만 덧붙인다
        if (amountReason) {
          if (/면세|봉사료/.test(w)) amountReason.detail.push(w)
        } else infos.push(w)
        break
      case "biz":
        if (lowReason && lowAll.has("vendor_biz_no")) lowReason.detail.push(w)
        else extra.push(aiReason(w, ["vendor_biz_no"]))
        break
      case "date":
        if (lowReason && lowAll.has("issue_date")) lowReason.detail.push(w)
        else extra.push(aiReason(w, ["issue_date"]))
        break
      case "fx":
        if (!fxError && f.currency !== "KRW" && f.exchange_rate === null) extra.push(aiReason(w, ["exchange_rate"]))
        break
      case "quality":
        if (lowReason) lowReason.detail.push(w)
        else extra.push(aiReason(w, []))
        break
      default:
        extra.push(aiReason(w, []))
    }
  }

  if (lowReason) all.push(lowReason)
  if (amountReason) all.push(amountReason)

  // 4) 사업 기간 밖 · 예산 외 비목 · 비목 빈칸
  if (project && isValidDate(f.issue_date)) {
    if (project.start_date && f.issue_date < project.start_date) {
      all.push({ id: "period", kind: "period", text: `사업 기간 전 거래예요(시작 ${formatDate(project.start_date)})`, detail: [], fields: ["issue_date"], needsOriginal: false })
    } else if (project.end_date && f.issue_date > project.end_date) {
      all.push({ id: "period", kind: "period", text: `사업 기간 뒤 거래예요(종료 ${formatDate(project.end_date)})`, detail: [], fields: ["issue_date"], needsOriginal: false })
    }
  }
  const budget = f.budget_item.trim()
  if (!budget) {
    all.push({ id: "budget_empty", kind: "budget_empty", text: "비목이 비어 있어요", detail: [], fields: ["budget_item"], needsOriginal: false })
  } else if (project && project.budget_items.length > 0 && !project.budget_items.some((b) => b.name.trim() === budget)) {
    all.push({ id: `budget:${budget}`, kind: "budget_outside", text: `예산에 없는 비목이에요: ${budget}`, detail: [], fields: ["budget_item"], needsOriginal: false })
  }
  const seen = new Set(all.map((r) => r.id))
  for (const r of extra) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    all.push(r)
  }
  for (const r of all) r.detail = uniq(r.detail)

  // 인식 불확실 사유는 노란 칸을 모두 확인했고(checkedFields) 전체 신뢰도 낮음도 확인했을 때 접힌다.
  const isAcked = (r: RowReason) => (r.id === "low" ? pendingLow.length === 0 && (!lowOverall || ack.has("low")) : ack.has(r.id))
  const reasons = all.filter((r) => !isAcked(r))
  const acknowledged = all.filter(isAcked)

  const duplicateSuspect = isDuplicateSuspect(row, matches)
  if (row.selected && duplicateSuspect) infos.push("중복 의심이지만 저장 대상에 넣었어요(저장할 때 한 번 더 물어요)")

  const status: RowStatusKey = !row.selected ? "excluded" : errors.length > 0 ? "needs_input" : reasons.length > 0 ? "needs_review" : "ready"
  return {
    status,
    label: statusMeta("expenseRow", status).label,
    detail: status === "excluded" && duplicateSuspect ? "중복 의심" : null,
    duplicateSuspect,
    errors,
    reasons,
    acknowledged,
    infos: uniq(infos),
  }
}

function aiReason(text: string, fields: ReasonField[]): RowReason {
  return { id: `ai:${text}`, kind: "ai", text, detail: [], fields, needsOriginal: fields.length === 0 }
}

// [확인했어요] 한 번 — 그 사유만 접는다. selected는 바꾸지 않는다(가드 7.2 #23).
export function acknowledgeReason(row: DraftRow, reasonId: string): DraftRow {
  const ack = row.ackReasons ?? []
  if (reasonId === "low") {
    return {
      ...row,
      checkedFields: uniq([...row.checkedFields, ...row.lowFields]),
      ackReasons: ack.includes("low") ? ack : [...ack, "low"],
    }
  }
  return ack.includes(reasonId) ? row : { ...row, ackReasons: [...ack, reasonId] }
}

// 검토 창의 "확인했어요 · 다음" — 남은 사유를 모두 접는다. selected는 바꾸지 않는다.
export function acknowledgeAll(row: DraftRow, project: UploaderProject | undefined, matches?: TableMatch[]): DraftRow {
  let next = row
  for (const r of assessRow(row, project, matches).reasons) next = acknowledgeReason(next, r.id)
  return next
}

// 저장 대상 포함 스위치(검토 창). 중복 의심 행을 다시 넣는 유일한 길이다.
export function setIncluded(row: DraftRow, included: boolean): DraftRow {
  return row.selected === included ? row : { ...row, selected: included }
}

export interface SaveSummary {
  /** 저장할 증빙 = selected 행 수(입력 필요 포함 — 누르면 빠진 것을 알려 준다) */
  count: number
  sum: number
  review: number
  input: number
}

export function saveSummary(rows: DraftRow[], assess: (row: DraftRow) => RowAssessment): SaveSummary {
  let count = 0
  let sum = 0
  let review = 0
  let input = 0
  for (const r of rows) {
    if (!r.selected) continue
    count++
    sum += typeof r.fields.total_amount === "number" ? r.fields.total_amount : 0
    const st = assess(r).status
    if (st === "needs_review") review++
    else if (st === "needs_input") input++
  }
  return { count, sum, review, input }
}

export type UploadView = "all" | "review" | "input" | "ready" | "excluded"

export const VIEW_STATUS: Record<Exclude<UploadView, "all">, RowStatusKey> = {
  review: "needs_review",
  input: "needs_input",
  ready: "ready",
  excluded: "excluded",
}

export function isUploadView(v: string): v is UploadView {
  return v === "all" || v === "review" || v === "input" || v === "ready" || v === "excluded"
}

// ── 인건비: 지난달 내역 불러오기(계획서 4.2.4 P-1) ─────────────────────────────
// 선택 프로젝트의 가장 최근 귀속월 인건비(doc_type 'payroll')를 한 달 뒤로 옮긴 행으로 만든다. 저장은 하지 않는다.
// - 귀속월 = payroll_month(없으면 지급일의 달). 이번 달보다 뒤 귀속월은 근거로 쓰지 않는다.
// - 기본 규칙(명세): 가장 최근 귀속월(L) → L+1. L+1이 이번 달보다 뒤면(= L이 이미 이번 달) 다음 달을 만들지 않는다.
// - L이 이번 달이고 그 앞달(P = L−1)에만 있던 대상자가 있으면 "이번 달 등록하다 만 사람" 후보로 L 귀속 행을 만든다.
//   이 행들은 퇴사·교체일 수 있으므로 **모두 기본 제외**(include false, missing true)다. 사람이 골라서 넣는다.
//   L에 이미 있는 대상자는 "이미 등록됨"(existing)으로 함께 기본 제외한다. 서버 중복 판정은
//   "같은 프로젝트·지급일·대상자·금액"이라 지급일이 하루만 달라도 통과하므로 여기서 막는다.
// - 인원이 바뀐 달(퇴사·교체)도 L → L+1 규칙을 그대로 쓴다. 지난 달을 다시 채우자고 제안하지 않는다(검토 M1).

export interface PayrollSourceReceipt {
  project_id: number
  doc_type: string
  issue_date: string
  vendor_name: string
  total_amount: number | null
  payroll_month: string
  payment_method: ReceiptFields["payment_method"]
  budget_item: string
  purpose: string
}

export interface PayrollImportRow {
  vendor_name: string
  amount: number | null
  issue_date: string
  payroll_month: string
  purpose: string
  payment_method: ReceiptFields["payment_method"]
  budget_item: string
  /** 새 귀속월에 같은 대상자가 이미 등록돼 있음 → 기본 제외 */
  existing: boolean
  /** 이번 달 기록에는 없고 지난달에만 있던 대상자(퇴사·교체일 수 있음) → 기본 제외, 골라서 넣기 */
  missing: boolean
  include: boolean
}

export interface PayrollImportPlan {
  sourceMonth: string | null
  targetMonth: string | null
  blocked: "this_month" | null
  /** "next": L → L+1 기본 불러오기 · "fill": L이 이번 달이라 지난달에만 있던 사람을 골라 넣는 후보만 */
  mode: "next" | "fill" | null
  rows: PayrollImportRow[]
}

function attributionMonth(r: Pick<PayrollSourceReceipt, "payroll_month" | "issue_date">): string {
  const m = (r.payroll_month || "").trim()
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return m
  return isValidDate(r.issue_date) ? r.issue_date.slice(0, 7) : ""
}

function normalizePerson(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase()
}

// 날짜를 한 달 뒤로(말일 넘침은 그 달 말일로: 1월 31일 → 2월 28일)
export function shiftDateOneMonth(d: string): string {
  if (!isValidDate(d)) return ""
  const [y, m, day] = d.split("-").map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`
}

// 적요 속 "2026년 9월"·"2026년 09월"·"2026-09"를 새 달로 바꾼다.
export function shiftPurposeMonth(purpose: string, from: string, to: string): string {
  const [fy, fm] = from.split("-").map(Number)
  const [ty, tm] = to.split("-").map(Number)
  return purpose
    .replace(new RegExp(`${fy}년\\s*0?${fm}월`, "g"), `${ty}년 ${tm}월`)
    .split(from)
    .join(to)
}

export function planPayrollImport(receipts: PayrollSourceReceipt[], projectId: number, today: string): PayrollImportPlan {
  const thisMonth = today.slice(0, 7)
  const mine = receipts.filter((r) => r.project_id === projectId && r.doc_type === "payroll" && r.vendor_name.trim())
  const byMonth = new Map<string, PayrollSourceReceipt[]>()
  for (const r of mine) {
    const m = attributionMonth(r)
    if (!m || m > thisMonth) continue
    const list = byMonth.get(m)
    if (list) list.push(r)
    else byMonth.set(m, [r])
  }
  const months = Array.from(byMonth.keys()).sort()
  if (months.length === 0) return { sourceMonth: null, targetMonth: null, blocked: null, mode: null, rows: [] }
  const latest = months[months.length - 1]
  const people = (m: string) => new Set((byMonth.get(m) ?? []).map((r) => normalizePerson(r.vendor_name)))

  const build = (sourceMonth: string, targetMonth: string, pick: (r: PayrollSourceReceipt) => { existing: boolean; missing: boolean }) =>
    (byMonth.get(sourceMonth) ?? [])
      .slice()
      .sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.vendor_name.localeCompare(b.vendor_name, "ko"))
      .map((r): PayrollImportRow => {
        const { existing, missing } = pick(r)
        return {
          vendor_name: r.vendor_name.trim(),
          amount: typeof r.total_amount === "number" ? r.total_amount : null,
          // 지급일이 귀속월과 다른 달(다음 달 지급)이어도 한 달 뒤로 옮긴다
          issue_date: shiftDateOneMonth(r.issue_date),
          payroll_month: targetMonth,
          purpose: shiftPurposeMonth(r.purpose, sourceMonth, targetMonth),
          payment_method: r.payment_method,
          budget_item: r.budget_item,
          existing,
          missing,
          include: !existing && !missing,
        }
      })

  // 기본: L → L+1(이번 달 이하일 때만)
  const next = addMonths(latest, 1)
  if (next <= thisMonth) {
    const already = people(next) // 정의상 비어 있지만(있으면 그 달이 L), 판정은 그대로 둔다
    return {
      sourceMonth: latest,
      targetMonth: next,
      blocked: null,
      mode: "next",
      rows: build(latest, next, (r) => ({ existing: already.has(normalizePerson(r.vendor_name)), missing: false })),
    }
  }

  // L이 이번 달: 다음 달은 만들지 않는다. 바로 앞달에만 있던 사람이 있으면 골라 넣을 후보로만 보여 준다.
  const prev = addMonths(latest, -1)
  const latestPeople = people(latest)
  const onlyPrev = byMonth.has(prev) && Array.from(people(prev)).some((n) => !latestPeople.has(n))
  if (!onlyPrev) return { sourceMonth: latest, targetMonth: null, blocked: "this_month", mode: null, rows: [] }
  return {
    sourceMonth: prev,
    targetMonth: latest,
    blocked: "this_month",
    mode: "fill",
    rows: build(prev, latest, (r) => {
      const existing = latestPeople.has(normalizePerson(r.vendor_name))
      return { existing, missing: !existing }
    }),
  }
}
