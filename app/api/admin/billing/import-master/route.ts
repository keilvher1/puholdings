import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { parseSettlement, type ImportResult } from "@/lib/billing-import"

// POST /api/admin/billing/import-master — xlsx 업로드 → 마스터 추출 미리보기(JSON)
// form-data: file. 반영은 ?confirm=1 또는 body의 confirm 데이터로 별도 처리.
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: "파일이 필요합니다" }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ success: false, error: "파일이 너무 큽니다 (최대 10MB)" }, { status: 400 })
    const ext = (file.name.match(/\.[^.]+$/)?.[0] || "").toLowerCase()
    if (![".xlsx", ".xls", ".xlsm"].includes(ext)) {
      return NextResponse.json({ success: false, error: "엑셀 파일(.xlsx/.xls)만 업로드할 수 있습니다" }, { status: 400 })
    }

    let parsed: ImportResult
    try {
      parsed = parseSettlement(new Uint8Array(await file.arrayBuffer()))
    } catch {
      return NextResponse.json({ success: false, error: "엑셀 파일을 읽을 수 없습니다" }, { status: 400 })
    }

    // 기존 tenants와 이름 매칭 표시
    const names = parsed.tenants.map((t) => t.name)
    const existing = names.length > 0
      ? await sql`SELECT id, name FROM tenants WHERE name = ANY(${names}::text[])`
      : []
    const existingByName = new Map(existing.map((e) => [e.name, e.id]))

    const preview = parsed.tenants.map((t) => ({
      ...t,
      matched_tenant_id: existingByName.get(t.name) ?? null,
    }))

    return NextResponse.json({
      success: true,
      tenants: preview,
      vacant_rooms: parsed.vacantRooms,
      warnings: parsed.warnings,
      summary: { tenants: preview.length, matched: preview.filter((t) => t.matched_tenant_id).length, vacant: parsed.vacantRooms.length },
    })
  } catch (error) {
    console.error("Import master error:", error)
    return NextResponse.json({ success: false, error: "가져오기에 실패했습니다" }, { status: 500 })
  }
}
