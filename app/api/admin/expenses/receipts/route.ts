import { NextResponse } from "next/server"
import { BlobNotFoundError, del, head } from "@vercel/blob"
import { isValidDate, type ExpenseDocType, type ExpenseReceipt, type ReceiptFields, type UploadedFileMeta } from "@/lib/expenses"
import {
  aiRawJson,
  dbErrorMessage,
  fail,
  getReceipt,
  listReceipts,
  parseConfidence,
  parseId,
  parseReceiptFields,
  parseUploadedFileMeta,
  requireAdminDb,
  type Sql,
} from "@/lib/expense-db"

// 사업비 정산 — 증빙
// GET    /api/admin/expenses/receipts?project_id=&from=&to=&q=&month=&doc_type=&budget_item=  → { success, receipts: ExpenseReceipt[] } (거래일 최신순)
//        month=YYYY-MM을 주면 그 달 1일~말일로 from/to를 채운다(from/to가 따로 오면 그것이 우선).
//        doc_type(문서 종류)·budget_item(비목, item도 같은 뜻 — 앞뒤·연속 공백은 무시)은 선택 조건이다(없으면 전체).
// POST   { receipts: ReceiptCreateInput[] } (1~100건) → 전부 검증 후 한 트랜잭션으로 저장 → { success, ids, skipped }
//        검증 실패 시 400 { success:false, error, row_errors: { index, errors[] }[] } — 한 건도 저장하지 않는다.
//        file은 필수다. 단 인건비 지급(doc_type 'payroll')은 수기 등록이라 file: null을 허용한다.
//        외화 증빙은 currency·foreign_amount·exchange_rate(·exchange_rate_date·exchange_rate_source)를 함께 보내고,
//        total_amount는 원화 환산액(외화 금액 × 환율, 반올림)이어야 한다.
//        같은 증빙(같은 원본 파일[경로 또는 해시]·거래일·거래처·합계)은 이미 저장돼 있거나 묶음 안에 두 번 있으면 막는다.
//        파일 없는 인건비 행은 같은 프로젝트·지급일·대상자·금액이 이미 있거나 묶음 안에 두 번 있으면 막는다.
//        원본 Blob이 지워진 경로(다른 행을 삭제하며 원본이 정리된 경우)도 막는다.
//        skipped: 검증 뒤 저장 직전에 다른 창·다른 관리자가 같은 증빙을 먼저 저장해 건너뛴 행의 index 목록(보통 빈 배열).
//        건너뛴 행도 이미 저장된 상태이므로 화면은 저장된 것으로 처리하면 된다.
// PUT    { id, ...ReceiptFields, project_id, file? } → { success, receipt } (보낸 필드만 바뀐다)
//        file: UploadedFileMeta(/attach 결과)를 보내면 원본 파일이 없는 행(수기 등록한 인건비)에 첨부를 붙인다.
//        원본이 이미 있는 행의 파일은 바꿀 수 없다. 파일 없는 행의 문서 종류는 '인건비 지급'만 가능하다.
// DELETE { id } → 같은 원본 파일을 쓰는 다른 증빙이 없으면 Blob 원본도 지운다(실패해도 삭제는 성공).

export const dynamic = "force-dynamic"

const MAX_BATCH = 100
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

const NO_FILE_ERROR = "원본 파일이 없습니다. 증빙 파일을 다시 올리세요(파일 없이 등록할 수 있는 것은 '인건비 지급'뿐입니다)"

// 파일 없는(수기) 인건비의 같은 건 키: 프로젝트·지급일·대상자·금액
function manualKey(projectId: number, p: { issue_date: string; vendor_name: string; total_amount: number | null }): string {
  return `${projectId}|${p.issue_date}|${p.vendor_name}|${p.total_amount}`
}

