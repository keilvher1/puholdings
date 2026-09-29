import { NextResponse } from "next/server"
import { fail, memberFromRow, readJson, recordEvent, requireMessenger, serverError } from "@/lib/messenger"

// PATCH /api/messenger/me {display_name?, title?, status_text?, away?} → { success, member }
// 내 프로필(표시 이름·직함·상태 메시지·자리 비움). 보낸 필드만 바뀐다.
// 게스트(입주기업 계정)의 이름·소속(회사명)은 계정 정보로 고정한다 — 직원이나 다른 회사로 보이게 바꿀 수 없다.
export const dynamic = "force-dynamic"

export async function PATCH(request: Request) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me } = auth
  const body = await readJson(request)
  if (!body) return fail("요청 형식이 올바르지 않습니다", 400)

  const next = {
    display_name: me.display_name,
    title: me.title,
    status_text: me.status_text,
    away: me.away,
  }
  if (me.role === "guest") {
    const changesName = "display_name" in body && body.display_name !== me.display_name
    const changesTitle = "title" in body && body.title !== me.title
    if (changesName || changesTitle) return fail("게스트는 이름과 소속을 바꿀 수 없습니다", 403)
  }
  if ("display_name" in body) {
    const v = typeof body.display_name === "string" ? body.display_name.trim() : ""
    if (!v) return fail("표시 이름을 입력하세요", 400)
    if (v.length > 80) return fail("표시 이름은 80자까지 쓸 수 있습니다", 400)
    next.display_name = v
  }
  if ("title" in body) {
    const v = typeof body.title === "string" ? body.title.trim() : ""
    if (v.length > 120) return fail("직함은 120자까지 쓸 수 있습니다", 400)
    next.title = v
  }
  if ("status_text" in body) {
    const v = typeof body.status_text === "string" ? body.status_text.trim() : ""
    if (v.length > 120) return fail("상태 메시지는 120자까지 쓸 수 있습니다", 400)
    next.status_text = v
  }
  if ("away" in body) {
    if (typeof body.away !== "boolean") return fail("away는 true/false여야 합니다", 400)
    next.away = body.away
  }

  try {
    const rows = await sql`
      UPDATE messenger_members
      SET display_name = ${next.display_name}, title = ${next.title}, status_text = ${next.status_text}, away = ${next.away}
      WHERE id = ${me.id}
      RETURNING id, kind, role, display_name, title, status_text, away, avatar_color, last_seen_at
    `
    if (rows.length === 0) return fail("구성원을 찾을 수 없습니다", 404)
    await recordEvent(sql, { room_id: null, type: "member.updated", payload: { member_id: me.id } })
    return NextResponse.json({ success: true, member: memberFromRow(rows[0]) })
  } catch (error) {
    return serverError(error, "me", "프로필을 저장하지 못했습니다")
  }
}
