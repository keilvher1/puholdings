// 사내 메신저 클라이언트 fetch 래퍼. 화면 컴포넌트는 fetch를 직접 쓰지 않고 이 파일을 거친다.
// 모든 경로는 /api/messenger/* 이고 오류는 { success:false, error } 형식이다 → MessengerApiError로 던진다.
//
// 응답 모양(서버 담당 A·B와 맞출 것): 각 함수 위 주석의 "응답" 참고. 서버가 다른 키를 쓰면 여기만 고친다.

import type {
  BootstrapResponse,
  MessengerAttachment,
  MessengerMember,
  MessengerMessage,
  MessengerPoll,
  MessengerRoom,
  MessengerTodo,
  SyncResponse,
} from "@/lib/messenger-types"
import { MESSENGER_MAX_FILE_BYTES } from "@/lib/messenger-types"
import {
  MESSENGER_SERVER_UPLOAD_MAX_BYTES,
  MESSENGER_UPLOAD_URL,
  buildMessengerPathname,
  isAllowedMessengerFile,
  messengerContentType,
} from "@/lib/messenger-files"

const BASE = "/api/messenger"

export class MessengerApiError extends Error {
  status: number
  data: unknown
  constructor(status: number, message: string, data?: unknown) {
    super(message)
    this.name = "MessengerApiError"
    this.status = status
    this.data = data
  }
}

type Json = Record<string, unknown>

