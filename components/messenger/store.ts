// 사내 메신저 화면 상태와 병합 로직. 순수 함수(리듀서·선택자) 위주라 테스트에서 그대로 import할 수 있다.
// 맨 아래 MessengerContext / useMessenger()는 화면 컴포넌트(C·D 담당)가 공유하는 컨텍스트다.
//
// 병합 원칙
// - 메시지는 id 하나당 한 벌(messages 맵)만 두고, 방 목록 순서(timelines)와 댓글 순서(threads)는 id 배열로 갖는다.
// - 같은 이벤트가 두 번 와도(재시도·API 응답과 sync가 겹침) 결과가 같게 한다(id 기준 upsert, 증가 연산은 처음 본 id에만).
// - room.updated는 방의 공용 필드만 덮어쓰고 "내 설정·상태"(별표·알림·읽음·안 읽은 수)는 로컬 값을 지킨다
//   (이벤트 로그는 사람마다 따로 만들지 않으므로 개인 필드를 믿지 않는다). 새로 초대된 방이면 이벤트 값을 그대로 쓴다.
// - 내가 보낸 메시지는 pending(음수 temp_id)으로 먼저 보이고, 서버가 같은 방·같은 부모·같은 본문의 내 메시지를 돌려주면 지운다.

import { createContext, useContext } from "react"
import type {
  BootstrapResponse,
  MessengerAttachment,
  MessengerEvent,
  MessengerMember,
  MessengerMessage,
  MessengerRoom,
  MessengerTodo,
} from "@/lib/messenger-types"
import type { MessagePage, SendMessageInput } from "./api"

// ── 상태 ─────────────────────────────────────────────────────────────────────

export type RightPanelTab = "thread" | "files" | "mentions" | "bookmarks" | "todos" | "members" | "search"

export interface RoomTimeline {
  ids: number[] // 불러온 최상위 메시지 id(오름차순)
  hasMore: boolean // 더 오래된 메시지가 서버에 있음
  loaded: boolean // 첫 페이지를 받았음
  loadingOlder: boolean
  staleReads: boolean // 다른 사람의 읽음 이벤트가 와서 unread_by 숫자를 다시 받아야 함
}

export interface PendingMessage {
  temp_id: number // 음수
  room_id: number
  parent_id: number | null
  body: string
  attachments: MessengerAttachment[]
  mentions: number[]
  created_at: string
  status: "sending" | "failed"
  error?: string
}

export interface MessengerState {
  phase: "loading" | "ready" | "error"
  error: string | null
  errorStatus: number | null
  me: MessengerMember | null
  members: Record<number, MessengerMember>
  rooms: Record<number, MessengerRoom>
  messages: Record<number, MessengerMessage>
  timelines: Record<number, RoomTimeline>
  threads: Record<number, number[]> // 원본 id → 댓글 id(오름차순). 스레드를 열었거나 sync로 본 댓글만
  threadLoaded: Record<number, boolean>
  todos: Record<number, MessengerTodo> // sync·응답으로 본 할 일(담당 D 패널이 병합에 쓸 수 있음)
  todoVersion: number // 할 일이 바뀔 때마다 +1(패널 재조회 신호)
  pending: PendingMessage[]
  cursor: number
  membersStale: boolean // 모르는 멤버 id가 보였음 → GET members 다시
  // 방별: 서버가 준 안 읽은 수·멘션 수가 이미 반영한 메시지 id 상한(bootstrap·새 방·API 응답). 이 id 이하의
  // message.created는 다시 세지 않는다(새 DM의 첫 메시지를 room.updated와 message.created로 두 번 세지 않게).
  countedThrough: Record<number, number>
  // 방별: 받은 메시지(댓글 포함) 중 가장 큰 id — 보고 있는 방의 읽음 위치를 댓글까지 올리는 데 쓴다.
  maxSeen: Record<number, number>
  // 방별·구성원별 마지막으로 본 읽음 위치. 같은 read 이벤트가 다시 와도(정착 구간 재전송) 재조회하지 않게.
  reads: Record<number, Record<number, number>>
}

export const initialMessengerState: MessengerState = {
  phase: "loading",
  error: null,
  errorStatus: null,
  me: null,
  members: {},
  rooms: {},
  messages: {},
  timelines: {},
  threads: {},
  threadLoaded: {},
  todos: {},
  todoVersion: 0,
  pending: [],
  cursor: 0,
  membersStale: false,
  countedThrough: {},
  maxSeen: {},
  reads: {},
}

export interface ApplyContext {
  activeRoomId: number | null // 지금 보고 있는 방
  visible: boolean // 화면이 보이는 중(document.visibilityState === 'visible')
}

