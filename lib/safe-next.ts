// 로그인 뒤 돌아갈 경로(next 파라미터) 검사 — 관리자 로그인(WP1)·포털 로그인(WP8)·미들웨어(WP0b)가 같이 쓴다(계획서 2.2).
// 같은 사이트 안, 지정한 영역(prefix) 아래 경로만 통과시킨다. 다른 사이트(https://evil…, //evil, /\evil)나
// 경로 조작(/admin/../portal)은 null을 돌려준다. 순수 함수.
//
// 사용 예:
//   import { safeNext } from "@/lib/safe-next"
//   router.replace(safeNext(nextParam, "/admin/") ?? "/admin")
//   const next = safeNext(request.nextUrl.searchParams.get("next"), "/portal/")
//
// 반환: 통과하면 "경로 + 쿼리"(해시는 버림), 아니면 null.
//   prefix 자체("/admin")는 통과, 그 영역의 로그인 화면(prefix + "login")은 되돌림 고리를 막으려고 null.

export function safeNext(raw: string | null | undefined, prefix: "/admin/" | "/portal/" | string): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!value || value.length > 2000) return null
  // 반드시 "/"로 시작하는 같은 사이트 경로. "//host"·"/\host"(브라우저가 //로 읽음)는 다른 사이트다.
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null
  // 제어 문자·역슬래시는 받지 않는다(브라우저마다 해석이 달라 우회 수단이 된다)
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null

  let url: URL
  try {
    url = new URL(value, "http://x")
  } catch {
    return null
  }
  if (url.origin !== "http://x") return null

  const base = prefix.endsWith("/") ? prefix : `${prefix}/`
  const root = base.slice(0, -1)
  const path = url.pathname
  if (path !== root && !path.startsWith(base)) return null
  if (path === `${base}login` || path.startsWith(`${base}login/`)) return null
  return path + url.search
}
