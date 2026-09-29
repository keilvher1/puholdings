// 사내 메신저 부가 기능(업로드·투표·할 일·웹훅) 서버 전용 헬퍼.
// 코어(메시지 쓰기·hydrate·이벤트·방 참여 확인)는 lib/messenger.ts를 그대로 쓰고, 여기에는 부가 기능 전용만 둔다.
// 클라이언트 컴포넌트에서 import하지 않는다.

import { randomBytes, timingSafeEqual } from "node:crypto"
import {
  createMessage,
  loadMessage,
  recordEvent,
  toIso,
  requireRoomMember,
  type NewMessage,
  type RoomAccess,
  type Sql,
} from "./messenger"
import type { MessengerMessage, MessengerTodo } from "./messenger-types"
import { MAX_MESSAGE_LENGTH, MESSENGER_MAX_FILE_BYTES } from "./messenger-types"
import { isSafePathname } from "./upload"
import { isAllowedMessengerFile, parseMessengerPathname } from "./messenger-files"

// ---------- 공통 ----------

export function toId(value: unknown): number | null {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null
}

export function toIdArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const out: number[] = []
  for (const v of value) {
    const id = toId(v)
    if (id !== null && !out.includes(id)) out.push(id)
  }
  return out
}

export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

// ---------- 첨부 ----------

// 클라이언트 업로드 토큰 발급 전 경로 검사. 올바르면 파일명 부분을 돌려준다.
export function checkUploadPathname(pathname: string, roomId: number): { ok: true } | { ok: false; error: string } {
  const parsed = parseMessengerPathname(pathname)
  if (!parsed || parsed.roomId !== roomId || !isSafePathname(pathname)) {
    return { ok: false, error: "업로드 경로가 올바르지 않습니다" }
  }
  // 파일명은 messengerSafeName 규칙(경로를 끊는 글자·'..' 없음)을 지켜야 한다. 앞뒤 공백·길이는 화면마다 달라 따지지 않는다.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f#?%\\/]/.test(parsed.name) || parsed.name.includes("..") || parsed.name.length > 200) {
    return { ok: false, error: "업로드 경로가 올바르지 않습니다" }
  }
  if (!isAllowedMessengerFile(parsed.name)) return { ok: false, error: "지원하지 않는 파일 형식입니다" }
  return { ok: true }
}

export function checkUploadSize(size: number): string | null {
  if (!Number.isFinite(size) || size <= 0) return "빈 파일은 올릴 수 없습니다"
  if (size > MESSENGER_MAX_FILE_BYTES) return "파일 크기는 20MB 이하여야 합니다"
  return null
}

// ---------- 웹훅(잔디 Incoming Webhook 호환) ----------

export const WEBHOOK_TOKEN_RE = /^[0-9a-f]{64}$/
export const WEBHOOK_RATE_LIMIT = 60 // 분당
export const WEBHOOK_MAX_CONNECT_INFO = 10

// 32바이트 랜덤 → 16진수 64자(messenger_webhooks.token VARCHAR(64))
export function generateWebhookToken(): string {
  return randomBytes(32).toString("hex")
}

// 상수 시간 비교. 길이가 다르면 false.
export function webhookTokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8")
  const bb = Buffer.from(b, "utf8")
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

// DB 조회는 앞 16자로만 하고(인덱스 비교 시간으로 비밀 부분이 새지 않게) 나머지는 상수 시간 비교.
export const WEBHOOK_LOOKUP_PREFIX = 16

