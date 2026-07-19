import { cookies } from "next/headers"
import { getDb } from "./db"
import bcrypt from "bcryptjs"
import { SignJWT, jwtVerify } from "jose"
import { randomInt } from "node:crypto"
import { resolveJwtSecret } from "./jwt-secret"

// 서명키는 JWT_SECRET이 없으면 기존 DB 비밀 env에서 자동 파생된다(별도 설정 불필요).
function getJwtSecret(): Uint8Array {
  return resolveJwtSecret()
}

// Demo mode credentials (used when DATABASE_URL is not set)
const DEMO_ADMIN = {
  id: 1,
  email: "admin@puholdings.com",
  name: "관리자",
  password: "pong1234"
}

export function isDemoMode(): boolean {
  return !process.env.DATABASE_URL
}

export interface AdminUser {
  id: number
  email: string
  name: string | null
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createToken(user: AdminUser): Promise<string> {
  return new SignJWT({ role: "admin", id: user.id, email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(getJwtSecret())
}

export async function verifyToken(token: string): Promise<AdminUser | null> {
  const secret = getJwtSecret()
  try {
    const { payload } = await jwtVerify(token, secret)
    // role 없는 토큰은 구버전 admin 토큰(하위 호환). tenant 등 다른 role은 거부.
    if (payload.role !== undefined && payload.role !== "admin") return null
    return payload as unknown as AdminUser
  } catch {
    return null
  }
}

export async function getSession(): Promise<AdminUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get("admin_token")?.value
  if (!token) return null
  return verifyToken(token)
}

export async function login(email: string, password: string): Promise<{ success: boolean; error?: string; user?: AdminUser }> {
  // Demo mode - use hardcoded credentials
  if (isDemoMode()) {
    if (email === DEMO_ADMIN.email && password === DEMO_ADMIN.password) {
      const user: AdminUser = { id: DEMO_ADMIN.id, email: DEMO_ADMIN.email, name: DEMO_ADMIN.name }
      return { success: true, user }
    }
    return { success: false, error: "이메일 또는 비밀번호가 올바르지 않습니다" }
  }

  const sql = getDb()
  if (!sql) return { success: false, error: "데이터베이스 연결 실패" }

  try {
    const rows = await sql`SELECT id, email, name, password_hash FROM admins WHERE email = ${email}`
    if (rows.length === 0) {
      return { success: false, error: "이메일 또는 비밀번호가 올바르지 않습니다" }
    }

    const admin = rows[0]
    const valid = await verifyPassword(password, admin.password_hash)
    if (!valid) {
      return { success: false, error: "이메일 또는 비밀번호가 올바르지 않습니다" }
    }

    // Update last login
    await sql`UPDATE admins SET last_login = NOW() WHERE id = ${admin.id}`

    const user: AdminUser = { id: admin.id, email: admin.email, name: admin.name }
    return { success: true, user }
  } catch (error) {
    console.error("Login error:", error)
    return { success: false, error: "로그인 중 오류가 발생했습니다" }
  }
}

export async function createAdmin(email: string, password: string, name: string): Promise<{ success: boolean; error?: string }> {
  // Demo mode - skip actual creation, just succeed
  if (isDemoMode()) {
    return { success: true }
  }

  const sql = getDb()
  if (!sql) return { success: false, error: "데이터베이스 연결 실패" }

  try {
    const existing = await sql`SELECT id FROM admins WHERE email = ${email}`
    if (existing.length > 0) {
      return { success: false, error: "이미 존재하는 이메일입니다" }
    }

    const hash = await hashPassword(password)
    await sql`INSERT INTO admins (email, password_hash, name) VALUES (${email}, ${hash}, ${name})`
    return { success: true }
  } catch (error) {
    console.error("Create admin error:", error)
    return { success: false, error: "관리자 생성 중 오류가 발생했습니다" }
  }
}

// ---------- 입주기업 포털 (tenant portal) ----------

export interface TenantSession {
  role: "tenant"
  tenant_id: number
  user_id: number
  email: string
  name: string | null
  must_change_password: boolean
}

export async function createPortalToken(session: TenantSession): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(getJwtSecret())
}

export async function verifyPortalToken(token: string): Promise<TenantSession | null> {
  const secret = getJwtSecret()
  try {
    const { payload } = await jwtVerify(token, secret)
    if (payload.role !== "tenant") return null
    return payload as unknown as TenantSession
  } catch {
    return null
  }
}

// 토큰 검증 + DB 재검증: 퇴거/삭제/비밀번호 초기화가 기존 토큰에 즉시 반영되도록
// 계정 존재 여부와 기업 status를 매 요청 확인하고, must_change_password는 DB 값으로 갱신한다.
export async function getPortalSession(): Promise<TenantSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get("portal_token")?.value
  if (!token) return null

  const session = await verifyPortalToken(token)
  if (!session) return null

  const sql = getDb()
  if (!sql) return null

  try {
    const rows = await sql`
      SELECT u.must_change_password, t.status AS tenant_status
      FROM tenant_users u
      JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = ${session.user_id} AND u.tenant_id = ${session.tenant_id}
    `
    if (rows.length === 0 || rows[0].tenant_status !== "active") return null
    return { ...session, must_change_password: rows[0].must_change_password }
  } catch (error) {
    console.error("Portal session validation error:", error)
    return null
  }
}

