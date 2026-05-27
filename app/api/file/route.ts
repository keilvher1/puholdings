import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'

// Derive a human-friendly filename from a stored pathname like
// "news/1716800000000-보고서.docx" -> "보고서.docx".
function deriveFilename(pathname: string): string {
  const base = pathname.split('/').pop() || pathname
  return base.replace(/^\d+-/, '')
}

export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.searchParams.get('pathname')
    const wantsDownload = request.nextUrl.searchParams.get('download') !== null
    const overrideName = request.nextUrl.searchParams.get('name')

    if (!pathname) {
      return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
    }

    const result = await get(pathname, {
      access: 'private',
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    })

    if (!result) {
      return new NextResponse('Not found', { status: 404 })
    }

    // Blob hasn't changed — tell the browser to use its cached copy
    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          'Cache-Control': 'private, no-cache',
        },
      })
    }

    const headers: Record<string, string> = {
      'Content-Type': result.blob.contentType,
      ETag: result.blob.etag,
      'Cache-Control': 'private, no-cache',
    }

    if (wantsDownload) {
      const filename = overrideName || deriveFilename(pathname)
      // RFC 5987 encoding so non-ASCII (e.g. Korean) filenames download correctly.
      const encoded = encodeURIComponent(filename)
      headers['Content-Disposition'] = `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`
    }

    return new NextResponse(result.stream, { headers })
  } catch (error) {
    console.error('Error serving file:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
