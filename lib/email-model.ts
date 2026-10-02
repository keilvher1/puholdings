// 메일 화면 공용 규칙(순수 모듈, 서버 API·클라이언트 화면·테스트 공용) — 계획서 3.4·4.1.6.
//   - 종류(template_code) → 한글 이름·"언제 나가나요"
//   - 설정 안 됨 실패(메일 env가 없어 보내지 않은 기록) 판정
//   - 오류 원문 → 쉬운 말
//   - 같은 내용 다시 보내기 가능 여부(바뀐 청구서·납부 완료 청구서·계정 안내·설정 안 됨·메일 꺼짐이면 끔)
//   - 일반 글 본문 → 단락 HTML(이스케이프)

// lib/admin-todo의 MAIL_NOT_CONFIGURED_ERRORS와 같은 값(그 파일은 서버 전용 의존이 있어 클라이언트 번들에 넣지 않으려고 복사.
// tests/emails-get.test.ts가 두 값이 같은지 확인한다)
export const NOT_CONFIGURED_ERRORS = ["RESEND_API_KEY not set", "MAIL_FROM not set"] as const

/** 3.4 /admin/emails?type=<template_code> 화면 이름 매핑(email_logs·lib/mail.ts 호출부에서 확인한 코드 전부) */
export const MAIL_TYPES: Record<string, { label: string; when: string }> = {
  bill_issued: { label: "청구서 발행", when: "청구서를 발행할 때" },
  bill_reminder: { label: "납부 안내", when: "매일 자동 점검이 켜져 있을 때, 납부 기한 3일 전과 기한이 지났을 때" },
  tenant_welcome: { label: "포털 계정 안내", when: "포털 계정을 발급하거나 비밀번호를 초기화할 때" },
  inquiry_received: { label: "문의 알림", when: "홈페이지에서 문의가 들어왔을 때(관리자에게)" },
  program_notice: { label: "프로그램 공지", when: "프로그램 모집을 시작할 때" },
  application_result: { label: "선정 결과", when: "프로그램 신청을 선정·미선정으로 정할 때" },
  submission_feedback: { label: "제출물 의견", when: "제출물을 승인·반려·보완 요청할 때" },
  submission_reminder: { label: "제출 독촉", when: "매일 자동 점검이 켜져 있을 때, 제출 마감 3일 전과 1일 전에" },
  manual: { label: "직접 작성", when: "메일 화면에서 직접 보낼 때" },
}

export function mailTypeLabel(code: string | null | undefined): string {
  if (!code) return "직접 작성"
  return MAIL_TYPES[code]?.label ?? "기타"
}

/** 메일 발송 env가 없어 보내지 않은 실패인가(운영 문구 'RESEND_API_KEY not set'·'MAIL_FROM not set', 같은 뜻의 변형 포함) */
export function isNotConfiguredError(error: string | null | undefined): boolean {
  if (!error) return false
  const e = error.trim()
  if ((NOT_CONFIGURED_ERRORS as readonly string[]).includes(e)) return true
  return /^(RESEND_API_KEY|MAIL_FROM)\b/.test(e)
}

/** SQL WHERE 조각용: 설정 안 됨 실패를 찾는 LIKE 패턴(isNotConfiguredError와 같은 범위) */
export const NOT_CONFIGURED_SQL_PATTERNS = ["RESEND_API_KEY%", "MAIL_FROM%"] as const

/** 오류 원문 → 화면 문구(3요소 중 '무슨 일·어떻게'). 원문은 상세 시트에만 */
export function friendlyMailError(error: string | null | undefined): string {
  if (!error) return "보내지 못했어요"
  const e = error.toLowerCase()
  if (isNotConfiguredError(error)) return "메일 발송 설정이 없어 보내지 않았어요"
  if (e.includes("템플릿을 찾을 수 없") || e.includes("template")) return "메일 양식을 찾지 못해 보내지 않았어요 — 메일 템플릿을 확인해 주세요"
  if (e.includes("`to`") || e.includes("주소 형식")) return "받는 주소 형식이 맞지 않아요 — 기업의 이메일 주소를 확인해 주세요"
  if (e.includes("mailbox full") || e.includes("거부") || e.includes("reject") || e.includes("bounce")) return "받는 서버가 거부했어요 — 주소를 확인해 주세요"
  if (e.includes("rate") || e.includes("too many")) return "한꺼번에 너무 많이 보내 잠시 막혔어요 — 잠시 뒤 다시 보내 주세요"
  if (e.includes("fetch") || e.includes("network") || e.includes("timeout") || e.includes("econn")) return "메일 서버에 연결하지 못했어요 — 잠시 뒤 다시 보내 주세요"
  return "보내지 못했어요 — 오류 내용은 자세히 보기에서 확인해 주세요"
}

