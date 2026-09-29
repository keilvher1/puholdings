import { NextResponse } from "next/server"
import { del } from "@vercel/blob"
import { getSession } from "@/lib/auth"
import { INBOX_STATUSES, type InboxListResponse, type InboxStatus, type InboxUploadResponse } from "@/lib/expenses"
import { fail, parseId, requireAdminDb } from "@/lib/expense-db"
import { scanUploadedReceipt } from "@/lib/expense-scan"
import { countPendingInbox, inboxDbErrorMessage, insertInbox, listInbox, recognizedDrafts } from "@/lib/expense-inbox"
import { notifyInboxArrival } from "@/lib/messenger-notify"

// 확인 대기함 — 데스크톱 앱(포연기 증빙함)이 끌어다 놓은 증빙을 받아 둔다.
//
// POST multipart: file(1개, 사진·PDF 4MB 이하) + original_hash(선택, 원본 sha256) + preferred_project_id(선택, 활성 프로젝트만)
//   → 파일 검사 → 원본 보관(Blob) → 자동 인식(/scan과 같은 로직) → expense_inbox에 pending으로 저장.
//   인식이 실패하거나 설정되지 않아도 파일은 보관하고 저장한다(scan_status 'failed' / 'not_configured').
//   증빙 장부(expense_receipts)에는 넣지 않는다 — 웹 '증빙 올리기' 화면에서 사람이 확인·저장한다.
//   200 InboxUploadResponse · 파일 검사 실패 400 { success:false, error }
// GET ?status=pending(기본)|done|dismissed → InboxListResponse(오래된 순, 최대 200)
// PATCH { ids: number[], status: 'done' | 'dismissed' } → { success:true, updated } (pending인 것만 바뀐다)
// DELETE { id } → dismissed로 바꾸고, 그 원본을 쓰는 증빙·다른 대기 항목이 없으면 Blob 원본도 지운다.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const NOT_CONFIGURED_NOTE = "자동 인식 미설정 · 웹에서 직접 입력"

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  const sql = auth.sql
  const session = await getSession()

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return fail("파일을 받지 못했습니다. 4MB 이하 파일로 다시 시도하세요.", 400)
  }

  const out = await scanUploadedReceipt(sql, formData)
  if (out.stage === "rejected") return fail(out.error, out.status)

  // 앱에서 고른 기본 프로젝트는 진행 중인 프로젝트일 때만 받는다.
  const wanted = parseId(formData.get("preferred_project_id"))
  const preferred = wanted !== null && out.projects.some((p) => p.id === wanted) ? wanted : null

  const drafts = out.stage === "ok" ? out.drafts : []
  const scanStatus = out.stage === "ok" ? "ok" : out.stage === "not_configured" || out.needsSetup ? "not_configured" : "failed"
  const error = out.stage === "ok" ? "" : out.stage === "not_configured" ? NOT_CONFIGURED_NOTE : out.message

  let id: number
  let pending: number
  try {
    id = await insertInbox(sql, {
      file: out.file,
      preferred_project_id: preferred,
      scan_status: scanStatus,
      drafts,
      warnings: out.stage === "ok" ? out.warnings : [],
      duplicates: out.duplicates,
      possible_duplicates: out.stage === "ok" ? out.possible_duplicates : [],
      error,
      created_by: session?.id ? Number(session.id) || null : null,
    })
    pending = await countPendingInbox(sql)
  } catch (e) {
    console.error("Expense inbox insert error:", e)
    // 방금 보관한 원본은 아무 데도 연결되지 않았으므로 지운다(실패해도 무시).
    try {
      await del(out.file.pathname)
    } catch (cleanup) {
      console.error("Expense inbox blob cleanup failed:", out.file.pathname, cleanup)
    }
    return fail(inboxDbErrorMessage(e, "확인 대기함에 저장하지 못했습니다. 잠시 후 다시 시도하세요."), 500)
  }

  const first = recognizedDrafts(drafts)[0]
  const body: InboxUploadResponse = {
    success: true,
    item: {
      id,
      file_name: out.file.name,
      scan_status: scanStatus,
      error,
      drafts_count: recognizedDrafts(drafts).length,
      first: first ? { vendor_name: first.vendor_name, total_amount: first.total_amount, issue_date: first.issue_date } : null,
    },
    pending_count: pending,
  }
  // 메신저 시스템 알림(응답 후 실행). 3분 안에 연달아 오면 대기 건수 요약만 보낸다.
  notifyInboxArrival(sql, { id, file_name: out.file.name, scan_status: scanStatus, first: body.item.first, pending })
  return NextResponse.json(body)
}

