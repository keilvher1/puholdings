import { NextResponse, type NextRequest } from "next/server"
import { jwtVerify } from "jose"

// /portal/* 보호: portal_token(JWT, role=tenant) 없거나 유효하지 않으면 /portal/login으로.
// must_change_password인 세션은 /portal/settings 외 접근을 차단해 비밀번호 변경을 강제한다.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get("portal_token")?.value

  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("JWT_SECRET 환경 변수가 설정되지 않았습니다. Vercel 프로젝트 설정 또는 .env.local에 JWT_SECRET을 추가하세요.")
  }

  if (pathname === "/portal/login") {
    // 이미 로그인된 입주기업은 로그인 페이지 대신 대시보드로
    if (token) {
      try {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(secret))
        if (payload.role === "tenant") {
          return NextResponse.redirect(new URL("/portal", request.url))
        }
      } catch {
        // 유효하지 않은 토큰이면 로그인 페이지 그대로 표시
      }
    }
    return NextResponse.next()
  }

  const loginUrl = new URL("/portal/login", request.url)
  if (!token) {
    return NextResponse.redirect(loginUrl)
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret))
    if (payload.role !== "tenant") {
      return NextResponse.redirect(loginUrl)
    }
    if (payload.must_change_password === true && pathname !== "/portal/settings") {
      return NextResponse.redirect(new URL("/portal/settings", request.url))
    }
    return NextResponse.next()
  } catch {
    return NextResponse.redirect(loginUrl)
  }
}

export const config = {
  matcher: ["/portal/:path*"],
}
