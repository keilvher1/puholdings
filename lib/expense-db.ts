// 사업비 정산(증빙 관리) 서버 전용 공용 로직.
// - DB 행 → lib/expenses.ts 타입 변환 (NUMERIC 문자열 → Number, 날짜는 SQL에서 to_char로 꺼낸다)
// - 공용 쿼리(프로젝트 목록·증빙 목록·중복 파일 조회)
// - 요청 본문 정규화·검증(ProjectInput, ReceiptFields, UploadedFileMeta)
// - 업로드 파일 검사(MIME + 매직 바이트)와 Blob(private) 보관
// API 라우트(/api/admin/expenses/**)에서만 import한다. 클라이언트 컴포넌트에서 import하면 안 된다
// (node:crypto·@vercel/blob·next/headers를 쓴다). 공용 타입·검증은 lib/expenses.ts에서 가져온다.

import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import type { NeonQueryFunction } from "@neondatabase/serverless"
import { getSession } from "./auth"
import { getDb, type Attachment } from "./db"
import { isSafePathname } from "./upload"
import { normalizeApproval, sameTransactionReason, type SimilarReceipt, type TxKeyFields } from "./expense-dedupe"
import {
  EXPENSE_DOC_TYPES,
  PAYMENT_METHODS,
  formatBizNo,
  isValidDate,
  isWholeWon,
  validateReceiptFields,
  type BudgetItem,
  type Confidence,
  type DuplicateReceipt,
  type ExpenseDocType,
  type ExpenseProject,
  type ExpenseReceipt,
  type PaymentMethod,
  type ProjectInput,
  type ReceiptFields,
  type ReceiptItem,
  type UploadedFileMeta,
} from "./expenses"

export type Sql = NeonQueryFunction<false, false>
type Row = Record<string, unknown>

export const RECEIPT_PREFIX = "expenses/receipts/"
export const PROJECT_DOC_PREFIX = "expenses/projects/"

// ── 라우트 공통: 인증·DB ────────────────────────────────────────────────────────
export function fail(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error, ...extra }, { status })
}

// 모든 /api/admin/expenses/* 라우트 맨 앞에서 호출한다.
export async function requireAdminDb(): Promise<{ sql: Sql; response?: undefined } | { sql?: undefined; response: NextResponse }> {
  if (!(await getSession())) return { response: fail("인증이 필요합니다", 401) }
  const sql = getDb()
  if (!sql) return { response: fail("데이터베이스 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.", 500) }
  return { sql }
}

// 테이블이 아직 없을 때(마이그레이션 미실행) 친절한 안내로 바꾼다.
export function dbErrorMessage(error: unknown, fallback: string): string {
  const code = (error as { code?: string } | null)?.code
  if (code === "42P01") return "사업비 정산 테이블이 아직 준비되지 않았습니다. 관리자에게 DB 마이그레이션(2026-expense-01.sql) 실행을 요청하세요."
  return fallback
}

