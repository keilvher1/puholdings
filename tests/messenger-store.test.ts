import { describe, expect, it } from "vitest"
import {
  applyEvents,
  initialMessengerState,
  messengerReducer,
  notifyCandidates,
  type ApplyContext,
  type MessengerState,
} from "@/components/messenger/store"
import type { MessengerEvent, MessengerMember, MessengerMessage, MessengerRoom } from "@/lib/messenger-types"

// 화면 상태 병합(components/messenger/store.ts) — 동기화 이벤트가 겹치거나 순서가 섞여도 숫자·목록이 서버와 맞는지.

const ME = 1
const OTHER = 2
const ctxAway: ApplyContext = { activeRoomId: null, visible: false }

function member(id: number, name: string): MessengerMember {
  return { id, kind: "admin", role: "member", display_name: name, title: "", status_text: "", away: false, avatar_color: "#2563eb", last_seen_at: null }
}

function msg(id: number, over: Partial<MessengerMessage> = {}): MessengerMessage {
  return {
    id,
    room_id: 10,
    author_id: OTHER,
    author_label: "",
    kind: "text",
    body: `m${id}`,
    attachments: [],
    connect_color: "",
    connect_info: [],
    mentions: [],
    parent_id: null,
    reply_count: 0,
    last_reply_at: null,
    shared_from: null,
    reactions: [],
    bookmarked: false,
    unread_by: 0,
    poll: null,
    todo: null,
    edited_at: null,
    deleted: false,
    created_at: new Date(1_760_000_000_000 + id * 1000).toISOString(),
    ...over,
  }
}

function room(id: number, over: Partial<MessengerRoom> = {}): MessengerRoom {
  return {
    id,
    kind: "topic",
    name: `방${id}`,
    description: "",
    is_private: false,
    is_archived: false,
    created_by: ME,
    created_at: "2026-09-01T00:00:00.000Z",
    member_ids: [ME, OTHER],
    announcement: null,
    starred: false,
    muted: false,
    last_read_message_id: null,
    unread_count: 0,
    mention_count: 0,
    last_message: null,
    ...over,
  }
}

function boot(rooms: MessengerRoom[]): MessengerState {
  return messengerReducer(initialMessengerState, {
    type: "bootstrap",
    data: { success: true, me: member(ME, "나"), members: [member(OTHER, "상대")], rooms, cursor: 100 },
  })
}

const sync = (s: MessengerState, events: MessengerEvent[], ctx = ctxAway) => messengerReducer(s, { type: "sync", events, cursor: s.cursor + 1, ctx })

// 방 10에 최근 50개(151~200)를 불러 둔 상태(더 오래된 것이 서버에 있음)
function withLoadedRecent(): MessengerState {
  let s = boot([room(10, { last_read_message_id: 200, last_message: msg(200) })])
  const page = Array.from({ length: 50 }, (_, i) => msg(151 + i))
  s = messengerReducer(s, { type: "messagesLoaded", roomId: 10, page: { messages: page, has_more: true }, mode: "initial" })
  return s
}