export type MessengerAction =
  | { type: "bootstrap"; data: BootstrapResponse }
  | { type: "error"; error: string; status?: number | null }
  | { type: "sync"; events: MessengerEvent[]; cursor: number; ctx: ApplyContext }
  | { type: "messagesLoaded"; roomId: number; page: MessagePage; mode: "initial" | "older" | "latest" }
  | { type: "loadingOlder"; roomId: number; value: boolean }
  | { type: "threadLoaded"; parentId: number; parent: MessengerMessage | null; replies: MessengerMessage[] }
  | { type: "upsertMessage"; message: MessengerMessage; ctx?: ApplyContext }
  | { type: "removeMessageLocal"; messageId: number }
  | { type: "upsertRoom"; room: MessengerRoom } // API 응답(개인 필드 포함)으로 받은 방
  | { type: "patchRoom"; roomId: number; patch: Partial<MessengerRoom> }
  | { type: "removeRoom"; roomId: number }
  | { type: "markRead"; roomId: number; messageId: number }
  | { type: "setMembers"; members: MessengerMember[] }
  | { type: "upsertMember"; member: MessengerMember }
  | { type: "upsertTodo"; todo: MessengerTodo }
  | { type: "pendingAdd"; pending: PendingMessage }
  | { type: "pendingFail"; tempId: number; error: string }
  | { type: "pendingRetry"; tempId: number }
  | { type: "pendingRemove"; tempId: number }

// ── 작은 도우미 ──────────────────────────────────────────────────────────────

function insertSorted(ids: number[], id: number): number[] {
  if (ids.length === 0 || ids[ids.length - 1] < id) return [...ids, id]
  let lo = 0
  let hi = ids.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (ids[mid] < id) lo = mid + 1
    else hi = mid
  }
  if (ids[lo] === id) return ids
  const next = ids.slice()
  next.splice(lo, 0, id)
  return next
}

function mergeSorted(a: number[], b: number[]): number[] {
  const set = new Set<number>(a)
  for (const x of b) set.add(x)
  return Array.from(set).sort((x, y) => x - y)
}

function emptyTimeline(): RoomTimeline {
  return { ids: [], hasMore: true, loaded: false, loadingOlder: false, staleReads: false }
}

// 참여·초대·나가기 같은 안내 메시지(작성자·발신자 이름 없음). 서버처럼 안 읽은 수·알림에서 뺀다.
export function isNoticeMessage(m: Pick<MessengerMessage, "kind" | "author_id" | "author_label">): boolean {
  return m.kind === "system" && m.author_id === null && !m.author_label
}

export function mentionsMe(message: Pick<MessengerMessage, "mentions" | "author_id">, meId: number | null | undefined): boolean {
  if (!meId || message.author_id === meId) return false
  return message.mentions.includes(meId) || message.mentions.includes(-1)
}

function sameText(a: string, b: string): boolean {
  return a.trim() === b.trim()
}

// 방의 공용 필드만 덮어쓴다(개인 필드는 prev 유지).
function mergeSharedRoom(prev: MessengerRoom, next: MessengerRoom): MessengerRoom {
  return {
    ...prev,
    kind: next.kind,
    name: next.name,
    description: next.description,
    is_private: next.is_private,
    is_archived: next.is_archived,
    created_by: next.created_by,
    created_at: next.created_at || prev.created_at,
    member_ids: next.member_ids,
    announcement: next.announcement,
    last_message: pickLater(prev.last_message, next.last_message),
    webhook_count: next.webhook_count ?? prev.webhook_count,
  }
}

function pickLater(a: MessengerMessage | null, b: MessengerMessage | null): MessengerMessage | null {
  if (!a) return b
  if (!b) return a
  return b.id >= a.id ? b : a
}

function unknownMemberIds(state: MessengerState, ids: number[]): boolean {
  return ids.some((id) => !state.members[id])
}

// ── 메시지 반영 ──────────────────────────────────────────────────────────────

