import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { getSession } from "@/lib/auth"
import {
  DESKTOP_PLATFORMS,
  DESKTOP_PLATFORM_INFO,
  listDesktopReleases,
  type DesktopPlatform,
} from "@/lib/desktop-release"

// GET /api/admin/expenses/desktop/download?platform=mac-arm64|mac-x64|win
// 데스크톱 앱 설치 파일(100MB 안팎)을 관리자에게만 내려준다.
// Blob 저장소가 비공개 전용이라 서명 링크가 없으므로 함수가 스트리밍으로 중계한다(운영에서 20MB 스트리밍 확인).

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  // 링크를 눌러 들어오는 요청이므로 JSON 401 대신 로그인 화면으로 보낸다.
  if (!(await getSession())) {
    return NextResponse.redirect(new URL("/admin/login", request.url))
  }

  const platform = request.nextUrl.searchParams.get("platform") as DesktopPlatform | null
  if (!platform || !DESKTOP_PLATFORMS.includes(platform)) {
    return NextResponse.json({ success: false, error: "설치 파일 종류가 올바르지 않습니다" }, { status: 400 })
  }

  try {
    const release = (await listDesktopReleases())[platform]
    if (!release) {
      return NextResponse.json({ success: false, error: "아직 올라간 설치 파일이 없습니다" }, { status: 404 })
    }

    const result = await get(release.pathname, { access: "private" })
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ success: false, error: "설치 파일을 찾을 수 없습니다" }, { status: 404 })
    }

    const asciiName = release.pathname.split("/").pop() || "puholdings-receipts"
    const displayName = DESKTOP_PLATFORM_INFO[platform].downloadName(release.version)

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(release.size),
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(displayName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("[desktop-download] 설치 파일 전송 실패:", error)
    return NextResponse.json({ success: false, error: "설치 파일을 내려받지 못했습니다. 잠시 후 다시 시도하세요." }, { status: 500 })
  }
}