// ── 값 변환 ────────────────────────────────────────────────────────────────────
export function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toInt(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function toStr(v: unknown): string {
  return v === null || v === undefined ? "" : String(v)
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString()
  return toStr(v)
}

// JSONB는 드라이버가 파싱해 주지만, 혹시 문자열로 오면 한 번 더 파싱한다.
function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function isObj(v: unknown): v is Row {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function asDocType(v: unknown): ExpenseDocType {
  return (EXPENSE_DOC_TYPES as readonly string[]).includes(String(v)) ? (v as ExpenseDocType) : "other"
}

function asPayment(v: unknown): PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(String(v)) ? (v as PaymentMethod) : "other"
}

function asConfidence(v: unknown): Confidence | null {
  return v === "high" || v === "medium" || v === "low" ? v : null
}

function looseBudgetItems(v: unknown): BudgetItem[] {
  return asArray(v)
    .filter(isObj)
    .map((b) => ({ name: toStr(b.name), amount: toNumOrNull(b.amount) }))
}

function looseItems(v: unknown): ReceiptItem[] {
  return asArray(v)
    .filter(isObj)
    .map((i) => ({
      name: toStr(i.name),
      quantity: toNumOrNull(i.quantity),
      unit_price: toNumOrNull(i.unit_price),
      amount: toNumOrNull(i.amount),
    }))
}

function looseAttachments(v: unknown): Attachment[] {
  return asArray(v)
    .filter((a): a is Row => isObj(a) && typeof a.pathname === "string")
    .map((a) => ({
      name: toStr(a.name),
      pathname: toStr(a.pathname),
      size: toInt(a.size),
      type: toStr(a.type),
    }))
}

// ── 행 → 타입 ───────────────────────────────────────────────────────────────────
export function rowToProject(row: Row): ExpenseProject {
  return {
    id: toInt(row.id),
    name: toStr(row.name),
    program_name: toStr(row.program_name),
    agency: toStr(row.agency),
    description: toStr(row.description),
    start_date: row.start_date ? toStr(row.start_date) : null,
    end_date: row.end_date ? toStr(row.end_date) : null,
    total_budget: toNumOrNull(row.total_budget),
    budget_items: looseBudgetItems(row.budget_items),
    source_files: looseAttachments(row.source_files),
    status: row.status === "closed" ? "closed" : "active",
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    receipt_count: toInt(row.receipt_count),
    spent_total: toNumOrNull(row.spent_total) ?? 0,
  }
}

export function rowToReceipt(row: Row): ExpenseReceipt {
  return {
    id: toInt(row.id),
    project_id: toInt(row.project_id),
    project_name: toStr(row.project_name),
    doc_type: asDocType(row.doc_type),
    issue_date: toStr(row.issue_date),
    vendor_name: toStr(row.vendor_name),
    vendor_biz_no: toStr(row.vendor_biz_no),
    supply_amount: toNumOrNull(row.supply_amount),
    vat_amount: toNumOrNull(row.vat_amount),
    total_amount: toNumOrNull(row.total_amount),
    payment_method: asPayment(row.payment_method),
    approval_no: toStr(row.approval_no),
    items: looseItems(row.items),
    budget_item: toStr(row.budget_item),
    purpose: toStr(row.purpose),
    memo: toStr(row.memo),
    file_pathname: toStr(row.file_pathname),
    file_name: toStr(row.file_name),
    file_type: toStr(row.file_type),
    file_size: toInt(row.file_size),
    file_hash: toStr(row.file_hash),
    ai_confidence: asConfidence(row.ai_confidence),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  }
}

// ── 공용 쿼리 ───────────────────────────────────────────────────────────────────
// 활성 프로젝트 먼저, 그다음 최신 등록순. 증빙 수·집행액을 함께 집계한다.
export async function listProjects(
  sql: Sql,
  opts: { id?: number | null; activeOnly?: boolean } = {},
): Promise<ExpenseProject[]> {
  const id = opts.id ?? null
  const activeOnly = opts.activeOnly === true
  const rows = await sql`
    SELECT p.id, p.name, p.program_name, p.agency, p.description,
           to_char(p.start_date, 'YYYY-MM-DD') AS start_date,
           to_char(p.end_date, 'YYYY-MM-DD') AS end_date,
           p.total_budget, p.budget_items, p.source_files, p.status, p.created_at, p.updated_at,
           COALESCE(r.receipt_count, 0) AS receipt_count,
           COALESCE(r.spent_total, 0) AS spent_total
    FROM expense_projects p
    LEFT JOIN (
      SELECT project_id, COUNT(*) AS receipt_count, SUM(total_amount) AS spent_total
      FROM expense_receipts
      GROUP BY project_id
    ) r ON r.project_id = p.id
    WHERE (${id}::int IS NULL OR p.id = ${id})
      AND (NOT ${activeOnly}::boolean OR p.status = 'active')
    ORDER BY (p.status = 'active') DESC, p.created_at DESC, p.id DESC
  `
  return rows.map((r) => rowToProject(r as Row))
}

export async function getProject(sql: Sql, id: number): Promise<ExpenseProject | null> {
  const rows = await listProjects(sql, { id })
  return rows[0] ?? null
}

export interface ReceiptFilter {
  id?: number | null
  projectId?: number | null
  from?: string | null
  to?: string | null
  q?: string | null
  limit?: number
}

// LIKE 와일드카드(% _)와 이스케이프 문자(\)를 글자 그대로 찾도록 이스케이프한다.
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export async function listReceipts(sql: Sql, filter: ReceiptFilter = {}): Promise<ExpenseReceipt[]> {
  const id = filter.id ?? null
  const projectId = filter.projectId ?? null
  const from = isValidDate(filter.from) ? filter.from : null
  const to = isValidDate(filter.to) ? filter.to : null
  const q = (filter.q ?? "").trim().slice(0, 100)
  const pattern = q ? likePattern(q) : null
  // "12,000" "12000원"처럼 금액만 입력하면 합계 금액 일치도 찾아 준다.
  const amountQ = /^[\d,]+\s*원?$/.test(q) ? Number(q.replace(/\D/g, "")) : null
  const amount = amountQ !== null && Number.isSafeInteger(amountQ) ? amountQ : null
  const limit = Math.min(Math.max(filter.limit ?? 5000, 1), 5000)
  const rows = await sql`
    SELECT r.id, r.project_id, p.name AS project_name, r.doc_type,
           to_char(r.issue_date, 'YYYY-MM-DD') AS issue_date,
           r.vendor_name, r.vendor_biz_no, r.supply_amount, r.vat_amount, r.total_amount,
           r.payment_method, r.approval_no, r.items, r.budget_item, r.purpose, r.memo,
           r.file_pathname, r.file_name, r.file_type, r.file_size, r.file_hash,
           r.ai_confidence, r.created_at, r.updated_at
    FROM expense_receipts r
    JOIN expense_projects p ON p.id = r.project_id
    WHERE (${id}::int IS NULL OR r.id = ${id})
      AND (${projectId}::int IS NULL OR r.project_id = ${projectId})
      AND (${from}::date IS NULL OR r.issue_date >= ${from}::date)
      AND (${to}::date IS NULL OR r.issue_date <= ${to}::date)
      AND (
        ${pattern}::text IS NULL
        OR r.vendor_name ILIKE ${pattern}
        OR r.purpose ILIKE ${pattern}
        OR r.memo ILIKE ${pattern}
        OR r.budget_item ILIKE ${pattern}
        OR r.vendor_biz_no ILIKE ${pattern}
        OR r.approval_no ILIKE ${pattern}
        OR (${amount}::numeric IS NOT NULL AND r.total_amount = ${amount}::numeric)
      )
    ORDER BY r.issue_date DESC, r.id DESC
    LIMIT ${limit}
  `
  return rows.map((r) => rowToReceipt(r as Row))
}

export async function getReceipt(sql: Sql, id: number): Promise<ExpenseReceipt | null> {
  const rows = await listReceipts(sql, { id, limit: 1 })
  return rows[0] ?? null
}

// 같은 파일(sha256 일치)로 이미 저장된 증빙. 해시를 여러 개 주면(원본 해시·전송본 해시) 어느 것이든 일치하면 찾는다.
export async function findDuplicatesByHash(sql: Sql, hash: string | string[]): Promise<DuplicateReceipt[]> {
  const hashes = [...new Set((Array.isArray(hash) ? hash : [hash]).filter((h) => /^[0-9a-f]{64}$/.test(h)))]
  if (hashes.length === 0) return []
  const rows = await sql`
    SELECT r.id, p.name AS project_name, to_char(r.issue_date, 'YYYY-MM-DD') AS issue_date,
           r.vendor_name, r.total_amount
    FROM expense_receipts r
    JOIN expense_projects p ON p.id = r.project_id
    WHERE r.file_hash = ANY(${hashes}::text[])
    ORDER BY r.id DESC
    LIMIT 10
  `
  return rows.map((r) => ({
    id: toInt(r.id),
    project_name: toStr(r.project_name),
    issue_date: toStr(r.issue_date),
    vendor_name: toStr(r.vendor_name),
    total_amount: toNumOrNull(r.total_amount) ?? 0,
  }))
}

// 파일은 다르지만 같은 거래로 보이는 저장된 증빙(세금계산서를 저장한 뒤 같은 거래의 이체확인증을 또 올린 경우 등).
// 결과는 drafts와 같은 순서의 배열이다. excludeIds(같은 파일로 이미 잡힌 증빙)는 뺀다.
export async function findSimilarReceipts(
  sql: Sql,
  drafts: TxKeyFields[],
  excludeIds: number[] = [],
): Promise<SimilarReceipt[][]> {
  const totals = [...new Set(drafts.map((d) => d.total_amount).filter((n): n is number => isWholeWon(n) && n !== 0))]
  const approvals = [...new Set(drafts.map((d) => normalizeApproval(d.approval_no)).filter((a) => a.length >= 6))]
  if (totals.length === 0 && approvals.length === 0) return drafts.map(() => [])
  const rows = await sql`
    SELECT r.id, p.name AS project_name, r.doc_type, to_char(r.issue_date, 'YYYY-MM-DD') AS issue_date,
           r.vendor_name, r.vendor_biz_no, r.total_amount, r.approval_no
    FROM expense_receipts r
    JOIN expense_projects p ON p.id = r.project_id
    WHERE r.total_amount = ANY(${totals}::numeric[])
       OR (r.approval_no <> '' AND regexp_replace(lower(r.approval_no), '[^0-9a-z]', '', 'g') = ANY(${approvals}::text[]))
    ORDER BY r.id DESC
    LIMIT 500
  `
  const exclude = new Set(excludeIds)
  const candidates = rows
    .map((r) => ({
      id: toInt(r.id),
      project_name: toStr(r.project_name),
      doc_type: asDocType(r.doc_type),
      issue_date: toStr(r.issue_date),
      vendor_name: toStr(r.vendor_name),
      vendor_biz_no: toStr(r.vendor_biz_no),
      total_amount: toNumOrNull(r.total_amount),
      approval_no: toStr(r.approval_no),
    }))
    .filter((c) => !exclude.has(c.id))
  return drafts.map((d) => {
    const out: SimilarReceipt[] = []
    for (const c of candidates) {
      const reason = sameTransactionReason(d, c)
      if (!reason) continue
      out.push({
        id: c.id,
        project_name: c.project_name,
        issue_date: c.issue_date,
        vendor_name: c.vendor_name,
        total_amount: c.total_amount ?? 0,
        doc_type: c.doc_type,
        reason,
      })
      if (out.length >= 5) break
    }
    return out
  })
}

// ── 요청 본문 정규화·검증 ──────────────────────────────────────────────────────────
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] }