export async function GET(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  const sql = auth.sql

  const raw = new URL(request.url).searchParams.get("status") ?? "pending"
  if (!(INBOX_STATUSES as readonly string[]).includes(raw)) return fail("status는 pending·done·dismissed 중 하나여야 합니다", 400)

  try {
    // 목록을 읽을 때 이미 저장된 항목이 done으로 정리될 수 있으므로 건수는 그다음에 센다.
    const items = await listInbox(sql, raw as InboxStatus)
    const pending = await countPendingInbox(sql)
    const body: InboxListResponse = { success: true, items, pending_count: pending }
    return NextResponse.json(body)
  } catch (e) {
    console.error("Expense inbox list error:", e)
    return fail(inboxDbErrorMessage(e, "확인 대기함을 불러오지 못했습니다. 잠시 후 다시 시도하세요."), 500)
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  const sql = auth.sql

  const body = await readJson(request)
  const status = body?.status
  if (status !== "done" && status !== "dismissed") return fail("status는 done 또는 dismissed여야 합니다", 400)
  const rawIds = Array.isArray(body?.ids) ? body.ids : null
  if (!rawIds || rawIds.length === 0) return fail("ids(대기 항목 번호 목록)를 보내세요", 400)
  if (rawIds.length > 500) return fail("한 번에 500건까지 처리할 수 있습니다", 400)
  const ids = rawIds.map(parseId)
  if (ids.some((v) => v === null)) return fail("ids에 올바르지 않은 번호가 있습니다", 400)

  try {
    const rows = await sql`
      UPDATE expense_inbox SET status = ${status}, updated_at = now()
      WHERE id = ANY(${ids as number[]}::int[]) AND status = 'pending'
      RETURNING id
    `
    return NextResponse.json({ success: true, updated: rows.length })
  } catch (e) {
    console.error("Expense inbox update error:", e)
    return fail(inboxDbErrorMessage(e, "확인 대기함을 갱신하지 못했습니다. 잠시 후 다시 시도하세요."), 500)
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  const sql = auth.sql

  const body = await readJson(request)
  const id = parseId(body?.id ?? new URL(request.url).searchParams.get("id"))
  if (!id) return fail("제외할 대기 항목을 찾을 수 없습니다(id 누락)", 400)

  let pathname: string
  try {
    const rows = await sql`
      UPDATE expense_inbox SET status = 'dismissed', updated_at = now()
      WHERE id = ${id} AND status = 'pending'
      RETURNING file_pathname
    `
    if (rows.length === 0) {
      const exists = await sql`SELECT 1 FROM expense_inbox WHERE id = ${id}`
      if (exists.length === 0) return fail("없는 대기 항목입니다. 새로고침하세요.", 404)
      // 이미 저장·제외된 항목 — 할 일 없음
      return NextResponse.json({ success: true })
    }
    pathname = String(rows[0].file_pathname)
  } catch (e) {
    console.error("Expense inbox dismiss error:", e)
    return fail(inboxDbErrorMessage(e, "대기 항목을 제외하지 못했습니다. 잠시 후 다시 시도하세요."), 500)
  }

  // 그 원본으로 저장된 증빙이나 같은 원본을 쓰는 다른 대기 항목이 없을 때만 원본을 지운다. 실패해도 성공으로 응답한다.
  try {
    const [receipts, others] = await Promise.all([
      sql`SELECT 1 FROM expense_receipts WHERE file_pathname = ${pathname} LIMIT 1`,
      sql`SELECT 1 FROM expense_inbox WHERE file_pathname = ${pathname} AND status = 'pending' AND id <> ${id} LIMIT 1`,
    ])
    if (receipts.length === 0 && others.length === 0) await del(pathname)
  } catch (e) {
    console.error("Expense inbox blob cleanup failed:", pathname, e)
  }
  return NextResponse.json({ success: true })
}
