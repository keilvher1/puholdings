import { NextResponse, type NextRequest } from "next/server"
import { jwtVerify } from "jose"
import { resolveJwtSecret } from "@/lib/jwt-secret"
import { safeNext } from "@/lib/safe-next"

// 화면 경로 보호(계획서 4.1.4·4.5.1, WP0b). 파일 이름은 middleware.ts 그대로 둔다(Next 16의 proxy.ts 이름 변경 경고는 무시).
// 경로를 먼저 /admin·/portal로 나눈 뒤 각자의 쿠키만 본다(포털 쿠키만 있는 브라우저가 /admin을 열면 관리자 로그인으로).
// /api/*는 matcher에 없다 — API는 각 라우트가 getSession()/getPortalSession()으로 직접 401을 돌려준다.
//
// /admin/*  : admin_token(JWT, role=admin 또는 role 없는 구버전)이 없거나 무효면 /admin/login?next=<경로+쿼리>.
//             /admin/login·/admin/setup은 그대로 통과. 최종 권한 판단은 지금처럼 각 화면의 getSession().
// /portal/* : portal_token(JWT, role=tenant)이 없거나 무효면 /portal/login?next=<경로+쿼리>.
//             이미 로그인한 입주기업이 로그인 화면을 열면 next(같은 영역만, safeNext) 또는 /portal로.
//             must_change_password면 next보다 우선해 /portal/settings 외 접근을 막는다(비밀번호 변경 강제).

const ADMIN_PUBLIC = ["/admin/login", "/admin/setup"]

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

/** 로그인 화면 주소. 돌아올 경로가 영역 첫 화면(/admin, /portal)뿐이면 next를 붙이지 않는다 */
function loginRedirect(request: NextRequest, area: "/admin" | "/portal"): NextResponse {
  const { pathname } = request.nextUrl
  // 클라이언트 이동 때 붙는 내부 파라미터(_rsc)는 돌아올 주소에 넣지 않는다
  const params = new URLSearchParams(request.nextUrl.search)
  params.delete("_rsc")
  const query = params.toString()
  const url = new URL(`${area}/login`, request.url)
  const back = safeNext(query ? `${pathname}?${query}` : pathname, `${area}/`)
  if (back && back !== area) url.searchParams.set("next", back)
  return NextResponse.redirect(url)
}

async function verifyRole(token: string | undefined, accept: (role: unknown) => boolean) {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, resolveJwtSecret())
    return accept(payload.role) ? payload : null
  } catch {
    return null
  }
}

async function guardAdmin(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  if (ADMIN_PUBLIC.some((p) => isUnder(pathname, p))) return NextResponse.next()
  // lib/auth.ts verifyToken과 같은 규칙: role 없는 토큰은 구버전 관리자 토큰, tenant 등 다른 role은 거부
  const payload = await verifyRole(request.cookies.get("admin_token")?.value, (role) => role === undefined || role === "admin")
  if (!payload) return loginRedirect(request, "/admin")
  return NextResponse.next()
}

async function guardPortal(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  // 서명키는 JWT_SECRET이 없으면 기존 DB 비밀 env에서 자동 파생된다(별도 설정 불필요).
  const payload = await verifyRole(request.cookies.get("portal_token")?.value, (role) => role === "tenant")

  if (pathname === "/portal/login") {
    // 이미 로그인된 입주기업은 로그인 화면 대신 포털로(비밀번호 변경이 필요하면 설정 화면이 먼저)
    if (payload) {
      if (payload.must_change_password === true) return NextResponse.redirect(new URL("/portal/settings", request.url))
      const back = safeNext(request.nextUrl.searchParams.get("next"), "/portal/") ?? "/portal"
      return NextResponse.redirect(new URL(back, request.url))
    }
    // 토큰이 없거나 무효면 로그인 화면 그대로
    return NextResponse.next()
  }

  if (!payload) return loginRedirect(request, "/portal")
  if (payload.must_change_password === true && pathname !== "/portal/settings") {
    return NextResponse.redirect(new URL("/portal/settings", request.url))
  }
  return NextResponse.next()
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isUnder(pathname, "/admin")) return guardAdmin(request)
  if (isUnder(pathname, "/portal")) return guardPortal(request)
  return NextResponse.next()
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/portal", "/portal/:path*"],
}
