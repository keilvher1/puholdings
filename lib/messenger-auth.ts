import { cache } from "react"
import { getSession, getPortalSession } from "./auth"
import { getDb } from "./db"
import { AVATAR_COLORS, type MemberKind, type MemberRole } from "./messenger-types"

// 사내 메신저 — 세션 → 메신저 구성원(서버 전용).
// 관리자 세션(admin_token)이 있으면 정회원, 없으면 포털 세션(portal_token)을 보고 게스트로 본다.
// 첫 접속 때 messenger_members 행을 만든다(관리자: admins.name, 게스트: tenant_users.name + 회사명을 title로).
// 관리자 계정이 삭제됐거나(토큰은 남아 있어도) 퇴거 기업이면 null → 라우트는 401.

export interface MessengerMemberRow {
  id: number
  kind: MemberKind
  role: MemberRole
  admin_id: number | null
  tenant_user_id: number | null
  tenant_id: number | null // 게스트의 소속 기업(tenants.id)
  display_name: string
  title: string
  status_text: string
  away: boolean
  avatar_color: string
  last_seen_at: string | null
}

export function avatarColorFor(seed: number): string {
  const n = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function rowToMemberRow(r: Record<string, unknown>, tenantId: number | null): MessengerMemberRow {
  return {
    id: Number(r.id),
    kind: r.kind === "tenant" ? "tenant" : "admin",
    role: r.role === "guest" ? "guest" : "member",
    admin_id: r.admin_id === null || r.admin_id === undefined ? null : Number(r.admin_id),
    tenant_user_id: r.tenant_user_id === null || r.tenant_user_id === undefined ? null : Number(r.tenant_user_id),
    tenant_id: tenantId,
    display_name: String(r.display_name ?? ""),
    title: String(r.title ?? ""),
    status_text: String(r.status_text ?? ""),
    away: r.away === true,
    avatar_color: String(r.avatar_color || AVATAR_COLORS[AVATAR_COLORS.length - 1]),
    last_seen_at: toIso(r.last_seen_at),
  }
}

async function memberForAdmin(adminId: number): Promise<MessengerMemberRow | null> {
  const sql = getDb()
  if (!sql) return null
  // 관리자 계정이 실제로 있어야 한다(삭제된 계정의 남은 토큰 차단).
  const found = await sql`
    SELECT m.id, m.kind, m.role, m.admin_id, m.tenant_user_id, m.display_name, m.title, m.status_text,
           m.away, m.avatar_color, m.last_seen_at
    FROM messenger_members m
    JOIN admins a ON a.id = m.admin_id
    WHERE m.admin_id = ${adminId}
  `
  if (found.length > 0) return rowToMemberRow(found[0], null)
  const inserted = await sql`
    INSERT INTO messenger_members (kind, admin_id, role, display_name, avatar_color)
    SELECT 'admin', a.id, 'member',
           LEFT(COALESCE(NULLIF(TRIM(a.name), ''), SPLIT_PART(a.email, '@', 1), '관리자'), 80),
           ${avatarColorFor(adminId)}
    FROM admins a
    WHERE a.id = ${adminId}
    ON CONFLICT (admin_id) DO NOTHING
    RETURNING id, kind, role, admin_id, tenant_user_id, display_name, title, status_text, away, avatar_color, last_seen_at
  `
  if (inserted.length > 0) return rowToMemberRow(inserted[0], null)
  // 동시 첫 접속 경합: 다른 요청이 먼저 만들었으면 다시 읽는다.
  const again = await sql`
    SELECT m.id, m.kind, m.role, m.admin_id, m.tenant_user_id, m.display_name, m.title, m.status_text,
           m.away, m.avatar_color, m.last_seen_at
    FROM messenger_members m
    JOIN admins a ON a.id = m.admin_id
    WHERE m.admin_id = ${adminId}
  `
  return again.length > 0 ? rowToMemberRow(again[0], null) : null
}

async function memberForTenantUser(tenantUserId: number, tenantId: number): Promise<MessengerMemberRow | null> {
  const sql = getDb()
  if (!sql) return null
  const found = await sql`
    SELECT id, kind, role, admin_id, tenant_user_id, display_name, title, status_text, away, avatar_color, last_seen_at
    FROM messenger_members
    WHERE tenant_user_id = ${tenantUserId}
  `
  if (found.length > 0) return rowToMemberRow(found[0], tenantId)
  const inserted = await sql`
    INSERT INTO messenger_members (kind, tenant_user_id, role, display_name, title, avatar_color)
    SELECT 'tenant', u.id, 'guest',
           LEFT(COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(t.name), ''), SPLIT_PART(u.email, '@', 1)), 80),
           LEFT(COALESCE(t.name, ''), 120),
           ${avatarColorFor(tenantUserId + 4)}
    FROM tenant_users u
    JOIN tenants t ON t.id = u.tenant_id
    WHERE u.id = ${tenantUserId}
    ON CONFLICT (tenant_user_id) DO NOTHING
    RETURNING id, kind, role, admin_id, tenant_user_id, display_name, title, status_text, away, avatar_color, last_seen_at
  `
  if (inserted.length > 0) return rowToMemberRow(inserted[0], tenantId)
  const again = await sql`
    SELECT id, kind, role, admin_id, tenant_user_id, display_name, title, status_text, away, avatar_color, last_seen_at
    FROM messenger_members
    WHERE tenant_user_id = ${tenantUserId}
  `
  return again.length > 0 ? rowToMemberRow(again[0], tenantId) : null
}

// 요청 단위 메모이제이션(React cache) — 한 요청 안에서 여러 번 불러도 DB는 한 번.
export const getMessengerMember = cache(async function getMessengerMember(): Promise<MessengerMemberRow | null> {
  try {
    const admin = await getSession()
    if (admin && Number.isInteger(Number(admin.id))) {
      return await memberForAdmin(Number(admin.id))
    }
    // getPortalSession은 계정 존재·기업 status(active)를 DB로 다시 확인한다.
    const portal = await getPortalSession()
    if (portal && Number.isInteger(Number(portal.user_id))) {
      return await memberForTenantUser(Number(portal.user_id), Number(portal.tenant_id))
    }
    return null
  } catch (error) {
    console.error("Messenger member resolve error:", error)
    return null
  }
})
