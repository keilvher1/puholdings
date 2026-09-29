// 사내 메신저(잔디 벤치마킹) — 서버 공용 로직(서버 전용: API 라우트에서만 import).
//
// 원칙
// - 데이터 범위는 messenger_room_members(방 참여)로만 정한다. 방 관련 요청은 requireRoomMember()로 확인.
// - 모든 쓰기 동작은 messenger_events에 이벤트를 남긴다(recordEvent). 이벤트에는 id만 담고,
//   /sync가 보는 사람 기준으로 현재 상태를 다시 읽어(hydrate) 내려준다 — 반응·별표·투표 내 선택 같은
//   사람마다 다른 값이 정확하고, 같은 이벤트를 여러 번 받아도 결과가 같다.
// - 시스템 알림 토픽은 postSystemMessage() 단일 진입점.
import { NextResponse } from "next/server"
import type { NeonQueryFunction } from "@neondatabase/serverless"
import { getDb } from "./db"
import { isSafePathname } from "./upload"
import { getMessengerMember, avatarColorFor, type MessengerMemberRow } from "./messenger-auth"
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MENTION_RE,
  MESSENGER_MAX_FILE_BYTES,
  type MessageKind,
  type MessengerAttachment,
  type MessengerMember,
  type MessengerMessage,
  type MessengerPoll,
  type MessengerRoom,
  type MessengerTodo,
  type ReactionSummary,
  type RoomKind,
} from "./messenger-types"

export type Sql = NeonQueryFunction<false, false>
export type { MessengerMemberRow }

// ── 응답·입력 공용 ─────────────────────────────────────────────────────────────
export function fail(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error, ...extra }, { status })
}

// JSON 본문 읽기. Content-Type이 application/json이 아니면 읽지 않는다(null) — text/plain 폼 전송처럼
// 사전 요청(preflight) 없이 다른 사이트에서 보낼 수 있는 형식으로 JSON을 흉내 내는 CSRF를 막는다.
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
  if (type !== "application/json") return null
  try {
    const body = await request.json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function parseId(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "number" ? v : NaN
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export function parseIdList(v: unknown, max = 200): number[] | null {
  if (!Array.isArray(v) || v.length > max) return null
  const out: number[] = []
  for (const x of v) {
    const id = parseId(x)
    if (id === null) return null
    if (!out.includes(id)) out.push(id)
  }
  return out
}

// 테이블이 아직 없을 때(마이그레이션 미실행) 친절한 안내로 바꾼다.
export function dbErrorMessage(error: unknown, fallback: string): string {
  const code = (error as { code?: string } | null)?.code
  if (code === "42P01" || code === "42703") {
    return "메신저 테이블이 아직 준비되지 않았습니다. 관리자에게 DB 마이그레이션(2026-messenger-01.sql) 실행을 요청하세요."
  }
  return fallback
}

export function serverError(error: unknown, label: string, fallback: string) {
  console.error(`Messenger ${label} error:`, error)
  return fail(dbErrorMessage(error, fallback), 500)
}

// 쓰기 요청(GET·HEAD 외)이 같은 사이트 화면에서 왔는지 확인한다(CSRF 방어).
// admin_token 쿠키가 SameSite=None이라 다른 사이트의 폼·no-cors fetch에도 쿠키가 실린다.
// - Sec-Fetch-Site가 있으면 same-origin 또는 none(주소창·북마크)만 허용.
// - 없으면 Origin 호스트가 요청 호스트와 같아야 한다.
// - 둘 다 없으면 브라우저가 아닌 호출(서버 간·테스트)이므로 허용 — 브라우저는 교차 출처 POST에 Origin을 항상 붙인다.
export function isSameOriginRequest(request: Request): boolean {
  const method = request.method.toUpperCase()
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true
  const site = request.headers.get("sec-fetch-site")
  if (site) return site === "same-origin" || site === "none"
  const origin = request.headers.get("origin")
  if (!origin) return true
  if (origin === "null") return false
  let originHost: string
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return false
  }
  const hosts = new Set<string>()
  try {
    hosts.add(new URL(request.url).host.toLowerCase())
  } catch {
    // 무시
  }
  for (const h of [request.headers.get("x-forwarded-host"), request.headers.get("host")]) {
    if (h) hosts.add(h.split(",")[0].trim().toLowerCase())
  }
  return hosts.has(originHost)
}

// 모든 /api/messenger/* 라우트(웹훅 수신 제외) 맨 앞에서 호출한다. 쓰기 요청은 같은 출처 확인도 한다.
export async function requireMessenger(request: Request): Promise<
  { sql: Sql; me: MessengerMemberRow; response?: undefined } | { sql?: undefined; me?: undefined; response: NextResponse }
> {
  if (!isSameOriginRequest(request)) return { response: fail("허용되지 않은 요청 출처입니다", 403) }
  const sql = getDb()
  if (!sql) return { response: fail("데이터베이스 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.", 500) }
  const me = await getMessengerMember()
  if (!me) return { response: fail("인증이 필요합니다", 401) }
  return { sql, me }
}

// ── 값 변환 ────────────────────────────────────────────────────────────────────
export function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toJson<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T
    } catch {
      return fallback
    }
  }
  return v as T
}

function pgIntArray(v: unknown): number[] {
  if (Array.isArray(v)) return v.map(Number).filter((n) => Number.isFinite(n))
  if (typeof v === "string") {
    const s = v.replace(/^\{|\}$/g, "").trim()
    return s ? s.split(",").map(Number).filter((n) => Number.isFinite(n)) : []
  }
  return []
}

// LIKE 패턴 특수문자 이스케이프(기본 이스케이프 문자 '\')
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

// ── 구성원 ─────────────────────────────────────────────────────────────────────
export function memberFromRow(r: Record<string, unknown>): MessengerMember {
  return {
    id: Number(r.id),
    kind: r.kind === "tenant" ? "tenant" : "admin",
    role: r.role === "guest" ? "guest" : "member",
    display_name: String(r.display_name ?? ""),
    title: String(r.title ?? ""),
    status_text: String(r.status_text ?? ""),
    away: r.away === true,
    avatar_color: String(r.avatar_color || avatarColorFor(Number(r.id))),
    last_seen_at: toIso(r.last_seen_at),
  }
}

export function publicMember(me: MessengerMemberRow): MessengerMember {
  return {
    id: me.id,
    kind: me.kind,
    role: me.role,
    display_name: me.display_name,
    title: me.title,
    status_text: me.status_text,
    away: me.away,
    avatar_color: me.avatar_color,
    last_seen_at: me.last_seen_at,
  }
}

