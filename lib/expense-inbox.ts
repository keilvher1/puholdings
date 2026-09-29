// 확인 대기함(expense_inbox) 서버 전용 쿼리·변환.
// 데스크톱 앱이 올린 증빙의 원본·인식 제안값을 보관한다. 증빙 장부(expense_receipts)로는 사람이 웹에서 저장할 때만 옮겨진다.
// API 라우트와 서버 컴포넌트에서만 import한다.

import {
  MAX_INBOX_LIST,
  type DuplicateReceipt,
  type InboxItem,
  type InboxScanStatus,
  type InboxStatus,
  type ReceiptDraft,
  type UploadedFileMeta,
} from "./expenses"
import type { Sql } from "./expense-db"

type Row = Record<string, unknown>

// 테이블이 아직 없을 때(마이그레이션 미실행)의 안내
export function inboxDbErrorMessage(error: unknown, fallback: string): string {
  const code = (error as { code?: string } | null)?.code
  if (code === "42P01") {
    return "확인 대기함 테이블이 아직 준비되지 않았습니다. 관리자에게 DB 마이그레이션(2026-expense-02-inbox.sql) 실행을 요청하세요."
  }
  return fallback
}

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

function toStr(v: unknown): string {
  return v === null || v === undefined ? "" : String(v)
}

