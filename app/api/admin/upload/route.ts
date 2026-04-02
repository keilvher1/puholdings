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

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: '지원하지 않는 파일 형식입니다' }, { status: 400 })
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기는 10MB 이하여야 합니다' }, { status: 400 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const filename = `${folder}/${timestamp}-${file.name}`

    // Upload to Vercel Blob
    const blob = await put(filename, file, {
      access: 'public',
    })

    // For public blobs, return the URL directly
    return NextResponse.json({ 
      success: true,
      url: blob.url,
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
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'URL이 제공되지 않았습니다' }, { status: 400 })
    }

    await del(url)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: '삭제에 실패했습니다' }, { status: 500 })
  }
}
