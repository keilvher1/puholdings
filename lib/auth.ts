import { cookies } from "next/headers"
import { getDb } from "./db"
import bcrypt from "bcryptjs"
import { SignJWT, jwtVerify } from "jose"

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "puholdings-cms-secret-key-change-in-production"
)

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
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<AdminUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
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