// 메시지 하나를 상태에 넣는다. created: sync의 message.created처럼 "새로 생김"이면 true(안 읽은 수·댓글 수 증가 판단).
function putMessage(state: MessengerState, msg: MessengerMessage, created: boolean, ctx: ApplyContext | null): MessengerState {
  const prev = state.messages[msg.id]
  const isNew = !prev
  let s: MessengerState = { ...state, messages: { ...state.messages, [msg.id]: msg } }
  const meId = s.me?.id ?? null

  // 내가 보낸 pending 정리
  if (isNew && meId && msg.author_id === meId && s.pending.length > 0) {
    const idx = s.pending.findIndex(
      (p) => p.room_id === msg.room_id && (p.parent_id ?? null) === (msg.parent_id ?? null) && sameText(p.body, msg.body)
    )
    if (idx >= 0) s = { ...s, pending: s.pending.filter((_, i) => i !== idx) }
  }

  if (msg.parent_id) {
    // 댓글
    const pid = msg.parent_id
    const list = s.threads[pid]
    const known = list ? list.includes(msg.id) : false
    if (!known) {
      s = { ...s, threads: { ...s.threads, [pid]: insertSorted(list ?? [], msg.id) } }
      const parent = s.messages[pid]
      if (parent && isNew && created) {
        s = {
          ...s,
          messages: {
            ...s.messages,
            [pid]: {
              ...parent,
              reply_count: parent.reply_count + 1,
              last_reply_at: msg.created_at > (parent.last_reply_at ?? "") ? msg.created_at : parent.last_reply_at,
            },
          },
        }
      }
    }
  } else {
    // 최상위: 불러온 범위 안이거나 더 새 메시지면 끼워 넣는다(불러온 적 없는 방은 열 때 받는다).
    // 불러온 범위보다 오래된 메시지(반응·댓글 수 변경, 댓글 패널의 원본)는 messages 맵만 갱신한다 —
    // 목록 맨 위에 끼우면 그 사이 메시지가 빠진 채로 붙어 보이고 이전 페이지 불러오기도 건너뛴다.
    const tl = s.timelines[msg.room_id]
    const inRange = !!tl && (!tl.hasMore || tl.ids.length === 0 || msg.id > tl.ids[0])
    if (tl && tl.loaded && inRange && !tl.ids.includes(msg.id)) {
      s = { ...s, timelines: { ...s.timelines, [msg.room_id]: { ...tl, ids: insertSorted(tl.ids, msg.id) } } }
    }
  }

  if (msg.id > (s.maxSeen[msg.room_id] ?? 0)) s = { ...s, maxSeen: { ...s.maxSeen, [msg.room_id]: msg.id } }

  // 방 정보: 마지막 메시지·공지·안 읽은 수
  const room = s.rooms[msg.room_id]
  if (room) {
    let r = room
    if (!msg.parent_id && (!r.last_message || r.last_message.id <= msg.id)) r = { ...r, last_message: msg }
    if (r.announcement && r.announcement.id === msg.id) r = { ...r, announcement: msg }
    const counted = msg.id <= (s.countedThrough[msg.room_id] ?? 0) // 서버 값에 이미 들어 있음
    if (created && isNew && meId && msg.author_id !== meId && !isNoticeMessage(msg) && !counted) {
      const lastRead = r.last_read_message_id ?? 0
      const viewing = !!ctx && ctx.visible && ctx.activeRoomId === msg.room_id
      if (msg.id > lastRead && !viewing) {
        r = {
          ...r,
          unread_count: msg.parent_id ? r.unread_count : r.unread_count + 1,
          mention_count: mentionsMe(msg, meId) ? r.mention_count + 1 : r.mention_count,
        }
      }
    }
    if (r !== room) s = { ...s, rooms: { ...s.rooms, [r.id]: r } }
  }

  if (msg.todo) {
    s = { ...s, todos: { ...s.todos, [msg.todo.id]: msg.todo } }
  }
  return s
}

function markDeleted(state: MessengerState, messageId: number): MessengerState {
  const m = state.messages[messageId]
  if (!m) return state
  const wasDeleted = m.deleted
  const dm: MessengerMessage = { ...m, deleted: true, body: "", attachments: [], connect_info: [], poll: null }
  let s: MessengerState = { ...state, messages: { ...state.messages, [messageId]: dm } }
  // 서버 목록처럼 지운 최상위 메시지는 목록에서 뺀다
  const tl = !m.parent_id ? s.timelines[m.room_id] : undefined
  if (tl && tl.ids.includes(messageId)) {
    s = { ...s, timelines: { ...s.timelines, [m.room_id]: { ...tl, ids: tl.ids.filter((id) => id !== messageId) } } }
  }
  const room = s.rooms[m.room_id]
  if (room) {
    let r = room
    if (r.announcement?.id === messageId) r = { ...r, announcement: null }
    if (r.last_message?.id === messageId) {
      // 불러온 목록에 바로 앞 메시지가 있으면 그것으로, 없으면 '삭제된 메시지'로 둔다
      const ids = s.timelines[m.room_id]?.ids ?? []
      let prevMsg: MessengerMessage | null = null
      for (let i = ids.length - 1; i >= 0; i--) {
        const x = s.messages[ids[i]]
        if (x && x.id < messageId && !x.deleted) {
          prevMsg = x
          break
        }
      }
      r = { ...r, last_message: prevMsg ?? dm }
    }
    // 읽기 전에 지워진 남의 글은 안 읽은 수·멘션 수에서 뺀다(서버는 삭제된 글을 세지 않는다)
    const meId = s.me?.id ?? null
    if (!wasDeleted && meId && m.author_id !== meId && m.id > (r.last_read_message_id ?? 0) && !isNoticeMessage(m)) {
      r = {
        ...r,
        unread_count: m.parent_id ? r.unread_count : Math.max(0, r.unread_count - 1),
        mention_count: mentionsMe(m, meId) ? Math.max(0, r.mention_count - 1) : r.mention_count,
      }
    }
    if (r !== room) s = { ...s, rooms: { ...s.rooms, [r.id]: r } }
  }
  return s
}