// 아직 메신저에 한 번도 들어오지 않은 관리자(·입주기업 계정)도 초대·대화 상대로 고를 수 있게
// messenger_members 행을 미리 만든다. NOT EXISTS로 거르므로 이미 있는 계정은 시퀀스도 쓰지 않는다.
// 반환: 새로 만든 구성원 id
export async function provisionMembers(sql: Sql, opts: { tenants?: boolean } = {}): Promise<number[]> {
  const includeTenants = opts.tenants !== false
  const rows = await sql`
    WITH ins_admins AS (
      INSERT INTO messenger_members (kind, admin_id, role, display_name, avatar_color)
      SELECT 'admin', a.id, 'member',
             LEFT(COALESCE(NULLIF(TRIM(a.name), ''), SPLIT_PART(a.email, '@', 1), '관리자'), 80),
             (ARRAY['#2563eb','#0891b2','#059669','#65a30d','#d97706','#dc2626','#db2777','#7c3aed','#475569'])[(a.id % 9) + 1]
      FROM admins a
      WHERE NOT EXISTS (SELECT 1 FROM messenger_members m WHERE m.admin_id = a.id)
      ON CONFLICT DO NOTHING
      RETURNING id
    ), ins_tenants AS (
      INSERT INTO messenger_members (kind, tenant_user_id, role, display_name, title, avatar_color)
      SELECT 'tenant', u.id, 'guest',
             LEFT(COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(t.name), ''), SPLIT_PART(u.email, '@', 1)), 80),
             LEFT(COALESCE(t.name, ''), 120),
             (ARRAY['#2563eb','#0891b2','#059669','#65a30d','#d97706','#dc2626','#db2777','#7c3aed','#475569'])[((u.id + 4) % 9) + 1]
      FROM tenant_users u
      JOIN tenants t ON t.id = u.tenant_id
      WHERE ${includeTenants}::boolean
        AND t.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM messenger_members m WHERE m.tenant_user_id = u.id)
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT id FROM ins_admins UNION ALL SELECT id FROM ins_tenants
  `
  const ids = rows.map((r) => Number(r.id))
  if (ids.length > 0) {
    await recordEvents(sql, ids.map((id) => ({ room_id: null, type: "member.updated", payload: { member_id: id } })))
  }
  return ids
}

// 내가 볼 수 있는 구성원.
// - 정회원: 활성 계정 전원(관리자 + 입주 중인 기업 계정) + 나와 같은 방에 있는 사람(퇴거 기업 등 과거 작성자 이름 표시용)
// - 게스트: 나 + 나와 같은 방에 있는 사람
export async function loadVisibleMembers(sql: Sql, me: MessengerMemberRow): Promise<MessengerMember[]> {
  const isMember = me.role === "member"
  const rows = await sql`
    SELECT m.id, m.kind, m.role, m.display_name, m.title, m.status_text, m.away, m.avatar_color, m.last_seen_at
    FROM messenger_members m
    LEFT JOIN admins a ON a.id = m.admin_id
    LEFT JOIN tenant_users u ON u.id = m.tenant_user_id
    LEFT JOIN tenants t ON t.id = u.tenant_id
    WHERE m.id = ${me.id}
       OR (${isMember}::boolean AND (a.id IS NOT NULL OR (u.id IS NOT NULL AND t.status = 'active')))
       OR m.id IN (
         SELECT x.member_id FROM messenger_room_members x
         WHERE x.room_id IN (SELECT y.room_id FROM messenger_room_members y WHERE y.member_id = ${me.id})
       )
    ORDER BY CASE WHEN m.role = 'member' THEN 0 ELSE 1 END, m.display_name, m.id
  `
  return rows.map(memberFromRow)
}

// 지정한 id들이 "내가 볼 수 있고 활성인" 구성원인지 — 초대·토픽 생성·DM 상대 검증용.
// 반환: 유효한 id 목록(입력 순서 유지). 호출자가 길이를 비교해 거절한다.
export async function filterInvitableMembers(sql: Sql, me: MessengerMemberRow, ids: number[]): Promise<number[]> {
  if (ids.length === 0) return []
  const isMember = me.role === "member"
  const rows = await sql`
    SELECT m.id
    FROM messenger_members m
    LEFT JOIN admins a ON a.id = m.admin_id
    LEFT JOIN tenant_users u ON u.id = m.tenant_user_id
    LEFT JOIN tenants t ON t.id = u.tenant_id
    WHERE m.id = ANY(${ids}::int[])
      AND (a.id IS NOT NULL OR (u.id IS NOT NULL AND t.status = 'active'))
      AND (
        ${isMember}::boolean
        OR m.id = ${me.id}
        OR m.id IN (
          SELECT x.member_id FROM messenger_room_members x
          WHERE x.room_id IN (SELECT y.room_id FROM messenger_room_members y WHERE y.member_id = ${me.id})
        )
      )
  `
  const ok = new Set(rows.map((r) => Number(r.id)))
  return ids.filter((id) => ok.has(id))
}

// ── 멘션 ───────────────────────────────────────────────────────────────────────
// 본문의 '@[이름](m:ID)' / '@[전체](m:all)' 토큰을 읽는다. @전체는 -1.
export function parseMentions(body: string): number[] {
  const out: number[] = []
  if (!body) return out
  const re = new RegExp(MENTION_RE.source, "g")
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const id = m[2] === "all" ? -1 : Number(m[2])
    if (Number.isSafeInteger(id) && (id === -1 || id > 0) && !out.includes(id)) out.push(id)
  }
  return out
}

// 본문 멘션 + 요청의 mentions를 합쳐 방 참여자(또는 -1)만 남긴다.
export function resolveMentions(body: string, extra: unknown, roomMemberIds: number[]): number[] {
  const ids = parseMentions(body)
  if (Array.isArray(extra)) {
    for (const x of extra) {
      const n = x === "all" ? -1 : Number(x)
      if (Number.isSafeInteger(n) && !ids.includes(n)) ids.push(n)
    }
  }
  const allowed = new Set(roomMemberIds)
  return ids.filter((id) => id === -1 || allowed.has(id))
}

// ── 이벤트(동기화 로그) ────────────────────────────────────────────────────────
export type EventType =
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "room.updated"
  | "room.removed"
  | "read"
  | "member.updated"
  | "todo.updated"

export interface EventInput {
  room_id: number | null
  member_id?: number | null // 있으면 그 구성원에게만 보이는 이벤트
  type: EventType
  // message.*: { message_id } · room.*: {} · read: { member_id, last_read_message_id }
  // member.updated: { member_id } · todo.updated: { todo_id }
  payload: Record<string, unknown>
}

export async function recordEvents(sql: Sql, events: EventInput[]): Promise<void> {
  if (events.length === 0) return
  const json = JSON.stringify(
    events.map((e) => ({ room_id: e.room_id, member_id: e.member_id ?? null, type: e.type, payload: e.payload ?? {} }))
  )
  await sql`
    INSERT INTO messenger_events (room_id, member_id, type, payload)
    SELECT x.room_id, x.member_id, x.type, COALESCE(x.payload, '{}'::jsonb)
    FROM jsonb_to_recordset(${json}::jsonb) AS x(room_id int, member_id int, type text, payload jsonb)
  `
}

