import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { neonConfig } from "@neondatabase/serverless"
import { applyMigration, hasLocalPostgres, startLocalPg, type LocalPg } from "./helpers/local-pg"

// 사내 메신저 핵심 흐름(한 줄로 이어지는 시나리오) — 관리자 A·관리자 B·입주기업 게스트 C.
// 토픽 생성 → 초대 → 메시지 → 멘션 → 반응 → 댓글 → 읽음 → sync 이벤트 → 공유 → 투표 → 할 일 → 검색 → 웹훅 수신,
// 그리고 게스트 범위(초대 안 받은 방·공개 토픽 둘러보기·다른 방 첨부)를 실제 마이그레이션·라우트로 확인한다.
// 권한 단위 검사는 tests/messenger-api.test.ts, 여기서는 기능이 서로 이어지는지를 본다.

type AdminSession = { id: number; email: string; name: string }
type PortalSession = { role: "tenant"; tenant_id: number; user_id: number; email: string; name: string; must_change_password: boolean }
let adminSession: AdminSession | null = null
let portalSession: PortalSession | null = null
vi.mock("@/lib/auth", () => ({
  getSession: async () => adminSession,
  getPortalSession: async () => portalSession,
}))

const blobGet = vi.fn(async (..._args: unknown[]) => null)
const blobCopy = vi.fn(async (_from: string, to: string) => ({ pathname: to, url: `https://blob.test/${to}` }))
vi.mock("@vercel/blob", () => ({
  get: (...args: unknown[]) => blobGet(...args),
  copy: (from: string, to: string) => blobCopy(from, to),
  put: vi.fn(),
  del: vi.fn(),
}))

import { GET as BOOTSTRAP } from "@/app/api/messenger/bootstrap/route"
import { GET as SYNC } from "@/app/api/messenger/sync/route"
import { POST as CREATE_ROOM } from "@/app/api/messenger/rooms/route"
import { GET as BROWSE } from "@/app/api/messenger/rooms/browse/route"
import { POST as JOIN } from "@/app/api/messenger/rooms/[id]/join/route"
import { POST as INVITE } from "@/app/api/messenger/rooms/[id]/members/route"
import { PATCH as ROOM_ME } from "@/app/api/messenger/rooms/[id]/me/route"
import { GET as LIST_MESSAGES, POST as POST_MESSAGE } from "@/app/api/messenger/rooms/[id]/messages/route"
import { GET as ROOM_FILES } from "@/app/api/messenger/rooms/[id]/files/route"
import { POST as CREATE_WEBHOOK } from "@/app/api/messenger/rooms/[id]/webhooks/route"
import { POST as REACT } from "@/app/api/messenger/messages/[id]/reactions/route"
import { GET as THREAD } from "@/app/api/messenger/messages/[id]/thread/route"
import { POST as SHARE } from "@/app/api/messenger/messages/[id]/share/route"
import { POST as BOOKMARK } from "@/app/api/messenger/messages/[id]/bookmark/route"
import { PATCH as EDIT_MESSAGE, DELETE as DELETE_MESSAGE } from "@/app/api/messenger/messages/[id]/route"
import { GET as MENTIONS } from "@/app/api/messenger/mentions/route"
import { GET as BOOKMARKS } from "@/app/api/messenger/bookmarks/route"
import { POST as CREATE_POLL } from "@/app/api/messenger/polls/route"
import { POST as VOTE } from "@/app/api/messenger/polls/[id]/vote/route"
import { POST as CLOSE_POLL } from "@/app/api/messenger/polls/[id]/close/route"
import { GET as LIST_TODOS, POST as CREATE_TODO } from "@/app/api/messenger/todos/route"
import { PATCH as PATCH_TODO } from "@/app/api/messenger/todos/[id]/route"
import { GET as SEARCH } from "@/app/api/messenger/search/route"
import { POST as HOOK } from "@/app/api/messenger/hooks/[token]/route"
import { GET as FILE } from "@/app/api/file/route"
import type { BootstrapResponse, MessengerEvent, MessengerMessage, MessengerRoom, SyncResponse } from "@/lib/messenger-types"