function applyRead(state: MessengerState, roomId: number, messageId: number): MessengerState {
  const room = state.rooms[roomId]
  if (!room) return state
  const prevRead = room.last_read_message_id ?? 0
  if (messageId <= prevRead) return state
  const meId = state.me?.id ?? null
  // 내가 읽은 범위의 남의 메시지는 "안 읽은 사람 수"가 1 줄어든다
  let messages = state.messages
  const tl = state.timelines[roomId]
  if (tl && meId) {
    for (const id of tl.ids) {
      if (id <= prevRead || id > messageId) continue
      const m = messages[id]
      if (m && m.author_id !== meId && m.unread_by > 0) {
        if (messages === state.messages) messages = { ...messages }
        messages[id] = { ...m, unread_by: m.unread_by - 1 }
      }
    }
  }
  const lastId = room.last_message?.id ?? 0
  const allRead = messageId >= lastId
  let unread = room.unread_count
  let mention = room.mention_count
  if (allRead) {
    unread = 0
    mention = 0
  } else if (tl && tl.loaded) {
    // 불러온 목록 기준으로 다시 센다(불러온 범위 밖은 서버 값 유지)
    const after = tl.ids.filter(
      (id) => id > messageId && messages[id] && messages[id].author_id !== meId && !isNoticeMessage(messages[id])
    )
    unread = Math.min(unread, after.length)
    mention = Math.min(mention, after.filter((id) => mentionsMe(messages[id], meId)).length)
  }
  return {
    ...state,
    messages,
    rooms: {
      ...state.rooms,
      [roomId]: { ...room, last_read_message_id: messageId, unread_count: unread, mention_count: mention },
    },
  }
}

function removeRoom(state: MessengerState, roomId: number): MessengerState {
  if (!state.rooms[roomId] && !state.timelines[roomId]) return state
  const rooms = { ...state.rooms }
  delete rooms[roomId]
  const timelines = { ...state.timelines }
  delete timelines[roomId]
  return { ...state, rooms, timelines, pending: state.pending.filter((p) => p.room_id !== roomId) }
}

function upsertRoomFull(state: MessengerState, room: MessengerRoom): MessengerState {
  const prev = state.rooms[room.id]
  // API 응답의 방은 개인 필드를 포함한다. 다만 로컬이 더 앞선 읽음 위치를 갖고 있으면 지킨다.
  let next = room
  const adopted = !(prev && (prev.last_read_message_id ?? 0) > (room.last_read_message_id ?? 0))
  if (!adopted && prev) {
    next = {
      ...room,
      last_read_message_id: prev.last_read_message_id,
      unread_count: prev.unread_count,
      mention_count: prev.mention_count,
    }
  }
  if (prev) next = { ...next, last_message: pickLater(prev.last_message, next.last_message) }
  return {
    ...state,
    rooms: { ...state.rooms, [room.id]: next },
    countedThrough: adopted ? withCounted(state.countedThrough, room) : state.countedThrough,
    membersStale: state.membersStale || unknownMemberIds(state, room.member_ids),
  }
}

function withCounted(map: Record<number, number>, room: MessengerRoom): Record<number, number> {
  const id = room.last_message?.id ?? 0
  if (id <= (map[room.id] ?? 0)) return map
  return { ...map, [room.id]: id }
}

// ── 이벤트 병합 ──────────────────────────────────────────────────────────────