export function parseId(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "number" ? v : NaN
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : ""
}

// 금액 입력: 숫자 또는 "1,234,000" "1234000원" 같은 문자열. 빈 값은 null, 해석 불가면 NaN.
export function parseWon(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === "number") return v
  if (typeof v === "string") {
    const s = v.replace(/[,\s원₩]/g, "")
    if (s === "") return null
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
  }
  return NaN
}

function parseDateOrNull(v: unknown): string | null | undefined {
  const s = trimStr(v)
  if (!s) return null
  return isValidDate(s) ? s : undefined // undefined = 형식 오류
}

// 첨부 메타데이터 배열(JSONB 규칙) — 지정한 프리픽스의 안전한 경로만 허용한다.
export function parseAttachments(v: unknown, prefix: string, label: string): Parsed<Attachment[]> {
  if (v === undefined || v === null) return { ok: true, value: [] }
  if (!Array.isArray(v)) return { ok: false, errors: [`${label} 형식이 올바르지 않습니다`] }
  if (v.length > 20) return { ok: false, errors: [`${label}는 20개까지 저장할 수 있습니다`] }
  const out: Attachment[] = []
  for (const a of v) {
    if (!isObj(a)) return { ok: false, errors: [`${label} 형식이 올바르지 않습니다`] }
    const pathname = trimStr(a.pathname)
    if (!isSafePathname(pathname) || !pathname.startsWith(prefix)) {
      return { ok: false, errors: [`${label} 경로가 올바르지 않습니다. 파일을 다시 올려 주세요.`] }
    }
    out.push({
      name: trimStr(a.name).slice(0, 300) || pathname.split("/").pop() || "파일",
      pathname,
      size: Math.max(0, toInt(a.size)),
      type: trimStr(a.type).slice(0, 100),
    })
  }
  return { ok: true, value: out }
}

