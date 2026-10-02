// 서버 전용 실행 설정 확인 — env가 "있는지"만 boolean으로 알려 준다(값은 화면에 내보내지 않는다, 계획서 2.2).
// 화면은 이 값으로 "메일이 가요" 같은 약속 문장을 켜고 끈다. 서버 컴포넌트에서 불러 boolean·문자열 prop으로 넘긴다.
//
// 사용 예(서버 컴포넌트):
//   import { isMailEnabled, getSupportContact } from "@/lib/runtime-flags"
//   <IssueStep mailEnabled={isMailEnabled()} supportContact={getSupportContact()} />
//
// 주의: 클라이언트 컴포넌트에서 직접 부르지 않는다(브라우저에는 env가 없어 늘 false가 된다).

function has(name: string): boolean {
  const v = process.env[name]
  return typeof v === "string" && v.trim() !== ""
}

/** 메일 발송이 켜져 있나: RESEND_API_KEY와 MAIL_FROM이 모두 있음(lib/mail.ts getMailEnv와 같은 조건). */
export function isMailEnabled(): boolean {
  return has("RESEND_API_KEY") && has("MAIL_FROM")
}

/** 매일 자동 점검(/api/cron/reminders — 납부 안내·제출 독촉 메일, 기한 지남 전환)이 돌 수 있나: CRON_SECRET 있음(없으면 그 라우트는 늘 401). */
export function isDailyCheckEnabled(): boolean {
  return has("CRON_SECRET")
}

/** 사진 자동 인식(계량기·고지서·증빙)이 켜져 있나: OPENAI_API_KEY 있음. */
export function isMeterScanEnabled(): boolean {
  return has("OPENAI_API_KEY")
}

/**
 * 관리자 화면에 보일 개발·운영 담당 연락처(선택 env ADMIN_SUPPORT_CONTACT, 예: "개발 담당 홍길동 010-0000-0000").
 * 없으면 null — 화면은 "담당자에게 알려 주세요" 같은 문장을 숨기고, 관리자가 직접 할 수 있는 다음 행동만 쓴다.
 */
export function getSupportContact(): string | null {
  const v = process.env.ADMIN_SUPPORT_CONTACT
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null
}