export function applyEvent(state: MessengerState, ev: MessengerEvent, ctx: ApplyContext): MessengerState {
  switch (ev.type) {
    case "message.created":
      if (!state.rooms[ev.room_id]) return state
      return putMessage(state, ev.message, true, ctx)
    case "message.updated":
      if (!state.rooms[ev.room_id]) return state
      return putMessage(state, ev.message, false, ctx)
    case "message.deleted":
      return markDeleted(state, ev.message_id)
    case "room.updated": {
      const meId = state.me?.id
      if (meId && ev.room.member_ids.length > 0 && !ev.room.member_ids.includes(meId)) {
        return removeRoom(state, ev.room_id)
      }
      const prev = state.rooms[ev.room_id]
      // 개인 이벤트(내 별표·알림 설정 변경, 서버가 personal 표시)는 그 값도 받는다 — 다른 탭·기기와 맞춘다
      const personal = (ev as { personal?: boolean }).personal === true
      let room = prev ? mergeSharedRoom(prev, ev.room) : ev.room
      if (prev && personal) room = { ...room, starred: ev.room.starred, muted: ev.room.muted }
      return {
        ...state,
        rooms: { ...state.rooms, [ev.room_id]: room },
        // 새로 알게 된 방은 서버가 센 안 읽은 수를 그대로 쓰므로, 그 범위의 메시지는 다시 세지 않는다
        countedThrough: prev ? state.countedThrough : withCounted(state.countedThrough, ev.room),
        membersStale: state.membersStale || unknownMemberIds(state, room.member_ids),
      }
    }
    case "room.removed":
      return removeRoom(state, ev.room_id)
    case "read": {
      if (state.me && ev.member_id === state.me.id) return applyRead(state, ev.room_id, ev.last_read_message_id)
      // 읽음 위치가 실제로 앞으로 움직였을 때만 "안 읽은 사람 수"를 다시 받는다(같은 이벤트 재전송은 무시)
      const roomReads = state.reads[ev.room_id] ?? {}
      if (ev.last_read_message_id <= (roomReads[ev.member_id] ?? 0)) return state
      const s: MessengerState = {
        ...state,
        reads: { ...state.reads, [ev.room_id]: { ...roomReads, [ev.member_id]: ev.last_read_message_id } },
      }
      const tl = s.timelines[ev.room_id]
      if (!tl || !tl.loaded || tl.staleReads) return s
      return { ...s, timelines: { ...s.timelines, [ev.room_id]: { ...tl, staleReads: true } } }
    }
    case "member.updated": {
      const members = { ...state.members, [ev.member.id]: ev.member }
      const me = state.me && state.me.id === ev.member.id ? ev.member : state.me
      return { ...state, members, me }
    }
    case "todo.updated":
      return upsertTodo(state, ev.todo)
    default:
      return state
  }
}

function upsertTodo(state: MessengerState, todo: MessengerTodo): MessengerState {
  let s: MessengerState = { ...state, todos: { ...state.todos, [todo.id]: todo }, todoVersion: state.todoVersion + 1 }
  if (todo.message_id && s.messages[todo.message_id]) {
    const m = s.messages[todo.message_id]
    if (m.todo && m.todo.id === todo.id) s = { ...s, messages: { ...s.messages, [m.id]: { ...m, todo } } }
  }
  return s
}

export function applyEvents(state: MessengerState, events: MessengerEvent[], ctx: ApplyContext): MessengerState {
  let s = state
  const sorted = [...events].sort((a, b) => a.id - b.id)
  // 새로 알게 된 방(초대·새 DM)은 먼저 반영한다 — 서버가 중복을 합치면서 room.updated가 그 방의
  // message.created보다 뒤에 올 수 있는데, 방을 모르면 메시지를 버리게 된다.
  const early = new Set<MessengerEvent>()
  for (const ev of sorted) {
    if (ev.type === "room.updated" && !s.rooms[ev.room_id]) {
      s = applyEvent(s, ev, ctx)
      early.add(ev)
    }
  }
  for (const ev of sorted) if (!early.has(ev)) s = applyEvent(s, ev, ctx)
  return s
}

// ── 리듀서 ───────────────────────────────────────────────────────────────────

