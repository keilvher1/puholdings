import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { getSession, getPortalSession } from '@/lib/auth'
import { isSafePathname } from '@/lib/upload'
import { getDb } from '@/lib/db'

// Derive a human-friendly filename from a stored pathname like
// "news/1716800000000-보고서.docx" -> "보고서.docx".
function deriveFilename(pathname: string): string {
  const base = pathname.split('/').pop() || pathname
  return base.replace(/^\d+-/, '')
}

// submissions/ 프리픽스는 입주기업 제출물 — 관리자이거나, 포털 세션의
// 본인 tenant 프리픽스(submissions/{tenant_id}/)일 때만 접근 허용.
// previews/ 는 변환된 미리보기 PDF — 원본(source_pathname)의 접근 권한을 그대로 상속한다.
// 그 외 경로(news/, programs/ 공고 첨부 등)는 기존처럼 공개 프록시.
async function canAccessSubmission(pathname: string): Promise<boolean> {
  const adminSession = await getSession()
  if (adminSession) return true
  const portalSession = await getPortalSession()
  return !!portalSession && pathname.startsWith(`submissions/${portalSession.tenant_id}/`)
}

// 공개 페이지에서 그대로 노출되는 프리픽스 — CDN에 캐시해도 되는 것들.
// 이 목록에 없는 경로는 절대 public 캐시 헤더를 붙이지 않는다.
const PUBLIC_PREFIXES = ['news/', 'popups/', 'portfolio/', 'content/']

function isPublicAsset(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}

async function canAccess(pathname: string): Promise<boolean> {
  if (pathname.startsWith('submissions/')) {
    return canAccessSubmission(pathname)
  }
  // billing/ — 계량기 판독 원본 사진 등 내부 정산 자료. 관리자만.
  if (pathname.startsWith('billing/')) {
    return !!(await getSession())
  }
  // invoices/{period}/{tenant_id}.pdf — 관리자이거나 본인 기업만.
  if (pathname.startsWith('invoices/')) {
    const adminSession = await getSession()
    if (adminSession) return true
    const portalSession = await getPortalSession()
    if (!portalSession) return false
    const seg = pathname.split('/').pop() || ''
    const ownerId = Number(seg.replace(/\.pdf$/, ''))
    return Number.isInteger(ownerId) && ownerId === portalSession.tenant_id
  }
  // 미리보기 PDF는 원본 파일의 접근 권한을 상속 — submissions 원본이면 동일하게 보호
  if (pathname.startsWith('previews/')) {
    const sql = getDb()
    if (!sql) return false
    try {
      const rows = await sql`
        SELECT source_pathname FROM file_conversions WHERE preview_pathname = ${pathname}
      `
      const source: string | undefined = rows[0]?.source_pathname
      // 매핑을 못 찾으면 안전하게 차단
      if (!source) return false
      if (source.startsWith('submissions/')) return canAccessSubmission(source)
      return true
    } catch (error) {
      console.error('preview access check error:', error)
      return false
    }
  }
  return true
}

export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.searchParams.get('pathname')
    const wantsDownload = request.nextUrl.searchParams.get('download') !== null
    const overrideName = request.nextUrl.searchParams.get('name')

    if (!pathname) {
      return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
    }

    // '..' 등 경로 이동은 URL 정규화로 프리픽스 검사를 우회할 수 있으므로 전면 거부
    if (!isSafePathname(pathname)) {
      return new NextResponse('Not found', { status: 404 })
    }

    if (!(await canAccess(pathname))) {
      return new NextResponse('Not found', { status: 404 })
    }

    const result = await get(pathname, {
      access: 'private',
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    })

    if (!result) {
      return new NextResponse('Not found', { status: 404 })
    }

    // 업로드 경로는 `{folder}/{timestamp}-{name}` 이라 같은 URL의 내용이 바뀌지 않는다.
    // 따라서 공개 자산은 immutable로 길게 캐시해도 안전하다(s-maxage가 있어야 CDN이 캐시한다).
    // 비공개 자산은 절대 CDN에 올리면 안 되므로 기존 private, no-cache를 유지한다.
    const cacheControl = isPublicAsset(pathname)
      ? 'public, max-age=31536000, s-maxage=31536000, immutable'
      : 'private, no-cache'

    // Blob hasn't changed — tell the browser to use its cached copy
    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          'Cache-Control': cacheControl,
        },
      })
    }

    const headers: Record<string, string> = {
      'Content-Type': result.blob.contentType,
      ETag: result.blob.etag,
      'Cache-Control': cacheControl,
      // 업로드된 파일이 다른 타입으로 해석돼 실행되지 않도록
      'X-Content-Type-Options': 'nosniff',
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
