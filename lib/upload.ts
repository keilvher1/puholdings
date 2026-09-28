import { put } from "@vercel/blob"
import { needsConversion, enqueueConversion } from "./convert"

// 파일 업로드 검증·저장 공용 로직 (admin/portal 업로드 라우트에서 공유).
// Vercel Blob(access: private) + /api/file 프록시 패턴을 따른다.

export const MAX_UPLOAD_SIZE = 20 * 1024 * 1024 // 20MB

// 이미지 + 흔한 문서 형식 MIME
const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-powerpoint", // .ppt
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "text/plain", // .txt
  "text/csv", // .csv
  "application/zip", "application/x-zip-compressed", // .zip
  // HWP MIME은 브라우저/OS마다 제각각:
  "application/x-hwp", "application/haansofthwp", "application/vnd.hancom.hwp", "application/hwp",
]

// HWP 등은 application/octet-stream이나 빈 타입으로 올 때가 많다.
// octet-stream은 catch-all이라 MIME으로 허용하지 않고, 확장자 allowlist로만 통과시킨다.
const ALLOWED_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".txt", ".csv", ".zip", ".hwp", ".hwpx",
]

// 잘못된 %-인코딩(예: '100%.jpg')이면 원문 그대로 둔다.
function decodeLoose(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

// Blob pathname 안전성 검사 — 프리픽스 비교(/api/file의 canAccess 등) 전에 반드시 거친다.
// @vercel/blob get()은 `https://{store}.blob.vercel-storage.com/${pathname}`을 그대로 만들어 fetch에 넘기고,
// fetch(WHATWG URL 파서)는 './', '%2e%2e', '.\t.' 같은 dot-segment를 풀어 버린다. 그러면
// './expenses/…'나 'news/%2e%2e/expenses/…'처럼 글자로는 다른 프리픽스인 경로가 실제로는 보호된 파일을 가리킨다.
// 그래서 글자 그대로의 '..'·'//'·'\'·선행 '/'뿐 아니라 아래를 모두 거부한다.
// - 제어문자(탭·개행은 URL 파서가 지워 '.\t.' → '..'가 된다)와 '?'·'#'(경로를 끊는다)
// - %-인코딩(두 번 인코딩 포함)으로 숨긴 '.'·'..' 세그먼트와 '/'·'\'
// - URL 파서로 해석한 경로가 원래 경로와 달라지는 모든 경우(보조 방어)
// 한글·공백·괄호가 든 정상 파일명('news/…-보고서 최종 (1).docx')은 통과한다.
export function isSafePathname(pathname: string): boolean {
  if (
    typeof pathname !== "string" ||
    pathname.length === 0 ||
    pathname.length > 1024 ||
    pathname.includes("..") ||
    pathname.includes("//") ||
    pathname.includes("\\") ||
    pathname.startsWith("/") ||
    CONTROL_CHARS.test(pathname) ||
    /[?#]/.test(pathname)
  ) {
    return false
  }
  for (const segment of pathname.split("/")) {
    let s = segment
    for (let i = 0; i < 3; i++) {
      const d = decodeLoose(s)
      if (d === "." || d === ".." || d.includes("/") || d.includes("\\") || CONTROL_CHARS.test(d) || /[?#]/.test(d)) {
        return false
      }
      if (d === s) break
      s = d
    }
  }
  let resolved: string
  try {
    resolved = new URL(pathname, "https://blob.invalid/").pathname.slice(1)
  } catch {
    return false
  }
  return decodeLoose(resolved) === decodeLoose(pathname)
}

// 저장 경로에 쓸 파일명 — isSafePathname을 통과하도록 경로를 끊거나 바꾸는 글자를 '_'로 바꾼다.
// ('#'·'?'·'%'가 든 이름은 예전에도 /api/file에서 열리지 않았다: Blob 주소에서 조각·쿼리로 잘리거나 %-해석된다.)
// 한글·공백·괄호 등은 그대로 둔다.
export function safeUploadName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f#?%\\/]/g, "_")
    .replace(/\.{2,}/g, ".")
    .trim()
  return cleaned || "file"
}

export function validateUploadFile(file: File): { ok: true } | { ok: false; error: string } {
  const ext = (file.name.match(/\.[^.]+$/)?.[0] || "").toLowerCase()
  const typeOk = !!file.type && ALLOWED_TYPES.includes(file.type)
  const extOk = ALLOWED_EXTENSIONS.includes(ext)
  if (!typeOk && !extOk) {
    return { ok: false, error: "지원하지 않는 파일 형식입니다" }
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return { ok: false, error: "파일 크기는 20MB 이하여야 합니다" }
  }
  return { ok: true }
}

// 검증 → Blob(private) 저장 → 변환 대상(hwp/doc 등)이면 PDF 변환 큐 등록.
// 변환 등록 실패는 업로드 성공에 영향을 주지 않는다.
export async function storeUpload(
  file: File,
  folder: string
): Promise<
  | { ok: true; pathname: string; preview_status?: "pending" | "failed" }
  | { ok: false; error: string }
> {
  const validation = validateUploadFile(file)
  if (!validation.ok) return validation

  const timestamp = Date.now()
  const filename = `${folder}/${timestamp}-${safeUploadName(file.name)}`
  const blob = await put(filename, file, { access: "private" })

  if (!needsConversion(file.name)) {
    return { ok: true, pathname: blob.pathname }
  }

  const result = await enqueueConversion(blob.pathname)
  return {
    ok: true,
    pathname: blob.pathname,
    preview_status: result.success ? "pending" : "failed",
  }
}
