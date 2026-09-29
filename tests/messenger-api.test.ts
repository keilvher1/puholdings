import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"

// 사내 메신저 API 통합 테스트 — 로컬 임시 Postgres(tests/helpers/local-pg.ts)에 실제 마이그레이션을 적용하고
// 라우트 핸들러를 그대로 호출한다. 세션(쿠키)만 가짜로 바꾼다.
// 확인하는 것: 권한(401·403·404), 게스트 범위(같은 방만), 멘션 저장, 웹훅 수신, 동기화 커서, 첨부 접근, 시스템 알림.
// Postgres(initdb)가 없는 환경에서는 통째로 건너뛴다. MESSENGER_PG_TESTS=0으로 끌 수도 있다.

// ── 가짜 세션 ──────────────────────────────────────────────────────────────────
type AdminSession = { id: number; email: string; name: string }
type PortalSession = { role: "tenant"; tenant_id: number; user_id: number; email: string; name: string; must_change_password: boolean }
let adminSession: AdminSession | null = null
let portalSession: PortalSession | null = null
vi.mock("@/lib/auth", () => ({
  getSession: async () => adminSession,
  getPortalSession: async () => portalSession,
}))

// ── 가짜 Blob(첨부 프록시가 실제로 Blob을 읽으러 가는지만 본다) ─────────────────────
const blobGet = vi.fn(async (..._args: unknown[]) => null)
vi.mock("@vercel/blob", () => ({
  get: (...args: unknown[]) => blobGet(...args),
  put: vi.fn(),
  del: vi.fn(),
}))

import { GET as BOOTSTRAP } from "@/app/api/messenger/bootstrap/route"
import { GET as SYNC } from "@/app/api/messenger/sync/route"
import { GET as MEMBERS } from "@/app/api/messenger/members/route"
import { POST as CREATE_ROOM } from "@/app/api/messenger/rooms/route"
import { GET as BROWSE } from "@/app/api/messenger/rooms/browse/route"
import { POST as JOIN } from "@/app/api/messenger/rooms/[id]/join/route"
import { PATCH as PATCH_ROOM } from "@/app/api/messenger/rooms/[id]/route"
import { POST as INVITE } from "@/app/api/messenger/rooms/[id]/members/route"
import { DELETE as REMOVE_MEMBER } from "@/app/api/messenger/rooms/[id]/members/[memberId]/route"
import { GET as LIST_MESSAGES, POST as POST_MESSAGE } from "@/app/api/messenger/rooms/[id]/messages/route"
import { DELETE as DELETE_MESSAGE } from "@/app/api/messenger/messages/[id]/route"
import { PATCH as ROOM_ME } from "@/app/api/messenger/rooms/[id]/me/route"
import { GET as LIST_WEBHOOKS, POST as CREATE_WEBHOOK, DELETE as DELETE_WEBHOOK } from "@/app/api/messenger/rooms/[id]/webhooks/route"
import { POST as HOOK } from "@/app/api/messenger/hooks/[token]/route"
import { GET as FILE } from "@/app/api/file/route"
import { cleanupOldEvents, postSystemMessage } from "@/lib/messenger"
import { getDb } from "@/lib/db"
import type { BootstrapResponse, MessengerEvent, MessengerMessage, MessengerRoom, SyncResponse } from "@/lib/messenger-types"

// ── 사람 ──────────────────────────────────────────────────────────────────────
const ADMIN1: AdminSession = { id: 1, email: "kim@pu.test", name: "김운영" }
const ADMIN2: AdminSession = { id: 2, email: "lee@pu.test", name: "이정산" }
const GUEST1: PortalSession = { role: "tenant", tenant_id: 1, user_id: 1, email: "park@t1.test", name: "박대표", must_change_password: false }
const GUEST2: PortalSession = { role: "tenant", tenant_id: 2, user_id: 2, email: "choi@t2.test", name: "최대표", must_change_password: false }

