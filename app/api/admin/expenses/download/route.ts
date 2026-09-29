import { NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { zip } from "fflate"
import { isValidDate, type ExpenseReceipt } from "@/lib/expenses"
import { dbErrorMessage, fail, getProject, kstToday, listReceipts, parseId, requireAdminDb } from "@/lib/expense-db"

// GET /api/admin/expenses/download?project_id=[&from=&to=&q=]
// 해당 프로젝트 증빙 원본 파일을 fflate zip()으로 묶어 내려준다(한글 파일명 UTF-8 플래그).
// zip 안 파일명: {거래일자}_{거래처}_{합계}원.{확장자} — 한 파일에 증빙이 여러 장이면 " 외 N건"을 붙이고 한 번만 넣는다.
// 못 읽은 파일이 있으면 _안내.txt에 목록을 남긴다(조용히 빠지지 않도록).
// 원본 파일이 없는 수기 등록 인건비는 건너뛰고 _안내.txt에 '수기 등록 N건 제외'와 목록을 적는다.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

// 함수 메모리를 지키기 위한 상한(원본 합계). 넘으면 기간을 나눠 받도록 안내한다.
const MAX_TOTAL_BYTES = 300 * 1024 * 1024
const CONCURRENCY = 5

function safeName(name: string, max = 40): string {
  return (
    name
      .replace(/[/\\:*?"<>|]/g, " ")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max) || "무제"
  )
}

function uniqueName(used: Set<string>, base: string, ext: string): string {
  let name = `${base}${ext}`
  let n = 2
  while (used.has(name)) name = `${base} (${n++})${ext}`
  used.add(name)
  return name
}

type FileReceipt = ExpenseReceipt & { file_pathname: string }

function extFor(r: FileReceipt): string {
  const fromName = (r.file_name.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] || "").toLowerCase()
  if (fromName) return fromName
  const fromPath = (r.file_pathname.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] || "").toLowerCase()
  if (fromPath) return fromPath
  if (r.file_type.includes("pdf")) return ".pdf"
  if (r.file_type.includes("png")) return ".png"
  if (r.file_type.includes("webp")) return ".webp"
  return ".jpg"
}

async function zipAsync(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    // 사진·PDF는 이미 압축돼 있어 재압축 이득이 거의 없다 — level 0(저장)으로 CPU를 아낀다.
    zip(files, { level: 0 }, (err, data) => (err ? reject(err) : resolve(data)))
  })
}

// 큰 zip도 함수 응답 크기 제한에 걸리지 않도록 스트림으로 내보낸다(/api/file 프록시와 같은 방식).
function streamBytes(data: Uint8Array): ReadableStream<Uint8Array> {
  const CHUNK = 1024 * 1024
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= data.length) {
        controller.close()
        return
      }
      controller.enqueue(data.subarray(offset, Math.min(offset + CHUNK, data.length)))
      offset += CHUNK
    },
  })
}