export function parseProjectInput(body: unknown): Parsed<ProjectInput> {
  const b = isObj(body) ? body : {}
  const errors: string[] = []

  const name = trimStr(b.name)
  if (!name) errors.push("프로젝트명을 입력하세요")
  else if (name.length > 200) errors.push("프로젝트명은 200자 이내로 입력하세요")
  const program_name = trimStr(b.program_name)
  if (program_name.length > 200) errors.push("지원사업명은 200자 이내로 입력하세요")
  const agency = trimStr(b.agency)
  if (agency.length > 200) errors.push("주관·전담기관은 200자 이내로 입력하세요")
  const description = trimStr(b.description)
  if (description.length > 5000) errors.push("설명은 5,000자 이내로 입력하세요")

  const start_date = parseDateOrNull(b.start_date)
  const end_date = parseDateOrNull(b.end_date)
  if (start_date === undefined) errors.push("시작일을 YYYY-MM-DD 형식으로 입력하세요")
  if (end_date === undefined) errors.push("종료일을 YYYY-MM-DD 형식으로 입력하세요")
  if (start_date && end_date && start_date > end_date) errors.push("종료일이 시작일보다 빠릅니다")

  const total_budget = parseWon(b.total_budget)
  if (total_budget !== null && (!isWholeWon(total_budget) || total_budget < 0)) {
    errors.push("총사업비는 0 이상의 원 단위 정수로 입력하세요")
  }

  const budget_items: BudgetItem[] = []
  if (b.budget_items !== undefined && b.budget_items !== null && !Array.isArray(b.budget_items)) {
    errors.push("비목별 예산 형식이 올바르지 않습니다")
  } else {
    const rows = Array.isArray(b.budget_items) ? b.budget_items : []
    if (rows.length > 50) errors.push("비목은 50개까지 입력할 수 있습니다")
    const seen = new Set<string>()
    rows.slice(0, 50).forEach((raw, i) => {
      const r = isObj(raw) ? raw : {}
      const itemName = trimStr(r.name)
      const amount = parseWon(r.amount)
      if (!itemName && amount === null) return // 완전히 빈 행은 조용히 버린다
      if (!itemName) {
        errors.push(`비목 ${i + 1}번째 행의 이름이 비어 있습니다`)
        return
      }
      if (itemName.length > 100) errors.push(`비목 '${itemName.slice(0, 20)}…'의 이름이 너무 깁니다(100자 이내)`)
      if (seen.has(itemName)) errors.push(`비목 '${itemName}'이(가) 두 번 입력되었습니다`)
      seen.add(itemName)
      if (amount !== null && (!isWholeWon(amount) || amount < 0)) {
        errors.push(`비목 '${itemName}'의 예산은 0 이상의 원 단위 정수로 입력하세요`)
      }
      budget_items.push({ name: itemName, amount })
    })
  }

  const files = parseAttachments(b.source_files, PROJECT_DOC_PREFIX, "사업 자료")
  if (!files.ok) errors.push(...files.errors)

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      name,
      program_name,
      agency,
      description,
      start_date: start_date ?? null,
      end_date: end_date ?? null,
      total_budget,
      budget_items,
      source_files: files.ok ? files.value : [],
    },
  }
}