describe("메신저 화면 상태 병합", () => {
  it("불러온 범위보다 오래된 메시지가 바뀌어도 목록 맨 위에 끼우지 않는다(이전 페이지 불러오기가 이어진다)", () => {
    let s = withLoadedRecent()
    s = sync(s, [{ id: 101, type: "message.updated", room_id: 10, message: msg(10, { reactions: [{ emoji: "👍", count: 1, member_ids: [OTHER] }] }) }])
    expect(s.timelines[10].ids[0]).toBe(151)
    expect(s.timelines[10].ids).not.toContain(10)
    expect(s.messages[10].reactions).toHaveLength(1) // 내용은 갱신
    // 댓글 패널을 열 때 오는 원본도 같다
    s = messengerReducer(s, { type: "threadLoaded", parentId: 20, parent: msg(20), replies: [msg(300, { parent_id: 20 })] })
    expect(s.timelines[10].ids[0]).toBe(151)
    // 새 메시지는 뒤에 붙는다
    s = sync(s, [{ id: 102, type: "message.created", room_id: 10, message: msg(301) }])
    expect(s.timelines[10].ids.at(-1)).toBe(301)
  })

  it("새 DM의 첫 메시지를 room.updated와 message.created로 두 번 세지 않고, 브라우저 알림 후보에도 넣는다", () => {
    const s0 = boot([])
    const first = msg(500, { room_id: 20 })
    const dm = room(20, { kind: "dm", name: "", unread_count: 1, last_message: first })
    const events: MessengerEvent[] = [
      { id: 101, type: "room.updated", room_id: 20, room: dm },
      { id: 102, type: "message.created", room_id: 20, message: first },
    ]
    expect(notifyCandidates(s0, events, ctxAway)).toHaveLength(1)
    const s = sync(s0, events)
    expect(s.rooms[20].unread_count).toBe(1)
    // 서버가 합치면서 room.updated가 메시지보다 뒤에 와도 같다
    const s2 = sync(boot([]), [
      { id: 101, type: "message.created", room_id: 20, message: first },
      { id: 103, type: "room.updated", room_id: 20, room: dm },
    ])
    expect(s2.rooms[20].unread_count).toBe(1)
    // 같은 이벤트가 정착 구간 때문에 다시 와도 그대로
    expect(sync(s, events).rooms[20].unread_count).toBe(1)
  })

  it("bootstrap 직후 다시 오는 메시지(정착 구간)는 서버 값에 이미 들어 있어 다시 세지 않는다", () => {
    const m = msg(210)
    let s = boot([room(10, { last_read_message_id: 200, unread_count: 1, last_message: m })])
    s = sync(s, [{ id: 101, type: "message.created", room_id: 10, message: m }])
    expect(s.rooms[10].unread_count).toBe(1)
    s = sync(s, [{ id: 102, type: "message.created", room_id: 10, message: msg(211) }])
    expect(s.rooms[10].unread_count).toBe(2)
  })

  it("참여·초대·나가기 안내 메시지는 안 읽은 수·알림에 넣지 않는다(웹훅 글은 넣는다)", () => {
    const s0 = boot([room(10, { last_read_message_id: 200, last_message: msg(200) })])
    const notice = msg(201, { kind: "system", author_id: null, author_label: "", body: "상대님이 참여했습니다." })
    const hook = msg(202, { kind: "system", author_id: null, author_label: "배포 알림", body: "배포 완료" })
    const events: MessengerEvent[] = [
      { id: 101, type: "message.created", room_id: 10, message: notice },
      { id: 102, type: "message.created", room_id: 10, message: hook },
    ]
    expect(notifyCandidates(s0, events, ctxAway).map((c) => c.message.id)).toEqual([202])
    expect(sync(s0, events).rooms[10].unread_count).toBe(1)
  })

  it("나를 멘션한 댓글도 읽음 위치 후보(maxSeen)에 들어가고, 그 id로 읽으면 멘션 배지가 지워진다", () => {
    let s = withLoadedRecent()
    const reply = msg(201, { parent_id: 180, mentions: [ME] })
    s = sync(s, [{ id: 101, type: "message.created", room_id: 10, message: reply }])
    expect(s.rooms[10].mention_count).toBe(1)
    expect(s.maxSeen[10]).toBe(201)
    s = messengerReducer(s, { type: "markRead", roomId: 10, messageId: s.maxSeen[10] })
    expect(s.rooms[10].mention_count).toBe(0)
  })

  it("같은 read 이벤트가 다시 와도 '안 읽은 사람 수' 재조회를 다시 켜지 않는다", () => {
    let s = withLoadedRecent()
    const read: MessengerEvent = { id: 101, type: "read", room_id: 10, member_id: OTHER, last_read_message_id: 200 }
    s = sync(s, [read])
    expect(s.timelines[10].staleReads).toBe(true)
    s = messengerReducer(s, { type: "messagesLoaded", roomId: 10, page: { messages: [], has_more: true }, mode: "latest" })
    expect(s.timelines[10].staleReads).toBe(false)
    s = sync(s, [read])
    expect(s.timelines[10].staleReads).toBe(false)
    s = sync(s, [{ ...read, id: 102, last_read_message_id: 201 }])
    expect(s.timelines[10].staleReads).toBe(true)
  })

  it("개인 room.updated(personal)만 별표·알림 설정을 바꾼다", () => {
    let s = boot([room(10)])
    s = sync(s, [{ id: 101, type: "room.updated", room_id: 10, room: room(10, { starred: true }) }])
    expect(s.rooms[10].starred).toBe(false)
    s = sync(s, [{ id: 102, type: "room.updated", room_id: 10, room: room(10, { starred: true, muted: true }), personal: true } as MessengerEvent])
    expect(s.rooms[10]).toMatchObject({ starred: true, muted: true })
  })

  it("읽기 전에 지워진 글은 안 읽은 수·멘션 수에서 빼고 목록에서도 뺀다", () => {
    let s = withLoadedRecent()
    const m = msg(201, { mentions: [ME] })
    s = sync(s, [{ id: 101, type: "message.created", room_id: 10, message: m }])
    expect(s.rooms[10]).toMatchObject({ unread_count: 1, mention_count: 1 })
    expect(s.timelines[10].ids).toContain(201)
    s = sync(s, [{ id: 102, type: "message.deleted", room_id: 10, message_id: 201 }])
    expect(s.rooms[10]).toMatchObject({ unread_count: 0, mention_count: 0 })
    expect(s.timelines[10].ids).not.toContain(201)
    expect(s.rooms[10].last_message?.id).toBe(200)
    // 같은 삭제 이벤트가 다시 와도 음수로 내려가지 않는다
    s = sync(s, [{ id: 102, type: "message.deleted", room_id: 10, message_id: 201 }])
    expect(s.rooms[10].unread_count).toBe(0)
  })

  it("applyEvents는 순서가 섞인 묶음도 id 순으로 반영한다", () => {
    const s = applyEvents(boot([room(10, { last_read_message_id: 200, last_message: msg(200) })]), [
      { id: 103, type: "message.created", room_id: 10, message: msg(203) },
      { id: 102, type: "message.created", room_id: 10, message: msg(202) },
    ], ctxAway)
    expect(s.rooms[10].unread_count).toBe(2)
    expect(s.rooms[10].last_message?.id).toBe(203)
  })
})