export function messengerReducer(state: MessengerState, action: MessengerAction): MessengerState {
  switch (action.type) {
    case "bootstrap": {
      const d = action.data
      const members: Record<number, MessengerMember> = {}
      for (const m of d.members) members[m.id] = m
      members[d.me.id] = d.me
      const rooms: Record<number, MessengerRoom> = {}
      let countedThrough: Record<number, number> = {}
      for (const r of d.rooms) {
        rooms[r.id] = r
        countedThrough = withCounted(countedThrough, r)
      }
      return {
        ...initialMessengerState,
        phase: "ready",
        me: d.me,
        members,
        rooms,
        cursor: d.cursor,
        countedThrough,
        // 재시작(reset) 때도 보내는 중인 메시지는 남긴다
        pending: state.pending.filter((p) => rooms[p.room_id]),
      }
    }
    case "error":
      return { ...state, phase: state.phase === "ready" ? "ready" : "error", error: action.error, errorStatus: action.status ?? null }
    case "sync": {
      if (action.cursor < state.cursor) return state // 늦게 도착한 옛 응답
      const s = applyEvents(state, action.events, action.ctx)
      return { ...s, cursor: Math.max(s.cursor, action.cursor), error: null, errorStatus: null }
    }
    case "messagesLoaded": {
      const { roomId, page, mode } = action
      let s = state
      for (const m of page.messages) s = putMessage(s, m, false, null)
      const tl = s.timelines[roomId] ?? emptyTimeline()
      const pageIds = page.messages.filter((m) => !m.parent_id && m.room_id === roomId).map((m) => m.id)
      let next: RoomTimeline
      if (mode === "initial") {
        // 처음 열 때: 받은 페이지 + (그사이 sync로 들어와 있던 것 중 페이지 이후 것)
        const newest = pageIds.length ? pageIds[pageIds.length - 1] : 0
        const tail = tl.ids.filter((id) => id > newest)
        next = { ...tl, ids: mergeSorted(pageIds, tail), hasMore: page.has_more, loaded: true, staleReads: false }
      } else if (mode === "older") {
        next = { ...tl, ids: mergeSorted(pageIds, tl.ids), hasMore: page.has_more, loadingOlder: false }
      } else {
        // latest: 최근 페이지 재조회(읽음 숫자 갱신). 불러온 목록과 이어지지 않으면(간격) 최근 페이지로 교체
        const oldestNew = pageIds[0] ?? 0
        const newestLoaded = tl.ids[tl.ids.length - 1] ?? 0
        const gap = page.has_more && tl.ids.length > 0 && oldestNew > newestLoaded
        next = gap
          ? { ...tl, ids: pageIds, hasMore: true, loaded: true, staleReads: false }
          : { ...tl, ids: mergeSorted(tl.ids, pageIds), loaded: true, staleReads: false, hasMore: tl.loaded ? tl.hasMore : page.has_more }
      }
      return { ...s, timelines: { ...s.timelines, [roomId]: next } }
    }
    case "loadingOlder": {
      const tl = state.timelines[action.roomId] ?? emptyTimeline()
      return { ...state, timelines: { ...state.timelines, [action.roomId]: { ...tl, loadingOlder: action.value } } }
    }
    case "threadLoaded": {
      let s = state
      if (action.parent) s = putMessage(s, action.parent, false, null)
      for (const m of action.replies) s = putMessage(s, m, false, null)
      const ids = action.replies.map((m) => m.id)
      return {
        ...s,
        threads: { ...s.threads, [action.parentId]: mergeSorted(s.threads[action.parentId] ?? [], ids) },
        threadLoaded: { ...s.threadLoaded, [action.parentId]: true },
      }
    }
    case "upsertMessage":
      return putMessage(state, action.message, !state.messages[action.message.id], action.ctx ?? null)
    case "removeMessageLocal":
      return markDeleted(state, action.messageId)
    case "upsertRoom":
      return upsertRoomFull(state, action.room)
    case "patchRoom": {
      const room = state.rooms[action.roomId]
      if (!room) return state
      return { ...state, rooms: { ...state.rooms, [action.roomId]: { ...room, ...action.patch } } }
    }
    case "removeRoom":
      return removeRoom(state, action.roomId)
    case "markRead":
      return applyRead(state, action.roomId, action.messageId)
    case "setMembers": {
      const members = { ...state.members }
      for (const m of action.members) members[m.id] = m
      const me = state.me ? members[state.me.id] ?? state.me : null
      return { ...state, members, me, membersStale: false }
    }
    case "upsertMember": {
      const me = state.me && state.me.id === action.member.id ? action.member : state.me
      return { ...state, members: { ...state.members, [action.member.id]: action.member }, me }
    }
    case "upsertTodo":
      return upsertTodo(state, action.todo)
    case "pendingAdd":
      return { ...state, pending: [...state.pending, action.pending] }
    case "pendingFail":
      return {
        ...state,
        pending: state.pending.map((p) => (p.temp_id === action.tempId ? { ...p, status: "failed", error: action.error } : p)),
      }
    case "pendingRetry":
      return {
        ...state,
        pending: state.pending.map((p) => (p.temp_id === action.tempId ? { ...p, status: "sending", error: undefined } : p)),
      }
    case "pendingRemove":
      return { ...state, pending: state.pending.filter((p) => p.temp_id !== action.tempId) }
    default:
      return state
  }
}

// ── 선택자 ───────────────────────────────────────────────────────────────────

export function memberName(members: Record<number, MessengerMember>, id: number | null | undefined, fallback = "알 수 없음"): string {
  if (id === null || id === undefined) return fallback
  return members[id]?.display_name || fallback
}

// DM 이름: 나를 뺀 참여자 이름. 나 혼자면 "나에게".
export function roomDisplayName(room: MessengerRoom, members: Record<number, MessengerMember>, meId: number | null | undefined): string {
  if (room.kind === "topic") return room.name || "이름 없는 토픽"
  const others = room.member_ids.filter((id) => id !== meId)
  if (others.length === 0) return `${memberName(members, meId ?? null, "나")} (나)`
  return others.map((id) => memberName(members, id)).join(", ")
}

