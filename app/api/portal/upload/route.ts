import { put, del } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { getPortalSession } from "@/lib/auth"
import { validateUploadFile, isSafePathname } from "@/lib/upload"

// POST /api/portal/upload — 입주기업 제출용 파일 업로드.
// 저장 경로는 항상 submissions/{tenant_id}/ 프리픽스 (세션 기준, 요청으로 바꿀 수 없음).
export async function POST(request: NextRequest) {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "파일이 제공되지 않았습니다" }, { status: 400 })
    }

    const validation = validateUploadFile(file)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const timestamp = Date.now()
    const filename = `submissions/${session.tenant_id}/${timestamp}-${file.name}`

    const blob = await put(filename, file, { access: "private" })

    return NextResponse.json({ success: true, pathname: blob.pathname })
  } catch (error) {
    console.error("Portal upload error:", error)
    return NextResponse.json({ error: "업로드에 실패했습니다" }, { status: 500 })
  }
}

// DELETE /api/portal/upload — 본인 tenant 프리픽스의 파일만 삭제 가능
export async function DELETE(request: NextRequest) {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
  }

  try {
    const { pathname } = await request.json()
    if (!pathname || typeof pathname !== "string") {
      return NextResponse.json({ error: "pathname이 제공되지 않았습니다" }, { status: 400 })
    }
    // '..' 경로 이동은 del()의 URL 정규화로 프리픽스를 우회할 수 있으므로 먼저 거부
    if (!isSafePathname(pathname) || !pathname.startsWith(`submissions/${session.tenant_id}/`)) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 })
    }

    await del(pathname)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Portal delete error:", error)
    return NextResponse.json({ error: "삭제에 실패했습니다" }, { status: 500 })
  }
}