function parseItems(v: unknown): ReceiptItem[] {
  if (!Array.isArray(v)) return []
  const out: ReceiptItem[] = []
  for (const raw of v.slice(0, 200)) {
    if (!isObj(raw)) continue
    const name = trimStr(raw.name).slice(0, 200)
    const quantity = parseWon(raw.quantity)
    const unitPrice = parseWon(raw.unit_price)
    const amount = parseWon(raw.amount)
    const clean = (n: number | null, round: boolean) =>
      n === null || !Number.isFinite(n) || Math.abs(n) >= 1e12 ? null : round ? Math.round(n) : n
    const item: ReceiptItem = {
      name,
      quantity: clean(quantity, false),
      unit_price: clean(unitPrice, true),
      amount: clean(amount, true),
    }
    if (!item.name && item.amount === null) continue
    out.push(item)
  }
  return out
}

// ReceiptFields 정규화 + validateReceiptFields(공용) + DB 컬럼 길이 등 서버 추가 검사.
export function parseReceiptFields(body: unknown): { fields: ReceiptFields; errors: string[] } {
  const b = isObj(body) ? body : {}
  const bizRaw = trimStr(b.vendor_biz_no)
  const fields: ReceiptFields = {
    doc_type: trimStr(b.doc_type) as ExpenseDocType,
    issue_date: trimStr(b.issue_date),
    vendor_name: trimStr(b.vendor_name),
    vendor_biz_no: bizRaw ? formatBizNo(bizRaw) : "",
    supply_amount: parseWon(b.supply_amount),
    vat_amount: parseWon(b.vat_amount),
    total_amount: parseWon(b.total_amount),
    payment_method: trimStr(b.payment_method) as PaymentMethod,
    approval_no: trimStr(b.approval_no),
    items: parseItems(b.items),
    budget_item: trimStr(b.budget_item),
    purpose: trimStr(b.purpose),
    memo: trimStr(b.memo),
  }
  const errors = validateReceiptFields(fields)
  if (fields.approval_no.length > 50) errors.push("승인번호가 너무 깁니다(50자 이내)")
  if (fields.purpose.length > 2000) errors.push("적요는 2,000자 이내로 입력하세요")
  if (fields.memo.length > 2000) errors.push("메모는 2,000자 이내로 입력하세요")
  return { fields, errors }
}