// 계정 미존재 시 타이밍 오라클 방지용 더미 해시 ("dummy-password-for-timing"의 bcrypt)
const DUMMY_PASSWORD_HASH = "$2b$12$umPF0oRJiqmj9YV5duIkQO3bX34Fqe5xpKzF3r6wqketr3lr0q/iW"

// 임시 비밀번호: 혼동되기 쉬운 문자(0/O, 1/l/I) 제외
function generateTempPassword(length = 10): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  let out = ""
  for (let i = 0; i < length; i++) {
    out += chars[randomInt(chars.length)]
  }
  return out
}

export async function tenantLogin(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; session?: TenantSession }> {
  const sql = getDb()
  if (!sql) return { success: false, error: "데이터베이스 연결 실패" }

  try {
    const rows = await sql`
      SELECT u.id, u.tenant_id, u.email, u.password_hash, u.name, u.must_change_password,
             t.status AS tenant_status
      FROM tenant_users u
      JOIN tenants t ON t.id = u.tenant_id
      WHERE u.email = ${email}
    `
    if (rows.length === 0) {
      // 계정 존재 여부가 응답 시간으로 드러나지 않도록 더미 비교 수행
      await verifyPassword(password, DUMMY_PASSWORD_HASH)
      return { success: false, error: "이메일 또는 비밀번호가 올바르지 않습니다" }
    }

    const row = rows[0]
    const valid = await verifyPassword(password, row.password_hash)
    if (!valid) {
      return { success: false, error: "이메일 또는 비밀번호가 올바르지 않습니다" }
    }
    if (row.tenant_status !== "active") {
      return { success: false, error: "퇴거 처리된 기업의 계정입니다. 관리자에게 문의하세요" }
    }

    await sql`UPDATE tenant_users SET last_login = NOW() WHERE id = ${row.id}`

    return {
      success: true,
      session: {
        role: "tenant",
        tenant_id: row.tenant_id,
        user_id: row.id,
        email: row.email,
        name: row.name,
        must_change_password: row.must_change_password,
      },
    }
  } catch (error) {
    console.error("Tenant login error:", error)
    return { success: false, error: "로그인 중 오류가 발생했습니다" }
  }
}

// 계정 발급: 해당 기업의 계정이 없으면 생성, 있으면 비밀번호 초기화.
// 생성된 임시 비밀번호는 이 함수의 반환값으로만 노출된다(해시만 저장).
export async function createTenantUser(
  tenantId: number,
  email: string,
  name: string | null
): Promise<{ success: boolean; error?: string; tempPassword?: string; email?: string }> {
  const sql = getDb()
  if (!sql) return { success: false, error: "데이터베이스 연결 실패" }

  try {
    const tenants = await sql`SELECT id FROM tenants WHERE id = ${tenantId}`
    if (tenants.length === 0) {
      return { success: false, error: "존재하지 않는 기업입니다" }
    }

    // 다른 기업이 이미 쓰는 이메일인지 확인 (email UNIQUE)
    const emailOwner = await sql`
      SELECT tenant_id FROM tenant_users WHERE email = ${email}
    `
    if (emailOwner.length > 0 && emailOwner[0].tenant_id !== tenantId) {
      return { success: false, error: "이미 다른 기업 계정에서 사용 중인 이메일입니다" }
    }

    const tempPassword = generateTempPassword()
    const hash = await hashPassword(tempPassword)

    // tenant_id UNIQUE 인덱스를 아비터로 사용해 기업당 계정 1개를 원자적으로 보장
    await sql`
      INSERT INTO tenant_users (tenant_id, email, password_hash, name, must_change_password)
      VALUES (${tenantId}, ${email}, ${hash}, ${name}, TRUE)
      ON CONFLICT (tenant_id) DO UPDATE
      SET email = EXCLUDED.email,
          name = EXCLUDED.name,
          password_hash = EXCLUDED.password_hash,
          must_change_password = TRUE
    `

    return { success: true, tempPassword, email }
  } catch (error) {
    console.error("Create tenant user error:", error)
    return { success: false, error: "계정 발급 중 오류가 발생했습니다" }
  }
}

export async function changeTenantPassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const sql = getDb()
  if (!sql) return { success: false, error: "데이터베이스 연결 실패" }

  try {
    const rows = await sql`SELECT id, password_hash FROM tenant_users WHERE id = ${userId}`
    if (rows.length === 0) {
      return { success: false, error: "계정을 찾을 수 없습니다" }
    }

    const valid = await verifyPassword(currentPassword, rows[0].password_hash)
    if (!valid) {
      return { success: false, error: "현재 비밀번호가 올바르지 않습니다" }
    }

    const hash = await hashPassword(newPassword)
    await sql`
      UPDATE tenant_users
      SET password_hash = ${hash}, must_change_password = FALSE
      WHERE id = ${userId}
    `
    return { success: true }
  } catch (error) {
    console.error("Change tenant password error:", error)
    return { success: false, error: "비밀번호 변경 중 오류가 발생했습니다" }
  }
}

// Initialize admin table if needed
export async function initAdminTable(): Promise<void> {
  if (isDemoMode()) return

  const sql = getDb()
  if (!sql) return

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      )
    `
  } catch (error) {
    console.error("Init admin table error:", error)
  }
}