const A: AdminSession = { id: 1, email: "a@pu.test", name: "김운영" }
const B: AdminSession = { id: 2, email: "b@pu.test", name: "이정산" }
const C: PortalSession = { role: "tenant", tenant_id: 1, user_id: 1, email: "c@t1.test", name: "박대표", must_change_password: false }

type Who = AdminSession | PortalSession | null
function as(who: Who) {
  adminSession = who && !("role" in who) ? who : null
  portalSession = who && "role" in who ? who : null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: any, ctx: { params: Promise<any> }) => Promise<Response>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = { status: number; json: any }
async function call(who: Who, handler: Handler, path: string, init: { method?: string; body?: unknown; params?: Record<string, string> } = {}): Promise<Res> {
  as(who)
  const req = new NextRequest(`http://localhost${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
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
const ok = (r: Res) => {
  if (r.status >= 300) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.json)}`)
  return r.json
}
const p = (id: number | string) => ({ id: String(id) })
const bootstrap = async (who: Who) => ok(await call(who, BOOTSTRAP, "/api/messenger/bootstrap")) as BootstrapResponse
const sync = async (who: Who, cursor: number) => ok(await call(who, SYNC, `/api/messenger/sync?cursor=${cursor}`)) as SyncResponse
const roomIn = (b: BootstrapResponse, id: number) => b.rooms.find((r) => r.id === id)
const messages = async (who: Who, roomId: number) =>
  (ok(await call(who, LIST_MESSAGES, `/api/messenger/rooms/${roomId}/messages`, { params: p(roomId) })).messages as MessengerMessage[])

const pgAvailable = hasLocalPostgres()
let pg: LocalPg