export interface MailLogRow {
  id: number
  to_email: string
  tenant_id: number | null
  tenant_name: string | null
  template_code: string | null
  subject: string | null
  status: "queued" | "sent" | "failed"
  error: string | null
  related_type: string | null
  related_id: number | null
  sent_at: string | null
  created_at: string
  /** since 조회에서만: 관련 청구서 상태·마지막 수정 시각 */
  bill_status?: string | null
  bill_updated_at?: string | null
  bill_period?: string | null
}

/** 화면 상태(사전 lib/status.ts email 도메인): 설정 안 됨 실패는 "보내지 않음"(not_configured) */
export function mailRowStatus(row: Pick<MailLogRow, "status" | "error">): "sent" | "failed" | "queued" | "not_configured" {
  if (row.status === "failed" && isNotConfiguredError(row.error)) return "not_configured"
  return row.status
}

/** 같은 내용으로 다시 보내기 가능 여부와 끈 이유 */
export function resendAvailability(
  row: MailLogRow,
  mailEnabled: boolean,
): { canResend: boolean; reason: string | null; billMail: boolean } {
  const billMail = row.related_type === "bill" && row.related_id !== null
  if (row.status !== "failed") return { canResend: false, reason: null, billMail }
  if (isNotConfiguredError(row.error)) return { canResend: false, reason: "메일 발송 설정이 없던 때의 기록이라 다시 보내지 않아요", billMail }
  if (!mailEnabled) return { canResend: false, reason: "메일 발송이 설정되지 않아 지금은 보낼 수 없어요", billMail }
  if (row.template_code === "tenant_welcome")
    return { canResend: false, reason: "계정 안내 메일은 다시 보낼 수 없어요. 입주기업 화면에서 비밀번호를 초기화하면 새 안내가 가요", billMail }
  if (billMail) {
    // 상태를 못 읽었거나(undefined: since 조회가 아님) 청구서가 없어졌으면(null: LEFT JOIN 결과 없음 — 기업 삭제 등) 옛 금액 메일이 나가지 않게 끈다
    if (row.bill_status === undefined)
      return { canResend: false, reason: "청구서 상태를 확인하지 못해 다시 보낼 수 없어요", billMail }
    if (row.bill_status === null)
      return { canResend: false, reason: "관련 청구서를 찾지 못했어요(삭제된 청구서). 옛 내용이라 다시 보내지 않아요", billMail }
    if (row.bill_status === "paid") return { canResend: false, reason: "이미 납부 완료된 청구서라 다시 보내지 않아요", billMail }
    if (row.bill_status !== "issued" && row.bill_status !== "overdue")
      return { canResend: false, reason: "청구서가 지금 발행 상태가 아니에요. 청구서 화면에서 확인해 주세요", billMail }
    if (row.bill_updated_at && new Date(row.bill_updated_at).getTime() > new Date(row.created_at).getTime())
      return { canResend: false, reason: "메일을 보낸 뒤 청구서 내용이나 상태가 바뀌었어요. 청구서 화면에서 확인해 주세요", billMail }
  }
  return { canResend: true, reason: null, billMail }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/** 일반 글 → 단락 HTML. 빈 줄로 단락을 나누고 줄바꿈은 <br>. {{변수}}는 그대로 둔다(이스케이프해도 글자가 같다) */
export function plainTextToHtml(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n")
}

/** since 파라미터: "30d"·"90d"·"365d"(일 수) 또는 "YYYY-MM-DD". 잘못된 값이면 null */
export function parseSince(raw: string | null | undefined, now: number = Date.now()): string | null {
  if (!raw) return null
  const m = /^(\d{1,3})d$/.exec(raw)
  if (m) {
    const days = Number(m[1])
    if (days < 1 || days > 366) return null
    return new Date(now - days * 86_400_000).toISOString()
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const t = Date.parse(`${raw}T00:00:00+09:00`)
    return Number.isNaN(t) ? null : new Date(t).toISOString()
  }
  return null
}