export async function recordEvent(sql: Sql, event: EventInput): Promise<void> {
  await recordEvents(sql, [event])
}

// 이벤트가 아직 커밋 중일 수 있는 최근 몇 초는 커서를 넘기지 않는다(BIGSERIAL 순서와 커밋 순서가
// 어긋나 이벤트를 건너뛰는 것 방지). 그 구간의 이벤트는 다음 sync에 다시 올 수 있다(병합은 멱등).
export const SYNC_SETTLE_SECONDS = 4
// 이 시간 안에 접속 기록이 있으면 '접속 중'(화면 presenceOf와 같은 3분)
export const PRESENCE_ONLINE_SECONDS = 180
export const EVENT_RETENTION_DAYS = 7
export const SYNC_BATCH_LIMIT = 500

// 현재 이벤트 커서(bootstrap용): 커밋이 끝났다고 볼 수 있는 가장 큰 id
export async function currentCursor(sql: Sql): Promise<number> {
  const rows = await sql`
    SELECT
      (SELECT min(id) FROM messenger_events WHERE created_at >= now() - make_interval(secs => ${SYNC_SETTLE_SECONDS})) AS first_unsettled,
      (SELECT max(id) FROM messenger_events) AS max_id
  `
  const firstUnsettled = toNumOrNull(rows[0]?.first_unsettled)
  const maxId = toNumOrNull(rows[0]?.max_id) ?? 0
  return firstUnsettled !== null ? Math.max(0, firstUnsettled - 1) : maxId
}

export async function cleanupOldEvents(sql: Sql): Promise<void> {
  await sql`DELETE FROM messenger_events WHERE created_at < now() - make_interval(days => ${EVENT_RETENTION_DAYS})`
}

// ── 방 접근 ────────────────────────────────────────────────────────────────────
export interface RoomAccess {
  id: number
  kind: RoomKind
  name: string
  description: string
  is_private: boolean
  is_archived: boolean
  system_slug: string | null
  created_by: number | null
  announcement_message_id: number | null
  my_role: "admin" | "member"
  last_read_message_id: number | null
}

// 내가 참여한 방이면 방 정보, 아니면 null(라우트는 404).
export async function requireRoomMember(sql: Sql, roomId: number, memberId: number): Promise<RoomAccess | null> {
  const rows = await sql`
    SELECT r.id, r.kind, r.name, r.description, r.is_private, r.is_archived, r.system_slug, r.created_by,
           r.announcement_message_id, rm.role AS my_role, rm.last_read_message_id
    FROM messenger_rooms r
    JOIN messenger_room_members rm ON rm.room_id = r.id AND rm.member_id = ${memberId}
    WHERE r.id = ${roomId}
  `
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    id: Number(r.id),
    kind: r.kind === "dm" ? "dm" : "topic",
    name: String(r.name ?? ""),
    description: String(r.description ?? ""),
    is_private: r.is_private === true,
    is_archived: r.is_archived === true,
    system_slug: r.system_slug ? String(r.system_slug) : null,
    created_by: toNumOrNull(r.created_by),
    announcement_message_id: toNumOrNull(r.announcement_message_id),
    my_role: r.my_role === "admin" ? "admin" : "member",
    last_read_message_id: toNumOrNull(r.last_read_message_id),
  }
}

// 토픽 관리자: 토픽이고, 정회원이고, (방 생성자 또는 방 admin). 시스템 토픽은 참여 정회원 모두.
export function isTopicAdmin(room: RoomAccess, me: MessengerMemberRow): boolean {
  if (room.kind !== "topic" || me.role !== "member") return false
  if (room.system_slug) return true
  return room.created_by === me.id || room.my_role === "admin"
}

export async function roomMemberIds(sql: Sql, roomId: number): Promise<number[]> {
  const rows = await sql`SELECT member_id FROM messenger_room_members WHERE room_id = ${roomId} ORDER BY member_id`
  return rows.map((r) => Number(r.member_id))
}

// 방에 새로 들어온 사람은 과거 메시지를 안 읽음으로 세지 않도록 last_read를 현재 마지막 메시지로 둔다.
// 반환: 실제로 추가된 구성원 id
export async function addRoomMembers(
  sql: Sql,
  roomId: number,
  memberIds: number[],
  role: "admin" | "member" = "member"
): Promise<number[]> {
  if (memberIds.length === 0) return []
  const rows = await sql`
    INSERT INTO messenger_room_members (room_id, member_id, role, last_read_message_id)
    SELECT ${roomId}, x, ${role}, (SELECT max(id) FROM messenger_messages WHERE room_id = ${roomId})
    FROM unnest(${memberIds}::int[]) AS x
    ON CONFLICT (room_id, member_id) DO NOTHING
    RETURNING member_id
  `
  return rows.map((r) => Number(r.member_id))
}

