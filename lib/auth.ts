import { cookies } from "next/headers"
import { getDb } from "./db"
import bcrypt from "bcryptjs"
import { SignJWT, jwtVerify } from "jose"

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("JWT_SECRET 환경 변수가 설정되지 않았습니다. Vercel 프로젝트 설정 또는 .env.local에 JWT_SECRET을 추가하세요.")
  }
  return new TextEncoder().encode(secret)
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
  return new SignJWT({ id: user.id, email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(getJwtSecret())
}

export async function verifyToken(token: string): Promise<AdminUser | null> {
  const secret = getJwtSecret()
  try {
    const { payload } = await jwtVerify(token, secret)
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
