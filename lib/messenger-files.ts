// 사내 메신저 첨부파일 공용 규칙 — 서버(업로드 라우트·메시지 저장)와 브라우저(입력창) 양쪽에서 import한다.
// 서버 전용 모듈(db·auth·@vercel/blob 서버 put)을 import하지 않는다.
//
// 저장 경로: messenger/{room_id}/{timestamp}-{safeName}  (Blob access: private, /api/file 프록시로만 열람)
// 업로드 방식(POST /api/messenger/upload):
//   1) 기본 — Blob 클라이언트 업로드(@vercel/blob/client upload + handleUploadUrl).
//      Vercel 함수 요청 본문 4.5MB 제한을 피해 20MB까지 브라우저 → Blob으로 바로 올린다.
//      서버는 토큰만 발급하며, 발급 전에 세션·방 참여·경로·크기·형식을 검사한다.
//   2) 대체 — multipart/form-data(room_id, file) 서버 업로드. 4MB까지. 큰 사진은 줄여서 보낸다.
// 업로드 결과(MessengerAttachment)는 메시지 전송(POST rooms/[id]/messages)의 attachments로 넘긴다.
// 브라우저 쪽 업로드 함수는 components/messenger/api.ts uploadFile()이 이 규칙대로 구현한다.

import type { MessengerAttachment } from "./messenger-types"

export const MESSENGER_UPLOAD_URL = "/api/messenger/upload"
// 서버 업로드(대체 경로) 한도 — 요청 본문 4.5MB 제한보다 조금 작게
export const MESSENGER_SERVER_UPLOAD_MAX_BYTES = 4 * 1024 * 1024

// 허용 형식. /api/file이 저장된 Content-Type 그대로 같은 출처에서 내려주므로
// HTML·SVG·JS처럼 브라우저가 실행할 수 있는 형식은 절대 넣지 않는다.
export const MESSENGER_ALLOWED_TYPES = [
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv",
  "application/zip", "application/x-zip-compressed",
  "application/x-hwp", "application/haansofthwp", "application/vnd.hancom.hwp", "application/hwp",
  "application/vnd.hancom.hwpx", "application/haansofthwpx", "application/x-hwpx", "application/hwp+zip",
  "application/csv", "text/x-csv",
  "video/mp4", "video/quicktime", "audio/mpeg", "audio/mp4", "audio/x-m4a",
  // hwp 등 브라우저가 형식을 모르는 파일. 브라우저는 실행하지 않고 내려받기만 한다.
  "application/octet-stream",
]

export const MESSENGER_ALLOWED_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".txt", ".csv", ".zip", ".hwp", ".hwpx",
  ".mp4", ".mov", ".mp3", ".m4a",
]

const EXT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
  ".heic": "image/heic", ".heif": "image/heif",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain", ".csv": "text/csv", ".zip": "application/zip",
  ".hwp": "application/x-hwp", ".hwpx": "application/vnd.hancom.hwpx",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
}

export function fileExtension(name: string): string {
  return (name.match(/\.[^./\\]+$/)?.[0] || "").toLowerCase()
}

// 확장자로 저장할 Content-Type을 정한다(브라우저가 준 type은 믿지 않는다). 모르는 확장자는 null.
export function messengerContentType(name: string): string | null {
  return EXT_TYPES[fileExtension(name)] ?? null
}

export function isAllowedMessengerFile(name: string): boolean {
  return MESSENGER_ALLOWED_EXTENSIONS.includes(fileExtension(name))
}

// 저장 경로용 파일명 — lib/upload.ts의 safeUploadName과 같은 규칙(경로를 끊거나 바꾸는 글자 → '_').
// 서버는 받은 경로의 파일명 부분이 이 함수의 결과와 같은지로 검사한다.
export function messengerSafeName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f#?%\\/]/g, "_")
    .replace(/\.{2,}/g, ".")
    .trim()
    .slice(-150) // 확장자는 끝에 있으므로 뒤쪽을 남긴다
  return cleaned || "file"
}

export function buildMessengerPathname(roomId: number, name: string, now = Date.now()): string {
  return `messenger/${roomId}/${now}-${messengerSafeName(name)}`
}

// 'messenger/{room_id}/{timestamp}-{name}' 형식이면 { roomId, name }. 아니면 null.
// (경로 이동 등 안전성 검사는 서버에서 lib/upload.ts isSafePathname을 따로 거친다)
export function parseMessengerPathname(pathname: string): { roomId: number; name: string } | null {
  if (typeof pathname !== "string") return null
  const m = /^messenger\/([1-9]\d{0,9})\/(\d{10,16})-([^/]+)$/.exec(pathname)
  if (!m) return null
  const roomId = Number(m[1])
  if (!Number.isSafeInteger(roomId)) return null
  return { roomId, name: m[3] }
}

export function isImageAttachment(a: Pick<MessengerAttachment, "type" | "name">): boolean {
  return /^image\/(jpeg|png|gif|webp)$/.test(a.type) || /\.(jpe?g|png|gif|webp)$/i.test(a.name)
}

// /api/file 주소. download=true면 원래 파일명으로 내려받는다.
export function messengerFileUrl(a: Pick<MessengerAttachment, "pathname" | "name">, download = false): string {
  const q = new URLSearchParams({ pathname: a.pathname })
  if (download) {
    q.set("download", "1")
    q.set("name", a.name)
  }
  return `/api/file?${q.toString()}`
}