function toInt(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function asStatus(v: unknown): InboxStatus {
  return v === "done" || v === "dismissed" ? v : "pending"
}

function asScanStatus(v: unknown): InboxScanStatus {
  return v === "failed" || v === "not_configured" ? v : "ok"
}

export function rowToInboxItem(row: Row): InboxItem {
  const file: UploadedFileMeta = {
    pathname: toStr(row.file_pathname),
    name: toStr(row.file_name),
    type: toStr(row.file_type),
    size: toInt(row.file_size),
    hash: toStr(row.file_hash),
  }
  const pid = row.preferred_project_id
  return {
    id: toInt(row.id),
    source: toStr(row.source) || "desktop",
    file,
    preferred_project_id: pid === null || pid === undefined ? null : toInt(pid),
    status: asStatus(row.status),
    scan_status: asScanStatus(row.scan_status),
    // 통화·인건비 필드가 생기기 전에 저장된 초안에는 그 필드가 없다(화면에서 원화 기본값으로 본다).
    drafts: asArray(row.drafts).filter((d): d is ReceiptDraft => !!d && typeof d === "object" && !Array.isArray(d)),
    warnings: asArray(row.warnings).map(toStr).filter(Boolean),
    duplicates: asArray(row.duplicates).filter((d): d is DuplicateReceipt => !!d && typeof d === "object"),
    possible_duplicates: asArray(row.possible_duplicates),
    error: toStr(row.error),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : toStr(row.created_at),
  }
}

export async function countPendingInbox(sql: Sql): Promise<number> {
  const rows = await sql`SELECT count(*)::int AS n FROM expense_inbox WHERE status = 'pending'`
  return toInt(rows[0]?.n)
}

// 오래된 것부터(먼저 올린 증빙이 표 위쪽)
export async function listInbox(sql: Sql, status: InboxStatus = "pending"): Promise<InboxItem[]> {
  const rows = await sql`
    SELECT id, source, file_pathname, file_name, file_type, file_size, file_hash, preferred_project_id,
           status, scan_status, drafts, warnings, duplicates, possible_duplicates, error, created_at
    FROM expense_inbox
    WHERE status = ${status}
    ORDER BY created_at ASC, id ASC
    LIMIT ${MAX_INBOX_LIST}
  `
  const items = rows.map(rowToInboxItem)
  return status === "pending" ? reconcileWithSaved(sql, items) : items
}

// 대기함 항목 중 일부(또는 전부)를 이미 저장했는데 pending으로 남은 경우(일부만 저장하고 떠남, 저장 후 done 처리 실패 등)를
// 읽는 시점에 바로잡는다. 업로드 때의 중복 정보는 낡았으므로 증빙 장부를 다시 조회한다.
//  - 같은 파일(경로 또는 해시)로 저장된 증빙을 duplicates로 덮어쓴다 → 웹 표에서 기본 선택이 해제되고 경고가 뜬다.
//  - 서버 중복 키(같은 파일 + 거래일·거래처·합계)가 같은 초안은 이미 저장된 것이므로 drafts에서 뺀다.
//  - 인식 초안이 있었는데 모두 저장된 항목은 done으로 돌리고 목록에서 뺀다(사람이 이미 저장한 것을 반영할 뿐, 새로 저장하지 않는다).
// 조회에 실패하면 원래 목록을 그대로 돌려준다(대기함 화면이 막히지 않게).
export function draftSavedKey(p: { issue_date: unknown; vendor_name: unknown; total_amount: unknown }): string {
  const total = p.total_amount === null || p.total_amount === undefined || p.total_amount === "" ? null : Number(p.total_amount)
  return `${toStr(p.issue_date).trim()}|${toStr(p.vendor_name).trim()}|${total}`
}

export async function reconcileWithSaved(sql: Sql, items: InboxItem[]): Promise<InboxItem[]> {
  if (items.length === 0) return items
  const paths = [...new Set(items.map((i) => i.file.pathname).filter(Boolean))]
  const hashes = [...new Set(items.map((i) => i.file.hash).filter((h): h is string => !!h))]
  let saved: Row[]
  try {
    saved = await sql`
      SELECT r.id, p.name AS project_name, to_char(r.issue_date, 'YYYY-MM-DD') AS issue_date,
             r.vendor_name, r.total_amount, r.file_pathname, r.file_hash
      FROM expense_receipts r
      JOIN expense_projects p ON p.id = r.project_id
      WHERE r.file_pathname = ANY(${paths}::text[]) OR (r.file_hash <> '' AND r.file_hash = ANY(${hashes}::text[]))
      ORDER BY r.id DESC
    `
  } catch (error) {
    console.error("Expense inbox duplicate refresh failed:", error)
    return items
  }
  if (saved.length === 0) return items

  const result: InboxItem[] = []
  const finished: number[] = []
  for (const item of items) {
    const hash = item.file.hash
    const same = saved.filter((r) => toStr(r.file_pathname) === item.file.pathname || (!!hash && toStr(r.file_hash) === hash))
    if (same.length === 0) {
      result.push(item)
      continue
    }
    const duplicates: DuplicateReceipt[] = same.slice(0, 10).map((r) => ({
      id: toInt(r.id),
      project_name: toStr(r.project_name),
      issue_date: toStr(r.issue_date),
      vendor_name: toStr(r.vendor_name),
      total_amount: Number(r.total_amount) || 0,
    }))
    const savedKeys = new Set(same.map((r) => draftSavedKey({ issue_date: r.issue_date, vendor_name: r.vendor_name, total_amount: r.total_amount })))
    const keep = item.drafts.map((d) => !savedKeys.has(draftSavedKey(d)))
    const drafts = item.drafts.filter((_, i) => keep[i])
    const similar = item.possible_duplicates
    const possible_duplicates = similar.length === item.drafts.length ? similar.filter((_, i) => keep[i]) : similar
    if (item.drafts.length > 0 && drafts.length === 0) {
      finished.push(item.id)
      continue
    }
    result.push({ ...item, drafts, possible_duplicates, duplicates })
  }

  if (finished.length > 0) {
    try {
      await sql`
        UPDATE expense_inbox SET status = 'done', updated_at = now()
        WHERE id = ANY(${finished}::int[]) AND status = 'pending'
      `
    } catch (error) {
      console.error("Expense inbox auto-done failed:", finished, error)
    }
  }
  return result
}

export interface InboxInsert {
  file: UploadedFileMeta
  preferred_project_id: number | null
  scan_status: InboxScanStatus
  drafts: ReceiptDraft[]
  warnings: string[]
  duplicates: DuplicateReceipt[]
  possible_duplicates: unknown[]
  error: string
  created_by: number | null
  source?: string
}

export async function insertInbox(sql: Sql, v: InboxInsert): Promise<number> {
  const rows = await sql`
    INSERT INTO expense_inbox (
      source, file_pathname, file_name, file_type, file_size, file_hash, preferred_project_id,
      scan_status, drafts, warnings, duplicates, possible_duplicates, error, created_by
    ) VALUES (
      ${v.source ?? "desktop"}, ${v.file.pathname}, ${v.file.name.slice(0, 300)}, ${v.file.type.slice(0, 100)},
      ${v.file.size}, ${v.file.hash}, ${v.preferred_project_id},
      ${v.scan_status}, ${JSON.stringify(v.drafts)}::jsonb, ${JSON.stringify(v.warnings)}::jsonb,
      ${JSON.stringify(v.duplicates)}::jsonb, ${JSON.stringify(v.possible_duplicates)}::jsonb,
      ${v.error}, ${v.created_by}
    )
    RETURNING id
  `
  return toInt(rows[0]?.id)
}

// 표에 인식 내용이 있는 초안 수(빈 직접 입력용 초안은 세지 않는다 — 웹 파일 카드의 '완료 · N건'과 같은 기준)
export function recognizedDrafts(drafts: ReceiptDraft[]): ReceiptDraft[] {
  return drafts.filter((d) => !!d.vendor_name || !!d.issue_date || d.total_amount !== null)
}