export function parseUploadedFileMeta(v: unknown): Parsed<UploadedFileMeta> {
  if (!isObj(v)) return { ok: false, errors: ["원본 파일 정보가 없습니다. 파일을 다시 올려 주세요."] }
  const pathname = trimStr(v.pathname)
  if (!isSafePathname(pathname) || !pathname.startsWith(RECEIPT_PREFIX)) {
    return { ok: false, errors: ["원본 파일 경로가 올바르지 않습니다. 파일을 다시 올려 주세요."] }
  }
  const hash = trimStr(v.hash).toLowerCase()
  if (hash && !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, errors: ["원본 파일 정보가 손상되었습니다. 파일을 다시 올려 주세요."] }
  const size = Number(v.size)
  return {
    ok: true,
    value: {
      pathname,
      name: (trimStr(v.name) || pathname.split("/").pop() || "파일").slice(0, 300),
      type: trimStr(v.type).slice(0, 100),
      size: Number.isSafeInteger(size) && size >= 0 && size < 2 ** 31 ? size : 0,
      hash,
    },
  }
}

// 감사용 AI 원본 초안 — 그대로 JSONB로 저장하되 비정상적으로 크면 버린다.
export function aiRawJson(v: unknown): string | null {
  if (v === undefined || v === null) return null
  try {
    const s = JSON.stringify(v)
    return s && s.length <= 200_000 ? s : null
  } catch {
    return null
  }
}

export function parseConfidence(v: unknown): Confidence | null {
  return asConfidence(v)
}

