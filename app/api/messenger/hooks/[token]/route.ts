import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { createMessage, fail, serverError } from "@/lib/messenger"
import {
  WEBHOOK_FAIL_LIMIT,
  WEBHOOK_LOOKUP_PREFIX,
  WEBHOOK_TOKEN_RE,
  parseWebhookPayload,
  isWebhookRateLimited,
  takeWebhookRate,
  webhookClientKey,
  webhookTokensEqual,
} from "@/lib/messenger-extras"

// POST /api/messenger/hooks/[token] — Incoming Webhook(잔디 형식 호환). 세션 없이 토큰으로만 인증한다.
// 본문: { body, connectColor?: '#RRGGBB', connectInfo?: [{ title, description }] } (슬랙식 { text }도 허용)
// → 토픽에 시스템 메시지(author_label = 웹훅 이름)를 올린다.
// 토큰: 32바이트 랜덤(16진수 64자), 앞 16자로 찾고 전체는 상수 시간 비교. 토큰별 분당 60건(인스턴스 메모리,
// 토큰이 맞았을 때만 셈). 모르는 토큰은 형식 오류든 없는 토큰이든 같은 404로 답하고, 보낸 IP별로 분당 30번까지만 받는다.

const MAX_BODY_BYTES = 64 * 1024

function tooMany() {
  return NextResponse.json(
    { success: false, error: "요청이 너무 많습니다. 1분에 60건까지 보낼 수 있습니다" },
    { status: 429, headers: { "Retry-After": "60" } }
  )
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const clientKey = webhookClientKey(request)
  if (isWebhookRateLimited(clientKey, Date.now(), WEBHOOK_FAIL_LIMIT)) return tooMany()
  if (typeof token !== "string" || !WEBHOOK_TOKEN_RE.test(token)) {
    takeWebhookRate(clientKey, Date.now(), WEBHOOK_FAIL_LIMIT)
    return fail("웹훅을 찾을 수 없습니다", 404)
  }
  const sql = getDb()
  if (!sql) return fail("데이터베이스 연결 실패", 500)

  const declared = Number(request.headers.get("content-length") || 0)
  if (declared > MAX_BODY_BYTES) return fail("본문이 너무 큽니다", 413)
  let raw: unknown
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return fail("본문이 너무 큽니다", 413)
    raw = JSON.parse(text)
  } catch {
    return fail("JSON 본문이 필요합니다", 400)
  }
  const parsed = parseWebhookPayload(raw)
  if (!parsed.ok) return fail(parsed.error, 400)

  try {
    const prefix = token.slice(0, WEBHOOK_LOOKUP_PREFIX)
    const rows = await sql`
      SELECT w.id, w.room_id, w.name, w.token, r.is_archived
      FROM messenger_webhooks w
      JOIN messenger_rooms r ON r.id = w.room_id
      WHERE left(w.token, ${WEBHOOK_LOOKUP_PREFIX}) = ${prefix}
    `
    const hook = rows.find((r) => webhookTokensEqual(String(r.token), token))
    if (!hook) {
      takeWebhookRate(clientKey, Date.now(), WEBHOOK_FAIL_LIMIT)
      return fail("웹훅을 찾을 수 없습니다", 404)
    }
    if (!takeWebhookRate(token)) return tooMany()
    if (hook.is_archived) return fail("보관된 토픽에는 보낼 수 없습니다", 409)

    const roomId = Number(hook.room_id)
    const { body, connect_color, connect_info } = parsed.payload
    // author_label이 비어 있으면 코어가 '안내 메시지'로 보고 안 읽은 수에서 빼므로 이름을 꼭 채운다
    const messageId = await createMessage(sql, {
      room_id: roomId,
      author_id: null,
      author_label: String(hook.name || "").trim().slice(0, 80) || "웹훅",
      kind: "system",
      body,
      connect_color,
      connect_info,
    })
    await sql`UPDATE messenger_webhooks SET last_used_at = now() WHERE id = ${hook.id}`
    return NextResponse.json({ success: true, message_id: messageId })
  } catch (error) {
    return serverError(error, "webhook post", "메시지를 올리지 못했습니다")
  }
}
