import { NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { zip } from "fflate"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isValidPeriod, BILL_STATUS_LABELS } from "@/lib/billing"
import { buildInvoiceInput } from "@/lib/invoice-gen"
import { renderInvoicePdf } from "@/lib/invoice-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// 기업 수만큼 PDF를 렌더할 수 있어 기본 타임아웃으로는 모자랄 수 있다.
export const maxDuration = 300

// zip 안에 들어갈 파일명 — 경로 구분자·제어문자·윈도우 금지문자를 제거한다.
// (기업명에 '(주)' 같은 괄호나 '/'가 들어가는 경우가 있어 그대로 쓰면 압축 해제가 깨진다)
function safeName(name: string): string {
  return (
    name
      .replace(/[/\\:*?"<>|]/g, " ")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "무제"
  )
}

// 같은 이름이 두 번 나오면 압축 해제 때 덮어써지므로 뒤에 (2), (3)을 붙인다.
function uniqueName(used: Set<string>, base: string, ext: string): string {
  let name = `${base}${ext}`
  let n = 2
  while (used.has(name)) name = `${base} (${n++})${ext}`
  used.add(name)
  return name
}

async function zipAsync(files: Record<string, Uint8Array>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // PDF는 이미 압축돼 있어 재압축 이득이 거의 없다 — level 0(저장)으로 CPU를 아낀다.
    zip(files, { level: 0 }, (err, data) => (err ? reject(err) : resolve(Buffer.from(data))))
  })
}

// GET /api/admin/billing/bills/download?period=YYYY-MM[&status=issued]
// 해당 청구월 청구서 PDF를 한 파일씩 담은 zip으로 내려받는다.
// 발행 시 저장해 둔 PDF(invoice_pathname)가 있으면 그대로 쓰고, 없으면(초안 등) 즉석 렌더한다.
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ error: "데이터베이스 연결 실패" }, { status: 500 })

  const params = new URL(request.url).searchParams
  const period = params.get("period")
  const status = params.get("status")
  if (!isValidPeriod(period)) return NextResponse.json({ error: "period(YYYY-MM)가 필요합니다" }, { status: 400 })
  const vStatus = ["draft", "issued", "paid", "overdue"].includes(status || "") ? status : null

  try {
    const bills = await sql`
      SELECT b.id, b.status, b.invoice_pathname, t.name AS tenant_name
      FROM bills b JOIN tenants t ON t.id = b.tenant_id
      WHERE b.period = ${period}
        AND (${vStatus}::text IS NULL OR b.status = ${vStatus})
      ORDER BY t.name
    `
    if (bills.length === 0) {
      return NextResponse.json({ error: `${period} 청구서가 없습니다` }, { status: 404 })
    }

    // 파일명은 목록 순서대로 먼저 정해 둔다 — 아래를 병렬로 돌려도 중복 처리(2), (3)이
    // 실행 순서에 따라 뒤바뀌지 않도록.
    const used = new Set<string>()
    const jobs = bills.map((bill) => ({
      id: Number(bill.id),
      tenantName: String(bill.tenant_name),
      pathname: bill.invoice_pathname ? String(bill.invoice_pathname) : null,
      entry: uniqueName(used, `${period}_${safeName(String(bill.tenant_name))}`, ".pdf"),
    }))

    const rendered: (Uint8Array | null)[] = new Array(jobs.length).fill(null)
    // 저장본을 못 읽어 현재 내용으로 다시 그린 발행분 — 관리자에게 알려야 한다
    const rerendered: string[] = []

    const fetchOne = async (job: (typeof jobs)[number], index: number) => {
      try {
        let buffer: Buffer | null = null
        // 발행 시점에 저장된 PDF가 있으면 그것을 쓴다 — 기업이 실제로 받은 파일과 동일해야 한다.
        if (job.pathname) {
          // @vercel/blob의 get은 404일 때만 null을 주고 그 밖의 오류(5xx·토큰 문제 등)는 throw한다.
          // 여기서 잡지 않으면 아래 즉석 렌더 폴백에 닿지 못해 그 기업만 통째로 빠진다.
          try {
            const stored = await get(job.pathname, { access: "private" })
            if (stored?.stream) {
              buffer = Buffer.from(await new Response(stored.stream).arrayBuffer())
            }
          } catch (error) {
            console.error(`Invoice zip: blob 읽기 실패 ${job.pathname}`, error)
          }
          if (!buffer) rerendered.push(job.tenantName)
        }
        // 초안이라 저장본이 없거나, 저장본을 못 읽은 경우 현재 내용으로 즉석 렌더.
        // 발행된 청구서는 항목 수정이 막혀 있어(bills PUT은 draft만 허용) 내용은 발행본과 같다.
        if (!buffer) {
          const input = await buildInvoiceInput(sql, job.id)
          if (input) buffer = await renderInvoicePdf(input)
        }
        if (buffer) rendered[index] = new Uint8Array(buffer)
      } catch (error) {
        console.error(`Invoice zip: ${job.tenantName} 실패`, error)
      }
    }

    // blob 조회는 I/O 대기가 대부분이라 순차로 돌리면 기업 수만큼 왕복이 쌓인다.
    // 동시 5건으로 제한 — 즉석 렌더가 섞여도 메모리가 튀지 않는 선.
    const CONCURRENCY = 5
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      await Promise.all(jobs.slice(i, i + CONCURRENCY).map((job, k) => fetchOne(job, i + k)))
    }

    // zip 안의 순서·실패 명단은 목록 순서(기업명 가나다)를 따르게 한다 — 병렬 완료 순서와 무관하게.
    const files: Record<string, Uint8Array> = {}
    const failed: string[] = []
    jobs.forEach((job, i) => {
      const data = rendered[i]
      if (data) files[job.entry] = data
      else failed.push(job.tenantName)
    })

    if (Object.keys(files).length === 0) {
      return NextResponse.json({ error: "PDF를 하나도 만들지 못했습니다" }, { status: 500 })
    }
    // 빠지거나 다시 그린 건이 있으면 조용히 넘어가지 않도록 zip 안에 사유를 남긴다
    const notes: string[] = []
    if (failed.length > 0) {
      notes.push(
        `[빠진 청구서 ${failed.length}건]\n아래 기업의 PDF를 만들지 못해 이 zip에 들어있지 않습니다.\n관리자 화면에서 개별 미리보기로 확인하세요.\n\n${failed.join("\n")}`,
      )
    }
    if (rerendered.length > 0) {
      notes.push(
        `[다시 그린 청구서 ${rerendered.length}건]\n발행 때 저장해 둔 PDF를 읽지 못해 현재 내용으로 다시 만들었습니다.\n발행된 청구서는 항목 수정이 막혀 있어 내용은 같지만, 원본 파일 그대로는 아닙니다.\n\n${rerendered.join("\n")}`,
      )
    }
    if (notes.length > 0) {
      files["_안내.txt"] = new TextEncoder().encode(`${notes.join("\n\n")}\n`)
    }

    const count = Object.keys(files).length - (notes.length > 0 ? 1 : 0)
    const data = await zipAsync(files)
    const label = vStatus ? `_${BILL_STATUS_LABELS[vStatus] ?? vStatus}` : ""
    const filename = encodeURIComponent(`청구서_${period}${label}.zip`)
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Cache-Control": "private, no-store",
        "X-Invoice-Count": String(count),
        "X-Invoice-Total": String(jobs.length),
      },
    })
  } catch (error) {
    console.error("Invoice zip error:", error)
    return NextResponse.json({ error: "청구서 묶음 생성에 실패했습니다" }, { status: 500 })
  }
}