function nullIfEmpty(s: string): string | null {
  return s ? s : null
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function monthRange(month: string | null): { from: string; to: string } | null {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null
  const [y, m] = month.split("-").map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` }
}

async function projectStatusMap(sql: Sql, ids: number[]): Promise<Map<number, { name: string; status: string }>> {
  const map = new Map<number, { name: string; status: string }>()
  if (ids.length === 0) return map
  const rows = await sql`SELECT id, name, status FROM expense_projects WHERE id = ANY(${ids}::int[])`
  for (const r of rows) map.set(Number(r.id), { name: String(r.name), status: String(r.status) })
  return map
}

export async function GET(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  const params = new URL(request.url).searchParams
  const range = monthRange(params.get("month"))
  const from = params.get("from")
  const to = params.get("to")
  try {
    const receipts = await listReceipts(auth.sql, {
      projectId: parseId(params.get("project_id")),
      from: isValidDate(from) ? from : (range?.from ?? null),
      to: isValidDate(to) ? to : (range?.to ?? null),
      q: params.get("q"),
      docType: (params.get("doc_type") as ExpenseDocType | null) || null,
      budgetItem: params.get("budget_item") ?? params.get("item"),
    })
    return NextResponse.json({ success: true, receipts })
  } catch (error) {
    console.error("Expense receipts list error:", error)
    return fail(dbErrorMessage(error, "증빙 내역을 불러오지 못했습니다. 새로고침하세요."), 500)
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  const sql = auth.sql

  const body = await readJson(request)
  const list = body?.receipts
  if (!Array.isArray(list)) return fail("요청 형식이 올바르지 않습니다(receipts 배열 필요)", 400)
  if (list.length === 0) return fail("저장할 증빙이 없습니다. 표에서 저장할 행을 선택하세요.", 400)
  if (list.length > MAX_BATCH) return fail(`한 번에 ${MAX_BATCH}건까지 저장할 수 있습니다. 나눠서 저장하세요.`, 400)

  try {
    const rawRows = list.map((r) => (r && typeof r === "object" && !Array.isArray(r) ? (r as Record<string, unknown>) : {}))
    const projectIds = [...new Set(rawRows.map((r) => parseId(r.project_id)).filter((n): n is number => n !== null))]
    const projects = await projectStatusMap(sql, projectIds)

    const rowErrors: { index: number; errors: string[] }[] = []
    const prepared: {
      index: number // 요청 receipts 배열에서의 위치(row_errors·skipped에 그대로 쓴다)
      projectId: number
      fields: ReceiptFields
      file: UploadedFileMeta | null // null = 수기 등록 인건비
      aiConfidence: string | null
      aiRaw: string | null
    }[] = []

    rawRows.forEach((raw, index) => {
      const { fields, errors } = parseReceiptFields(raw)
      const projectId = parseId(raw.project_id)
      const project = projectId ? projects.get(projectId) : undefined
      if (!projectId) errors.push("어느 프로젝트의 증빙인지 선택하세요")
      else if (!project) errors.push("선택한 프로젝트가 삭제되었습니다. 다시 선택하세요")
      else if (project.status !== "active") {
        errors.push(`'${project.name}' 프로젝트는 종료되어 증빙을 추가할 수 없습니다. 다른 프로젝트를 고르거나 프로젝트를 재개하세요`)
      }
      // 인건비 지급만 파일 없이(수기) 저장할 수 있다.
      const noFile = raw.file === null || raw.file === undefined
      const file = noFile ? null : parseUploadedFileMeta(raw.file)
      if (noFile && fields.doc_type !== "payroll") errors.push(NO_FILE_ERROR)
      if (file && !file.ok) errors.push(...file.errors)
      if (errors.length > 0 || !projectId || (file && !file.ok)) {
        rowErrors.push({ index, errors })
        return
      }
      prepared.push({
        index,
        projectId,
        fields,
        file: file && file.ok ? file.value : null,
        aiConfidence: parseConfidence(raw.ai_confidence),
        aiRaw: aiRawJson(raw.ai_raw),
      })
    })

    if (rowErrors.length === 0) {
      const addError = (index: number, message: string) => {
        const hit = rowErrors.find((e) => e.index === index)
        if (hit) {
          if (!hit.errors.includes(message)) hit.errors.push(message)
        } else rowErrors.push({ index, errors: [message] })
      }
      // 같은 증빙 = 같은 원본 파일(경로가 같거나, 내용 해시가 같음) + 같은 거래일·거래처·합계
      const rest = (p: { issue_date: string; vendor_name: string; total_amount: number | null }) =>
        `${p.issue_date}|${p.vendor_name}|${p.total_amount}`

      // 1) 묶음 안: 같은 증빙이 두 번 들어온 경우(같은 파일을 두 번 올림 — 경로는 달라도 해시가 같다 — 또는 같은 행을 복제).
      //    아래 저장 단계는 이미 있는 같은 증빙을 건너뛰므로, 여기서 먼저 막아 조용히 한 건이 빠지는 일이 없게 한다.
      const withFile = prepared.filter((p): p is (typeof prepared)[number] & { file: UploadedFileMeta } => p.file !== null)
      const manual = prepared.filter((p) => p.file === null)
      const seenInBatch = new Set<string>()
      for (const p of withFile) {
        const k = rest(p.fields)
        const keys = [`p:${p.file.pathname}|${k}`, ...(p.file.hash ? [`h:${p.file.hash}|${k}`] : [])]
        if (keys.some((key) => seenInBatch.has(key))) {
          addError(p.index, "같은 증빙(같은 파일·거래일·거래처·합계)이 이번 저장에 두 번 들어 있습니다. 한 건만 남기고 제외하세요")
        }
        for (const key of keys) seenInBatch.add(key)
      }
      const seenManual = new Set<string>()
      for (const p of manual) {
        const key = manualKey(p.projectId, p.fields)
        if (seenManual.has(key)) {
          addError(p.index, "같은 인건비(같은 프로젝트·지급일·대상자·금액)가 이번 저장에 두 번 들어 있습니다. 한 건만 남기세요")
        }
        seenManual.add(key)
      }

      // 2) 이미 저장된 증빙과 비교('저장'을 두 번 누름, 같은 파일을 다시 올려 다시 저장 등)
      const paths = [...new Set(withFile.map((p) => p.file.pathname))]
      const hashes = [...new Set(withFile.map((p) => p.file.hash).filter(Boolean))]
      const savedKeys = new Set<string>()
      const savedPaths = new Set<string>()
      if (withFile.length > 0) {
        const existing = await sql`
          SELECT file_pathname, file_hash, to_char(issue_date, 'YYYY-MM-DD') AS issue_date, vendor_name, total_amount
          FROM expense_receipts
          WHERE file_pathname = ANY(${paths}::text[]) OR (file_hash <> '' AND file_hash = ANY(${hashes}::text[]))
        `
        for (const e of existing) {
          const k = rest({ issue_date: String(e.issue_date), vendor_name: String(e.vendor_name), total_amount: Number(e.total_amount) })
          savedKeys.add(`p:${e.file_pathname}|${k}`)
          if (e.file_hash) savedKeys.add(`h:${e.file_hash}|${k}`)
          savedPaths.add(String(e.file_pathname))
        }
      }
      for (const p of withFile) {
        const k = rest(p.fields)
        if (savedKeys.has(`p:${p.file.pathname}|${k}`) || (p.file.hash && savedKeys.has(`h:${p.file.hash}|${k}`))) {
          addError(p.index, "이미 저장된 증빙입니다(같은 파일·거래일·거래처·합계). 증빙 내역에서 확인하세요")
        }
      }
      if (manual.length > 0) {
        const pids = [...new Set(manual.map((p) => p.projectId))]
        const dates = [...new Set(manual.map((p) => p.fields.issue_date))]
        const savedManual = await sql`
          SELECT project_id, to_char(issue_date, 'YYYY-MM-DD') AS issue_date, vendor_name, total_amount
          FROM expense_receipts
          WHERE file_pathname IS NULL AND project_id = ANY(${pids}::int[]) AND issue_date = ANY(${dates}::date[])
        `
        const savedManualKeys = new Set(
          savedManual.map((e) =>
            manualKey(Number(e.project_id), { issue_date: String(e.issue_date), vendor_name: String(e.vendor_name), total_amount: Number(e.total_amount) }),
          ),
        )
        for (const p of manual) {
          if (savedManualKeys.has(manualKey(p.projectId, p.fields))) {
            addError(p.index, "이미 등록된 인건비입니다(같은 프로젝트·지급일·대상자·금액). 증빙 내역에서 확인하세요")
          }
        }
      }

      // 3) 원본이 아직 있는지 — 같은 파일의 다른 증빙을 삭제하면서 원본이 정리됐을 수 있다(임시 보관에서 되살린 행 등).
      //    이미 저장된 행이 쓰는 경로는 원본이 있으므로 건너뛴다. 확인 자체가 실패하면(네트워크 등) 막지 않는다.
      const unknownPaths = paths.filter((path) => !savedPaths.has(path))
      const missing = new Set<string>()
      for (let i = 0; i < unknownPaths.length; i += 8) {
        await Promise.all(
          unknownPaths.slice(i, i + 8).map(async (path) => {
            try {
              await head(path)
            } catch (error) {
              if (error instanceof BlobNotFoundError) missing.add(path)
              else console.error("Expense receipt blob check failed:", path, error)
            }
          }),
        )
      }
      for (const p of withFile) {
        if (missing.has(p.file.pathname)) {
          addError(p.index, "원본 파일이 삭제되어 이 행을 저장할 수 없습니다. 원본 파일을 다시 올려 새 행으로 저장하세요")
        }
      }
    }

    if (rowErrors.length > 0) {
      rowErrors.sort((a, b) => a.index - b.index)
      return fail(`${rowErrors.length}건에 확인이 필요한 항목이 있어 저장하지 않았습니다. 표에 표시된 내용을 수정하세요.`, 400, {
        row_errors: rowErrors,
      })
    }

    // 전부 통과했을 때만 한 트랜잭션으로 저장 — 일부만 저장되는 일이 없도록.
    // 두 창에서 거의 동시에 같은 증빙을 저장하는 경우를 막기 위해, 저장을 잠금으로 한 줄로 세우고
    // 같은 증빙이 이미 있으면 그 행은 넣지 않는다(위 검사를 통과한 뒤 다른 요청이 먼저 저장한 경우뿐이다).
    const results = await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtext('expense_receipts_insert'))`,
      ...prepared.map((p) => {
        const f = p.fields
        const fxDate = nullIfEmpty(f.exchange_rate_date)
        const payrollMonth = nullIfEmpty(f.payroll_month)
        if (p.file) {
          const file = p.file
          return sql`
            INSERT INTO expense_receipts
              (project_id, doc_type, issue_date, vendor_name, vendor_biz_no, supply_amount, vat_amount, total_amount,
               payment_method, approval_no, items, budget_item, purpose, memo,
               currency, foreign_amount, exchange_rate, exchange_rate_date, exchange_rate_source, payroll_month,
               file_pathname, file_name, file_type, file_size, file_hash, ai_confidence, ai_raw)
            SELECT
              ${p.projectId}, ${f.doc_type}, ${f.issue_date}::date, ${f.vendor_name}, ${f.vendor_biz_no},
              ${f.supply_amount}::numeric, ${f.vat_amount}::numeric, ${f.total_amount}::numeric,
              ${f.payment_method}, ${f.approval_no}, ${JSON.stringify(f.items)}::jsonb,
              ${f.budget_item}, ${f.purpose}, ${f.memo},
              ${f.currency}, ${f.foreign_amount}::numeric, ${f.exchange_rate}::numeric, ${fxDate}::date,
              ${f.exchange_rate_source}, ${payrollMonth},
              ${file.pathname}, ${file.name}, ${file.type}, ${file.size}, ${file.hash},
              ${p.aiConfidence}, ${p.aiRaw}::jsonb
            WHERE NOT EXISTS (
              SELECT 1 FROM expense_receipts e
              WHERE (e.file_pathname = ${file.pathname} OR (${file.hash}::text <> '' AND e.file_hash = ${file.hash}))
                AND e.issue_date = ${f.issue_date}::date
                AND e.vendor_name = ${f.vendor_name}
                AND e.total_amount = ${f.total_amount}::numeric
            )
            RETURNING id
          `
        }
        // 수기 등록 인건비(파일 없음): 같은 프로젝트·지급일·대상자·금액이 이미 있으면 넣지 않는다.
        return sql`
          INSERT INTO expense_receipts
            (project_id, doc_type, issue_date, vendor_name, vendor_biz_no, supply_amount, vat_amount, total_amount,
             payment_method, approval_no, items, budget_item, purpose, memo,
             currency, foreign_amount, exchange_rate, exchange_rate_date, exchange_rate_source, payroll_month,
             file_pathname, file_name, file_type, file_size, file_hash, ai_confidence, ai_raw)
          SELECT
            ${p.projectId}, ${f.doc_type}, ${f.issue_date}::date, ${f.vendor_name}, ${f.vendor_biz_no},
            ${f.supply_amount}::numeric, ${f.vat_amount}::numeric, ${f.total_amount}::numeric,
            ${f.payment_method}, ${f.approval_no}, ${JSON.stringify(f.items)}::jsonb,
            ${f.budget_item}, ${f.purpose}, ${f.memo},
            ${f.currency}, ${f.foreign_amount}::numeric, ${f.exchange_rate}::numeric, ${fxDate}::date,
            ${f.exchange_rate_source}, ${payrollMonth},
            NULL, '', '', 0, '',
            ${p.aiConfidence}, ${p.aiRaw}::jsonb
          WHERE NOT EXISTS (
            SELECT 1 FROM expense_receipts e
            WHERE e.file_pathname IS NULL
              AND e.project_id = ${p.projectId}
              AND e.issue_date = ${f.issue_date}::date
              AND e.vendor_name = ${f.vendor_name}
              AND e.total_amount = ${f.total_amount}::numeric
          )
          RETURNING id
        `
      }),
    ], { isolationLevel: "ReadCommitted" }) // 잠금을 얻은 뒤의 문장이 먼저 끝난 저장을 볼 수 있어야 한다
    const ids: number[] = []
    const skipped: number[] = []
    results.slice(1).forEach((rows, i) => {
      const id = Number((rows as Record<string, unknown>[])[0]?.id)
      if (Number.isFinite(id) && id > 0) ids.push(id)
      else skipped.push(prepared[i].index)
    })
    return NextResponse.json({ success: true, ids, skipped })
  } catch (error) {
    console.error("Expense receipts create error:", error)
    return fail(dbErrorMessage(error, "증빙을 저장하지 못했습니다(한 건도 저장되지 않았습니다). 잠시 후 다시 시도하세요."), 500)
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  const sql = auth.sql

  const body = await readJson(request)
  if (!body) return fail("요청 형식이 올바르지 않습니다", 400)
  const id = parseId(body.id)
  if (!id) return fail("수정할 증빙을 찾을 수 없습니다(id 누락)", 400)

  try {
    const existing = await getReceipt(sql, id)
    if (!existing) return fail("이미 삭제되었거나 없는 증빙입니다. 새로고침하세요.", 404)

    // 보낸 필드만 덮어쓰고 전체를 다시 검증한다.
    const merged: Record<string, unknown> = {}
    for (const key of FIELD_KEYS) merged[key] = key in body ? body[key] : existing[key as keyof ExpenseReceipt]
    const { fields, errors } = parseReceiptFields(merged)

    const projectId = "project_id" in body ? parseId(body.project_id) : existing.project_id
    if (!projectId) errors.push("어느 프로젝트의 증빙인지 선택하세요")
    else if (projectId !== existing.project_id) {
      // 다른 프로젝트로 옮길 때만 대상이 진행 중인지 본다(종료된 프로젝트의 기존 증빙 수정은 허용).
      const target = (await projectStatusMap(sql, [projectId])).get(projectId)
      if (!target) errors.push("선택한 프로젝트가 삭제되었습니다. 다시 선택하세요")
      else if (target.status !== "active") errors.push(`'${target.name}' 프로젝트는 종료되어 증빙을 옮길 수 없습니다`)
    }

    // 첨부 추가: 원본 파일이 없는 행(수기 등록 인건비)에만 붙일 수 있다.
    let attach: UploadedFileMeta | null = null
    if (body.file !== undefined && body.file !== null) {
      if (existing.file_pathname) errors.push("이미 원본 파일이 있는 증빙입니다. 원본 파일은 바꿀 수 없습니다")
      else {
        const parsed = parseUploadedFileMeta(body.file)
        if (parsed.ok) attach = parsed.value
        else errors.push(...parsed.errors)
      }
    }
    if (!attach && !existing.file_pathname && fields.doc_type !== "payroll") {
      errors.push("원본 파일이 없는 증빙은 문서 종류를 '인건비 지급'으로만 둘 수 있습니다. 첨부를 먼저 추가하세요")
    }
    if (errors.length > 0 || !projectId) return fail(errors[0] ?? "입력값을 확인하세요", 400, { errors })

    await sql`
      UPDATE expense_receipts SET
        project_id = ${projectId},
        doc_type = ${fields.doc_type},
        issue_date = ${fields.issue_date}::date,
        vendor_name = ${fields.vendor_name},
        vendor_biz_no = ${fields.vendor_biz_no},
        supply_amount = ${fields.supply_amount}::numeric,
        vat_amount = ${fields.vat_amount}::numeric,
        total_amount = ${fields.total_amount}::numeric,
        payment_method = ${fields.payment_method},
        approval_no = ${fields.approval_no},
        items = ${JSON.stringify(fields.items)}::jsonb,
        budget_item = ${fields.budget_item},
        purpose = ${fields.purpose},
        memo = ${fields.memo},
        currency = ${fields.currency},
        foreign_amount = ${fields.foreign_amount}::numeric,
        exchange_rate = ${fields.exchange_rate}::numeric,
        exchange_rate_date = ${nullIfEmpty(fields.exchange_rate_date)}::date,
        exchange_rate_source = ${fields.exchange_rate_source},
        payroll_month = ${nullIfEmpty(fields.payroll_month)},
        file_pathname = CASE WHEN ${attach !== null}::boolean THEN ${attach?.pathname ?? null} ELSE file_pathname END,
        file_name = CASE WHEN ${attach !== null}::boolean THEN ${attach?.name ?? ""} ELSE file_name END,
        file_type = CASE WHEN ${attach !== null}::boolean THEN ${attach?.type ?? ""} ELSE file_type END,
        file_size = CASE WHEN ${attach !== null}::boolean THEN ${attach?.size ?? 0}::int ELSE file_size END,
        file_hash = CASE WHEN ${attach !== null}::boolean THEN ${attach?.hash ?? ""} ELSE file_hash END,
        updated_at = now()
      WHERE id = ${id}
    `
    const receipt = await getReceipt(sql, id)
    return NextResponse.json({ success: true, receipt })
  } catch (error) {
    console.error("Expense receipt update error:", error)
    return fail(dbErrorMessage(error, "증빙을 수정하지 못했습니다. 잠시 후 다시 시도하세요."), 500)
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  const sql = auth.sql

  const body = await readJson(request)
  const id = parseId(body?.id ?? new URL(request.url).searchParams.get("id"))
  if (!id) return fail("삭제할 증빙을 찾을 수 없습니다(id 누락)", 400)

  try {
    const rows = await sql`DELETE FROM expense_receipts WHERE id = ${id} RETURNING file_pathname`
    if (rows.length === 0) return fail("이미 삭제되었거나 없는 증빙입니다. 새로고침하세요.", 404)
    // 수기 등록 인건비(원본 없음)는 정리할 파일이 없다.
    if (rows[0].file_pathname === null || rows[0].file_pathname === undefined) return NextResponse.json({ success: true })
    const pathname = String(rows[0].file_pathname)

    // 한 파일에 증빙이 여러 장이면 다른 행이 같은 원본을 쓴다 — 마지막 행일 때만 원본을 지운다.
    // 확인 대기함에 아직 저장 전인 초안이 남아 있어도(같은 원본) 지우지 않는다.
    try {
      const others = await sql`SELECT 1 FROM expense_receipts WHERE file_pathname = ${pathname} LIMIT 1`
      if (others.length === 0 && !(await inboxStillUses(sql, pathname))) await del(pathname)
    } catch (error) {
      console.error("Expense receipt blob cleanup failed:", pathname, error)
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Expense receipt delete error:", error)
    return fail(dbErrorMessage(error, "증빙을 삭제하지 못했습니다. 잠시 후 다시 시도하세요."), 500)
  }
}

// 확인 대기함(pending)이 이 원본을 아직 쓰는지. 테이블이 없으면(마이그레이션 전, 42P01) 참조 없음으로 본다.
async function inboxStillUses(sql: Sql, pathname: string): Promise<boolean> {
  try {
    const rows = await sql`
      SELECT 1 FROM expense_inbox WHERE file_pathname = ${pathname} AND status = 'pending' LIMIT 1
    `
    return rows.length > 0
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "42P01") return false
    throw error
  }
}