// ── 메시지 읽기(hydrate) ───────────────────────────────────────────────────────
// 메시지 id 목록 → 보는 사람(meId) 기준 MessengerMessage. 반응·별표·안 읽은 수·투표·할 일·댓글 수·
// 공유 원본을 한 번의 쿼리로 채운다. 없는 id는 결과에서 빠진다.
export async function loadMessages(sql: Sql, meId: number, ids: number[]): Promise<Map<number, MessengerMessage>> {
  const out = new Map<number, MessengerMessage>()
  const uniq = [...new Set(ids.filter((n) => Number.isSafeInteger(n) && n > 0))]
  if (uniq.length === 0) return out
  const rows = await sql`
    SELECT m.id, m.room_id, m.author_id, m.author_label, m.kind, m.body, m.attachments, m.connect_color, m.connect_info,
           m.mentions, m.parent_id, m.edited_at, m.deleted_at, m.created_at,
           (SELECT count(*) FROM messenger_messages c WHERE c.parent_id = m.id AND c.deleted_at IS NULL)::int AS reply_count,
           (SELECT max(c.created_at) FROM messenger_messages c WHERE c.parent_id = m.id AND c.deleted_at IS NULL) AS last_reply_at,
           (SELECT COALESCE(json_agg(json_build_object('emoji', x.emoji, 'count', x.n, 'member_ids', x.ids) ORDER BY x.first_at), '[]'::json)
              FROM (SELECT r.emoji, count(*)::int AS n, array_agg(r.member_id ORDER BY r.created_at) AS ids, min(r.created_at) AS first_at
                    FROM messenger_reactions r WHERE r.message_id = m.id GROUP BY r.emoji) x) AS reactions,
           EXISTS (SELECT 1 FROM messenger_bookmarks b WHERE b.message_id = m.id AND b.member_id = ${meId}) AS bookmarked,
           CASE WHEN m.deleted_at IS NOT NULL THEN 0 ELSE (
             SELECT count(*) FROM messenger_room_members rm
             WHERE rm.room_id = m.room_id
               AND rm.member_id IS DISTINCT FROM m.author_id
               AND rm.joined_at <= m.created_at
               AND COALESCE(rm.last_read_message_id, 0) < m.id
           ) END::int AS unread_by,
           (SELECT json_build_object(
                     'id', p.id, 'question', p.question, 'options', p.options, 'multiple', p.multiple,
                     'anonymous', p.anonymous, 'closes_at', p.closes_at,
                     'closed', (p.closed OR (p.closes_at IS NOT NULL AND p.closes_at <= now())),
                     'votes', COALESCE((SELECT json_agg(json_build_array(v.option_index, v.member_id) ORDER BY v.created_at)
                                        FROM messenger_poll_votes v WHERE v.poll_id = p.id), '[]'::json))
              FROM messenger_polls p WHERE p.message_id = m.id) AS poll,
           (SELECT json_build_object(
                     'id', t.id, 'room_id', t.room_id, 'message_id', t.message_id, 'title', t.title,
                     'assignee_ids', t.assignee_ids, 'due_date', to_char(t.due_date, 'YYYY-MM-DD'),
                     'done_at', t.done_at, 'done_by', t.done_by, 'created_by', t.created_by, 'created_at', t.created_at)
              FROM messenger_todos t WHERE t.message_id = m.id ORDER BY t.id LIMIT 1) AS todo,
           (SELECT json_build_object(
                     'message_id', s.id,
                     'room_name', CASE WHEN sr.kind = 'dm' THEN '' ELSE sr.name END,
                     'author_name', COALESCE(sa.display_name, s.author_label))
              FROM messenger_messages s
              JOIN messenger_rooms sr ON sr.id = s.room_id
              LEFT JOIN messenger_members sa ON sa.id = s.author_id
              WHERE s.id = m.shared_from_id) AS shared_from
    FROM messenger_messages m
    WHERE m.id = ANY(${uniq}::bigint[])
  `
  for (const r of rows) {
    const msg = messageFromRow(r, meId)
    out.set(msg.id, msg)
  }
  return out
}

// 순서를 지키며 hydrate(없는 id는 빠짐)
export async function loadMessageList(sql: Sql, meId: number, ids: number[]): Promise<MessengerMessage[]> {
  const map = await loadMessages(sql, meId, ids)
  const out: MessengerMessage[] = []
  for (const id of ids) {
    const m = map.get(id)
    if (m) out.push(m)
  }
  return out
}

export async function loadMessage(sql: Sql, meId: number, id: number): Promise<MessengerMessage | null> {
  return (await loadMessages(sql, meId, [id])).get(id) ?? null
}

function attachmentsFrom(v: unknown): MessengerAttachment[] {
  const arr = toJson<unknown>(v, [])
  if (!Array.isArray(arr)) return []
  const out: MessengerAttachment[] = []
  for (const a of arr) {
    if (!a || typeof a !== "object") continue
    const o = a as Record<string, unknown>
    if (typeof o.pathname !== "string") continue
    out.push({
      name: String(o.name ?? ""),
      pathname: o.pathname,
      size: Number(o.size) || 0,
      type: String(o.type ?? ""),
      width: toNumOrNull(o.width),
      height: toNumOrNull(o.height),
    })
  }
  return out
}

function connectInfoFrom(v: unknown): { title: string; description: string }[] {
  const arr = toJson<unknown>(v, [])
  if (!Array.isArray(arr)) return []
  return arr
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>
      return { title: String(o.title ?? ""), description: String(o.description ?? "") }
    })
}

function numberList(v: unknown): number[] {
  if (typeof v === "string" && v.startsWith("{")) return pgIntArray(v) // Postgres 배열 문자열 '{1,2}'
  const arr = toJson<unknown>(v, [])
  return Array.isArray(arr) ? arr.map(Number).filter((n) => Number.isFinite(n)) : []
}

export function todoFromRow(r: Record<string, unknown>): MessengerTodo {
  return {
    id: Number(r.id),
    room_id: Number(r.room_id),
    message_id: toNumOrNull(r.message_id),
    title: String(r.title ?? ""),
    assignee_ids: numberList(r.assignee_ids),
    due_date: r.due_date ? String(r.due_date).slice(0, 10) : null,
    done: r.done_at !== null && r.done_at !== undefined,
    done_by: toNumOrNull(r.done_by),
    done_at: toIso(r.done_at),
    created_by: Number(r.created_by ?? 0),
    created_at: toIso(r.created_at) ?? "",
  }
}

export function pollFromJson(v: unknown, meId: number): MessengerPoll | null {
  const p = toJson<Record<string, unknown> | null>(v, null)
  if (!p || typeof p !== "object") return null
  const options = Array.isArray(p.options) ? (p.options as unknown[]).map((o) => String(o)) : []
  const votes = Array.isArray(p.votes) ? (p.votes as unknown[]) : []
  const counts = options.map(() => 0)
  const voters = options.map(() => [] as number[])
  const voterSet = new Set<number>()
  const mine: number[] = []
  for (const v of votes) {
    if (!Array.isArray(v)) continue
    const opt = Number(v[0])
    const mid = Number(v[1])
    if (!Number.isInteger(opt) || opt < 0 || opt >= options.length) continue
    counts[opt]++
    voters[opt].push(mid)
    voterSet.add(mid)
    if (mid === meId && !mine.includes(opt)) mine.push(opt)
  }
  const anonymous = p.anonymous === true
  const poll: MessengerPoll = {
    id: Number(p.id),
    question: String(p.question ?? ""),
    options,
    multiple: p.multiple === true,
    anonymous,
    closes_at: toIso(p.closes_at),
    closed: p.closed === true,
    counts,
    voter_count: voterSet.size,
    my_votes: mine.sort((a, b) => a - b),
  }
  if (!anonymous) poll.voters = voters.map((member_ids, option) => ({ option, member_ids }))
  return poll
}

