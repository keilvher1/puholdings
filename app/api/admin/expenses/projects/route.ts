import { NextResponse } from "next/server"
import { del } from "@vercel/blob"
import {
  dbErrorMessage,
  fail,
  getProject,
  listProjects,
  parseId,
  parseProjectInput,
  requireAdminDb,
} from "@/lib/expense-db"

// 사업비 정산 — 사업·프로젝트
// GET    /api/admin/expenses/projects            → { success, projects: ExpenseProject[] } (활성 먼저, 최신순, 증빙 수·집행액 포함)
// POST   /api/admin/expenses/projects  ProjectInput → { success, project }
// PUT    /api/admin/expenses/projects  { id, ...ProjectInput 일부 또는 전체, status? } → { success, project }
//        보낸 필드만 바뀐다. 종료/재개는 { id, status: "closed" | "active" }만 보내도 된다.
// DELETE /api/admin/expenses/projects  { id }     → 증빙이 있으면 409

export const dynamic = "force-dynamic"

const PROJECT_FIELDS = [
  "name",
  "program_name",
  "agency",
  "description",
  "start_date",
  "end_date",
  "total_budget",
  "budget_items",
  "source_files",
] as const

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function GET() {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  try {
    const projects = await listProjects(auth.sql)
    return NextResponse.json({ success: true, projects })
  } catch (error) {
    console.error("Expense projects list error:", error)
    return fail(dbErrorMessage(error, "프로젝트 목록을 불러오지 못했습니다. 새로고침하세요."), 500)
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  const sql = auth.sql

  const body = await readJson(request)
  if (!body) return fail("요청 형식이 올바르지 않습니다", 400)
  const parsed = parseProjectInput(body)
  if (!parsed.ok) return fail(parsed.errors[0], 400, { errors: parsed.errors })
  const p = parsed.value

  try {
    // '이 프로젝트 등록'을 두 번 누른 경우 등 — 같은 이름·같은 시작일이면 중복 등록을 막는다.
    const dup = await sql`
      SELECT id FROM expense_projects
      WHERE name = ${p.name} AND start_date IS NOT DISTINCT FROM ${p.start_date}::date
      LIMIT 1
    `
    if (dup.length > 0) {
      return fail(`'${p.name}' 프로젝트가 이미 등록되어 있습니다. 목록에서 확인하세요.`, 409, { existing_id: Number(dup[0].id) })
    }

    const rows = await sql`
      INSERT INTO expense_projects
        (name, program_name, agency, description, start_date, end_date, total_budget, budget_items, source_files)
      VALUES
        (${p.name}, ${p.program_name}, ${p.agency}, ${p.description}, ${p.start_date}::date, ${p.end_date}::date,
         ${p.total_budget}::numeric, ${JSON.stringify(p.budget_items)}::jsonb, ${JSON.stringify(p.source_files)}::jsonb)
      RETURNING id
    `
    const project = await getProject(sql, Number(rows[0].id))
    return NextResponse.json({ success: true, project })
  } catch (error) {
    console.error("Expense project create error:", error)
    return fail(dbErrorMessage(error, "프로젝트를 저장하지 못했습니다. 잠시 후 다시 시도하세요."), 500)
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  const sql = auth.sql

  const body = await readJson(request)
  if (!body) return fail("요청 형식이 올바르지 않습니다", 400)
  const id = parseId(body.id)
  if (!id) return fail("수정할 프로젝트를 찾을 수 없습니다(id 누락)", 400)

  let status: "active" | "closed" | undefined
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "closed") return fail("상태는 진행 중(active) 또는 종료(closed)만 가능합니다", 400)
    status = body.status
  }

  try {
    const existing = await getProject(sql, id)
    if (!existing) return fail("이미 삭제되었거나 없는 프로젝트입니다. 새로고침하세요.", 404)

    // 보낸 필드만 덮어쓰고 나머지는 기존 값을 유지한 뒤 전체를 다시 검증한다.
    const merged: Record<string, unknown> = {}
    for (const key of PROJECT_FIELDS) merged[key] = key in body ? body[key] : existing[key]
    const parsed = parseProjectInput(merged)
    if (!parsed.ok) return fail(parsed.errors[0], 400, { errors: parsed.errors })
    const p = parsed.value
    const nextStatus = status ?? existing.status

    await sql`
      UPDATE expense_projects SET
        name = ${p.name},
        program_name = ${p.program_name},
        agency = ${p.agency},
        description = ${p.description},
        start_date = ${p.start_date}::date,
        end_date = ${p.end_date}::date,
        total_budget = ${p.total_budget}::numeric,
        budget_items = ${JSON.stringify(p.budget_items)}::jsonb,
        source_files = ${JSON.stringify(p.source_files)}::jsonb,
        status = ${nextStatus},
        updated_at = now()
      WHERE id = ${id}
    `
    const project = await getProject(sql, id)
    return NextResponse.json({ success: true, project })
  } catch (error) {
    console.error("Expense project update error:", error)
    return fail(dbErrorMessage(error, "프로젝트를 수정하지 못했습니다. 잠시 후 다시 시도하세요."), 500)
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  const sql = auth.sql

  const body = await readJson(request)
  const id = parseId(body?.id ?? new URL(request.url).searchParams.get("id"))
  if (!id) return fail("삭제할 프로젝트를 찾을 수 없습니다(id 누락)", 400)

  try {
    const existing = await getProject(sql, id)
    if (!existing) return fail("이미 삭제되었거나 없는 프로젝트입니다. 새로고침하세요.", 404)
    if (existing.receipt_count > 0) {
      return fail("증빙이 있는 프로젝트는 삭제할 수 없습니다(종료 처리하세요)", 409, { receipt_count: existing.receipt_count })
    }

    try {
      await sql`DELETE FROM expense_projects WHERE id = ${id}`
    } catch (error) {
      // 확인 직후 다른 창에서 증빙이 저장된 경우 — FK(ON DELETE RESTRICT)가 막는다.
      if ((error as { code?: string } | null)?.code === "23503") {
        return fail("증빙이 있는 프로젝트는 삭제할 수 없습니다(종료 처리하세요)", 409)
      }
      throw error
    }

    // 사업 자료 원본은 다른 프로젝트가 같은 파일을 쓰지 않을 때만 지운다
    // (한 번의 AI 분석에서 여러 프로젝트를 등록하면 같은 자료를 공유한다). 실패해도 삭제는 성공.
    for (const file of existing.source_files) {
      try {
        const shared = await sql`
          SELECT 1 FROM expense_projects
          WHERE source_files @> ${JSON.stringify([{ pathname: file.pathname }])}::jsonb
          LIMIT 1
        `
        if (shared.length === 0) await del(file.pathname)
      } catch (error) {
        console.error("Expense project source file cleanup failed:", file.pathname, error)
      }
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Expense project delete error:", error)
    return fail(dbErrorMessage(error, "프로젝트를 삭제하지 못했습니다. 잠시 후 다시 시도하세요."), 500)
  }
}