// DM 상대(1:1이면 그 사람, 아니면 null)
export function dmPartner(room: MessengerRoom, members: Record<number, MessengerMember>, meId: number | null | undefined): MessengerMember | null {
  if (room.kind !== "dm") return null
  const others = room.member_ids.filter((id) => id !== meId)
  if (others.length !== 1) return null
  return members[others[0]] ?? null
}

function activityKey(room: MessengerRoom): string {
  return room.last_message?.created_at || room.created_at || ""
}

// 토픽: 보관 제외 · 별표 먼저 · 이름순
export function sortedTopics(rooms: Record<number, MessengerRoom>): MessengerRoom[] {
  return Object.values(rooms)
    .filter((r) => r.kind === "topic" && !r.is_archived)
    .sort((a, b) => Number(b.starred) - Number(a.starred) || a.name.localeCompare(b.name, "ko"))
}

export function archivedTopics(rooms: Record<number, MessengerRoom>): MessengerRoom[] {
  return Object.values(rooms)
    .filter((r) => r.kind === "topic" && r.is_archived)
    .sort((a, b) => a.name.localeCompare(b.name, "ko"))
}

// 대화(DM): 별표 먼저 · 최근 대화순
export function sortedDms(rooms: Record<number, MessengerRoom>): MessengerRoom[] {
  return Object.values(rooms)
    .filter((r) => r.kind === "dm")
    .sort((a, b) => Number(b.starred) - Number(a.starred) || activityKey(b).localeCompare(activityKey(a)))
}

// 문서 제목·배지에 쓰는 합계: 알림 켠 방의 안 읽은 수 + 알림 끈 방의 멘션 수
export function totalUnread(rooms: Record<number, MessengerRoom>): number {
  let n = 0
  for (const r of Object.values(rooms)) {
    if (r.is_archived) continue
    n += r.muted ? r.mention_count : r.unread_count
  }
  return n
}

export function timelineMessages(state: MessengerState, roomId: number): MessengerMessage[] {
  const tl = state.timelines[roomId]
  if (!tl) return []
  const out: MessengerMessage[] = []
  for (const id of tl.ids) {
    const m = state.messages[id]
    if (m) out.push(m)
  }
  return out
}

export function threadReplies(state: MessengerState, parentId: number): MessengerMessage[] {
  const ids = state.threads[parentId] ?? []
  const out: MessengerMessage[] = []
  for (const id of ids) {
    const m = state.messages[id]
    if (m) out.push(m)
  }
  return out
}

export function pendingFor(state: MessengerState, roomId: number, parentId: number | null = null): PendingMessage[] {
  return state.pending.filter((p) => p.room_id === roomId && (p.parent_id ?? null) === parentId)
}

// pending을 화면용 메시지 모양으로(목록에서 같은 컴포넌트로 그리기 위해)
export function pendingAsMessage(p: PendingMessage, meId: number): MessengerMessage {
  return {
    id: p.temp_id,
    room_id: p.room_id,
    author_id: meId,
    author_label: "",
    kind: p.attachments.length > 0 && !p.body.trim() ? "file" : "text",
    body: p.body,
    attachments: p.attachments,
    connect_color: "",
    connect_info: [],
    mentions: p.mentions,
    parent_id: p.parent_id,
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
    created_at: p.created_at,
  }
}

// sync 이벤트 중 브라우저 알림 후보: 남이 쓴 새 메시지 · 보고 있지 않은 방 · 알림 켠 방(멘션은 알림 꺼도 포함)
export interface NotifyCandidate {
  room: MessengerRoom
  message: MessengerMessage
  mention: boolean
}

export function notifyCandidates(state: MessengerState, events: MessengerEvent[], ctx: ApplyContext): NotifyCandidate[] {
  const meId = state.me?.id
  if (!meId) return []
  const out: NotifyCandidate[] = []
  // 같은 묶음의 room.updated로 새로 알게 되는 방(새 DM·초대)도 찾는다
  const batchRooms = new Map<number, MessengerRoom>()
  for (const ev of events) if (ev.type === "room.updated") batchRooms.set(ev.room_id, ev.room)
  for (const ev of events) {
    if (ev.type !== "message.created") continue
    const m = ev.message
    if (state.messages[m.id]) continue // 이미 본 메시지
    if (m.author_id === meId) continue
    if (isNoticeMessage(m)) continue // 참여·나가기 안내
    const room = state.rooms[ev.room_id] ?? batchRooms.get(ev.room_id)
    if (!room || room.is_archived) continue
    if (ctx.visible && ctx.activeRoomId === room.id) continue
    const mention = mentionsMe(m, meId)
    if (room.muted && !mention) continue
    if (m.parent_id && !mention) continue // 댓글은 멘션일 때만
    out.push({ room, message: m, mention })
  }
  return out
}