describe.skipIf(!pgAvailable)("메신저 핵심 흐름(A·B 관리자, C 게스트)", () => {
  const id = { a: 0, b: 0, c: 0 }
  let topic = 0 // A가 만들고 B·C를 초대한 공개 토픽
  let other = 0 // A·B만 있는 공개 토픽(C 초대 안 함)
  let dmAB = 0
  let msg = 0 // A가 C를 멘션한 메시지
  let reply = 0
  const cursor = { a: 0, b: 0, c: 0 }

  beforeAll(async () => {
    pg = await startLocalPg()
    neonConfig.fetchFunction = pg.fetchFunction
    process.env.DATABASE_URL = pg.databaseUrl
    await applyMigration(pg.conn, "scripts/migrations/2026-saas-01-tenants.sql")
    await applyMigration(pg.conn, "scripts/migrations/2026-saas-08-admins.sql")
    await applyMigration(pg.conn, "scripts/migrations/2026-messenger-01.sql")
    await pg.conn.simple(`
      INSERT INTO admins (id, email, password_hash, name) VALUES (1, 'a@pu.test', 'x', '김운영'), (2, 'b@pu.test', 'x', '이정산');
      INSERT INTO tenants (id, name) VALUES (1, '포항테크');
      INSERT INTO tenant_users (id, tenant_id, email, password_hash, name) VALUES (1, 1, 'c@t1.test', 'x', '박대표');
    `)
  }, 60_000)

  afterAll(() => {
    pg?.stop()
    delete process.env.DATABASE_URL
  })

  it("1. 세 사람 첫 접속 → 구성원 생성", async () => {
    const a = await bootstrap(A)
    const b = await bootstrap(B)
    const c = await bootstrap(C)
    id.a = a.me.id
    id.b = b.me.id
    id.c = c.me.id
    expect(c.me.role).toBe("guest")
    expect(c.rooms).toHaveLength(0)
    cursor.a = a.cursor
    cursor.b = b.cursor
    cursor.c = c.cursor
  })

  it("2. 토픽 생성 → 초대(B·C)", async () => {
    const created = await call(A, CREATE_ROOM, "/api/messenger/rooms", {
      body: { kind: "topic", name: "입주 지원", description: "입주기업 문의", is_private: false, member_ids: [] },
    })
    expect(created.status).toBe(201)
    topic = (created.json.room as MessengerRoom).id
    ok(await call(A, INVITE, `/api/messenger/rooms/${topic}/members`, { body: { member_ids: [id.b, id.c] }, params: p(topic) }))
    const c = await bootstrap(C)
    expect(roomIn(c, topic)?.member_ids.sort()).toEqual([id.a, id.b, id.c].sort())

    const o = await call(A, CREATE_ROOM, "/api/messenger/rooms", {
      body: { kind: "topic", name: "운영팀", description: "", is_private: false, member_ids: [id.b] },
    })
    other = (o.json.room as MessengerRoom).id
  })

  it("3. 메시지 + 멘션 → C의 안 읽은 수·멘션 수·멘션 목록", async () => {
    const r = await call(A, POST_MESSAGE, `/api/messenger/rooms/${topic}/messages`, {
      body: { body: `@[박대표](m:${id.c}) 계약서 초안 확인 부탁드립니다`, mentions: [id.c] },
      params: p(topic),
    })
    expect(r.status).toBe(201)
    msg = r.json.message.id
    expect(r.json.message.mentions).toEqual([id.c])
    const c = await bootstrap(C)
    const room = roomIn(c, topic)!
    expect(room.unread_count).toBe(1)
    expect(room.mention_count).toBe(1)
    const mentions = ok(await call(C, MENTIONS, "/api/messenger/mentions")).messages as MessengerMessage[]
    expect(mentions.map((m) => m.id)).toContain(msg)
  })

  it("4. 반응(토글)", async () => {
    const on = ok(await call(B, REACT, `/api/messenger/messages/${msg}/reactions`, { body: { emoji: "👍" }, params: p(msg) }))
    expect(on.reacted).toBe(true)
    ok(await call(C, REACT, `/api/messenger/messages/${msg}/reactions`, { body: { emoji: "👍" }, params: p(msg) }))
    const off = ok(await call(C, REACT, `/api/messenger/messages/${msg}/reactions`, { body: { emoji: "👍" }, params: p(msg) }))
    expect(off.reacted).toBe(false)
    const m = off.message as MessengerMessage
    expect(m.reactions).toEqual([{ emoji: "👍", count: 1, member_ids: [id.b] }])
  })

  it("5. 댓글 → 스레드·댓글 수, 목록에는 최상위만", async () => {
    const r = await call(C, POST_MESSAGE, `/api/messenger/rooms/${topic}/messages`, {
      body: {
        body: "네, 오늘 중으로 보겠습니다",
        parent_id: msg,
        attachments: [{ name: "방문자_명단.pdf", pathname: `messenger/${topic}/1759000000001-방문자_명단.pdf`, size: 2048, type: "application/pdf" }],
      },
      params: p(topic),
    })
    expect(r.status).toBe(201)
    reply = r.json.message.id
    const t = ok(await call(A, THREAD, `/api/messenger/messages/${msg}/thread`, { params: p(msg) }))
    expect(t.parent.id).toBe(msg)
    expect(t.parent.reply_count).toBe(1)
    expect(t.replies.map((m: MessengerMessage) => m.id)).toEqual([reply])
    const list = await messages(A, topic)
    expect(list.some((m) => m.id === reply)).toBe(false)
    // 댓글에 붙은 파일도 파일 모아보기에 나오고, 원본 메시지 id(parent_id)로 이동할 수 있다
    const files = ok(await call(A, ROOM_FILES, `/api/messenger/rooms/${topic}/files`, { params: p(topic) })).files
    expect(files).toEqual([expect.objectContaining({ name: "방문자_명단.pdf", message_id: reply, parent_id: msg })])
  })

  it("6. 읽음 → 안 읽은 수 0, 메시지의 안 읽은 사람 수 감소", async () => {
    // C는 댓글을 쓰면서 읽음 처리됐고, B는 반응만 했으므로 아직 안 읽음
    const before = (await messages(A, topic)).find((m) => m.id === msg)!
    expect(before.unread_by).toBe(1)
    expect(roomIn(await bootstrap(C), topic)!.unread_count).toBe(0)
    expect(roomIn(await bootstrap(C), topic)!.mention_count).toBe(0)
    expect(roomIn(await bootstrap(B), topic)!.unread_count).toBe(1)
    ok(await call(B, ROOM_ME, `/api/messenger/rooms/${topic}/me`, { method: "PATCH", body: { last_read_message_id: reply }, params: p(topic) }))
    expect(roomIn(await bootstrap(B), topic)!.unread_count).toBe(0)
    const after = (await messages(A, topic)).find((m) => m.id === msg)!
    expect(after.unread_by).toBe(0)
  })

  it("7. sync: A는 이 토픽의 새 글·반응·읽음을, C는 초대받지 않은 방 이벤트를 받지 않는다", async () => {
    const s = await sync(A, cursor.a)
    // 같은 메시지의 created·updated는 한 건으로 합쳐져 최신 상태(반응 포함)로 온다
    const m = s.events.find((e) => (e.type === "message.created" || e.type === "message.updated") && e.message.id === msg)
    expect(m && "message" in m ? m.message.reactions.map((r) => r.emoji) : null).toEqual(["👍"])
    expect(s.events.some((e) => e.type === "read" && e.member_id === id.b)).toBe(true)
    expect(s.events.some((e) => e.type === "message.created" && e.message.id === reply)).toBe(true)
    expect(s.cursor).toBeGreaterThanOrEqual(cursor.a)
    cursor.a = s.cursor

    // 운영팀(C 없음)에 글을 쓰면 C의 sync에는 나오지 않는다
    ok(await call(B, POST_MESSAGE, `/api/messenger/rooms/${other}/messages`, { body: { body: "내부 공유: 7월 정산 검토" }, params: p(other) }))
    const sc = await sync(C, cursor.c)
    const roomsSeen = new Set(sc.events.map((e: MessengerEvent) => ("room_id" in e ? e.room_id : null)))
    expect(roomsSeen.has(other)).toBe(false)
    expect(roomsSeen.has(topic)).toBe(true)
  })

  it("8. 공유: A → A·B DM, C는 참여하지 않은 방으로 공유 불가", async () => {
    const dm = await call(A, CREATE_ROOM, "/api/messenger/rooms", { body: { kind: "dm", member_ids: [id.b] } })
    expect(dm.status).toBe(201)
    dmAB = dm.json.room.id
    const shared = await call(A, SHARE, `/api/messenger/messages/${msg}/share`, { body: { room_id: dmAB, comment: "참고하세요" }, params: p(msg) })
    expect(shared.status).toBe(201)
    expect(shared.json.message.shared_from).toMatchObject({ message_id: msg, room_name: "입주 지원" })
    const inDm = await messages(B, dmAB)
    expect(inDm.map((m) => m.body)).toEqual(["참고하세요", expect.stringContaining("계약서 초안")])

    expect((await call(C, SHARE, `/api/messenger/messages/${msg}/share`, { body: { room_id: other }, params: p(msg) })).status).toBe(404)
    expect((await call(C, SHARE, `/api/messenger/messages/${msg}/share`, { body: { room_id: dmAB }, params: p(msg) })).status).toBe(404)
  })

  it("9. 투표: 만들기 → 투표(B·C) → C는 마감 불가, A가 마감 → 마감 뒤 투표 불가", async () => {
    const created = ok(
      await call(A, CREATE_POLL, "/api/messenger/polls", {
        body: { room_id: topic, question: "입주자 간담회 날짜", options: ["10/14(화)", "10/16(목)"], multiple: false, anonymous: false },
      })
    )
    const pollId = created.message.poll.id as number
    const pollMsg = created.message.id as number
    ok(await call(B, VOTE, `/api/messenger/polls/${pollId}/vote`, { body: { options: [0] }, params: p(pollId) }))
    const v = ok(await call(C, VOTE, `/api/messenger/polls/${pollId}/vote`, { body: { options: [1] }, params: p(pollId) }))
    expect(v.poll.counts).toEqual([1, 1])
    expect(v.poll.my_votes).toEqual([1])
    expect((await call(C, VOTE, `/api/messenger/polls/${pollId}/vote`, { body: { options: [0, 1] }, params: p(pollId) })).status).toBe(400)
    expect((await call(C, CLOSE_POLL, `/api/messenger/polls/${pollId}/close`, { body: {}, params: p(pollId) })).status).toBe(403)
    const closed = ok(await call(A, CLOSE_POLL, `/api/messenger/polls/${pollId}/close`, { body: {}, params: p(pollId) }))
    expect(closed.poll.closed).toBe(true)
    expect((await call(B, VOTE, `/api/messenger/polls/${pollId}/vote`, { body: { options: [1] }, params: p(pollId) })).status).toBeGreaterThanOrEqual(400)
    const inList = (await messages(C, topic)).find((m) => m.id === pollMsg)!
    expect(inList.poll?.closed).toBe(true)
  })

  it("10. 할 일: 메시지를 할 일로(담당 C) → C의 내 할 일 → 완료", async () => {
    const created = await call(A, CREATE_TODO, "/api/messenger/todos", {
      body: { room_id: topic, title: "계약서 초안 회신", assignee_ids: [id.c], due_date: "2026-10-10", message_id: msg },
    })
    expect(created.status).toBeLessThan(300)
    const todoId = created.json.todo.id as number
    expect(created.json.message.kind).toBe("todo")
    const mine = ok(await call(C, LIST_TODOS, "/api/messenger/todos?scope=mine")).todos
    expect(mine.map((t: { id: number }) => t.id)).toContain(todoId)
    const done = ok(await call(C, PATCH_TODO, `/api/messenger/todos/${todoId}`, { method: "PATCH", body: { done: true }, params: p(todoId) }))
    expect(done.todo.done).toBe(true)
    expect(done.todo.done_by).toBe(id.c)
    const s = await sync(C, cursor.c)
    expect(s.events.some((e) => e.type === "todo.updated" && e.todo.id === todoId)).toBe(true)
  })

  it("11. 수정·별표·삭제", async () => {
    const edited = ok(await call(A, EDIT_MESSAGE, `/api/messenger/messages/${msg}`, { method: "PATCH", body: { body: `@[박대표](m:${id.c}) 계약서 초안(v2) 확인 부탁드립니다` }, params: p(msg) }))
    expect(edited.message.edited_at).not.toBeNull()
    expect((await call(C, EDIT_MESSAGE, `/api/messenger/messages/${msg}`, { method: "PATCH", body: { body: "남의 글 수정" }, params: p(msg) })).status).toBe(403)
    const bm = ok(await call(C, BOOKMARK, `/api/messenger/messages/${msg}/bookmark`, { body: {}, params: p(msg) }))
    expect(bm.bookmarked).toBe(true)
    expect(ok(await call(C, BOOKMARKS, "/api/messenger/bookmarks")).messages.map((m: MessengerMessage) => m.id)).toEqual([msg])
    const tmp = ok(await call(C, POST_MESSAGE, `/api/messenger/rooms/${topic}/messages`, { body: { body: "잘못 보낸 글" }, params: p(topic) })).message.id
    expect((await call(B, DELETE_MESSAGE, `/api/messenger/messages/${tmp}`, { method: "DELETE", params: p(tmp) })).status).toBe(403)
    expect((await call(C, DELETE_MESSAGE, `/api/messenger/messages/${tmp}`, { method: "DELETE", params: p(tmp) })).status).toBeLessThan(300)
    expect((await messages(A, topic)).some((m) => m.id === tmp)).toBe(false)
  })

  it("12. 검색: C는 자기 방 글만, 남의 방 범위 지정은 404", async () => {
    const mine = ok(await call(C, SEARCH, `/api/messenger/search?q=${encodeURIComponent("계약서")}&type=messages`)).messages as MessengerMessage[]
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((m) => m.room_id === topic)).toBe(true)
    const internal = ok(await call(C, SEARCH, `/api/messenger/search?q=${encodeURIComponent("내부 공유")}&type=messages`)).messages
    expect(internal).toHaveLength(0)
    expect((await call(C, SEARCH, `/api/messenger/search?q=x&type=messages&room_id=${other}`)).status).toBe(404)
    const byA = ok(await call(A, SEARCH, `/api/messenger/search?q=${encodeURIComponent("내부 공유")}&type=messages`)).messages
    expect(byA.length).toBeGreaterThan(0)
    const members = ok(await call(C, SEARCH, `/api/messenger/search?q=${encodeURIComponent("이정산")}&type=members`)).members
    expect(members.map((m: { id: number }) => m.id)).toEqual([id.b]) // 같은 방 사람이라 보인다
  })

  it("13. 웹훅 수신(잔디 형식) → 토픽에 커넥트 메시지, C에게도 보인다", async () => {
    const wh = await call(A, CREATE_WEBHOOK, `/api/messenger/rooms/${topic}/webhooks`, { body: { name: "빌드 알림" }, params: p(topic) })
    expect(wh.status).toBeLessThan(300)
    const token = String(wh.json.webhook.url).split("/").pop()!
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    const hook = await call(null, HOOK, `/api/messenger/hooks/${token}`, {
      body: { body: "[[배포]] 완료", connectColor: "#FAC11B", connectInfo: [{ title: "버전", description: "1.2.0" }] },
      params: { token },
    })
    expect(hook.status).toBeLessThan(300)
    const got = (await messages(C, topic)).find((m) => m.id === hook.json.message_id)!
    expect(got.author_id).toBeNull()
    expect(got.author_label).toBe("빌드 알림")
    expect(got.connect_info).toEqual([{ title: "버전", description: "1.2.0" }])
    expect(roomIn(await bootstrap(C), topic)!.unread_count).toBeGreaterThanOrEqual(1)
    expect((await call(C, CREATE_WEBHOOK, `/api/messenger/rooms/${topic}/webhooks`, { body: { name: "x" }, params: p(topic) })).status).toBe(403)
  })

  it("14. 게스트 범위: 초대 안 받은 방·공개 토픽 둘러보기·다른 방 첨부", async () => {
    expect((await call(C, LIST_MESSAGES, `/api/messenger/rooms/${other}/messages`, { params: p(other) })).status).toBe(404)
    expect((await call(C, POST_MESSAGE, `/api/messenger/rooms/${other}/messages`, { body: { body: "끼어들기" }, params: p(other) })).status).toBe(404)
    expect((await call(C, ROOM_FILES, `/api/messenger/rooms/${other}/files`, { params: p(other) })).status).toBe(404)
    expect((await call(C, BROWSE, "/api/messenger/rooms/browse")).status).toBe(403)
    expect((await call(C, JOIN, `/api/messenger/rooms/${other}/join`, { body: {}, params: p(other) })).status).toBeGreaterThanOrEqual(403)
    expect(roomIn(await bootstrap(C), other)).toBeUndefined()
    expect(roomIn(await bootstrap(C), dmAB)).toBeUndefined()

    // 운영팀 방에 첨부를 올린다(업로드는 Blob이라 메타데이터만)
    const pathname = `messenger/${other}/1759000000000-정산표.xlsx`
    ok(
      await call(B, POST_MESSAGE, `/api/messenger/rooms/${other}/messages`, {
        body: { body: "", attachments: [{ name: "정산표.xlsx", pathname, size: 1200, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }] },
        params: p(other),
      })
    )
    // 다른 방 경로를 끼워 넣으면 거절
    expect(
      (
        await call(C, POST_MESSAGE, `/api/messenger/rooms/${topic}/messages`, {
          body: { body: "", attachments: [{ name: "정산표.xlsx", pathname, size: 1200, type: "application/octet-stream" }] },
          params: p(topic),
        })
      ).status
    ).toBe(400)
    const open = async (who: Who) => {
      blobGet.mockClear()
      const r = await call(who, FILE, `/api/file?pathname=${encodeURIComponent(pathname)}`)
      return { status: r.status, reachedBlob: blobGet.mock.calls.length > 0 }
    }
    expect(await open(C)).toEqual({ status: 404, reachedBlob: false })
    expect((await open(A)).reachedBlob).toBe(true)
    // 파일 검색에도 나오지 않는다
    expect(ok(await call(C, SEARCH, `/api/messenger/search?q=${encodeURIComponent("정산표")}&type=files`)).files).toHaveLength(0)
    expect(ok(await call(A, SEARCH, `/api/messenger/search?q=${encodeURIComponent("정산표")}&type=files`)).files).toHaveLength(1)
    // 공개 토픽 A·B 참여자 목록에 C가 없어 C가 B를 멤버 목록에서 보는 것은 같은 방(입주 지원) 덕분
    const c = await bootstrap(C)
    expect(c.members.map((m) => m.id).sort()).toEqual([id.a, id.b, id.c].sort())
  })
})