// ── 업로드 파일 검사(MIME + 매직 바이트)·Blob 보관 ───────────────────────────────────
export type FileKind = "pdf" | "jpeg" | "png" | "webp" | "text"
const KIND_MIME: Record<Exclude<FileKind, "text">, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
}

function ascii(buf: Uint8Array, start: number, len: number): string {
  let s = ""
  for (let i = start; i < start + len && i < buf.length; i++) s += String.fromCharCode(buf[i])
  return s
}

// 파일 앞부분 바이트로 실제 형식을 판별한다. 브라우저가 보낸 MIME·확장자는 믿지 않는다.
export function sniffFileKind(buf: Uint8Array): Exclude<FileKind, "text"> | "heic" | "gif" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg"
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "png"
  if (buf.length >= 12 && ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 4) === "WEBP") return "webp"
  // PDF 규격상 %PDF- 앞에 쓰레기 바이트가 조금 붙을 수 있다(최대 1KB 안쪽).
  if (ascii(buf, 0, 1024).includes("%PDF-")) return "pdf"
  if (buf.length >= 12 && ascii(buf, 4, 4) === "ftyp") {
    const brand = ascii(buf, 8, 4)
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif", "avis"].includes(brand)) return "heic"
  }
  if (ascii(buf, 0, 4) === "GIF8") return "gif"
  return null
}

// 텍스트 파일로 볼 수 있는지 — 앞부분에 NUL 바이트가 없으면 텍스트로 본다.
function looksLikeText(buf: Uint8Array): boolean {
  const n = Math.min(buf.length, 8192)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return false
  return true
}

// UTF-8이 아니면 한국어 윈도우 기본 인코딩(CP949/EUC-KR)으로 읽는다.
export function decodeTextFile(buf: Uint8Array): string {
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf)
  } catch {
    try {
      text = new TextDecoder("euc-kr").decode(buf)
    } catch {
      text = new TextDecoder("utf-8").decode(buf)
    }
  }
  return text.replace(/^﻿/, "")
}