// 알림·목록 미리보기용 한 줄 요약(멘션 토큰은 @이름으로)
export function messagePreview(m: Pick<MessengerMessage, "kind" | "body" | "attachments" | "deleted" | "poll" | "todo">): string {
  if (m.deleted) return "삭제된 메시지"
  const text = m.body.replace(/@\[([^\]]{1,60})\]\(m:(?:\d+|all)\)/g, "@$1").replace(/\*\*|`/g, "").replace(/\s+/g, " ").trim()
  if (m.kind === "poll") return `[투표] ${m.poll?.question ?? text}`
  if (m.kind === "todo") return `[할 일] ${m.todo?.title ?? text}`
  if (text) return text
  if (m.attachments.length === 1) return `[파일] ${m.attachments[0].name}`
  if (m.attachments.length > 1) return `[파일] ${m.attachments[0].name} 외 ${m.attachments.length - 1}개`
  return ""
}

// ── 컨텍스트(화면 공용) ──────────────────────────────────────────────────────

export type MessengerDialog =
  | { name: "createTopic" }
  | { name: "browseTopics" }
  | { name: "startDm"; memberIds?: number[] }
  | { name: "invite"; roomId: number }
  | { name: "roomSettings"; roomId: number }
  | { name: "webhooks"; roomId: number }
  | { name: "profile"; memberId: number }
  | { name: "poll"; roomId: number }
  | { name: "todo"; roomId: number; messageId?: number | null; defaultTitle?: string }
  | { name: "share"; messageId: number }

export interface PanelState {
  open: boolean
  tab: RightPanelTab
  threadId: number | null // 댓글 탭에서 보는 원본 메시지 id
  searchQuery: string
}

export interface MessengerContextValue {
  variant: "admin" | "portal"
  state: MessengerState
  dispatch: (action: MessengerAction) => void
  me: MessengerMember
  isMember: boolean // 정회원(게스트가 아님)
  activeRoomId: number | null
  activeRoom: MessengerRoom | null
  openRoom: (roomId: number | null) => void
  // 메시지로 이동: 방을 열고 해당 메시지로 스크롤·강조(불러오지 않았으면 이전 페이지를 더 불러온다)
  jumpToMessage: (roomId: number, messageId: number) => void
  jumpTarget: { roomId: number; messageId: number; nonce: number } | null
  panel: PanelState
  openPanel: (tab: RightPanelTab, opts?: { threadId?: number | null; searchQuery?: string }) => void
  closePanel: () => void
  dialog: MessengerDialog | null
  openDialog: (d: MessengerDialog) => void
  closeDialog: () => void
  // 동작(오류는 toast로 알리고 호출부에는 성공 여부만 돌려준다)
  send: (roomId: number, input: SendMessageInput) => Promise<boolean>
  retryPending: (tempId: number) => Promise<void>
  discardPending: (tempId: number) => void
  editMessage: (messageId: number, body: string) => Promise<boolean>
  deleteMessage: (messageId: number) => Promise<boolean>
  toggleReaction: (messageId: number, emoji: string) => Promise<void>
  toggleBookmark: (messageId: number) => Promise<void>
  pinAnnouncement: (roomId: number, messageId: number | null) => Promise<void>
  toggleStar: (roomId: number) => Promise<void>
  toggleMute: (roomId: number) => Promise<void>
  leaveRoom: (roomId: number) => Promise<boolean>
  loadThread: (parentId: number) => Promise<void>
  ensureRoomLoaded: (roomId: number) => Promise<void> // 방 첫 페이지(이미 받았으면 아무것도 안 함)
  loadOlder: (roomId: number) => Promise<boolean> // 이전 페이지. 더 받을 게 없으면 false
  refreshMembers: () => Promise<void>
  // 방·메시지·할 일 응답을 상태에 바로 반영(다이얼로그·패널에서 API를 부른 뒤 사용)
  applyRoom: (room: MessengerRoom, open?: boolean) => void
  applyMessage: (message: MessengerMessage) => void
  applyTodo: (todo: MessengerTodo) => void
  openDm: (memberId: number) => Promise<void> // 1:1 대화가 있으면 열고, 없으면 만들어 연다
  notify: (text: string, tone?: "info" | "error") => void
  memberName: (id: number | null | undefined) => string
  roomName: (room: MessengerRoom) => string
  canManageRoom: (room: MessengerRoom) => boolean
}

export const MessengerContext = createContext<MessengerContextValue | null>(null)

export function useMessenger(): MessengerContextValue {
  const v = useContext(MessengerContext)
  if (!v) throw new Error("useMessenger는 <Messenger> 안에서만 쓸 수 있습니다.")
  return v
}