export function messageFromRow(r: Record<string, unknown>, meId: number): MessengerMessage {
  const deleted = r.deleted_at !== null && r.deleted_at !== undefined
  const kind = String(r.kind ?? "text") as MessageKind
  const reactionsRaw = toJson<unknown>(r.reactions, [])
  const reactions: ReactionSummary[] = Array.isArray(reactionsRaw)
    ? reactionsRaw.map((x) => {
        const o = x as Record<string, unknown>
        return { emoji: String(o.emoji ?? ""), count: Number(o.count) || 0, member_ids: numberList(o.member_ids) }
      })
    : []
  const todoJson = toJson<Record<string, unknown> | null>(r.todo, null)
  const shared = toJson<Record<string, unknown> | null>(r.shared_from, null)
  return {
    id: Number(r.id),
    room_id: Number(r.room_id),
    author_id: toNumOrNull(r.author_id),
    author_label: String(r.author_label ?? ""),
    kind,
    body: deleted ? "" : String(r.body ?? ""),
    attachments: deleted ? [] : attachmentsFrom(r.attachments),
    connect_color: deleted ? "" : String(r.connect_color ?? ""),
    connect_info: deleted ? [] : connectInfoFrom(r.connect_info),
    mentions: deleted ? [] : numberList(r.mentions),
    parent_id: toNumOrNull(r.parent_id),
    reply_count: Number(r.reply_count) || 0,
    last_reply_at: toIso(r.last_reply_at),
    shared_from:
      shared && !deleted
        ? {
            message_id: Number(shared.message_id),
            room_name: String(shared.room_name ?? ""),
            author_name: String(shared.author_name ?? ""),
          }
        : null,
    reactions: deleted ? [] : reactions,
    bookmarked: r.bookmarked === true,
    unread_by: Number(r.unread_by) || 0,
    poll: deleted ? null : pollFromJson(r.poll, meId),
    todo: todoJson && !deleted ? todoFromRow(todoJson) : null,
    edited_at: toIso(r.edited_at),
    deleted,
    created_at: toIso(r.created_at) ?? "",
  }
}

export async function loadTodos(sql: Sql, ids: number[]): Promise<Map<number, MessengerTodo>> {
  const out = new Map<number, MessengerTodo>()
  const uniq = [...new Set(ids.filter((n) => Number.isSafeInteger(n) && n > 0))]
  if (uniq.length === 0) return out
  const rows = await sql`
    SELECT id, room_id, message_id, title, assignee_ids, to_char(due_date, 'YYYY-MM-DD') AS due_date,
           done_at, done_by, created_by, created_at
    FROM messenger_todos
    WHERE id = ANY(${uniq}::int[])
  `
  for (const r of rows) {
    const t = todoFromRow(r)
    out.set(t.id, t)
  }
  return out
}

// ── 방 읽기(hydrate) ───────────────────────────────────────────────────────────
// 내가 참여한 방 → MessengerRoom(내 설정·안 읽은 수·멘션 수·마지막 메시지·공지 포함).
// roomIds를 주면 그 방들만(참여하지 않은 방은 빠진다).
export async function loadRooms(sql: Sql, meId: number, roomIds?: number[]): Promise<MessengerRoom[]> {
  const all = roomIds === undefined
  const ids = all ? [] : [...new Set(roomIds.filter((n) => Number.isSafeInteger(n) && n > 0))]
  if (!all && ids.length === 0) return []
  const rows = await sql`
    SELECT r.id, r.kind, r.name, r.description, r.is_private, r.is_archived, r.created_by, r.created_at,
           r.announcement_message_id, r.system_slug,
           rm.role AS my_role, rm.starred, rm.muted, rm.last_read_message_id,
           (SELECT COALESCE(array_agg(x.member_id ORDER BY x.joined_at, x.member_id), '{}')
              FROM messenger_room_members x WHERE x.room_id = r.id) AS member_ids,
           (SELECT count(*) FROM messenger_messages m
             WHERE m.room_id = r.id AND m.parent_id IS NULL AND m.deleted_at IS NULL
               AND m.id > COALESCE(rm.last_read_message_id, 0)
               AND m.author_id IS DISTINCT FROM rm.member_id
               AND NOT (m.kind = 'system' AND m.author_id IS NULL AND m.author_label = ''))::int AS unread_count,
           (SELECT count(*) FROM messenger_messages m
             WHERE m.room_id = r.id AND m.deleted_at IS NULL
               AND m.id > COALESCE(rm.last_read_message_id, 0)
               AND m.author_id IS DISTINCT FROM rm.member_id
               AND (m.mentions @> jsonb_build_array(rm.member_id) OR m.mentions @> '[-1]'::jsonb))::int AS mention_count,
           (SELECT max(m.id) FROM messenger_messages m
             WHERE m.room_id = r.id AND m.parent_id IS NULL AND m.deleted_at IS NULL) AS last_message_id,
           (SELECT count(*) FROM messenger_webhooks w WHERE w.room_id = r.id)::int AS webhook_count
    FROM messenger_room_members rm
    JOIN messenger_rooms r ON r.id = rm.room_id
    WHERE rm.member_id = ${meId}
      AND (${all}::boolean OR r.id = ANY(${ids}::int[]))
    ORDER BY r.id
  `
  const msgIds: number[] = []
  for (const r of rows) {
    const last = toNumOrNull(r.last_message_id)
    const ann = toNumOrNull(r.announcement_message_id)
    if (last) msgIds.push(last)
    if (ann) msgIds.push(ann)
  }
  const msgs = await loadMessages(sql, meId, msgIds)
  return rows.map((r) => {
    const last = toNumOrNull(r.last_message_id)
    const annId = toNumOrNull(r.announcement_message_id)
    const ann = annId ? msgs.get(annId) ?? null : null
    const room: MessengerRoom = {
      id: Number(r.id),
      kind: r.kind === "dm" ? "dm" : "topic",
      name: String(r.name ?? ""),
      description: String(r.description ?? ""),
      is_private: r.kind === "dm" ? true : r.is_private === true,
      is_archived: r.is_archived === true,
      created_by: toNumOrNull(r.created_by),
      created_at: toIso(r.created_at) ?? "",
      member_ids: pgIntArray(r.member_ids),
      announcement: ann && !ann.deleted ? ann : null,
      starred: r.starred === true,
      muted: r.muted === true,
      last_read_message_id: toNumOrNull(r.last_read_message_id),
      unread_count: Number(r.unread_count) || 0,
      mention_count: Number(r.mention_count) || 0,
      last_message: last ? msgs.get(last) ?? null : null,
      webhook_count: Number(r.webhook_count) || 0,
    }
    return room
  })
}

export async function loadRoom(sql: Sql, meId: number, roomId: number): Promise<MessengerRoom | null> {
  return (await loadRooms(sql, meId, [roomId]))[0] ?? null
}

// ── 메시지 쓰기 ────────────────────────────────────────────────────────────────
export interface NewMessage {
  room_id: number
  author_id: number | null
  author_label?: string
  kind: MessageKind
  body?: string
  attachments?: MessengerAttachment[]
  connect_color?: string
  connect_info?: { title: string; description: string }[]
  mentions?: number[]
  parent_id?: number | null
  shared_from_id?: number | null
}

