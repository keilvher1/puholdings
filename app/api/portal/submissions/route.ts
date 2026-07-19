import { NextResponse } from "next/server"
import { getPortalSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { todayKST } from "@/lib/programs"
import { isSafePathname } from "@/lib/upload"

interface AttachmentInput {
  name?: unknown
  pathname?: unknown
  size?: unknown
  type?: unknown
}

// 첨부 검증: 본인 tenant 프리픽스(submissions/{tenant_id}/)의 pathname만 허용
function normalizeAttachments(
  value: unknown,
  tenantId: number
): { ok: true; json: string } | { ok: false; error: string } {
  if (!Array.isArray(value)) return { ok: true, json: "[]" }
  const prefix = `submissions/${tenantId}/`
  const cleaned = []
  for (const raw of value as AttachmentInput[]) {
    if (!raw || typeof raw.pathname !== "string") continue
    // '..' 경로 이동으로 타 기업 파일을 참조하지 못하도록 안전성 검사 후 프리픽스 확인
    if (!isSafePathname(raw.pathname) || !raw.pathname.startsWith(prefix)) {
      return { ok: false, error: "본인 계정으로 업로드한 파일만 첨부할 수 있습니다" }
    }
    cleaned.push({
      name: typeof raw.name === "string" ? raw.name : raw.pathname,
      pathname: raw.pathname,
      size: Number(raw.size) || 0,
      type: typeof raw.type === "string" ? raw.type : "",
    })
  }
  return { ok: true, json: JSON.stringify(cleaned) }
}

// 제출 가능 조건 공통 검증: 본인 신청이 accepted, 프로그램이 draft/archived 아님, 마감 전
async function checkSubmittable(
  sql: NonNullable<ReturnType<typeof getDb>>,
  programId: number,
  tenantId: number
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const rows = await sql`
    SELECT p.status AS program_status, p.submit_deadline::text AS submit_deadline,
           a.status AS application_status
    FROM programs p
    LEFT JOIN program_applications a ON a.program_id = p.id AND a.tenant_id = ${tenantId}
    WHERE p.id = ${programId}
  `
  if (rows.length === 0) {
    return { ok: false, error: "프로그램을 찾을 수 없습니다", status: 404 }
  }
  const row = rows[0]
  if (row.program_status === "draft" || row.program_status === "archived") {
    return { ok: false, error: "제출할 수 없는 프로그램입니다", status: 400 }
  }
  if (row.application_status !== "accepted") {
    return { ok: false, error: "선정된 기업만 제출할 수 있습니다", status: 403 }
  }
  if (row.submit_deadline && todayKST() > row.submit_deadline) {
    return { ok: false, error: "제출 마감일이 지났습니다", status: 400 }
  }
  return { ok: true }
}

// POST /api/portal/submissions — { program_id, title, note, attachments } 최초 제출
export async function POST(request: Request) {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const { program_id, title, note, attachments } = await request.json()
    const programId = Number(program_id)
    if (!Number.isInteger(programId) || programId <= 0) {
      return NextResponse.json({ success: false, error: "program_id가 필요합니다" }, { status: 400 })
    }

    const check = await checkSubmittable(sql, programId, session.tenant_id)
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: check.status })
    }
    const atts = normalizeAttachments(attachments, session.tenant_id)
    if (!atts.ok) {
      return NextResponse.json({ success: false, error: atts.error }, { status: 400 })
    }

    const inserted = await sql`
      INSERT INTO submissions (program_id, tenant_id, title, note, attachments)
      VALUES (${programId}, ${session.tenant_id}, ${title || null}, ${note || null}, ${atts.json}::jsonb)
      ON CONFLICT (program_id, tenant_id) DO NOTHING
      RETURNING id
    `
    if (inserted.length === 0) {
      return NextResponse.json(
        { success: false, error: "이미 제출한 프로그램입니다. 기존 제출물을 수정해주세요" },
        { status: 409 }
      )
    }
    return NextResponse.json({ success: true, id: inserted[0].id })
  } catch (error) {
    console.error("Portal submission create error:", error)
    return NextResponse.json({ success: false, error: "제출에 실패했습니다" }, { status: 500 })
  }
}

// PUT /api/portal/submissions — { id, title, note, attachments } 수정/재제출
// 본인 제출물이면서 status가 submitted(검토 전) 또는 resubmit_requested일 때만.
// 재제출 시 status는 submitted로 돌아간다.
export async function PUT(request: Request) {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const { id, title, note, attachments } = await request.json()
    const subId = Number(id)
    if (!Number.isInteger(subId) || subId <= 0) {
      return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    }

    // 본인 것만 조회 (타 기업 제출물 id는 404)
    const rows = await sql`
      SELECT id, program_id, status FROM submissions
      WHERE id = ${subId} AND tenant_id = ${session.tenant_id}
    `
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "제출물을 찾을 수 없습니다" }, { status: 404 })
    }
    const sub = rows[0]
    if (sub.status !== "submitted" && sub.status !== "resubmit_requested") {
      return NextResponse.json(
        { success: false, error: "검토가 진행 중이거나 완료된 제출물은 수정할 수 없습니다" },
        { status: 400 }
      )
    }

    const check = await checkSubmittable(sql, sub.program_id, session.tenant_id)
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: check.status })
    }
    const atts = normalizeAttachments(attachments, session.tenant_id)
    if (!atts.ok) {
      return NextResponse.json({ success: false, error: atts.error }, { status: 400 })
    }

    await sql`
      UPDATE submissions
      SET title = ${title || null}, note = ${note || null}, attachments = ${atts.json}::jsonb,
          status = 'submitted', updated_at = NOW()
      WHERE id = ${subId} AND tenant_id = ${session.tenant_id}
    `
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Portal submission update error:", error)
    return NextResponse.json({ success: false, error: "제출에 실패했습니다" }, { status: 500 })
  }
}
