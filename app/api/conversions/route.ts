import { NextResponse } from "next/server"
import { getSession, getPortalSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { isSafePathname } from "@/lib/upload"

// GET /api/conversions?pathname= — 변환 상태 조회 (프론트 폴링용).
// 관리자 또는 포털 세션 필요. 포털 세션은 타 기업 제출물 경로를 조회할 수 없다.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pathname = searchParams.get("pathname")
  if (!pathname || !isSafePathname(pathname)) {
    return NextResponse.json({ success: false, error: "pathname이 필요합니다" }, { status: 400 })
  }

  // submissions/ 경로는 세션 스코프 검증. 그 외(news/ 공개 첨부, programs/ 공고)는
  // 파일 자체가 공개 프록시로 열람 가능하므로 상태 폴링도 인증 없이 허용한다.
  if (pathname.startsWith("submissions/")) {
    const adminSession = await getSession()
    if (!adminSession) {
      const portalSession = await getPortalSession()
      if (!portalSession) {
        return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
      }
      if (!pathname.startsWith(`submissions/${portalSession.tenant_id}/`)) {
        return NextResponse.json({ success: false, error: "권한이 없습니다" }, { status: 403 })
      }
    }
  }

  const sql = getDb()
  if (!sql) {
    return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  }
  try {
    const rows = await sql`
      SELECT status, preview_pathname FROM file_conversions WHERE source_pathname = ${pathname}
    `
    if (rows.length === 0) {
      return NextResponse.json({ success: true, status: null })
    }
    return NextResponse.json({
      success: true,
      status: rows[0].status,
      preview_pathname: rows[0].preview_pathname,
    })
  } catch (error) {
    console.error("Conversion status error:", error)
    return NextResponse.json({ success: false, error: "상태 조회에 실패했습니다" }, { status: 500 })
  }
}
