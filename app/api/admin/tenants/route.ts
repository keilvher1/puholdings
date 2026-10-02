import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { RECEIVABLE_SQL } from "@/lib/receivables"
import { todayKST } from "@/lib/format"
import {
  businessNoError,
  emailError,
  formatBusinessNo,
  isValidDateText,
  type TenantFieldErrors,
} from "@/lib/tenant-model"

// 입주기업 API.
// GET    ?status=active|moved_out — 목록(계정 유무 + 진행 중 계약 호실·청구서 받을 메일·받을 돈). 기존 필드는 그대로, 필드만 추가.
// POST   — 등록. tax_email·manager_name 저장, 형식 오류는 field_errors.
// PUT    — 수정(body에 id). **키가 없으면 기존 값 유지, 빈 문자열(또는 null)만 NULL**, status도 키가 없으면 유지.
//          형식 검증(사업자번호·이메일·날짜)은 값이 바뀐 칸에만 한다(운영의 형식 어긋난 기존 값 때문에 메모·상태 저장이 막히지 않게).
//          오류 응답: { success: false, error, field_errors?: { business_no?, tax_email?, contact_email?, … } }
// DELETE ?id= — 삭제(tenant_users·계약·청구서는 CASCADE). 동작 그대로.

const TEXT_FIELDS = ["business_no", "ceo_name", "room_no", "contact_email", "contact_phone", "memo", "tax_email", "manager_name"] as const
type TextField = (typeof TEXT_FIELDS)[number]
const DATE_FIELDS = ["move_in_date", "move_out_date"] as const
type DateField = (typeof DATE_FIELDS)[number]

const FIELD_ERROR_MESSAGE = "입력한 내용을 확인해 주세요"

function unauthorized() {
  return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
}
function noDb() {
  return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
}
function fieldErrorResponse(field_errors: TenantFieldErrors) {
  const first = Object.values(field_errors)[0]
  return NextResponse.json({ success: false, error: first ?? FIELD_ERROR_MESSAGE, field_errors }, { status: 400 })
}

/** 문자열 칸 값: 빈 문자열·null → null, 그 밖은 앞뒤 공백을 뺀 문자열 */
function textValue(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === "" ? null : s
}

/** 등록·수정 공통 형식 검증. check 집합에 든 칸만 본다 */
function validate(values: Partial<Record<TextField | DateField, string | null>>, check: Set<string>): TenantFieldErrors {
  const errors: TenantFieldErrors = {}
  if (check.has("business_no")) {
    const e = businessNoError(values.business_no)
    if (e) errors.business_no = e
  }
  if (check.has("tax_email")) {
    const e = emailError(values.tax_email, "청구서 받을 메일")
    if (e) errors.tax_email = e
  }
  if (check.has("contact_email")) {
    const e = emailError(values.contact_email, "담당자 메일")
    if (e) errors.contact_email = e
  }
  for (const k of DATE_FIELDS) {
    if (!check.has(k)) continue
    const v = values[k]
    if (v && !isValidDateText(v)) errors[k] = "날짜를 YYYY-MM-DD 형식으로 골라 주세요"
  }
  return errors
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return unauthorized()

  const sql = getDb()
  if (!sql) return noDb()

  try {
    const { searchParams } = new URL(request.url)
    const raw = searchParams.get("status")
    const status = raw === "active" || raw === "moved_out" ? raw : null
    const R = RECEIVABLE_SQL("b", todayKST())

    // DATE는 텍스트로 캐스팅: JS Date 직렬화(UTC 변환)로 인한 하루 밀림 방지
    const rows = await sql`
      SELECT t.id, t.name, t.business_no, t.ceo_name, t.room_no, t.contact_email, t.contact_phone,
             t.move_in_date::text AS move_in_date, t.move_out_date::text AS move_out_date,
             t.status, t.memo, t.overpaid_balance, t.created_at, t.updated_at,
             u.id AS account_id, u.email AS account_email, u.last_login AS account_last_login,
             t.tax_email, t.manager_name,
             c.contract_rooms, COALESCE(c.active_contracts, 0)::int AS active_contracts, c.contract_start,
             COALESCE(r.unpaid_count, 0)::int AS unpaid_count,
             COALESCE(r.unpaid_total, 0)::text AS unpaid_total,
             COALESCE(r.unpaid_late_count, 0)::int AS unpaid_late_count
      FROM tenants t
      LEFT JOIN tenant_users u ON u.tenant_id = t.id
      LEFT JOIN LATERAL (
        SELECT string_agg(rm.code, ', ' ORDER BY rm.sort_order, rm.code) AS contract_rooms,
               COUNT(*) AS active_contracts,
               MIN(ct.start_date)::text AS contract_start
        FROM contracts ct JOIN rooms rm ON rm.id = ct.room_id
        WHERE ct.tenant_id = t.id AND ct.status = 'active'
      ) c ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS unpaid_count,
               SUM(b.total_amount) AS unpaid_total,
               COUNT(*) FILTER (WHERE ${sql.unsafe(R.isLate)}) AS unpaid_late_count
        FROM bills b
        WHERE b.tenant_id = t.id AND ${sql.unsafe(R.isReceivable)}
      ) r ON TRUE
      WHERE (${status}::text IS NULL OR t.status = ${status})
      ORDER BY t.status, t.room_no NULLS LAST, t.name
    `
    return NextResponse.json({ success: true, tenants: rows })
  } catch (error) {
    console.error("List tenants error:", error)
    return NextResponse.json({ success: false, error: "목록을 불러오지 못했습니다" }, { status: 500 })
  }
}

// ── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return unauthorized()

  const sql = getDb()
  if (!sql) return noDb()

  try {
    const body = (await request.json()) as Record<string, unknown>
    const name = textValue(body.name)
    if (!name) {
      return NextResponse.json({ success: false, error: "기업명은 필수입니다", field_errors: { name: "기업명을 입력해 주세요" } }, { status: 400 })
    }

    const values: Partial<Record<TextField | DateField, string | null>> = {}
    for (const k of TEXT_FIELDS) values[k] = textValue(body[k])
    for (const k of DATE_FIELDS) values[k] = textValue(body[k])
    const errors = validate(values, new Set([...TEXT_FIELDS, ...DATE_FIELDS]))
    if (Object.keys(errors).length > 0) return fieldErrorResponse(errors)
    if (values.business_no) values.business_no = formatBusinessNo(values.business_no)

    const rows = await sql`
      INSERT INTO tenants (name, business_no, ceo_name, room_no, contact_email, contact_phone, move_in_date, move_out_date, status, memo, tax_email, manager_name)
      VALUES (
        ${name},
        ${values.business_no ?? null},
        ${values.ceo_name ?? null},
        ${values.room_no ?? null},
        ${values.contact_email ?? null},
        ${values.contact_phone ?? null},
        ${values.move_in_date ?? null},
        ${values.move_out_date ?? null},
        ${body.status === "moved_out" ? "moved_out" : "active"},
        ${values.memo ?? null},
        ${values.tax_email ?? null},
        ${values.manager_name ?? null}
      )
      RETURNING *
    `
    return NextResponse.json({ success: true, tenant: rows[0] })
  } catch (error) {
    console.error("Create tenant error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}

// ── PUT ─────────────────────────────────────────────────────────────────────

export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) return unauthorized()

  const sql = getDb()
  if (!sql) return noDb()

  try {
    const body = (await request.json()) as Record<string, unknown>
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "요청 형식이 올바르지 않습니다" }, { status: 400 })
    }
    const id = Number(body.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    }
    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined

    const currentRows = await sql`
      SELECT id, name, business_no, ceo_name, room_no, contact_email, contact_phone,
             move_in_date::text AS move_in_date, move_out_date::text AS move_out_date,
             status, memo, tax_email, manager_name
      FROM tenants WHERE id = ${id}
    `
    if (currentRows.length === 0) {
      return NextResponse.json({ success: false, error: "존재하지 않는 기업입니다" }, { status: 404 })
    }
    const current = currentRows[0] as Record<string, string | null>
    const errors: TenantFieldErrors = {}

    // 기업명: 키가 있으면 비울 수 없다
    let name: string | null = null
    if (has("name")) {
      name = textValue(body.name)
      if (!name) errors.name = "기업명을 입력해 주세요"
    }

    // 문자열·날짜 칸: 키가 있으면 그 값(빈 문자열·null → NULL), 바뀐 칸만 형식 검증
    const values: Partial<Record<TextField | DateField, string | null>> = {}
    const changed = new Set<string>()
    for (const k of [...TEXT_FIELDS, ...DATE_FIELDS]) {
      if (!has(k)) continue
      const v = textValue(body[k])
      values[k] = v
      const before = current[k] === null || current[k] === undefined ? null : String(current[k]).trim() || null
      if (v !== before) changed.add(k)
    }
    Object.assign(errors, validate(values, changed))

    // 상태: 키가 없거나 비어 있으면 유지
    let status: "active" | "moved_out" | null = null
    if (has("status") && body.status !== null && body.status !== "") {
      if (body.status === "active" || body.status === "moved_out") status = body.status
      else errors.status = "기업 상태는 ‘입주 중’ 또는 ‘퇴실’이어야 해요"
    }

    // 과납잔액: 미전송(undefined/null/"")이면 기존값 유지, 값이 있는데 잘못됐으면 400
    let overpaid: number | null = null
    if (body.overpaid_balance !== undefined && body.overpaid_balance !== null && body.overpaid_balance !== "") {
      const n = Number(body.overpaid_balance)
      if (!Number.isFinite(n) || n < 0) errors.overpaid_balance = "더 받은 금액(과납)은 0 이상으로 넣어 주세요"
      else overpaid = Math.round(n)
    }

    if (Object.keys(errors).length > 0) return fieldErrorResponse(errors)

    // 바뀐 사업자번호는 000-00-00000으로 맞춘다(바뀌지 않은 값은 원문 그대로 둔다)
    if (changed.has("business_no") && values.business_no) values.business_no = formatBusinessNo(values.business_no)

    const set = (k: TextField | DateField) => has(k)
    const val = (k: TextField | DateField) => (has(k) ? (values[k] ?? null) : null)

    const rows = await sql`
      UPDATE tenants
      SET name = CASE WHEN ${name !== null}::boolean THEN ${name} ELSE name END,
          business_no = CASE WHEN ${set("business_no")}::boolean THEN ${val("business_no")} ELSE business_no END,
          ceo_name = CASE WHEN ${set("ceo_name")}::boolean THEN ${val("ceo_name")} ELSE ceo_name END,
          room_no = CASE WHEN ${set("room_no")}::boolean THEN ${val("room_no")} ELSE room_no END,
          contact_email = CASE WHEN ${set("contact_email")}::boolean THEN ${val("contact_email")} ELSE contact_email END,
          contact_phone = CASE WHEN ${set("contact_phone")}::boolean THEN ${val("contact_phone")} ELSE contact_phone END,
          move_in_date = CASE WHEN ${set("move_in_date")}::boolean THEN ${val("move_in_date")}::date ELSE move_in_date END,
          move_out_date = CASE WHEN ${set("move_out_date")}::boolean THEN ${val("move_out_date")}::date ELSE move_out_date END,
          status = COALESCE(${status}::text, status),
          memo = CASE WHEN ${set("memo")}::boolean THEN ${val("memo")} ELSE memo END,
          tax_email = CASE WHEN ${set("tax_email")}::boolean THEN ${val("tax_email")} ELSE tax_email END,
          manager_name = CASE WHEN ${set("manager_name")}::boolean THEN ${val("manager_name")} ELSE manager_name END,
          overpaid_balance = COALESCE(${overpaid}::numeric, overpaid_balance),
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "존재하지 않는 기업입니다" }, { status: 404 })
    }
    return NextResponse.json({ success: true, tenant: rows[0] })
  } catch (error) {
    console.error("Update tenant error:", error)
    return NextResponse.json({ success: false, error: "저장에 실패했습니다" }, { status: 500 })
  }
}

// ── DELETE ──────────────────────────────────────────────────────────────────

// DELETE /api/admin/tenants?id=1 — 삭제 (tenant_users는 CASCADE)
export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return unauthorized()

  const sql = getDb()
  if (!sql) return noDb()

  try {
    const { searchParams } = new URL(request.url)
    const id = Number(searchParams.get("id"))
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "id가 필요합니다" }, { status: 400 })
    }

    const rows = await sql`DELETE FROM tenants WHERE id = ${id} RETURNING id`
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "존재하지 않는 기업입니다" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete tenant error:", error)
    return NextResponse.json({ success: false, error: "삭제에 실패했습니다" }, { status: 500 })
  }
}