// 메시지 한 건을 넣고 이벤트(message.created, 댓글이면 원본 message.updated)를 남긴다.
// 작성자가 사람이면 그 방의 내 last_read를 새 메시지까지 올리고 read 이벤트를 남긴다.
// 반환: 새 메시지 id
export async function createMessage(sql: Sql, m: NewMessage): Promise<number> {
  const rows = await sql`
    INSERT INTO messenger_messages
      (room_id, author_id, author_label, kind, body, attachments, connect_color, connect_info, mentions, parent_id, shared_from_id)
    VALUES
      (${m.room_id}, ${m.author_id}, ${(m.author_label ?? "").slice(0, 80)}, ${m.kind}, ${m.body ?? ""},
       ${JSON.stringify(m.attachments ?? [])}::jsonb, ${(m.connect_color ?? "").slice(0, 9)},
       ${JSON.stringify(m.connect_info ?? [])}::jsonb, ${JSON.stringify(m.mentions ?? [])}::jsonb,
       ${m.parent_id ?? null}, ${m.shared_from_id ?? null})
    RETURNING id
  `
  const id = Number(rows[0].id)
  const events: EventInput[] = [{ room_id: m.room_id, type: "message.created", payload: { message_id: id } }]
  if (m.parent_id) events.push({ room_id: m.room_id, type: "message.updated", payload: { message_id: m.parent_id } })
  const touches: Promise<unknown>[] = [sql`UPDATE messenger_rooms SET updated_at = now() WHERE id = ${m.room_id}`]
  if (m.author_id !== null) {
    touches.push(
      sql`
        UPDATE messenger_room_members SET last_read_message_id = ${id}
        WHERE room_id = ${m.room_id} AND member_id = ${m.author_id}
          AND (last_read_message_id IS NULL OR last_read_message_id < ${id})
      `
    )
    events.push({ room_id: m.room_id, type: "read", payload: { member_id: m.author_id, last_read_message_id: id } })
  }
  await Promise.all([...touches, recordEvents(sql, events)])
  return id
}

// 입장·초대·나가기 같은 안내 메시지(작성자 없음, 발신자 이름 없음) — 안 읽은 수에는 세지 않는다.
export async function postNotice(sql: Sql, roomId: number, text: string): Promise<number> {
  return createMessage(sql, { room_id: roomId, author_id: null, author_label: "", kind: "system", body: text })
}

// 첨부 배열 검증: messenger/{room_id}/ 아래의 안전한 경로만.
export function parseAttachments(
  raw: unknown,
  roomId: number
): { ok: true; value: MessengerAttachment[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] }
  if (!Array.isArray(raw)) return { ok: false, error: "첨부 형식이 올바르지 않습니다" }
  if (raw.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return { ok: false, error: `첨부는 한 번에 ${MAX_ATTACHMENTS_PER_MESSAGE}개까지 보낼 수 있습니다` }
  }
  const prefix = `messenger/${roomId}/`
  const out: MessengerAttachment[] = []
  for (const a of raw) {
    if (!a || typeof a !== "object") return { ok: false, error: "첨부 형식이 올바르지 않습니다" }
    const o = a as Record<string, unknown>
    const pathname = typeof o.pathname === "string" ? o.pathname : ""
    if (!isSafePathname(pathname) || !pathname.startsWith(prefix)) {
      return { ok: false, error: "첨부 파일 경로가 올바르지 않습니다" }
    }
    const size = Number(o.size)
    if (!Number.isFinite(size) || size < 0 || size > MESSENGER_MAX_FILE_BYTES) {
      return { ok: false, error: "첨부 파일 크기가 올바르지 않습니다" }
    }
    const name = (typeof o.name === "string" ? o.name : "").trim().slice(0, 255) || pathname.split("/").pop() || "파일"
    const type = (typeof o.type === "string" ? o.type : "").slice(0, 200)
    const width = toNumOrNull(o.width)
    const height = toNumOrNull(o.height)
    out.push({
      name,
      pathname,
      size: Math.trunc(size),
      type,
      width: width !== null && width > 0 ? Math.trunc(width) : null,
      height: height !== null && height > 0 ? Math.trunc(height) : null,
    })
  }
  return { ok: true, value: out }
}

// ── 시스템 알림 토픽 ──────────────────────────────────────────────────────────
const SYSTEM_ROOMS: Record<string, { name: string; description: string; label: string }> = {
  alerts: { name: "시스템 알림", description: "문의 접수·증빙 도착·청구서 발행 알림", label: "시스템 알림" },
}

export interface SystemMessageInput {
  slug?: "alerts"
  text: string
  info?: { title: string; description: string }[]
  color?: string // 커넥트 영역 색(#hex)
}

// 시스템 알림 토픽(system_slug 'alerts', 비공개, 정회원 전원 참여)에 메시지를 넣는다.
// 방이 없으면 만들고, 아직 참여하지 않은 정회원을 넣는다. 실패해도 throw하지 않는다.
// 응답을 늦추지 않으려면 호출 쪽에서 after(() => postSystemMessage(...))로 부른다.
export async function postSystemMessage(input: SystemMessageInput): Promise<{ success: boolean; message_id?: number }> {
  try {
    const sql = getDb()
    if (!sql) return { success: false }
    const slug = input.slug ?? "alerts"
    const def = SYSTEM_ROOMS[slug]
    if (!def) return { success: false }
    const text = String(input.text ?? "").trim().slice(0, 5000)
    const info = (Array.isArray(input.info) ? input.info : [])
      .slice(0, 20)
      .map((x) => ({ title: String(x?.title ?? "").slice(0, 200), description: String(x?.description ?? "").slice(0, 1000) }))
    if (!text && info.length === 0) return { success: false }
    const color = typeof input.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(input.color) ? input.color : ""

    // 관리자 계정이 메신저에 들어온 적이 없어도 알림을 받도록 구성원 행을 먼저 만든다.
    await provisionMembers(sql, { tenants: false })

    let roomId: number | null = null
    const existing = await sql`SELECT id FROM messenger_rooms WHERE system_slug = ${slug}`
    if (existing.length > 0) {
      roomId = Number(existing[0].id)
    } else {
      const created = await sql`
        INSERT INTO messenger_rooms (kind, name, description, is_private, system_slug)
        VALUES ('topic', ${def.name}, ${def.description}, true, ${slug})
        ON CONFLICT (system_slug) DO NOTHING
        RETURNING id
      `
      if (created.length > 0) roomId = Number(created[0].id)
      else {
        const again = await sql`SELECT id FROM messenger_rooms WHERE system_slug = ${slug}`
        roomId = again.length > 0 ? Number(again[0].id) : null
      }
    }
    if (!roomId) return { success: false }

    const added = await sql`
      INSERT INTO messenger_room_members (room_id, member_id, role, last_read_message_id)
      SELECT ${roomId}, m.id, 'member', (SELECT max(id) FROM messenger_messages WHERE room_id = ${roomId})
      FROM messenger_members m
      JOIN admins a ON a.id = m.admin_id
      WHERE m.role = 'member'
      ON CONFLICT (room_id, member_id) DO NOTHING
      RETURNING member_id
    `
    if (added.length > 0) await recordEvent(sql, { room_id: roomId, type: "room.updated", payload: {} })

    const messageId = await createMessage(sql, {
      room_id: roomId,
      author_id: null,
      author_label: def.label,
      kind: "system",
      body: text,
      connect_color: color,
      connect_info: info,
    })
    return { success: true, message_id: messageId }
  } catch (error) {
    console.error("postSystemMessage error:", error)
    return { success: false }
  }
}

