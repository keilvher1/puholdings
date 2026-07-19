// 파일 업로드 검증 공용 로직 (admin/portal 업로드 라우트에서 공유).
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

// Blob pathname 안전성 검사 — 경로 이동(..), 이중 슬래시, 선행 슬래시, 역슬래시를 거부한다.
// fetch/undici가 URL 정규화 시 dot-segment를 해석해 프리픽스 검사를 우회할 수 있기 때문에
// 프리픽스 비교 전에 반드시 이 검사를 거쳐야 한다.
export function isSafePathname(pathname: string): boolean {
  return (
    pathname.length > 0 &&
    !pathname.includes("..") &&
    !pathname.includes("//") &&
    !pathname.includes("\\") &&
    !pathname.startsWith("/")
  )
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