export async function GET(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  const sql = auth.sql
  const params = new URL(request.url).searchParams
  const projectId = parseId(params.get("project_id"))
  if (!projectId) return fail("증빙 파일을 내려받을 프로젝트를 먼저 선택하세요", 400)
  const from = params.get("from")
  const to = params.get("to")

  try {
    const project = await getProject(sql, projectId)
    if (!project) return fail("없는 프로젝트입니다. 새로고침하세요.", 404)
    const receipts = await listReceipts(sql, {
      projectId,
      from: isValidDate(from) ? from : null,
      to: isValidDate(to) ? to : null,
      q: params.get("q"),
    })
    if (receipts.length === 0) return fail("조건에 맞는 증빙이 없습니다", 404)

    // 거래일 오름차순, 같은 원본 파일은 한 번만
    const sorted = [...receipts].sort((a, b) => (a.issue_date === b.issue_date ? a.id - b.id : a.issue_date < b.issue_date ? -1 : 1))
    // 원본 파일이 없는 수기 등록(인건비)은 묶을 파일이 없다.
    const manual = sorted.filter((r) => !r.file_pathname)
    const manualNote =
      manual.length > 0
        ? `[수기 등록 ${manual.length}건 제외]\n원본 파일 없이 직접 등록한 인건비는 이 zip에 파일이 없습니다(증빙 목록 엑셀에는 포함).\n\n${manual
            .map((r) => `${r.issue_date} ${r.vendor_name} ${r.total_amount !== null ? `${r.total_amount.toLocaleString("ko-KR")}원` : ""}${r.payroll_month ? ` (귀속 ${r.payroll_month})` : ""}`.trim())
            .join("\n")}\n`
        : ""
    const withFile = sorted.filter((r): r is FileReceipt => !!r.file_pathname)
    if (withFile.length === 0) {
      return fail(`내려받을 원본 파일이 없습니다(조건에 맞는 ${manual.length}건이 모두 파일 없이 수기 등록한 인건비입니다)`, 404)
    }
    const byPath = new Map<string, FileReceipt[]>()
    for (const r of withFile) {
      const list = byPath.get(r.file_pathname)
      if (list) list.push(r)
      else byPath.set(r.file_pathname, [r])
    }

    const used = new Set<string>()
    let totalBytes = 0
    const jobs = [...byPath.entries()].map(([pathname, rows]) => {
      const r = rows[0]
      totalBytes += r.file_size
      const amount = r.total_amount !== null ? `${r.total_amount.toLocaleString("ko-KR")}원` : "금액미상"
      const more = rows.length > 1 ? ` 외 ${rows.length - 1}건` : ""
      const base = `${r.issue_date}_${safeName(r.vendor_name)}_${amount}${more}`
      return { pathname, label: `${r.issue_date} ${r.vendor_name} (${r.file_name})`, entry: uniqueName(used, base, extFor(r)) }
    })
    if (totalBytes > MAX_TOTAL_BYTES) {
      return fail("원본 파일이 너무 많아 한 번에 묶을 수 없습니다. 기간을 나눠(예: 월별로) 내려받으세요.", 413)
    }

    const data: (Uint8Array | null)[] = new Array(jobs.length).fill(null)
    const fetchOne = async (job: (typeof jobs)[number], index: number) => {
      try {
        const stored = await get(job.pathname, { access: "private" })
        if (stored?.stream) data[index] = new Uint8Array(await new Response(stored.stream).arrayBuffer())
      } catch (error) {
        console.error(`Expense zip: blob 읽기 실패 ${job.pathname}`, error)
      }
    }
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      await Promise.all(jobs.slice(i, i + CONCURRENCY).map((job, k) => fetchOne(job, i + k)))
    }

    const files: Record<string, Uint8Array> = {}
    const failed: string[] = []
    jobs.forEach((job, i) => {
      const bytes = data[i]
      if (bytes) files[job.entry] = bytes
      else failed.push(job.label)
    })
    if (Object.keys(files).length === 0) {
      return fail("증빙 원본 파일을 하나도 읽지 못했습니다. 잠시 후 다시 시도하세요.", 500)
    }
    const notes: string[] = []
    if (failed.length > 0) {
      notes.push(
        `[빠진 원본 ${failed.length}건]\n아래 증빙의 원본 파일을 읽지 못해 이 zip에 들어 있지 않습니다.\n증빙 내역 화면에서 개별로 열어 확인하세요.\n\n${failed.join("\n")}\n`,
      )
    }
    if (manualNote) notes.push(manualNote)
    if (notes.length > 0) files["_안내.txt"] = new TextEncoder().encode(notes.join("\n"))

    const zipped = await zipAsync(files)
    const filename = encodeURIComponent(`사업비_증빙원본_${safeName(project.name, 60)}_${kstToday().replace(/-/g, "")}.zip`)
    return new NextResponse(streamBytes(zipped), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="receipts.zip"; filename*=UTF-8''${filename}`,
        "Cache-Control": "private, no-store",
        "X-File-Count": String(jobs.length - failed.length),
        "X-File-Total": String(jobs.length),
        "X-Manual-Skipped": String(manual.length),
      },
    })
  } catch (error) {
    console.error("Expense zip error:", error)
    return fail(dbErrorMessage(error, "증빙 파일 묶음을 만들지 못했습니다. 잠시 후 다시 시도하세요."), 500)
  }
}