// ── 동기화 ─────────────────────────────────────────────────────────────────────
// cursor 이후 "내 방" 이벤트를 보는 사람 기준으로 hydrate해 돌려준다.
// - 방 이벤트: 지금 참여 중인 방만. 대상 지정 이벤트(member_id): 나에게 온 것만.
// - member.updated: 정회원은 전부, 게스트는 볼 수 있는 구성원만.
// - 같은 대상의 중복 이벤트는 마지막 것만(메시지는 created가 있으면 updated 생략 — created가 현재 상태를 담는다).
// - 커서 바로 다음 이벤트가 정리(7일)로 사라졌거나, 있을 수 없는 미래 값이면 reset:true.
export async function syncEvents(
  sql: Sql,
  me: MessengerMemberRow,
  cursor: number
): Promise<{ events: MessengerEventOut[]; cursor: number; reset?: boolean }> {
  const [meta, rows] = await Promise.all([
    sql`
      SELECT
        (SELECT min(id) FROM messenger_events
          WHERE id > ${cursor} AND created_at >= now() - make_interval(secs => ${SYNC_SETTLE_SECONDS})) AS first_unsettled,
        (SELECT max(id) FROM messenger_events
          WHERE id > ${cursor} AND created_at < now() - make_interval(secs => ${SYNC_SETTLE_SECONDS})) AS max_settled,
        (SELECT max(id) FROM messenger_events) AS max_id,
        (SELECT min(id) FROM messenger_events) AS min_id
    `,
    sql`
      SELECT e.id, e.room_id, e.member_id, e.type, e.payload
      FROM messenger_events e
      WHERE e.id > ${cursor}
        AND (
          e.member_id = ${me.id}
          OR (e.member_id IS NULL AND (
                e.room_id IS NULL
                OR e.room_id IN (SELECT room_id FROM messenger_room_members WHERE member_id = ${me.id})
             ))
        )
      ORDER BY e.id
      LIMIT ${SYNC_BATCH_LIMIT + 1}
    `,
  ])
  const m = meta[0] ?? {}
  const maxId = toNumOrNull(m.max_id) ?? 0
  const minId = toNumOrNull(m.min_id)
  // 정리(7일)로 커서 바로 다음 이벤트가 사라졌으면(가장 오래 남은 id가 cursor+1보다 크면) 놓친 변경이 있을 수 있다.
  // cursor+1이 남아 있는 가장 오래된 이벤트면 빠진 게 없다 — 정리 직후 bootstrap한 커서가 reset을 반복하지 않는다.
  if (cursor > 0 && (minId === null || minId > cursor + 1 || cursor > maxId)) {
    return { events: [], cursor: 0, reset: true }
  }

  const truncated = rows.length > SYNC_BATCH_LIMIT
  const batch = truncated ? rows.slice(0, SYNC_BATCH_LIMIT) : rows
  const firstUnsettled = toNumOrNull(m.first_unsettled)
  const maxSettled = toNumOrNull(m.max_settled)
  let next = firstUnsettled !== null ? firstUnsettled - 1 : maxSettled ?? cursor
  if (truncated) next = Math.min(next, Number(batch[batch.length - 1].id))
  next = Math.max(next, cursor)

  // 중복 정리: 뒤에서부터 보며 대상별 마지막 이벤트만 남긴다.
  type Raw = { id: number; room_id: number | null; type: string; payload: Record<string, unknown> }
  const raws: Raw[] = batch.map((r) => ({
    id: Number(r.id),
    room_id: toNumOrNull(r.room_id),
    type: String(r.type),
    payload: toJson<Record<string, unknown>>(r.payload, {}),
  }))
  // 나만 받는 room.updated(내 별표·알림 설정 변경)가 섞인 방 — 화면이 개인 필드도 받아들이도록 personal 표시
  const personalRooms = new Set<number>()
  for (const r of batch) {
    if (String(r.type) === "room.updated" && r.member_id !== null && r.member_id !== undefined && r.room_id !== null) {
      personalRooms.add(Number(r.room_id))
    }
  }
  const createdIds = new Set<number>()
  for (const e of raws) if (e.type === "message.created") createdIds.add(Number(e.payload.message_id))
  const seen = new Set<string>()
  const kept: Raw[] = []
  for (let i = raws.length - 1; i >= 0; i--) {
    const e = raws[i]
    let key: string
    switch (e.type) {
      case "message.created":
        key = `mc:${e.payload.message_id}`
        break
      case "message.updated":
        if (createdIds.has(Number(e.payload.message_id))) continue
        key = `mu:${e.payload.message_id}`
        break
      case "message.deleted":
        key = `md:${e.payload.message_id}`
        break
      case "room.updated":
      case "room.removed":
        key = `r:${e.room_id}` // 방의 마지막 상태(참여/빠짐)만 의미 있다
        break
      case "read":
        key = `rd:${e.room_id}:${e.payload.member_id}`
        break
      case "member.updated":
        key = `mb:${e.payload.member_id}`
        break
      case "todo.updated":
        key = `t:${e.payload.todo_id}`
        break
      default:
        continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    kept.unshift(e)
  }

  // hydrate
  const msgIds: number[] = []
  const roomIds: number[] = []
  const todoIds: number[] = []
  const memberIds: number[] = []
  for (const e of kept) {
    if (e.type === "message.created" || e.type === "message.updated") msgIds.push(Number(e.payload.message_id))
    else if (e.type === "room.updated" && e.room_id) roomIds.push(e.room_id)
    else if (e.type === "todo.updated") todoIds.push(Number(e.payload.todo_id))
    else if (e.type === "member.updated") memberIds.push(Number(e.payload.member_id))
  }
  const [msgs, rooms, todos, members] = await Promise.all([
    loadMessages(sql, me.id, msgIds),
    roomIds.length > 0 ? loadRooms(sql, me.id, roomIds) : Promise.resolve([] as MessengerRoom[]),
    loadTodos(sql, todoIds),
    memberIds.length > 0 ? loadMembersForViewer(sql, me, memberIds) : Promise.resolve(new Map<number, MessengerMember>()),
  ])
  const roomMap = new Map(rooms.map((r) => [r.id, r]))

  const events: MessengerEventOut[] = []
  for (const e of kept) {
    switch (e.type) {
      case "message.created":
      case "message.updated": {
        const msg = msgs.get(Number(e.payload.message_id))
        if (msg) events.push({ id: e.id, type: e.type, room_id: msg.room_id, message: msg })
        break
      }
      case "message.deleted": {
        const mid = parseId(e.payload.message_id)
        if (mid && e.room_id) events.push({ id: e.id, type: "message.deleted", room_id: e.room_id, message_id: mid })
        break
      }
      case "room.updated": {
        const room = e.room_id ? roomMap.get(e.room_id) : undefined
        if (room) {
          const ev: MessengerEventOut = { id: e.id, type: "room.updated", room_id: room.id, room }
          events.push(personalRooms.has(room.id) ? ({ ...ev, personal: true } as MessengerEventOut) : ev)
        }
        else if (e.room_id) events.push({ id: e.id, type: "room.removed", room_id: e.room_id }) // 그 사이 빠졌다
        break
      }
      case "room.removed": {
        if (e.room_id) events.push({ id: e.id, type: "room.removed", room_id: e.room_id })
        break
      }
      case "read": {
        const mid = parseId(e.payload.member_id)
        const last = parseId(e.payload.last_read_message_id)
        if (e.room_id && mid && last) {
          events.push({ id: e.id, type: "read", room_id: e.room_id, member_id: mid, last_read_message_id: last })
        }
        break
      }
      case "member.updated": {
        const mb = members.get(Number(e.payload.member_id))
        if (mb) events.push({ id: e.id, type: "member.updated", member: mb })
        break
      }
      case "todo.updated": {
        const t = todos.get(Number(e.payload.todo_id))
        if (t && e.room_id) events.push({ id: e.id, type: "todo.updated", room_id: e.room_id, todo: t })
        break
      }
    }
  }

  // 접속 표시(30초에 한 번만 기록). 한동안(3분) 접속이 없다가 돌아온 경우에만 member.updated를 남겨
  // 다른 사람 화면의 초록 점이 바로 켜지게 한다(계속 접속 중일 때는 화면이 1분마다 구성원 목록을 다시 받는다).
  const touched = await sql`
    WITH prev AS (SELECT id, last_seen_at FROM messenger_members WHERE id = ${me.id})
    UPDATE messenger_members m SET last_seen_at = now()
    FROM prev
    WHERE m.id = prev.id AND (prev.last_seen_at IS NULL OR prev.last_seen_at < now() - interval '30 seconds')
    RETURNING (prev.last_seen_at IS NULL OR prev.last_seen_at < now() - make_interval(secs => ${PRESENCE_ONLINE_SECONDS})) AS came_online
  `
  if (touched[0]?.came_online === true) {
    await recordEvent(sql, { room_id: null, type: "member.updated", payload: { member_id: me.id } })
  }
  return { events, cursor: next }
}

export type MessengerEventOut = import("./messenger-types").MessengerEvent

// 지정한 구성원 중 내가 볼 수 있는 사람만(게스트는 같은 방 참여자만).
export async function loadMembersForViewer(
  sql: Sql,
  me: MessengerMemberRow,
  ids: number[]
): Promise<Map<number, MessengerMember>> {
  const out = new Map<number, MessengerMember>()
  const uniq = [...new Set(ids.filter((n) => Number.isSafeInteger(n) && n > 0))]
  if (uniq.length === 0) return out
  const isMember = me.role === "member"
  const rows = await sql`
    SELECT m.id, m.kind, m.role, m.display_name, m.title, m.status_text, m.away, m.avatar_color, m.last_seen_at
    FROM messenger_members m
    WHERE m.id = ANY(${uniq}::int[])
      AND (
        ${isMember}::boolean
        OR m.id = ${me.id}
        OR m.id IN (
          SELECT x.member_id FROM messenger_room_members x
          WHERE x.room_id IN (SELECT y.room_id FROM messenger_room_members y WHERE y.member_id = ${me.id})
        )
      )
  `
  for (const r of rows) {
    const mb = memberFromRow(r)
    out.set(mb.id, mb)
  }
  return out
}

// ── 메시지 접근 ────────────────────────────────────────────────────────────────
export interface MessageAccess {
  id: number
  room_id: number
  author_id: number | null
  author_label: string
  kind: MessageKind
  parent_id: number | null
  deleted: boolean
  body: string
  attachments: MessengerAttachment[]
  connect_color: string
  connect_info: { title: string; description: string }[]
  room: RoomAccess
}

// 메시지가 내가 참여한 방의 것이면 메시지·방 정보, 아니면 null(라우트는 404).
export async function requireMessageAccess(sql: Sql, messageId: number, memberId: number): Promise<MessageAccess | null> {
  const rows = await sql`
    SELECT m.id, m.room_id, m.author_id, m.author_label, m.kind, m.parent_id, m.deleted_at, m.body, m.attachments,
           m.connect_color, m.connect_info,
           r.kind AS room_kind, r.name AS room_name, r.description AS room_description, r.is_private, r.is_archived,
           r.system_slug, r.created_by, r.announcement_message_id, rm.role AS my_role, rm.last_read_message_id
    FROM messenger_messages m
    JOIN messenger_rooms r ON r.id = m.room_id
    JOIN messenger_room_members rm ON rm.room_id = m.room_id AND rm.member_id = ${memberId}
    WHERE m.id = ${messageId}
  `
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    id: Number(r.id),
    room_id: Number(r.room_id),
    author_id: toNumOrNull(r.author_id),
    author_label: String(r.author_label ?? ""),
    kind: String(r.kind) as MessageKind,
    parent_id: toNumOrNull(r.parent_id),
    deleted: r.deleted_at !== null && r.deleted_at !== undefined,
    body: String(r.body ?? ""),
    attachments: attachmentsFrom(r.attachments),
    connect_color: String(r.connect_color ?? ""),
    connect_info: connectInfoFrom(r.connect_info),
    room: {
      id: Number(r.room_id),
      kind: r.room_kind === "dm" ? "dm" : "topic",
      name: String(r.room_name ?? ""),
      description: String(r.room_description ?? ""),
      is_private: r.is_private === true,
      is_archived: r.is_archived === true,
      system_slug: r.system_slug ? String(r.system_slug) : null,
      created_by: toNumOrNull(r.created_by),
      announcement_message_id: toNumOrNull(r.announcement_message_id),
      my_role: r.my_role === "admin" ? "admin" : "member",
      last_read_message_id: toNumOrNull(r.last_read_message_id),
    },
  }
}

// ── 파일 모아보기 ──────────────────────────────────────────────────────────────
// GET rooms/[id]/files, GET search?type=files 응답 항목
export interface MessengerFileItem extends MessengerAttachment {
  message_id: number
  room_id: number
  author_id: number | null
  parent_id: number | null // 댓글에 붙은 파일이면 원본 메시지 id(파일 → 메시지로 이동용)
  created_at: string
}

export function fileItemFromRow(r: Record<string, unknown>): MessengerFileItem | null {
  const att = attachmentsFrom([toJson<unknown>(r.att, null)])[0]
  if (!att) return null
  return {
    ...att,
    message_id: Number(r.message_id),
    room_id: Number(r.room_id),
    author_id: toNumOrNull(r.author_id),
    parent_id: toNumOrNull(r.parent_id),
    created_at: toIso(r.created_at) ?? "",
  }
}
