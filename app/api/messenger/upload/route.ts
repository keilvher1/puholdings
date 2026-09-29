import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { fail, requireMessenger, requireRoomMember } from "@/lib/messenger"
import { checkUploadPathname, checkUploadSize, toId } from "@/lib/messenger-extras"
import {
  MESSENGER_ALLOWED_TYPES,
  MESSENGER_SERVER_UPLOAD_MAX_BYTES,
  buildMessengerPathname,
  isAllowedMessengerFile,
  messengerContentType,
} from "@/lib/messenger-files"
import { MESSENGER_MAX_FILE_BYTES, type MessengerAttachment } from "@/lib/messenger-types"

// POST /api/messenger/upload — 메신저 첨부 업로드(Blob private, messenger/{room_id}/…)
// 1) application/json: @vercel/blob/client upload()의 토큰 발급 요청(handleUpload).
//    토큰 발급 전에 세션·방 참여·보관 여부·경로·형식·크기를 검사한다. 파일은 브라우저 → Blob으로 바로 간다(20MB).
//    업로드 완료 콜백(onUploadCompleted)은 쓰지 않는다 — 첨부 정보는 메시지 전송 때 함께 저장된다.
// 2) multipart/form-data { room_id, file }: 서버 업로드(4MB). 로컬처럼 클라이언트 토큰을 못 쓸 때의 대체 경로.
// 브라우저 쪽 사용법은 lib/messenger-files.ts uploadMessengerFile() 참고.

export async function POST(request: Request) {
  const auth = await requireMessenger(request)
  if (auth.response) return auth.response
  const { sql, me: member } = auth

  const contentType = request.headers.get("content-type") || ""

  // ── 1) 클라이언트 업로드 토큰 발급 ──
  if (contentType.includes("application/json")) {
    let body: HandleUploadBody
    try {
      body = (await request.json()) as HandleUploadBody
    } catch {
      return fail("요청 형식이 올바르지 않습니다", 400)
    }
    // 완료 콜백은 등록하지 않으므로 토큰 발급 요청만 받는다
    if (!body || body.type !== "blob.generate-client-token") return fail("요청 형식이 올바르지 않습니다", 400)
    if (!process.env.BLOB_READ_WRITE_TOKEN) return fail("파일 저장소가 설정되지 않았습니다", 503)

    let refusal: { error: string; status: number } | null = null
    try {
      const result = await handleUpload({
        request,
        body,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          let payload: { room_id?: unknown; size?: unknown } = {}
          try {
            payload = clientPayload ? JSON.parse(clientPayload) : {}
          } catch {
            payload = {}
          }
          const roomId = toId(payload.room_id)
          if (!roomId) {
            refusal = { error: "대화방을 지정해 주세요", status: 400 }
            throw new Error(refusal.error)
          }
          const access = await requireRoomMember(sql, roomId, member.id)
          if (!access) {
            refusal = { error: "대화방을 찾을 수 없습니다", status: 404 }
            throw new Error(refusal.error)
          }
          if (access.is_archived) {
            refusal = { error: "보관된 토픽에는 파일을 올릴 수 없습니다", status: 409 }
            throw new Error(refusal.error)
          }
          const path = checkUploadPathname(pathname, roomId)
          if (!path.ok) {
            refusal = { error: path.error, status: 400 }
            throw new Error(refusal.error)
          }
          if (typeof payload.size === "number") {
            const sizeError = checkUploadSize(payload.size)
            if (sizeError) {
              refusal = { error: sizeError, status: 413 }
              throw new Error(refusal.error)
            }
          }
          return {
            // 크기·형식은 Blob 서버가 토큰 기준으로 다시 강제한다(클라이언트가 속여도 막힌다)
            maximumSizeInBytes: MESSENGER_MAX_FILE_BYTES,
            allowedContentTypes: MESSENGER_ALLOWED_TYPES,
            addRandomSuffix: false,
            allowOverwrite: false,
            validUntil: Date.now() + 10 * 60 * 1000,
            tokenPayload: JSON.stringify({ member_id: member.id, room_id: roomId }),
          }
        },
      })
      return NextResponse.json(result)
    } catch (error) {
      if (refusal) {
        const r = refusal as { error: string; status: number }
        return fail(r.error, r.status)
      }
      console.error("[messenger] upload token error:", error)
      return fail("업로드를 준비하지 못했습니다", 500)
    }
  }

  // ── 2) 서버 업로드(대체 경로) ──
  if (!contentType.includes("multipart/form-data")) return fail("요청 형식이 올바르지 않습니다", 400)
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail("파일을 읽지 못했습니다. 4MB 이하 파일만 올릴 수 있습니다", 413)
  }
  const roomId = toId(form.get("room_id"))
  const file = form.get("file")
  if (!roomId) return fail("대화방을 지정해 주세요", 400)
  if (!(file instanceof File)) return fail("파일이 없습니다", 400)

  let access
  try {
    access = await requireRoomMember(sql, roomId, member.id)
  } catch (error) {
    console.error("[messenger] upload room check error:", error)
    return fail("대화방을 확인하지 못했습니다", 500)
  }
  if (!access) return fail("대화방을 찾을 수 없습니다", 404)
  if (access.is_archived) return fail("보관된 토픽에는 파일을 올릴 수 없습니다", 409)
  if (!isAllowedMessengerFile(file.name)) return fail("지원하지 않는 파일 형식입니다", 400)
  const sizeError = checkUploadSize(file.size)
  if (sizeError) return fail(sizeError, 413)
  if (file.size > MESSENGER_SERVER_UPLOAD_MAX_BYTES) return fail("이 경로로는 4MB 이하 파일만 올릴 수 있습니다", 413)

  const type = messengerContentType(file.name) || "application/octet-stream"
  const pathname = buildMessengerPathname(roomId, file.name)
  const path = checkUploadPathname(pathname, roomId)
  if (!path.ok) return fail(path.error, 400)

  try {
    const blob = await put(pathname, file, { access: "private", contentType: type })
    const attachment: MessengerAttachment = {
      name: file.name.slice(0, 200),
      pathname: blob.pathname,
      size: file.size,
      type,
      width: null,
      height: null,
    }
    return NextResponse.json({ success: true, attachment })
  } catch (error) {
    console.error("[messenger] server upload error:", error)
    return fail("파일을 저장하지 못했습니다", 500)
  }
}