type Who = AdminSession | PortalSession | null
function as(who: Who) {
  adminSession = who && !("role" in who) ? who : null
  portalSession = who && "role" in who ? who : null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: any, ctx: { params: Promise<any> }) => Promise<Response>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(who: Who, handler: Handler, path: string, init: { method?: string; body?: unknown; params?: Record<string, string>; headers?: Record<string, string> } = {}): Promise<{ status: number; json: any }> {
  as(who)
  const req = new NextRequest(`http://localhost${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    headers: { ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
  })
  const res = await handler(req, { params: Promise.resolve(init.params ?? {}) })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: res.status, json }
}

const bootstrap = async (who: Who) => {
  const r = await call(who, BOOTSTRAP, "/api/messenger/bootstrap")
  expect(r.status).toBe(200)
  return r.json as BootstrapResponse
}
const sync = async (who: Who, cursor: number) => {
  const r = await call(who, SYNC, `/api/messenger/sync?cursor=${cursor}`)
  expect(r.status).toBe(200)
  return r.json as SyncResponse
}
const roomOf = (j: { room?: MessengerRoom; id?: number }) => (j.room ?? j) as MessengerRoom
const messageOf = (j: { message?: MessengerMessage }) => (j.message ?? j) as MessengerMessage

const pgAvailable = hasLocalPostgres()
let pg: LocalPg

describe.skipIf(!pgAvailable)("메신저 API(로컬 Postgres)", () => {
  const id = { admin1: 0, admin2: 0, guest1: 0, guest2: 0 }
  let pub = 0 // 공개 토픽(김운영 생성, 박대표 초대)
  let priv = 0 // 비공개 토픽(김운영만)
  let webhookToken = ""

  beforeAll(async () => {
    pg = await startLocalPg()
    neonConfig.fetchFunction = pg.fetchFunction
    process.env.DATABASE_URL = pg.databaseUrl
    await applyMigration(pg.conn, "scripts/migrations/2026-saas-01-tenants.sql")
    await applyMigration(pg.conn, "scripts/migrations/2026-saas-08-admins.sql")
    await applyMigration(pg.conn, "scripts/migrations/2026-messenger-01.sql")
    await applyMigration(pg.conn, "scripts/migrations/2026-messenger-01.sql") // 멱등
    await pg.conn.simple(`
      INSERT INTO admins (id, email, password_hash, name) VALUES (1, 'kim@pu.test', 'x', '김운영'), (2, 'lee@pu.test', 'x', '이정산');
      INSERT INTO tenants (id, name) VALUES (1, '포항테크'), (2, '경북바이오');
      INSERT INTO tenant_users (id, tenant_id, email, password_hash, name) VALUES (1, 1, 'park@t1.test', 'x', '박대표'), (2, 2, 'choi@t2.test', 'x', '최대표');
    `)
  }, 60_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
  })

  it("세션이 없으면 401이고 구성원 행도 만들지 않는다", async () => {
    expect((await call(null, BOOTSTRAP, "/api/messenger/bootstrap")).status).toBe(401)
    expect((await call(null, SYNC, "/api/messenger/sync?cursor=0")).status).toBe(401)
    expect((await call(null, MEMBERS, "/api/messenger/members")).status).toBe(401)
    expect((await call(null, CREATE_ROOM, "/api/messenger/rooms", { body: { kind: "topic", name: "x", member_ids: [] } })).status).toBe(401)
    expect((await call(null, LIST_MESSAGES, "/api/messenger/rooms/1/messages", { params: { id: "1" } })).status).toBe(401)
    const [{ rows }] = await pg.conn.simple("SELECT count(*) FROM messenger_members")
    expect(rows[0][0]).toBe("0")
  })

  it("첫 접속 때 구성원 자동 생성: 관리자=정회원, 포털 계정=게스트(회사명이 title)", async () => {
    const a1 = await bootstrap(ADMIN1)
    expect(a1.me).toMatchObject({ kind: "admin", role: "member", display_name: "김운영" })
    id.admin1 = a1.me.id
    const g1 = await bootstrap(GUEST1)
    expect(g1.me).toMatchObject({ kind: "tenant", role: "guest", display_name: "박대표", title: "포항테크" })
    id.guest1 = g1.me.id
    id.admin2 = (await bootstrap(ADMIN2)).me.id
    id.guest2 = (await bootstrap(GUEST2)).me.id
    // 다시 접속해도 같은 구성원
    expect((await bootstrap(ADMIN1)).me.id).toBe(id.admin1)
    // 정회원은 전원이 보이고, 방이 없는 게스트는 자기 자신만 보인다
    expect(a1.members.map((m) => m.id)).toEqual(expect.arrayContaining([id.admin1, id.guest1]))
    const g1again = await bootstrap(GUEST1)
    expect(g1again.members.map((m) => m.id)).toEqual([id.guest1])
    expect(g1again.rooms).toEqual([])
  })

  it("게스트는 토픽 만들기·둘러보기를 할 수 없다", async () => {
    const created = await call(GUEST1, CREATE_ROOM, "/api/messenger/rooms", { body: { kind: "topic", name: "몰래", description: "", is_private: false, member_ids: [] } })
    expect(created.status).toBe(403)
    expect((await call(GUEST1, BROWSE, "/api/messenger/rooms/browse")).status).toBe(403)
  })

  it("정회원이 공개·비공개 토픽을 만들고, 다른 정회원은 공개 토픽만 둘러보고 참여한다", async () => {
    const a = await call(ADMIN1, CREATE_ROOM, "/api/messenger/rooms", {
      body: { kind: "topic", name: "입주 운영", description: "공지·문의", is_private: false, member_ids: [id.guest1] },
    })
    expect(a.status).toBe(201)
    pub = roomOf(a.json).id
    expect(roomOf(a.json).member_ids.sort()).toEqual([id.admin1, id.guest1].sort())
    const b = await call(ADMIN1, CREATE_ROOM, "/api/messenger/rooms", { body: { kind: "topic", name: "정산 내부", description: "", is_private: true, member_ids: [] } })
    expect(b.status).toBe(201)
    priv = roomOf(b.json).id

    const browse = await call(ADMIN2, BROWSE, "/api/messenger/rooms/browse")
    expect(browse.status).toBe(200)
    const ids = JSON.stringify(browse.json)
    expect(ids).toContain(`"id":${pub}`)
    expect(ids).not.toContain(`"id":${priv}`)

    const joinPriv = await call(ADMIN2, JOIN, `/api/messenger/rooms/${priv}/join`, { method: "POST", params: { id: String(priv) } })
    expect([403, 404]).toContain(joinPriv.status)
    const joinPub = await call(ADMIN2, JOIN, `/api/messenger/rooms/${pub}/join`, { method: "POST", params: { id: String(pub) } })
    expect(joinPub.status).toBe(200)
  })

  it("게스트는 참여한 방·그 방 사람만 본다", async () => {
    const g = await bootstrap(GUEST1)
    expect(g.rooms.map((r) => r.id)).toEqual([pub])
    const seen = g.members.map((m) => m.id).sort()
    expect(seen).toEqual([id.admin1, id.admin2, id.guest1].sort())
    const members = await call(GUEST1, MEMBERS, "/api/messenger/members")
    expect(members.json.members.map((m: { id: number }) => m.id)).not.toContain(id.guest2)
  })

  it("참여하지 않은 방은 id를 알아도 404", async () => {
    const p = { params: { id: String(priv) } }
    expect((await call(GUEST1, LIST_MESSAGES, `/api/messenger/rooms/${priv}/messages`, p)).status).toBe(404)
    expect((await call(GUEST1, POST_MESSAGE, `/api/messenger/rooms/${priv}/messages`, { ...p, body: { body: "안녕" } })).status).toBe(404)
    expect((await call(ADMIN2, LIST_MESSAGES, `/api/messenger/rooms/${priv}/messages`, p)).status).toBe(404)
    expect((await call(GUEST2, LIST_MESSAGES, `/api/messenger/rooms/${pub}/messages`, { params: { id: String(pub) } })).status).toBe(404)
    expect((await call(GUEST1, LIST_MESSAGES, `/api/messenger/rooms/999999/messages`, { params: { id: "999999" } })).status).toBe(404)
  })

  it("게스트는 초대·토픽 설정·웹훅 관리를 할 수 없다", async () => {
    const p = { params: { id: String(pub) } }
    const invite = await call(GUEST1, INVITE, `/api/messenger/rooms/${pub}/members`, { ...p, body: { member_ids: [id.guest2] } })
    expect(invite.status).toBe(403)
    const rename = await call(GUEST1, PATCH_ROOM, `/api/messenger/rooms/${pub}`, { ...p, method: "PATCH", body: { name: "바꿈" } })
    expect(rename.status).toBe(403)
    expect((await call(GUEST1, LIST_WEBHOOKS, `/api/messenger/rooms/${pub}/webhooks`, p)).status).toBe(403)
    expect((await call(GUEST1, CREATE_WEBHOOK, `/api/messenger/rooms/${pub}/webhooks`, { ...p, body: { name: "x" } })).status).toBe(403)
  })

  it("게스트 DM: 같은 방 사람과만, 같은 상대면 기존 방을 돌려준다", async () => {
    const other = await call(GUEST1, CREATE_ROOM, "/api/messenger/rooms", { body: { kind: "dm", member_ids: [id.guest2] } })
    expect([400, 403, 404]).toContain(other.status)
    const dm = await call(GUEST1, CREATE_ROOM, "/api/messenger/rooms", { body: { kind: "dm", member_ids: [id.admin1] } })
    expect(dm.status).toBe(201)
    const again = await call(ADMIN1, CREATE_ROOM, "/api/messenger/rooms", { body: { kind: "dm", member_ids: [id.guest1] } })
    expect(again.status).toBe(200)
    expect(again.json.existing).toBe(true)
    expect(roomOf(again.json).id).toBe(roomOf(dm.json).id)
    expect(roomOf(dm.json).kind).toBe("dm")
  })

  it("멘션: 본문 토큰을 저장하되 방 밖 사람은 뺀다, 안 읽은 수·멘션 수에 반영", async () => {
    const body = `@[박대표](m:${id.guest1}) 확인 부탁드립니다 @[전체](m:all) @[최대표](m:${id.guest2})`
    const r = await call(ADMIN1, POST_MESSAGE, `/api/messenger/rooms/${pub}/messages`, { params: { id: String(pub) }, body: { body } })
    expect(r.status).toBe(201)
    const msg = messageOf(r.json)
    expect(msg.mentions.sort()).toEqual([-1, id.guest1].sort())
    expect(msg.author_id).toBe(id.admin1)
    expect(msg.unread_by).toBe(2) // 이정산·박대표

    const g = await bootstrap(GUEST1)
    const room = g.rooms.find((x) => x.id === pub)!
    expect(room.unread_count).toBeGreaterThanOrEqual(1)
    expect(room.mention_count).toBeGreaterThanOrEqual(1)
    expect(room.last_message?.id).toBe(msg.id)
  })

  it("본문 길이 제한(5000자)", async () => {
    const r = await call(ADMIN1, POST_MESSAGE, `/api/messenger/rooms/${pub}/messages`, { params: { id: String(pub) }, body: { body: "가".repeat(5001) } })
    expect(r.status).toBe(400)
  })

  it("동기화: 내 방 이벤트만, 커서는 앞으로만, 중복 없이", async () => {
    const g1 = await bootstrap(GUEST1)
    const g2 = await bootstrap(GUEST2)
    const posted = messageOf(
      (await call(ADMIN1, POST_MESSAGE, `/api/messenger/rooms/${pub}/messages`, { params: { id: String(pub) }, body: { body: "동기화 확인" } })).json,
    )
    const privMsg = messageOf(
      (await call(ADMIN1, POST_MESSAGE, `/api/messenger/rooms/${priv}/messages`, { params: { id: String(priv) }, body: { body: "내부 전용" } })).json,
    )

    const s1 = await sync(GUEST1, g1.cursor)
    type Ev = SyncResponse["events"][number]
    const created = s1.events.filter((e): e is Extract<Ev, { message: unknown }> => e.type === "message.created")
    expect(created.map((e) => e.message.id)).toContain(posted.id)
    expect(created.map((e) => e.message.id)).not.toContain(privMsg.id)
    expect(JSON.stringify(s1.events)).not.toContain("내부 전용")
    expect(s1.cursor).toBeGreaterThanOrEqual(g1.cursor)

    const s2 = await sync(GUEST2, g2.cursor)
    expect(JSON.stringify(s2.events)).not.toContain("동기화 확인")
    expect(JSON.stringify(s2.events)).not.toContain("내부 전용")

    // 이벤트가 충분히 지난 뒤(커밋 대기 구간 밖)에는 커서가 끝까지 가고, 같은 커서로 다시 부르면 빈 결과
    await pg.conn.simple("UPDATE messenger_events SET created_at = now() - interval '1 minute'")
    const settled = await sync(GUEST1, g1.cursor)
    const [{ rows }] = await pg.conn.simple("SELECT max(id) FROM messenger_events")
    expect(settled.cursor).toBe(Number(rows[0][0]))
    const empty = await sync(GUEST1, settled.cursor)
    expect(empty.events).toEqual([])
    expect(empty.cursor).toBe(settled.cursor)
    expect(empty.reset).toBeUndefined()
  })

  it("동기화: 잘못된 커서는 400, 정리된(또는 미래의) 커서는 reset", async () => {
    expect((await call(GUEST1, SYNC, "/api/messenger/sync?cursor=abc")).status).toBe(400)
    expect((await call(GUEST1, SYNC, "/api/messenger/sync?cursor=-1")).status).toBe(400)
    expect((await sync(GUEST1, 9_999_999)).reset).toBe(true)
  })

  it("웹훅: 토픽 관리자가 만들고, 주소로 보낸 글은 이름을 단 시스템 메시지로 올라온다", async () => {
    const p = { params: { id: String(pub) } }
    // 참여만 한 정회원(방 관리자 아님)은 관리할 수 없다
    expect((await call(ADMIN2, CREATE_WEBHOOK, `/api/messenger/rooms/${pub}/webhooks`, { ...p, body: { name: "x" } })).status).toBe(403)

    const created = await call(ADMIN1, CREATE_WEBHOOK, `/api/messenger/rooms/${pub}/webhooks`, { ...p, body: { name: "배포 알림" } })
    expect(created.status).toBe(200)
    const url: string = created.json.webhook.url
    webhookToken = url.split("/").pop()!
    expect(webhookToken).toMatch(/^[0-9a-f]{64}$/)

    const sent = await call(null, HOOK, `/api/messenger/hooks/${webhookToken}`, {
      params: { token: webhookToken },
      body: { body: "**배포** 완료", connectColor: "#FAC11B", connectInfo: [{ title: "버전", description: "1.2.0" }] },
    })
    expect(sent.status).toBe(200)

    const list = await call(GUEST1, LIST_MESSAGES, `/api/messenger/rooms/${pub}/messages`, p)
    const msgs: MessengerMessage[] = list.json.messages
    const hookMsg = msgs.find((m) => m.id === sent.json.message_id)!
    expect(hookMsg).toMatchObject({ kind: "system", author_id: null, author_label: "배포 알림", body: "**배포** 완료", connect_color: "#FAC11B" })
    expect(hookMsg.connect_info).toEqual([{ title: "버전", description: "1.2.0" }])

    // 한 글자만 달라도 404
    const wrong = webhookToken.slice(0, -1) + (webhookToken.endsWith("0") ? "1" : "0")
    expect((await call(null, HOOK, `/api/messenger/hooks/${wrong}`, { params: { token: wrong }, body: { body: "x" } })).status).toBe(404)
  })

  it("웹훅 삭제 후에는 그 주소로 보낼 수 없다", async () => {
    const p = { params: { id: String(pub) } }
    const list = await call(ADMIN1, LIST_WEBHOOKS, `/api/messenger/rooms/${pub}/webhooks`, p)
    const hookId = list.json.webhooks[0].id
    const del = await call(ADMIN1, DELETE_WEBHOOK, `/api/messenger/rooms/${pub}/webhooks?webhook_id=${hookId}`, { ...p, method: "DELETE" })
    expect(del.status).toBe(200)
    expect((await call(null, HOOK, `/api/messenger/hooks/${webhookToken}`, { params: { token: webhookToken }, body: { body: "x" } })).status).toBe(404)
  })

  it("다른 사이트에서 보낸 쓰기 요청(CSRF)은 막는다", async () => {
    const p = { params: { id: String(pub) } }
    const body = { member_ids: [id.guest2] }
    const crossSite = await call(ADMIN1, INVITE, `/api/messenger/rooms/${pub}/members`, { ...p, body, headers: { "Sec-Fetch-Site": "cross-site" } })
    expect(crossSite.status).toBe(403)
    const evilOrigin = await call(ADMIN1, INVITE, `/api/messenger/rooms/${pub}/members`, { ...p, body, headers: { Origin: "https://evil.example" } })
    expect(evilOrigin.status).toBe(403)
    // text/plain 폼 전송으로 JSON을 흉내 내도 읽지 않는다(사전 요청 없이 보낼 수 있는 형식)
    const textPlain = await call(ADMIN1, INVITE, `/api/messenger/rooms/${pub}/members`, { ...p, body, headers: { "Content-Type": "text/plain" } })
    expect(textPlain.status).toBe(400)
    const [{ rows }] = await pg.conn.simple(`SELECT 1 FROM messenger_room_members WHERE room_id = ${pub} AND member_id = ${id.guest2}`)
    expect(rows).toHaveLength(0)
    // 같은 출처 화면에서 온 요청은 통과(여기서는 이미 참여한 사람이라 추가 0명)
    const same = await call(ADMIN1, INVITE, `/api/messenger/rooms/${pub}/members`, {
      ...p,
      body: { member_ids: [id.guest1] },
      headers: { "Sec-Fetch-Site": "same-origin", Origin: "http://localhost" },
    })
    expect(same.status).toBe(200)
  })

  it("첨부(/api/file messenger/…)는 그 방 참여자만, 살아 있는 메시지에 붙은 파일만 연다", async () => {
    const path = `messenger/${pub}/1759000000000-견적서.pdf`
    const open = async (who: Who, pathname = path) => {
      blobGet.mockClear()
      const r = await call(who, FILE, `/api/file?pathname=${encodeURIComponent(pathname)}`)
      return { status: r.status, reachedBlob: blobGet.mock.calls.length > 0 }
    }
    // 메시지에 붙기 전에는 참여자라도 못 연다
    expect(await open(ADMIN1)).toEqual({ status: 404, reachedBlob: false })
    const posted = await call(ADMIN1, POST_MESSAGE, `/api/messenger/rooms/${pub}/messages`, {
      params: { id: String(pub) },
      body: { body: "", attachments: [{ name: "견적서.pdf", pathname: path, size: 100, type: "application/pdf" }] },
    })
    expect(posted.status).toBe(201)
    expect(await open(null)).toEqual({ status: 404, reachedBlob: false })
    expect(await open(GUEST2)).toEqual({ status: 404, reachedBlob: false })
    expect((await open(GUEST1)).reachedBlob).toBe(true)
    expect((await open(ADMIN2)).reachedBlob).toBe(true)
    // 비공개 토픽 파일은 관리자라도 참여하지 않았으면 못 연다
    blobGet.mockClear()
    const r = await call(ADMIN2, FILE, `/api/file?pathname=${encodeURIComponent(`messenger/${priv}/1759000000000-a.pdf`)}`)
    expect(r.status).toBe(404)
    expect(blobGet).not.toHaveBeenCalled()

    // 잘못 올린 파일을 지우면 주소를 알아도 더는 못 받는다
    const tmpPath = `messenger/${pub}/1759000000001-잘못올림.pdf`
    const tmp = await call(ADMIN1, POST_MESSAGE, `/api/messenger/rooms/${pub}/messages`, {
      params: { id: String(pub) },
      body: { body: "", attachments: [{ name: "잘못올림.pdf", pathname: tmpPath, size: 100, type: "application/pdf" }] },
    })
    expect((await open(GUEST1, tmpPath)).reachedBlob).toBe(true)
    const tmpId = messageOf(tmp.json).id
    const removed = await call(ADMIN1, DELETE_MESSAGE, `/api/messenger/messages/${tmpId}`, { method: "DELETE", params: { id: String(tmpId) } })
    expect(removed.status).toBe(200)
    expect(await open(GUEST1, tmpPath)).toEqual({ status: 404, reachedBlob: false })
    expect(await open(ADMIN1, tmpPath)).toEqual({ status: 404, reachedBlob: false })
  })

  it("시스템 알림: 'alerts' 비공개 토픽을 만들고 정회원 전원만 넣는다(두 번째부터는 같은 방)", async () => {
    const first = await postSystemMessage({ slug: "alerts", text: "**새 문의** · 홍길동", info: [{ title: "문의 내용", description: "입주 문의" }] })
    expect(first.success).toBe(true)
    const second = await postSystemMessage({ slug: "alerts", text: "증빙 추가 도착 · 확인 대기 **2건**" })
    expect(second.success).toBe(true)

    const [{ rows: rooms }] = await pg.conn.simple("SELECT id, is_private, kind FROM messenger_rooms WHERE system_slug = 'alerts'")
    expect(rooms).toHaveLength(1)
    expect(rooms[0][1]).toBe("t")
    const alertsId = Number(rooms[0][0])

    const a1 = await bootstrap(ADMIN1)
    expect(a1.rooms.map((r) => r.id)).toContain(alertsId)
    const alertRoom = a1.rooms.find((r) => r.id === alertsId)!
    expect(alertRoom.member_ids.sort()).toEqual([id.admin1, id.admin2].sort())
    expect(alertRoom.unread_count).toBe(2)
    expect((await bootstrap(GUEST1)).rooms.map((r) => r.id)).not.toContain(alertsId)

    const list = await call(ADMIN1, LIST_MESSAGES, `/api/messenger/rooms/${alertsId}/messages`, { params: { id: String(alertsId) } })
    const msgs: MessengerMessage[] = list.json.messages
    expect(msgs.map((m) => m.body)).toEqual(["**새 문의** · 홍길동", "증빙 추가 도착 · 확인 대기 **2건**"])
    expect(msgs[0]).toMatchObject({ kind: "system", author_id: null, connect_info: [{ title: "문의 내용", description: "입주 문의" }] })

    // 시스템 알림 토픽에는 게스트를 초대할 수 없다(정회원 전용)
    const invite = await call(ADMIN1, INVITE, `/api/messenger/rooms/${alertsId}/members`, {
      params: { id: String(alertsId) },
      body: { member_ids: [id.guest1] },
    })
    expect(invite.status).toBe(400)
    expect((await bootstrap(GUEST1)).rooms.map((r) => r.id)).not.toContain(alertsId)
  })

  it("방에서 나가면 메시지·첨부·동기화 모두 끊긴다", async () => {
    const before = await bootstrap(GUEST1)
    const left = await call(GUEST1, REMOVE_MEMBER, `/api/messenger/rooms/${pub}/members/${id.guest1}`, {
      method: "DELETE",
      params: { id: String(pub), memberId: String(id.guest1) },
    })
    expect(left.status).toBe(200)
    expect((await call(GUEST1, LIST_MESSAGES, `/api/messenger/rooms/${pub}/messages`, { params: { id: String(pub) } })).status).toBe(404)
    const s = await sync(GUEST1, before.cursor)
    expect(s.events.some((e) => e.type === "room.removed" && e.room_id === pub)).toBe(true)
    expect(s.events.some((e) => e.type === "message.created" && e.room_id === pub)).toBe(false)
    blobGet.mockClear()
    await call(GUEST1, FILE, `/api/file?pathname=${encodeURIComponent(`messenger/${pub}/1759000000000-견적서.pdf`)}`)
    expect(blobGet).not.toHaveBeenCalled()
  })

  it("게스트는 다른 사람을 강퇴할 수 없다", async () => {
    // 박대표는 DM 방에는 남아 있다
    const g = await bootstrap(GUEST1)
    const dm = g.rooms.find((r) => r.kind === "dm")!
    const kick = await call(GUEST1, REMOVE_MEMBER, `/api/messenger/rooms/${dm.id}/members/${id.admin1}`, {
      method: "DELETE",
      params: { id: String(dm.id), memberId: String(id.admin1) },
    })
    expect([400, 403]).toContain(kick.status)
  })

  // (마지막에 둔다: 이벤트를 모두 지우므로 앞 테스트의 커서에 영향)
  // 정착 구간(최근 4초) 이벤트는 다음 sync에도 다시 오므로, 동작 직전의 최대 이벤트 id 이후만 본다
  const maxEventId = async () => {
    const [{ rows }] = await pg.conn.simple("SELECT COALESCE(max(id), 0) FROM messenger_events")
    return Number(rows[0][0])
  }

  it("동기화: 읽음은 read 이벤트만 남기고, 별표·알림 변경은 나에게만 personal room.updated로 온다", async () => {
    const start = (await bootstrap(ADMIN1)).cursor
    const room = (await bootstrap(ADMIN1)).rooms.find((r) => r.id === pub)!
    const p = { params: { id: String(pub) } }
    const lastId = room.last_message?.id ?? 1
    const beforeRead = await maxEventId()
    await pg.conn.simple(`UPDATE messenger_room_members SET last_read_message_id = NULL WHERE room_id = ${pub} AND member_id = ${id.admin1}`)
    await call(ADMIN1, ROOM_ME, `/api/messenger/rooms/${pub}/me`, { ...p, method: "PATCH", body: { last_read_message_id: lastId + 1000 } })
    const afterRead = (await sync(ADMIN1, start)).events.filter((e) => e.id > beforeRead)
    expect(afterRead.some((e) => e.type === "read" && e.room_id === pub)).toBe(true)
    expect(afterRead.some((e) => e.type === "room.updated" && e.room_id === pub)).toBe(false)

    const beforeStar = await maxEventId()
    const starred = await call(ADMIN1, ROOM_ME, `/api/messenger/rooms/${pub}/me`, { ...p, method: "PATCH", body: { starred: true } })
    expect(starred.status).toBe(200)
    const mine = (await sync(ADMIN1, start)).events.filter((e) => e.id > beforeStar)
    const ev = mine.find((e) => e.type === "room.updated" && e.room_id === pub) as (MessengerEvent & { personal?: boolean; room: MessengerRoom }) | undefined
    expect(ev?.personal).toBe(true)
    expect(ev?.room.starred).toBe(true)
    // 다른 참여자에게는 가지 않는다
    expect((await sync(GUEST1, start)).events.some((e) => e.id > beforeStar && e.type === "room.updated" && e.room_id === pub)).toBe(false)
    await call(ADMIN1, ROOM_ME, `/api/messenger/rooms/${pub}/me`, { ...p, method: "PATCH", body: { starred: false } })
  })

  it("접속 표시: 한동안 없다가 돌아오면 member.updated가 한 번 남는다", async () => {
    await pg.conn.simple(`UPDATE messenger_members SET last_seen_at = now() - interval '10 minutes' WHERE id = ${id.admin2}`)
    const start = (await bootstrap(ADMIN1)).cursor
    const before = await maxEventId()
    await sync(ADMIN2, start) // 돌아옴
    const upd = (await sync(ADMIN1, start)).events.filter((e) => e.id > before && e.type === "member.updated" && e.member.id === id.admin2)
    expect(upd).toHaveLength(1)
    const lastSeen = upd[0].type === "member.updated" ? upd[0].member.last_seen_at : null
    expect(lastSeen && Date.now() - Date.parse(lastSeen) < 60_000).toBe(true)
    // 계속 접속 중이면(3분 안) 다시 남기지 않는다
    await pg.conn.simple(`UPDATE messenger_members SET last_seen_at = now() - interval '40 seconds' WHERE id = ${id.admin2}`)
    const mid = await maxEventId()
    await sync(ADMIN2, start)
    expect((await sync(ADMIN1, start)).events.some((e) => e.id > mid && e.type === "member.updated" && e.member.id === id.admin2)).toBe(false)
  })

  it("동기화: 7일 지난 이벤트가 정리되면 옛 커서는 reset, 다시 bootstrap한 커서는 reset 없이 이어진다", async () => {
    const old = await bootstrap(ADMIN1)
    await pg.conn.simple("UPDATE messenger_events SET created_at = now() - interval '8 days'")
    await cleanupOldEvents(getDb()!)
    const [{ rows }] = await pg.conn.simple("SELECT count(*) FROM messenger_events")
    expect(rows[0][0]).toBe("0")
    // 정리 직후 새 글(아직 커밋 대기 구간 안의 이벤트)
    const dm = (await bootstrap(ADMIN1)).rooms.find((r) => r.kind === "dm")!
    await call(ADMIN1, POST_MESSAGE, `/api/messenger/rooms/${dm.id}/messages`, { params: { id: String(dm.id) }, body: { body: "정리 뒤 첫 글" } })
    if (old.cursor > 0) expect((await sync(ADMIN1, old.cursor)).reset).toBe(true)
    // 새로 받은 커서로는 곧바로 이어져야 한다(reset이 반복되면 화면이 bootstrap을 계속 다시 부른다)
    const fresh = await bootstrap(ADMIN1)
    const next = await sync(ADMIN1, fresh.cursor)
    expect(next.reset).toBeUndefined()
    expect(JSON.stringify(next.events)).toContain("정리 뒤 첫 글")
  })
})
