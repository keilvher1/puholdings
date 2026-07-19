import { put, del } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { validateUploadFile } from '@/lib/upload'

// Check admin session using JWT token
async function isAuthenticated() {
  const session = await getSession()
  return session !== null
}

export async function POST(request: NextRequest) {
  // Check authentication
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const folder = formData.get('folder') as string || 'uploads'

    if (!file) {
      return NextResponse.json({ error: '파일이 제공되지 않았습니다' }, { status: 400 })
    }

    // 공용 검증 (확장자 allowlist + 20MB) — lib/upload.ts
    const validation = validateUploadFile(file)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const timestamp = Date.now()
    const filename = `${folder}/${timestamp}-${file.name}`
    const blob = await put(filename, file, { access: 'private' })

    // For private blobs, return the pathname to use with /api/file route
    return NextResponse.json({
      success: true,
      pathname: blob.pathname,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: '업로드에 실패했습니다' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  // Check authentication
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  try {
    const { pathname } = await request.json()

    if (!pathname) {
      return NextResponse.json({ error: 'pathname이 제공되지 않았습니다' }, { status: 400 })
    }

    // For private blobs, we need to delete by pathname
    await del(pathname)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: '삭제에 실패했습니다' }, { status: 500 })
  }
}