export function webhookUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/api/messenger/hooks/${token}`
}

// 인메모리 분당 제한(서버리스 인스턴스별). 한도 안이면 true.
// 토큰별 버킷은 토큰이 맞았을 때만 기록한다(모르는 토큰마다 버킷이 생기지 않게).
// 모르는 토큰 시도는 보낸 IP별로 따로 센다(WEBHOOK_FAIL_LIMIT). 전체 버킷 수는 WEBHOOK_MAX_BUCKETS로 묶는다.
export const WEBHOOK_FAIL_LIMIT = 30 // IP당 분당 실패 허용
const WEBHOOK_MAX_BUCKETS = 5000
const rateBuckets = new Map<string, number[]>()

function recentHits(key: string, since: number): number[] {
  return (rateBuckets.get(key) || []).filter((t) => t > since)
}

function pruneBuckets(since: number): void {
  if (rateBuckets.size <= WEBHOOK_MAX_BUCKETS) return
  for (const [k, v] of rateBuckets) if (!v.some((t) => t > since)) rateBuckets.delete(k)
  // 그래도 넘치면 오래된(먼저 들어온) 버킷부터 버린다
  for (const k of rateBuckets.keys()) {
    if (rateBuckets.size <= WEBHOOK_MAX_BUCKETS) break
    rateBuckets.delete(k)
  }
}

export function takeWebhookRate(key: string, now = Date.now(), limit = WEBHOOK_RATE_LIMIT): boolean {
  const since = now - 60_000
  const hits = recentHits(key, since)
  if (hits.length >= limit) {
    rateBuckets.set(key, hits)
    return false
  }
  hits.push(now)
  rateBuckets.delete(key) // 최근 사용 순서 유지(가장 오래 안 쓴 버킷이 먼저 버려지게)
  rateBuckets.set(key, hits)
  pruneBuckets(since)
  return true
}

// 기록하지 않고 한도를 넘었는지만 본다.
export function isWebhookRateLimited(key: string, now = Date.now(), limit = WEBHOOK_RATE_LIMIT): boolean {
  return recentHits(key, now - 60_000).length >= limit
}

// 요청 보낸 곳(프록시 뒤: x-forwarded-for 첫 값, 없으면 x-real-ip).
export function webhookClientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const ip = fwd || request.headers.get("x-real-ip")?.trim() || "unknown"
  return `fail:${ip.slice(0, 64)}`
}

export function webhookRateBucketCount(): number {
  return rateBuckets.size
}

export function resetWebhookRateLimits(): void {
  rateBuckets.clear()
}

export interface WebhookPayload {
  body: string
  connect_color: string
  connect_info: { title: string; description: string }[]
}

// 잔디 형식 { body, connectColor?, connectInfo?: [{ title, description, imageUrl? }] }.
// 슬랙식 { text }도 body로 받는다. 본문은 5000자.
export function parseWebhookPayload(raw: unknown): { ok: true; payload: WebhookPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "JSON 객체 본문이 필요합니다" }
  const o = raw as Record<string, unknown>
  const bodyRaw = typeof o.body === "string" ? o.body : typeof o.text === "string" ? o.text : ""
  const body = bodyRaw.replace(/\r\n/g, "\n").trim()
  if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, error: `body는 ${MAX_MESSAGE_LENGTH}자 이하여야 합니다` }

  let connect_color = ""
  if (o.connectColor !== undefined && o.connectColor !== null && o.connectColor !== "") {
    if (typeof o.connectColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(o.connectColor)) {
      return { ok: false, error: "connectColor는 #RRGGBB 형식이어야 합니다" }
    }
    connect_color = o.connectColor.toUpperCase()
  }

  const connect_info: { title: string; description: string }[] = []
  if (o.connectInfo !== undefined && o.connectInfo !== null) {
    if (!Array.isArray(o.connectInfo)) return { ok: false, error: "connectInfo는 배열이어야 합니다" }
    if (o.connectInfo.length > WEBHOOK_MAX_CONNECT_INFO) {
      return { ok: false, error: `connectInfo는 ${WEBHOOK_MAX_CONNECT_INFO}개까지입니다` }
    }
    let total = body.length
    for (const item of o.connectInfo) {
      if (!item || typeof item !== "object") return { ok: false, error: "connectInfo 항목 형식이 올바르지 않습니다" }
      const it = item as Record<string, unknown>
      const title = typeof it.title === "string" ? it.title.trim() : ""
      const description = typeof it.description === "string" ? it.description.replace(/\r\n/g, "\n").trim() : ""
      if (!title && !description) continue
      total += title.length + description.length
      connect_info.push({ title: title.slice(0, 300), description: description.slice(0, 2000) })
    }
    if (total > MAX_MESSAGE_LENGTH * 2) return { ok: false, error: "본문이 너무 깁니다" }
  }

  if (!body && connect_info.length === 0) return { ok: false, error: "body가 필요합니다" }
  return { ok: true, payload: { body, connect_color, connect_info } }
}

// ---------- 투표 ----------

export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 10

export function parsePollInput(raw: Record<string, unknown>):
  | { ok: true; question: string; options: string[]; multiple: boolean; anonymous: boolean; closes_at: string | null }
  | { ok: false; error: string } {
  const question = typeof raw.question === "string" ? raw.question.trim() : ""
  if (!question) return { ok: false, error: "질문을 입력해 주세요" }
  if (question.length > 300) return { ok: false, error: "질문은 300자 이하여야 합니다" }
  if (!Array.isArray(raw.options)) return { ok: false, error: "선택지를 입력해 주세요" }
  const options = raw.options.map((o) => (typeof o === "string" ? o.trim() : "")).filter(Boolean)
  if (options.length < POLL_MIN_OPTIONS || options.length > POLL_MAX_OPTIONS) {
    return { ok: false, error: `선택지는 ${POLL_MIN_OPTIONS}~${POLL_MAX_OPTIONS}개여야 합니다` }
  }
  if (options.some((o) => o.length > 100)) return { ok: false, error: "선택지는 100자 이하여야 합니다" }
  if (new Set(options).size !== options.length) return { ok: false, error: "같은 선택지가 있습니다" }
  let closes_at: string | null = null
  if (raw.closes_at !== undefined && raw.closes_at !== null && raw.closes_at !== "") {
    const iso = typeof raw.closes_at === "string" ? toIso(raw.closes_at) : null
    if (!iso) return { ok: false, error: "마감 시각 형식이 올바르지 않습니다" }
    if (new Date(iso).getTime() <= Date.now()) return { ok: false, error: "마감 시각은 지금 이후여야 합니다" }
    closes_at = iso
  }
  return { ok: true, question, options, multiple: raw.multiple === true, anonymous: raw.anonymous === true, closes_at }
}

export interface PollContext {
  poll_id: number
  message_id: number
  room_id: number
  author_id: number | null
  options: string[]
  multiple: boolean
  closed: boolean // 닫힘 또는 마감 시각 지남
  deleted: boolean
  access: RoomAccess
}

// 투표 + 그 메시지의 방에 내가 참여 중인지. 참여하지 않았으면 null(→ 404).
export async function getPollContext(sql: Sql, pollId: number, memberId: number): Promise<PollContext | null> {
  const rows = await sql`
    SELECT p.id, p.message_id, p.options, p.multiple, p.closed,
           (p.closes_at IS NOT NULL AND p.closes_at <= now()) AS expired,
           m.room_id, m.author_id, m.deleted_at
    FROM messenger_polls p
    JOIN messenger_messages m ON m.id = p.message_id
    WHERE p.id = ${pollId}
  `
  const r = rows[0]
  if (!r) return null
  const access = await requireRoomMember(sql, Number(r.room_id), memberId)
  if (!access) return null
  return {
    poll_id: Number(r.id),
    message_id: Number(r.message_id),
    room_id: Number(r.room_id),
    author_id: r.author_id === null ? null : Number(r.author_id),
    options: Array.isArray(r.options) ? r.options.map(String) : [],
    multiple: !!r.multiple,
    closed: !!r.closed || !!r.expired,
    deleted: r.deleted_at !== null && r.deleted_at !== undefined,
    access,
  }
}

// 투표 선택 검사: 범위 안·중복 없음·단일 선택이면 1개 이하(빈 배열 = 투표 취소)
export function parseVoteOptions(raw: unknown, optionCount: number, multiple: boolean): { ok: true; options: number[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "선택지를 골라 주세요" }
  const out: number[] = []
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= optionCount) {
      return { ok: false, error: "선택지가 올바르지 않습니다" }
    }
    if (!out.includes(v)) out.push(v)
  }
  if (!multiple && out.length > 1) return { ok: false, error: "하나만 고를 수 있는 투표입니다" }
  return { ok: true, options: out.sort((a, b) => a - b) }
}

// ---------- 메시지 쓰기 + 동기화 이벤트 ----------
// 코어 createMessage()로 메시지를 넣고(message.created·read 이벤트, 작성자 last_read 갱신),
// 딸린 행(투표·할 일)을 이어서 만든다. 딸린 행을 못 만들면 메시지를 지워 빈 카드가 남지 않게 한다
// (이미 남은 message.created 이벤트는 sync hydrate에서 없는 id로 빠진다).
export async function createMessageWith<T>(
  sql: Sql,
  message: NewMessage,
  attach: (messageId: number) => Promise<T>
): Promise<{ messageId: number; value: T }> {
  const messageId = await createMessage(sql, message)
  try {
    return { messageId, value: await attach(messageId) }
  } catch (error) {
    await sql`DELETE FROM messenger_messages WHERE id = ${messageId}`.catch(() => undefined)
    throw error
  }
}

// 기존 메시지가 바뀌었음을 알리고(message.updated) 보는 사람 기준으로 다시 읽는다.
export async function publishMessageUpdate(
  sql: Sql,
  roomId: number,
  messageId: number,
  viewerId: number
): Promise<MessengerMessage | null> {
  await recordEvent(sql, { room_id: roomId, type: "message.updated", payload: { message_id: messageId } })
  return loadMessage(sql, viewerId, messageId)
}

export async function publishTodoUpdate(sql: Sql, todo: MessengerTodo): Promise<void> {
  await recordEvent(sql, { room_id: todo.room_id, type: "todo.updated", payload: { todo_id: todo.id } })
}

// 웹훅 수가 바뀌면 방 정보(webhook_count)를 다시 받도록
export async function publishRoomUpdate(sql: Sql, roomId: number): Promise<void> {
  await recordEvent(sql, { room_id: roomId, type: "room.updated", payload: {} })
}