async function request<T = Json>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}/${path}`, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e
    throw new MessengerApiError(0, "네트워크에 연결할 수 없습니다.")
  }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  const obj = (data ?? {}) as Json
  if (!res.ok || obj.success === false) {
    const msg =
      typeof obj.error === "string" && obj.error
        ? obj.error
        : res.status === 401
          ? "로그인이 필요합니다."
          : res.status === 404
            ? "찾을 수 없거나 권한이 없습니다."
            : `요청을 처리하지 못했습니다(${res.status}).`
    throw new MessengerApiError(res.status, msg, data)
  }
  return obj as T
}

// D(화면 기능) 담당 컴포넌트도 쓸 수 있는 범용 호출. path는 'rooms/3/files'처럼 /api/messenger/ 뒤만 넘긴다.
export const messengerApi = {
  get: <T = Json>(path: string, signal?: AbortSignal) => request<T>("GET", path, undefined, signal),
  post: <T = Json>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T = Json>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T = Json>(path: string) => request<T>("DELETE", path),
}

function qs(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ""
}

// ── 시작·동기화 ──────────────────────────────────────────────────────────────

export function fetchBootstrap(): Promise<BootstrapResponse> {
  return request<BootstrapResponse>("GET", "bootstrap")
}

export function fetchSync(cursor: number, signal?: AbortSignal): Promise<SyncResponse> {
  return request<SyncResponse>("GET", `sync${qs({ cursor })}`, undefined, signal)
}

// ── 구성원 ───────────────────────────────────────────────────────────────────

// 응답: { success, members: MessengerMember[] }
export async function fetchMembers(): Promise<MessengerMember[]> {
  const r = await request<{ members?: MessengerMember[] }>("GET", "members")
  return r.members ?? []
}

export interface MePatch {
  display_name?: string
  title?: string
  status_text?: string
  away?: boolean
}

// 응답: { success, member: MessengerMember } (없으면 null)
export async function patchMe(patch: MePatch): Promise<MessengerMember | null> {
  const r = await request<{ member?: MessengerMember; me?: MessengerMember }>("PATCH", "me", patch)
  return r.member ?? r.me ?? null
}

// ── 방 ───────────────────────────────────────────────────────────────────────

export type CreateRoomInput =
  | { kind: "topic"; name: string; description: string; is_private: boolean; member_ids: number[] }
  | { kind: "dm"; member_ids: number[] }

// 응답: { success, room: MessengerRoom } — DM이 이미 있으면 기존 방
export async function createRoom(input: CreateRoomInput): Promise<MessengerRoom> {
  const r = await request<{ room: MessengerRoom }>("POST", "rooms", input)
  return r.room
}

// 응답: { success, rooms: MessengerRoom[] } — 참여하지 않은 공개 토픽(정회원만)
export async function browseRooms(): Promise<MessengerRoom[]> {
  const r = await request<{ rooms?: MessengerRoom[] }>("GET", "rooms/browse")
  return r.rooms ?? []
}

// 응답: { success, room }
export async function joinRoom(roomId: number): Promise<MessengerRoom | null> {
  const r = await request<{ room?: MessengerRoom }>("POST", `rooms/${roomId}/join`)
  return r.room ?? null
}

export interface RoomPatch {
  name?: string
  description?: string
  is_private?: boolean
  is_archived?: boolean
  announcement_message_id?: number | null
}

// 응답: { success, room }
export async function patchRoom(roomId: number, patch: RoomPatch): Promise<MessengerRoom | null> {
  const r = await request<{ room?: MessengerRoom }>("PATCH", `rooms/${roomId}`, patch)
  return r.room ?? null
}

// 응답: { success, room }
export async function addRoomMembers(roomId: number, memberIds: number[]): Promise<MessengerRoom | null> {
  const r = await request<{ room?: MessengerRoom }>("POST", `rooms/${roomId}/members`, { member_ids: memberIds })
  return r.room ?? null
}

// 본인 id면 나가기. 응답: { success }
export async function removeRoomMember(roomId: number, memberId: number): Promise<void> {
  await request("DELETE", `rooms/${roomId}/members/${memberId}`)
}

export interface RoomMePatch {
  starred?: boolean
  muted?: boolean
  last_read_message_id?: number
}

export async function patchRoomMe(roomId: number, patch: RoomMePatch): Promise<void> {
  await request("PATCH", `rooms/${roomId}/me`, patch)
}

// ── 메시지 ───────────────────────────────────────────────────────────────────

export interface MessagePage {
  messages: MessengerMessage[] // 오래된 → 최근
  has_more: boolean // 더 오래된 메시지가 있는지
}

// 응답: { success, messages: MessengerMessage[], has_more?: boolean }
// has_more가 없으면 받은 개수 === limit 로 추정한다.
export async function fetchMessages(
  roomId: number,
  opts: { before?: number | null; limit?: number } = {},
  signal?: AbortSignal
): Promise<MessagePage> {
  const limit = opts.limit ?? 50
  const r = await request<{ messages?: MessengerMessage[]; has_more?: boolean }>(
    "GET",
    `rooms/${roomId}/messages${qs({ before: opts.before ?? null, limit })}`,
    undefined,
    signal
  )
  const messages = [...(r.messages ?? [])].sort((a, b) => a.id - b.id)
  return { messages, has_more: typeof r.has_more === "boolean" ? r.has_more : messages.length >= limit }
}

export interface SendMessageInput {
  body: string
  attachments?: MessengerAttachment[]
  parent_id?: number | null
  mentions?: number[]
}

// 응답: { success, message }
export async function sendMessage(roomId: number, input: SendMessageInput): Promise<MessengerMessage> {
  const r = await request<{ message: MessengerMessage }>("POST", `rooms/${roomId}/messages`, input)
  return r.message
}

// 응답: { success, message }
export async function editMessage(messageId: number, body: string): Promise<MessengerMessage | null> {
  const r = await request<{ message?: MessengerMessage }>("PATCH", `messages/${messageId}`, { body })
  return r.message ?? null
}

export async function deleteMessage(messageId: number): Promise<void> {
  await request("DELETE", `messages/${messageId}`)
}

// 응답: { success, message(원본) | parent, replies: MessengerMessage[] }
export async function fetchThread(messageId: number): Promise<{ parent: MessengerMessage | null; replies: MessengerMessage[] }> {
  const r = await request<{ message?: MessengerMessage; parent?: MessengerMessage; replies?: MessengerMessage[] }>(
    "GET",
    `messages/${messageId}/thread`
  )
  return { parent: r.parent ?? r.message ?? null, replies: [...(r.replies ?? [])].sort((a, b) => a.id - b.id) }
}

// 응답: { success, message? } — 메시지를 돌려주면 바로 반영하고, 없으면 sync를 기다린다.
export async function toggleReaction(messageId: number, emoji: string): Promise<MessengerMessage | null> {
  const r = await request<{ message?: MessengerMessage }>("POST", `messages/${messageId}/reactions`, { emoji })
  return r.message ?? null
}

// 응답: { success, bookmarked: boolean }
export async function toggleBookmark(messageId: number): Promise<boolean | null> {
  const r = await request<{ bookmarked?: boolean }>("POST", `messages/${messageId}/bookmark`)
  return typeof r.bookmarked === "boolean" ? r.bookmarked : null
}

// 응답: { success, message(대상 방에 새로 생긴 메시지) }
export async function shareMessage(messageId: number, roomId: number, comment?: string): Promise<MessengerMessage | null> {
  const r = await request<{ message?: MessengerMessage }>("POST", `messages/${messageId}/share`, {
    room_id: roomId,
    comment: comment || undefined,
  })
  return r.message ?? null
}

// ── 투표·할 일 ───────────────────────────────────────────────────────────────

// 응답: { success, poll? , message? }
export async function votePoll(pollId: number, options: number[]): Promise<{ poll: MessengerPoll | null; message: MessengerMessage | null }> {
  const r = await request<{ poll?: MessengerPoll; message?: MessengerMessage }>("POST", `polls/${pollId}/vote`, { options })
  return { poll: r.poll ?? null, message: r.message ?? null }
}

// 응답: { success, todo }
export async function patchTodo(
  todoId: number,
  patch: { title?: string; assignee_ids?: number[]; due_date?: string | null; done?: boolean }
): Promise<MessengerTodo | null> {
  const r = await request<{ todo?: MessengerTodo }>("PATCH", `todos/${todoId}`, patch)
  return r.todo ?? null
}

// ── 파일 ─────────────────────────────────────────────────────────────────────

export function fileUrl(pathname: string, opts: { download?: boolean; name?: string } = {}): string {
  const sp = new URLSearchParams({ pathname })
  if (opts.download) sp.set("download", "1")
  if (opts.name) sp.set("name", opts.name)
  return `/api/file?${sp.toString()}`
}

async function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return null
  try {
    const bmp = await createImageBitmap(file)
    const size = { width: bmp.width, height: bmp.height }
    bmp.close()
    return size
  } catch {
    return null
  }
}

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

// 서버 업로드(대체 경로)용: 4MB를 넘는 사진을 긴 변 2560px JPEG로 줄인다. 줄일 수 없으면 null.
async function shrinkImage(file: File): Promise<File | null> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== "function") return null
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const g = canvas.getContext("2d")
    if (!g) return null
    g.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    for (const q of [0.85, 0.7, 0.55]) {
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", q))
      if (blob && blob.size <= MESSENGER_SERVER_UPLOAD_MAX_BYTES) {
        const name = file.name.replace(/\.[^.]+$/, "") + ".jpg"
        return new File([blob], name, { type: "image/jpeg" })
      }
    }
    return null
  } catch {
    return null
  }
}

// 파일 1개 업로드 → MessengerAttachment. 경로·형식 규칙은 lib/messenger-files.ts(담당 B)를 따른다.
// 1순위: Vercel Blob 클라이언트 업로드(@vercel/blob/client upload, access:'private', 20MB까지)
//   handleUploadUrl = /api/messenger/upload, clientPayload = JSON {room_id, size}
//   pathname = messenger/{room_id}/{timestamp}-{safeName} (서버 onBeforeGenerateToken에서 검사)
// 2순위(클라이언트 업로드 실패 시): multipart POST /api/messenger/upload (room_id, file) — 4MB까지, 큰 사진은 줄여서
//   응답: { success, attachment: MessengerAttachment }
export async function uploadFile(
  roomId: number,
  file: File,
  opts: { onProgress?: (p: UploadProgress) => void; signal?: AbortSignal } = {}
): Promise<MessengerAttachment> {
  if (!isAllowedMessengerFile(file.name)) {
    throw new MessengerApiError(400, `${file.name}: 지원하지 않는 파일 형식입니다.`)
  }
  if (file.size <= 0) throw new MessengerApiError(400, `${file.name}: 빈 파일은 올릴 수 없습니다.`)
  if (file.size > MESSENGER_MAX_FILE_BYTES) {
    throw new MessengerApiError(413, `파일이 너무 큽니다(최대 ${Math.round(MESSENGER_MAX_FILE_BYTES / 1024 / 1024)}MB).`)
  }
  const dims = await imageSize(file)
  const type = messengerContentType(file.name) || file.type || "application/octet-stream"
  const pathname = buildMessengerPathname(roomId, file.name)

  let clientError: unknown = null
  try {
    const { upload } = await import("@vercel/blob/client")
    const result = await upload(pathname, file, {
      access: "private",
      handleUploadUrl: MESSENGER_UPLOAD_URL,
      clientPayload: JSON.stringify({ room_id: roomId, size: file.size }),
      contentType: type,
      multipart: file.size > 8 * 1024 * 1024,
      abortSignal: opts.signal,
      onUploadProgress: opts.onProgress,
    })
    return {
      name: file.name,
      pathname: result.pathname,
      size: file.size,
      type,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError" || opts.signal?.aborted) throw e
    clientError = e
  }

  let sendFile: File = file
  if (file.size > MESSENGER_SERVER_UPLOAD_MAX_BYTES) {
    const small = await shrinkImage(file)
    if (!small) {
      // 클라이언트 업로드(20MB)가 막혀 서버 업로드(4MB)로 넘어왔는데 줄일 수 없는 파일.
      // Blob SDK의 영문 오류("Failed to retrieve the client token" 등)는 그대로 보여주지 않는다.
      if (clientError) console.warn("messenger client upload failed:", clientError)
      throw new MessengerApiError(
        413,
        `${file.name}: 4MB가 넘는 파일을 올리지 못했습니다. 잠시 후 다시 시도하거나 파일 크기를 줄여 주세요.`
      )
    }
    sendFile = small
  }

  const form = new FormData()
  form.set("room_id", String(roomId))
  form.set("file", sendFile)
  let res: Response
  try {
    res = await fetch(MESSENGER_UPLOAD_URL, { method: "POST", body: form, credentials: "same-origin", signal: opts.signal })
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e
    throw new MessengerApiError(0, "네트워크에 연결할 수 없습니다.")
  }
  const data = (await res.json().catch(() => ({}))) as Json
  if (!res.ok || data.success === false) {
    throw new MessengerApiError(res.status, typeof data.error === "string" ? data.error : "파일을 올리지 못했습니다.", data)
  }
  opts.onProgress?.({ loaded: sendFile.size, total: sendFile.size, percentage: 100 })
  const att = (data.attachment ?? data) as Partial<MessengerAttachment>
  if (!att.pathname) throw new MessengerApiError(500, "업로드 응답에 파일 경로가 없습니다.", data)
  const sentDims = sendFile === file ? dims : await imageSize(sendFile)
  return {
    name: att.name ?? sendFile.name,
    pathname: att.pathname,
    size: att.size ?? sendFile.size,
    type: att.type ?? type,
    width: att.width ?? sentDims?.width ?? null,
    height: att.height ?? sentDims?.height ?? null,
  }
}
