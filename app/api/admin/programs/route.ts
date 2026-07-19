import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { sendBatch, type BatchRecipient } from "@/lib/mail"
import { isValidDateString } from "@/lib/billing"

function normalizeDate(value: unknown): string | null {
  return isValidDateString(value) ? value : null
}

function normalizeAttachments(value: unknown): string {
  if (!Array.isArray(value)) return "[]"
  const cleaned = value
    .filter((a) => a && typeof a === "object" && typeof (a as { pathname?: unknown }).pathname === "string")
    .map((a) => {
      const att = a as { name?: unknown; pathname: string; size?: unknown; type?: unknown }
      return {
        name: typeof att.name === "string" ? att.name : att.pathname,
        pathname: att.pathname,
        size: Number(att.size) || 0,
        type: typeof att.type === "string" ? att.type : "",
      }
    })
  return JSON.stringify(cleaned)
}

const VALID_STATUS = ["draft", "open", "closed", "archived"]

// GET /api/admin/programs — 목록(신청/제출 수 포함). ?id= 지정 시 단건
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
    const id = searchParams.get("id")

    if (id) {
      const programId = Number(id)
      if (!Number.isInteger(programId) || programId <= 0) {
        return NextResponse.json({ success: false, error: "잘못된 id입니다" }, { status: 400 })
      }
      const rows = await sql`
        SELECT p.*, p.apply_start::text AS apply_start, p.apply_end::text AS apply_end,
               p.submit_deadline::text AS submit_deadline
        FROM programs p WHERE p.id = ${programId}
      `
      if (rows.length === 0) {
        return NextResponse.json({ success: false, error: "존재하지 않는 프로그램입니다" }, { status: 404 })
      }
      return NextResponse.json({ success: true, program: rows[0] })
    }

    const rows = await sql`
      SELECT p.*, p.apply_start::text AS apply_start, p.apply_end::text AS apply_end,
             p.submit_deadline::text AS submit_deadline,
             (SELECT COUNT(*)::int FROM program_applications a WHERE a.program_id = p.id) AS application_count,
             (SELECT COUNT(*)::int FROM submissions s WHERE s.program_id = p.id) AS submission_count
      FROM programs p
      ORDER BY p.created_at DESC
    `
    return NextResponse.json({ success: true, programs: rows })
  } catch (error) {
    console.error("List programs error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// POST /api/admin/programs — 등록 (기본 draft)
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
    const { title, description, category, apply_start, apply_end, submit_deadline, status, attachments } =
      await request.json()
    if (!title) {
      return NextResponse.json({ success: false, error: "제목은 필수입니다" }, { status: 400 })
    }
    const newStatus = VALID_STATUS.includes(status) ? status : "draft"

    const rows = await sql`
      INSERT INTO programs (title, description, category, apply_start, apply_end, submit_deadline, status, attachments)
      VALUES (
        ${title},
        ${description || null},
        ${category || null},
        ${normalizeDate(apply_start)},
        ${normalizeDate(apply_end)},
        ${normalizeDate(submit_deadline)},
        ${newStatus},
        ${normalizeAttachments(attachments)}::jsonb
      )
      RETURNING id
    `
    // draft가 아닌 open으로 바로 만드는 경우에도 공지 메일 발송
    if (newStatus === "open") {
      await notifyProgramOpen(rows[0].id, request)
    }
    return NextResponse.json({ success: true, id: rows[0].id })
  } catch (error) {
    console.error("Create program error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}

// PUT /api/admin/programs — 수정. draft→open 전환 시 active 입주기업 전체에 program_notice 발송
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const { id, title, description, category, apply_start, apply_end, submit_deadline, status, attachments } =
      await request.json()
    const programId = Number(id)
    if (!Number.isInteger(programId) || programId <= 0 || !title) {
      return NextResponse.json({ success: false, error: "id와 제목은 필수입니다" }, { status: 400 })
    }
    if (!VALID_STATUS.includes(status)) {
      return NextResponse.json({ success: false, error: "잘못된 상태입니다" }, { status: 400 })
    }

    const existing = await sql`SELECT status FROM programs WHERE id = ${programId}`
    if (existing.length === 0) {
      return NextResponse.json({ success: false, error: "존재하지 않는 프로그램입니다" }, { status: 404 })
    }
    const oldStatus = existing[0].status

    await sql`
      UPDATE programs
      SET title = ${title},
          description = ${description || null},
          category = ${category || null},
          apply_start = ${normalizeDate(apply_start)},
          apply_end = ${normalizeDate(apply_end)},
          submit_deadline = ${normalizeDate(submit_deadline)},
          status = ${status},
          attachments = ${normalizeAttachments(attachments)}::jsonb,
          updated_at = NOW()
      WHERE id = ${programId}
    `

    let mail: { sent: number; failed: number } | null = null
    if (oldStatus === "draft" && status === "open") {
      mail = await notifyProgramOpen(programId, request)
    }
    return NextResponse.json({ success: true, mail })
  } catch (error) {
    console.error("Update program error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}

// DELETE /api/admin/programs?id=1 — 신청/제출은 CASCADE로 함께 삭제
export async function DELETE(request: Request) {
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
    const id = Number(searchParams.get("id"))
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    }
    const rows = await sql`DELETE FROM programs WHERE id = ${id} RETURNING id`
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "존재하지 않는 프로그램입니다" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete program error:", error)
    return NextResponse.json({ success: false, error: "삭제에 실패했습니다" }, { status: 500 })
  }
}

// active 입주기업 전체에 program_notice 발송 (포털 계정 이메일 우선, 없으면 담당자 이메일)
async function notifyProgramOpen(programId: number, request: Request): Promise<{ sent: number; failed: number }> {
  const sql = getDb()
  if (!sql) return { sent: 0, failed: 0 }
  try {
    const [programs, tenants] = await Promise.all([
      sql`
        SELECT title, apply_start::text AS apply_start, apply_end::text AS apply_end
        FROM programs WHERE id = ${programId}
      `,
      sql`
        SELECT t.id, t.name, COALESCE(u.email, t.contact_email) AS email
        FROM tenants t
        LEFT JOIN tenant_users u ON u.tenant_id = t.id
        WHERE t.status = 'active'
      `,
    ])
    if (programs.length === 0) return { sent: 0, failed: 0 }
    const program = programs[0]
    const portalUrl = `${new URL(request.url).origin}/portal/login`
    const period =
      program.apply_start || program.apply_end
        ? `${program.apply_start ?? ""} ~ ${program.apply_end ?? ""}`
        : "공고 참조"

    const recipients: BatchRecipient[] = tenants
      .filter((t) => t.email)
      .map((t) => ({
        to: t.email,
        tenantId: t.id,
        related: { type: "program", id: programId },
        vars: {
          tenant_name: t.name,
          program_name: program.title,
          program_period: period,
          apply_due: program.apply_end ?? "공고 참조",
          portal_url: portalUrl,
        },
      }))
    const result = await sendBatch(recipients, "program_notice")
    return { sent: result.sent, failed: result.failed }
  } catch (error) {
    console.error("Program notice mail error:", error)
    return { sent: 0, failed: 0 }
  }
}
