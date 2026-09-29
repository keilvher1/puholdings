import { NextResponse } from "next/server"
import {
  fail,
  isTopicAdmin,
  requireMessenger,
  requireRoomMember,
  serverError,
  toIso,
  type RoomAccess,
  type Sql,
} from "@/lib/messenger"
import { WEBHOOK_TOKEN_RE, generateWebhookToken, publishRoomUpdate, toId, webhookUrl } from "@/lib/messenger-extras"

// /api/messenger/rooms/[id]/webhooks — 토픽 Incoming Webhook(잔디 호환) 관리.
// 정회원이면서 토픽 관리자(방 생성자 또는 방 admin)만. DM에는 웹훅을 만들 수 없다.
// 주소: {APP_URL}/api/messenger/hooks/{token} — 외부 서비스가 이 주소로 POST하면 토픽에 메시지가 올라온다.

const MAX_WEBHOOKS_PER_ROOM = 20

export interface MessengerWebhookInfo {
  id: number
  room_id: number
  name: string
  url: string
  created_by: number | null
  created_at: string | null
  last_used_at: string | null
}

type Guard =
  | { ok: true; sql: Sql; roomId: number; access: RoomAccess; memberId: number }
  | { ok: false; res: NextResponse }

async function guard(request: Request, params: Promise<{ id: string }>): Promise<Guard> {
  const auth = await requireMessenger(request)
  if (auth.response) return { ok: false, res: auth.response }
  const { sql, me: member } = auth
  const roomId = toId((await params).id)
  if (!roomId) return { ok: false, res: fail("대화방을 찾을 수 없습니다", 404) }
  let access: RoomAccess | null
  try {
    access = await requireRoomMember(sql, roomId, member.id)
  } catch (error) {
    return { ok: false, res: serverError(error, "webhooks guard", "대화방을 확인하지 못했습니다") }
  }
  if (!access) return { ok: false, res: fail("대화방을 찾을 수 없습니다", 404) }
  if (access.kind !== "topic") return { ok: false, res: fail("웹훅은 토픽에서만 쓸 수 있습니다", 400) }
  if (!isTopicAdmin(access, member)) return { ok: false, res: fail("토픽 관리자만 웹훅을 관리할 수 있습니다", 403) }
  return { ok: true, sql, roomId, access, memberId: member.id }
}

function origin(request: Request): string {
  return process.env.APP_URL || new URL(request.url).origin
}

function toInfo(r: Record<string, unknown>, base: string): MessengerWebhookInfo {
  return {
    id: Number(r.id),
    room_id: Number(r.room_id),
    name: String(r.name ?? ""),
    url: webhookUrl(base, String(r.token)),
    created_by: r.created_by === null || r.created_by === undefined ? null : Number(r.created_by),
    created_at: toIso(r.created_at),
    last_used_at: toIso(r.last_used_at),
  }
}

// GET → { success, webhooks: MessengerWebhookInfo[] }
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, params)
  if (!g.ok) return g.res
  try {
    const rows = await g.sql`
      SELECT id, room_id, name, token, created_by, created_at, last_used_at
      FROM messenger_webhooks WHERE room_id = ${g.roomId} ORDER BY id
    `
    const base = origin(request)
    return NextResponse.json({ success: true, webhooks: rows.map((r) => toInfo(r, base)) })
  } catch (error) {
    return serverError(error, "webhooks list", "웹훅 목록을 불러오지 못했습니다")
  }
}

// POST { name } → { success, webhook: MessengerWebhookInfo }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, params)
  if (!g.ok) return g.res
  if (g.access.is_archived) return fail("보관된 토픽입니다", 409)
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null
  const name = typeof body?.name === "string" ? body.name.replace(/\s+/g, " ").trim() : ""
  if (!name) return fail("웹훅 이름을 입력해 주세요", 400)
  if (name.length > 80) return fail("웹훅 이름은 80자 이하여야 합니다", 400)
  try {
    const count = await g.sql`SELECT count(*)::int AS n FROM messenger_webhooks WHERE room_id = ${g.roomId}`
    if (Number(count[0]?.n ?? 0) >= MAX_WEBHOOKS_PER_ROOM) {
      return fail(`웹훅은 토픽당 ${MAX_WEBHOOKS_PER_ROOM}개까지 만들 수 있습니다`, 409)
    }
    const token = generateWebhookToken()
    if (!WEBHOOK_TOKEN_RE.test(token)) return fail("웹훅을 만들지 못했습니다", 500)
    const rows = await g.sql`
      INSERT INTO messenger_webhooks (room_id, name, token, created_by, created_at)
      VALUES (${g.roomId}, ${name}, ${token}, ${g.memberId}, now())
      RETURNING id, room_id, name, token, created_by, created_at, last_used_at
    `
    await publishRoomUpdate(g.sql, g.roomId)
    return NextResponse.json({ success: true, webhook: toInfo(rows[0], origin(request)) })
  } catch (error) {
    return serverError(error, "webhook create", "웹훅을 만들지 못했습니다")
  }
}

// DELETE ?id=N(또는 ?webhook_id=N, 본문 { id }) → { success }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, params)
  if (!g.ok) return g.res
  const sp = new URL(request.url).searchParams
  let webhookId = toId(sp.get("webhook_id") ?? sp.get("id"))
  if (!webhookId) {
    const body = (await request.json().catch(() => null)) as { id?: unknown } | null
    webhookId = toId(body?.id)
  }
  if (!webhookId) return fail("삭제할 웹훅을 지정해 주세요", 400)
  try {
    const rows = await g.sql`
      DELETE FROM messenger_webhooks WHERE id = ${webhookId} AND room_id = ${g.roomId} RETURNING id
    `
    if (rows.length === 0) return fail("웹훅을 찾을 수 없습니다", 404)
    await publishRoomUpdate(g.sql, g.roomId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return serverError(error, "webhook delete", "웹훅을 삭제하지 못했습니다")
  }
}