function extOf(name: string): string {
  return (name.match(/\.[^.]+$/)?.[0] || "").toLowerCase()
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`
  if (n >= 1024) return `${Math.round(n / 1024)}KB`
  return `${n}B`
}

export type CheckedUpload =
  | { ok: true; kind: FileKind; mime: string; buffer: Buffer }
  | { ok: false; error: string }

// 업로드 파일 검사: 크기 → 매직 바이트 → 허용 형식. 사람이 바로 고칠 수 있는 한국어 안내를 돌려준다.
export async function checkUpload(file: File, allowed: readonly string[], maxBytes: number): Promise<CheckedUpload> {
  const name = file.name || "파일"
  if (file.size === 0) return { ok: false, error: `'${name}' 파일이 비어 있습니다. 파일을 다시 저장해 올려 주세요.` }
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `'${name}'이(가) ${formatBytes(maxBytes)}를 넘습니다(현재 ${formatBytes(file.size)}). PDF는 페이지를 나누거나 용량을 줄여 올려 주세요. 사진은 화면에서 자동으로 줄여 보냅니다.`,
    }
  }
  const ext = extOf(name)
  if ([".hwp", ".hwpx", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"].includes(ext)) {
    return {
      ok: false,
      error: `'${name}'은(는) 한글·Office 문서라 바로 읽을 수 없습니다. 해당 프로그램에서 'PDF로 저장'한 뒤 올려 주세요.`,
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const kind = sniffFileKind(buffer)
  const claimed = (file.type || "").toLowerCase()
  // 비표준 MIME(image/jpg 등)은 흔하므로 이미지 계열이면 실제 바이트 판별을 믿는다.
  // 반대로 전혀 다른 계열(text/html 등)을 주장하면서 이미지 바이트인 파일은 거절한다.
  const claimedOk =
    !claimed ||
    claimed === "application/octet-stream" ||
    claimed === "application/x-pdf" ||
    claimed.startsWith("image/") ||
    allowed.includes(claimed)

  if (kind === "heic" || claimed === "image/heic" || claimed === "image/heif" || ext === ".heic" || ext === ".heif") {
    return {
      ok: false,
      error: `'${name}'은(는) 아이폰 HEIC 사진이라 읽을 수 없습니다. 사진을 JPG로 내보내거나(아이폰 설정 › 카메라 › 포맷 › 높은 호환성) 화면을 캡처해 올려 주세요.`,
    }
  }
  if (kind === "gif") return { ok: false, error: `'${name}'은(는) GIF 형식이라 읽을 수 없습니다. JPG·PNG 사진이나 PDF로 올려 주세요.` }

  if (kind && allowed.includes(KIND_MIME[kind])) {
    if (!claimedOk) {
      return { ok: false, error: `'${name}'의 파일 형식 정보(${claimed})가 실제 내용과 다릅니다. 파일을 다시 저장해 올려 주세요.` }
    }
    return { ok: true, kind, mime: KIND_MIME[kind], buffer }
  }
  if (!kind && allowed.includes("text/plain") && (claimed === "text/plain" || ext === ".txt") && looksLikeText(buffer)) {
    return { ok: true, kind: "text", mime: "text/plain", buffer }
  }
  if (claimed && (allowed.includes(claimed) || claimed === "application/x-pdf")) {
    return {
      ok: false,
      error: `'${name}' 파일의 내용이 ${claimed.startsWith("image/") ? "사진" : claimed.startsWith("text/") ? "텍스트" : "PDF"} 형식이 아닙니다(손상되었거나 확장자만 바뀐 파일). 원본 파일을 다시 저장해 올려 주세요.`,
    }
  }
  const kinds = allowed.includes("text/plain") ? "JPG·PNG·WebP 사진, PDF, 텍스트(.txt)" : "JPG·PNG·WebP 사진이나 PDF"
  return { ok: false, error: `'${name}'은(는) 지원하지 않는 형식입니다. ${kinds}만 올릴 수 있습니다.` }
}

export function sha256Hex(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex")
}

// Blob 경로에 쓸 파일명 — 경로 구분자·'..'·제어문자·URL 특수문자를 없앤다. 확장자는 살린다.
export function safeBlobName(name: string): string {
  const cleaned = name
    .replace(/[\\/]/g, "_")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[?#%*:"<>|]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
  const base = cleaned || "file"
  if (base.length <= 120) return base
  const ext = extOf(base).slice(0, 10)
  return base.slice(0, 120 - ext.length) + ext
}

// 한국 시간 기준 오늘 'YYYY-MM-DD'
export function kstToday(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date())
}

// 확장자를 실제 형식에 맞춘다(예: 브라우저가 압축한 사진은 JPEG인데 이름이 .png인 경우).
export function nameWithKindExt(name: string, kind: FileKind): string {
  const want = kind === "jpeg" ? [".jpg", ".jpeg"] : kind === "text" ? [".txt"] : [`.${kind}`]
  const ext = extOf(name)
  if (want.includes(ext)) return name
  const base = ext ? name.slice(0, -ext.length) : name
  return `${base || "file"}${want[0]}`
}

// Blob(private)에 보관하고 pathname을 돌려준다. 같은 이름이 같은 ms에 올라와 충돌하면 한 번 더 시도한다.
export async function storePrivateBlob(folder: string, name: string, data: Buffer, contentType: string): Promise<string> {
  const safe = safeBlobName(name)
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const stamp = Date.now() + attempt * (1 + Math.floor(Math.random() * 997))
    try {
      const blob = await put(`${folder}/${stamp}-${safe}`, data, { access: "private", contentType, addRandomSuffix: false })
      return blob.pathname
    } catch (error) {
      lastError = error
      const msg = error instanceof Error ? error.message : ""
      if (!/exist/i.test(msg)) break
    }
  }
  throw lastError instanceof Error ? lastError : new Error("파일 보관에 실패했습니다")
}
