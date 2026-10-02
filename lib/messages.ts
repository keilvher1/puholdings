// 자주 쓰는 화면 문구와 서버 오류 → 사용자 문구 변환(계획서 2.2·2.5). 해요체, 3요소(무슨 일·왜·어떻게).
// 순수 모듈(서버·클라이언트 공용). 문체·용어 결정이 바뀌면 이 파일·lib/glossary.ts·lib/status.ts만 고치면 된다.
//
// 사용 예:
//   import { MSG, friendlyError } from "@/lib/messages"
//   const res = await fetch(...)
//   if (!res.ok) setError(friendlyError(res.status, body?.error, MSG.saveFailed))
//   // 네트워크 자체가 실패하면 status 0:
//   catch { setError(friendlyError(0, null, MSG.loadFailed)) }
//
// 주의: API가 돌려준 개발자 문구("period(YYYY-MM)가 필요합니다", "id가 필요합니다", 환경변수 이름)는 화면에 그대로 내보내지 않는다.
//       사용자용으로 쓰인 한국어 문구(예: 409 "이미 발행된 청구서예요")만 그대로 쓴다.

export const MSG = {
  saveFailed: "저장하지 못했어요.",
  loadFailed: "불러오지 못했어요.",
  deleteFailed: "삭제하지 못했어요.",
  network: "인터넷 연결을 확인하고 다시 눌러 주세요.",
  retry: "다시 시도",
  invalidInput: "입력값을 다시 확인해 주세요.",
  sessionExpired: "로그인이 끝났어요. 다시 로그인해 주세요.",
  forbidden: "이 작업을 할 권한이 없어요.",
  notFound: "찾을 수 없어요. 이미 지워졌을 수 있어요.",
  conflict: "지금 상태에서는 처리할 수 없어요. 화면을 새로 고친 뒤 다시 확인해 주세요.",
  tooLarge: "파일이 너무 커서 보낼 수 없어요. 더 작은 파일로 다시 올려 주세요.",
  timeout: "처리 시간이 너무 오래 걸려 멈췄어요. 잠시 뒤 다시 눌러 주세요.",
  busySave: "저장 중…",
  busyLoad: "불러오는 중…",
  busy: "처리 중…",
  close: "닫기",
  saved: "저장했어요",
  deleted: "삭제했어요",
  copied: "복사했어요",
  copyFallback: "길게 눌러 복사해 주세요",
  noTodo: "오늘 처리할 일이 없어요",
  contactSupport: "계속 안 되면 담당자에게 알려 주세요.",
  mailOff: "메일 발송이 설정되지 않아 메일은 나가지 않아요.",
} as const

// 개발자용 문구로 보이는 신호: 환경변수 이름, 영문 식별자(괄호 형식 포함), SQL·예외 이름, 한국어가 없음
const DEV_HINTS = [
  /[A-Z][A-Z0-9]*_[A-Z0-9_]+/, // OPENAI_API_KEY, RESEND_API_KEY
  /\b[a-z]+_[a-z_]+\b/, // tenant_id, due_date
  /\b(?:id|period|billMonth|YYYY|null|undefined|NaN|JSON|SQL|relation|column|constraint|Error|TypeError|fetch)\b/,
  /[a-z]+\([A-Z-]+\)/i, // period(YYYY-MM)
]

/** 서버 문구를 사용자에게 그대로 보여도 되는가(한국어 문장이고 개발 용어가 없음) */
export function isUserFacingMessage(message: string | null | undefined): message is string {
  if (typeof message !== "string") return false
  const m = message.trim()
  if (!m || m.length > 200) return false
  if (!/[가-힣]/.test(m)) return false
  return !DEV_HINTS.some((re) => re.test(m))
}

export interface FriendlyErrorOptions {
  /** 연락처가 설정돼 있을 때만 true(getSupportContact() !== null). 기본 false — "담당자에게 알려 주세요"를 붙이지 않는다 */
  supportContact?: boolean
}

/**
 * HTTP 상태 + 서버 문구 → 화면 문구.
 *   0(네트워크)·5xx·504 → "{fallback} 인터넷 연결을 확인하고 다시 눌러 주세요."(+ 연락처가 있으면 "계속 안 되면 담당자에게 알려 주세요.")
 *   400·409·422 → 사용자용 서버 문구가 있으면 그것, 없으면 "입력값을 다시 확인해 주세요."·지금 상태 안내
 *   401 → "로그인이 끝났어요. 다시 로그인해 주세요."  403 → 권한 없음  404 → "찾을 수 없어요. 이미 지워졌을 수 있어요."
 *   413 → 파일 크기 안내
 * fallback은 무엇을 못 했는지 한 문장(기본 MSG.saveFailed "저장하지 못했어요.").
 */
export function friendlyError(
  status: number,
  serverMessage?: string | null,
  fallback: string = MSG.saveFailed,
  options: FriendlyErrorOptions = {},
): string {
  const head = fallback.trim().replace(/([^.?!])$/, "$1.")
  const tail = options.supportContact ? ` ${MSG.contactSupport}` : ""
  if (status === 401) return MSG.sessionExpired
  if (status === 403) return MSG.forbidden
  if (status === 404) return isUserFacingMessage(serverMessage) ? serverMessage : MSG.notFound
  if (status === 413) return MSG.tooLarge
  if (status === 504 || status === 524) return `${head} ${MSG.timeout}${tail}`
  if (status === 400 || status === 422) return isUserFacingMessage(serverMessage) ? serverMessage : MSG.invalidInput
  if (status === 409) return isUserFacingMessage(serverMessage) ? serverMessage : MSG.conflict
  if (status === 0 || status >= 500) return `${head} ${MSG.network}${tail}`
  return isUserFacingMessage(serverMessage) ? serverMessage : `${head} ${MSG.network}${tail}`
}
