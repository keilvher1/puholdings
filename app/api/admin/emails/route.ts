import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { sendBatch } from "@/lib/mail"
import { isMailEnabled } from "@/lib/runtime-flags"
import { NOT_CONFIGURED_SQL_PATTERNS, parseSince } from "@/lib/email-model"

const PAGE_SIZE = 200

// GET /api/admin/emails?status=sent|failed|queued — 발송 로그 (최근 200건)
//   since 가 없으면 예전과 똑같이 동작한다(응답 { success, logs }).
// GET /api/admin/emails?since=30d|90d|365d|YYYY-MM-DD[&status=failed|not_configured|sent|queued|all][&type=<template_code>][&q=][&page=]
//   기간 안 기록을 최근순 200건씩(page는 1부터). 응답에 상태별 건수(counts)·관련 청구서 상태(bill_status·bill_updated_at)·메일 켜짐 여부를 더한다.
//   status=failed는 "설정 안 됨" 실패(메일 env가 없어 보내지 않은 기록)를 빼고, not_configured는 그것만 센다(계획서 4.1.6).
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }

  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")

    if (searchParams.has("since")) {
      const since = parseSince(searchParams.get("since"))
      if (!since) {
        return NextResponse.json({ success: false, error: "조회 기간이 맞지 않아요. 다시 골라 주세요" }, { status: 400 })
      }
      const view = status === "failed" || status === "not_configured" || status === "sent" || status === "queued" ? status : "all"
      const type = searchParams.get("type")?.trim() || null
      const q = searchParams.get("q")?.trim().slice(0, 100) || null
      const like = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null
      const pageNum = Math.max(1, Math.min(1000, Number(searchParams.get("page")) || 1))
      const offset = (pageNum - 1) * PAGE_SIZE
      const [p1, p2] = NOT_CONFIGURED_SQL_PATTERNS

      const [rows, countRows] = (await sql.transaction(
        [
          sql`
            SELECT l.id, l.to_email, l.tenant_id, l.template_code, l.subject, l.status, l.error,
                   l.related_type, l.related_id, l.sent_at, l.created_at, t.name AS tenant_name,
                   b.status AS bill_status, b.updated_at AS bill_updated_at, b.period AS bill_period
            FROM email_logs l
            LEFT JOIN tenants t ON t.id = l.tenant_id
            LEFT JOIN bills b ON l.related_type = 'bill' AND b.id = l.related_id
            WHERE l.created_at >= ${since}::timestamptz
              AND (${type}::text IS NULL OR l.template_code = ${type}::text)
              AND (${like}::text IS NULL OR t.name ILIKE ${like}::text OR l.to_email ILIKE ${like}::text OR l.subject ILIKE ${like}::text)
              AND (
                ${view}::text = 'all'
                OR (${view}::text = 'failed' AND l.status = 'failed' AND NOT (COALESCE(l.error, '') LIKE ${p1} OR COALESCE(l.error, '') LIKE ${p2}))
                OR (${view}::text = 'not_configured' AND l.status = 'failed' AND (COALESCE(l.error, '') LIKE ${p1} OR COALESCE(l.error, '') LIKE ${p2}))
                OR (${view}::text IN ('sent', 'queued') AND l.status = ${view}::text)
              )
            ORDER BY l.created_at DESC, l.id DESC
            LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
          `,
          sql`
            SELECT
              COUNT(*) FILTER (WHERE l.status = 'failed' AND NOT (COALESCE(l.error, '') LIKE ${p1} OR COALESCE(l.error, '') LIKE ${p2}))::int AS failed,
              COUNT(*) FILTER (WHERE l.status = 'failed' AND (COALESCE(l.error, '') LIKE ${p1} OR COALESCE(l.error, '') LIKE ${p2}))::int AS not_configured,
              COUNT(*) FILTER (WHERE l.status = 'sent')::int AS sent,
              COUNT(*) FILTER (WHERE l.status = 'queued')::int AS queued,
              COUNT(*)::int AS total
            FROM email_logs l
            LEFT JOIN tenants t ON t.id = l.tenant_id
            WHERE l.created_at >= ${since}::timestamptz
              AND (${type}::text IS NULL OR l.template_code = ${type}::text)
              AND (${like}::text IS NULL OR t.name ILIKE ${like}::text OR l.to_email ILIKE ${like}::text OR l.subject ILIKE ${like}::text)
          `,
        ],
        { readOnly: true },
      )) as Record<string, unknown>[][]

      const c = countRows[0] ?? {}
      return NextResponse.json({
        success: true,
        logs: rows.slice(0, PAGE_SIZE),
        has_more: rows.length > PAGE_SIZE,
        page: pageNum,
        since,
        mail_enabled: isMailEnabled(),
        counts: {
          failed: Number(c.failed) || 0,
          not_configured: Number(c.not_configured) || 0,
          sent: Number(c.sent) || 0,
          queued: Number(c.queued) || 0,
          all: Number(c.total) || 0,
        },
      })
    }

    const rows =
      status === "sent" || status === "failed" || status === "queued"
        ? await sql`
            SELECT l.id, l.to_email, l.tenant_id, l.template_code, l.subject, l.status, l.error,
                   l.related_type, l.related_id, l.sent_at, l.created_at, t.name AS tenant_name
            FROM email_logs l
            LEFT JOIN tenants t ON t.id = l.tenant_id
            WHERE l.status = ${status}
            ORDER BY l.created_at DESC
            LIMIT 200
          `
        : await sql`
            SELECT l.id, l.to_email, l.tenant_id, l.template_code, l.subject, l.status, l.error,
                   l.related_type, l.related_id, l.sent_at, l.created_at, t.name AS tenant_name
            FROM email_logs l
            LEFT JOIN tenants t ON t.id = l.tenant_id
            ORDER BY l.created_at DESC
            LIMIT 200
          `
    return NextResponse.json({ success: true, logs: rows })
  } catch (error) {
    console.error("List email logs error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// POST /api/admin/emails — 수동 발송 (수신 기업 다중 선택 + 제목/본문 직접 작성)
// body: { tenant_ids: number[], subject: string, body_html: string }
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }

  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }

  try {
    const { tenant_ids, subject, body_html } = await request.json()

    if (!Array.isArray(tenant_ids) || tenant_ids.length === 0) {
      return NextResponse.json({ success: false, error: "수신 기업을 선택해주세요" }, { status: 400 })
    }
    if (!subject || !body_html) {
      return NextResponse.json({ success: false, error: "제목과 본문을 입력해주세요" }, { status: 400 })
    }

    const ids = tenant_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)

    // 수신 주소: 포털 계정 이메일 우선, 없으면 담당자 이메일. 입주 중인 기업만.
    const recipients = await sql`
      SELECT t.id, t.name, COALESCE(u.email, t.contact_email) AS email
      FROM tenants t
      LEFT JOIN tenant_users u ON u.tenant_id = t.id
      WHERE t.id = ANY(${ids}) AND t.status = 'active'
    `

    const skipped = recipients.filter((r) => !r.email).map((r) => r.name)
    const portalUrl = `${new URL(request.url).origin}/portal/login`

    // Resend batch API 사용 (건별 순차 호출은 rate limit(2req/s)에 걸린다)
    const result = await sendBatch(
      recipients
        .filter((r) => r.email)
        .map((r) => ({
          to: r.email,
          tenantId: r.id,
          vars: { tenant_name: r.name, portal_url: portalUrl },
        })),
      "manual",
      { subject, html: body_html }
    )

    return NextResponse.json({ success: true, sent: result.sent, failed: result.failed, skipped })
  } catch (error) {
    console.error("Manual send error:", error)
    return NextResponse.json({ success: false, error: "발송에 실패했습니다" }, { status: 500 })
  }
}
