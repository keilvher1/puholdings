import { put, del } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

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

    // Allowed MIME types (images + common document formats).
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.ms-excel', // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-powerpoint', // .ppt
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'text/plain', // .txt
      'text/csv', // .csv
      'application/zip', 'application/x-zip-compressed', // .zip
      // HWP MIME types are inconsistent across browsers/OS:
      'application/x-hwp', 'application/haansofthwp', 'application/vnd.hancom.hwp',
      'application/hwp', 'application/octet-stream',
    ]
    // HWP / some docs often arrive as octet-stream or empty type, so fall back
    // to an extension allowlist when the MIME type isn't recognized.
    const allowedExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.webp',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.txt', '.csv', '.zip', '.hwp', '.hwpx',
    ]
    const ext = (file.name.match(/\.[^.]+$/)?.[0] || '').toLowerCase()
    const typeOk = !!file.type && allowedTypes.includes(file.type)
    const extOk = allowedExtensions.includes(ext)
    if (!typeOk && !extOk) {
      return NextResponse.json({ error: '지원하지 않는 파일 형식입니다' }, { status: 400 })
    }

    // Validate file size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기는 20MB 이하여야 합니다' }, { status: 400 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const filename = `${folder}/${timestamp}-${file.name}`

    // Upload to Vercel Blob (private store)
    const blob = await put(filename, file, {
      access: 'private',
    })

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
