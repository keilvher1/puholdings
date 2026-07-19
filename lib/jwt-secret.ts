// 토큰 서명/검증 키 결정. lib/auth와 middleware가 동일한 키를 쓰도록 공용화.
//
// 우선순위:
//   1) JWT_SECRET (명시적으로 설정한 경우)
//   2) POSTGRES_PASSWORD / DATABASE_URL 등 이미 존재하는 비밀 env에서 파생
//      → 별도 env 설정 없이도 로그인이 동작하고, 소스코드에 비밀이 박히지 않음
//   3) 로컬/데모 최후 기본값
//
// (HMAC-HS256 키는 임의 길이 문자열을 그대로 쓸 수 있으므로 별도 해시가 필요 없다.
//  node:crypto를 쓰지 않아 edge/node 미들웨어 어디서나 안전하게 import된다.)
export function resolveJwtSecret(): Uint8Array {
  const secret =
    process.env.JWT_SECRET ||
    process.env.POSTGRES_PASSWORD ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    "puholdings-local-dev-secret"
  return new TextEncoder().encode(`puholdings-auth::${secret}`)
}
