import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { buildInvoiceInput } from "@/lib/invoice-gen"
import { renderInvoicePdf } from "@/lib/invoice-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/admin/billing/bills/preview?id= — 청구서 PDF 미리보기 (저장 없이 즉석 렌더, 인라인)
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ error: "데이터베이스 연결 실패" }, { status: 500 })
  const id = Number(new URL(request.url).searchParams.get("id"))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id가 필요합니다" }, { status: 400 })
  try {
    const input = await buildInvoiceInput(sql, id)
    if (!input) return NextResponse.json({ error: "청구서를 찾을 수 없습니다" }, { status: 404 })
    const buffer = await renderInvoicePdf(input)
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=preview.pdf" },
    })
  } catch (error) {
    console.error("Invoice preview error:", error)
    return NextResponse.json({ error: "미리보기 생성 실패" }, { status: 500 })
  }
}
