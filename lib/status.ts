// 상태 사전 — 관리자·포털·메일 화면이 같은 상태를 같은 말·같은 색으로 보이게 하는 단일 기준(계획서 2.3).
// 톤은 5가지(neutral·info·warning·danger·success)뿐이고 색은 이 톤으로만 쓴다. 순수 모듈(서버·클라이언트 공용).
//
// 사용 예:
//   import { statusMeta, billBadge, TONE_CLASS } from "@/lib/status"
//   statusMeta("submission", "resubmit_requested")   // { label: "보완 요청", tone: "warning" }
//   const b = billBadge(bill)                         // 청구서 배지는 DB 상태가 아니라 날짜로 고른다
//   <StatusBadge domain="bill" status={b.status} detail={b.detail} />   // components/saas
//
// 주의: lib/billing.ts의 BILL_STATUS_LABELS는 PDF·zip 파일명·생성 사유 문구용이라 건드리지 않는다. 화면은 이 사전을 쓴다.
//       남색 채움(primary)은 주 버튼 전용이라 상태 톤에 없다. 빨강(danger)은 문제에만, 개수에는 CountBadge(중립)를 쓴다.

import { daysFrom, sinceIssued, toKstDate, todayKST } from "./format"
import { receivableState, type ReceivableInput } from "./receivables"

export type Tone = "neutral" | "info" | "warning" | "danger" | "success"

export type StatusDomain =
  | "bill"
  | "room"
  | "tenant"
  | "contract"
  | "program"
  | "application"
  | "submission"
  | "portalProgram"
  | "expenseRow"
  | "expenseCheck"
  | "email"
  | "inquiry"
  | "note"
  | "inbox"
  | "closeStep"

export interface StatusMeta {
  label: string
  tone: Tone
  /** 배지 뒤에 붙일 기본 보조 글자(예: 정정 중 → "다시 발행해야 포털에 보여요"). StatusBadge의 detail이 있으면 그쪽이 우선 */
  detail?: string
  /** 표시하지 않는 상태(예: 장부 점검 ok). StatusBadge는 아무것도 그리지 않는다 */
  hidden?: boolean
  /** 호실 타일 모양 힌트: 공실은 점선, 사용 불가는 빗금 */
  pattern?: "dashed" | "hatched"
}

// 대비(흰 바탕 기준): #3f3f4e/warm-beige 9.0 · blue-800/blue-50 8.6 · amber-800/amber-50 6.8 · red-800/red-50 7.6 · green-800/green-50 6.8
export const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-warm-beige bg-warm-beige text-[#3f3f4e]",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  success: "border-green-200 bg-green-50 text-green-800",
}

/** 화면 안 알림(Notice) 등 넓은 면에 쓰는 같은 톤의 바탕·테두리·글자 */
export const TONE_SURFACE_CLASS: Record<Tone, string> = {
  neutral: "border-warm-tan bg-card text-dark",
  info: "border-blue-200 bg-blue-50 text-blue-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-900",
  success: "border-green-200 bg-green-50 text-green-900",
}

type Dict = Record<string, StatusMeta>

export const STATUS: Record<StatusDomain, Dict> = {
  // 청구서. 화면 배지는 billBadge()로 고른다(issued인데 기한이 지나면 late, draft + issued_at이면 correcting).
  bill: {
    draft: { label: "작성 중", tone: "neutral" },
    issued: { label: "납부 대기", tone: "info" },
    overdue: { label: "기한 지남", tone: "danger" },
    late: { label: "기한 지남", tone: "danger" },
    paid: { label: "납부 완료", tone: "success" },
    correcting: { label: "정정 중", tone: "warning", detail: "다시 발행해야 포털에 보여요" },
  },
  // 호실(보드 상태는 계약에서 파생). board API의 "maintenance"도 사용 불가로 읽는다.
  room: {
    occupied: { label: "입주 중", tone: "neutral" },
    leaving: { label: "퇴실 예정", tone: "warning" },
    vacant: { label: "공실", tone: "neutral", pattern: "dashed" },
    unavailable: { label: "사용 불가", tone: "neutral", pattern: "hatched" },
    maintenance: { label: "사용 불가", tone: "neutral", pattern: "hatched" },
  },
  tenant: {
    active: { label: "입주 중", tone: "neutral" },
    moved_out: { label: "퇴실", tone: "neutral" },
  },
  contract: {
    active: { label: "진행 중", tone: "neutral" },
    ended: { label: "종료", tone: "neutral" },
  },
  program: {
    draft: { label: "작성 중", tone: "neutral" },
    open: { label: "모집 중", tone: "info" },
    closed: { label: "모집 마감", tone: "neutral" },
    archived: { label: "보관", tone: "neutral" },
  },
  // 관리자 화면의 신청 상태
  application: {
    applied: { label: "신청함", tone: "neutral" },
    accepted: { label: "선정", tone: "success" },
    rejected: { label: "미선정", tone: "neutral" },
    completed: { label: "완료", tone: "success" },
  },
  submission: {
    submitted: { label: "제출함", tone: "info" },
    reviewing: { label: "검토 중", tone: "info" },
    approved: { label: "승인", tone: "success" },
    rejected: { label: "반려", tone: "danger" },
    resubmit_requested: { label: "보완 요청", tone: "warning" },
  },
  // 포털 프로그램 카드 1개 = 배지 1개. 키는 화면 판정 결과(WP8이 프로그램·신청·제출 상태를 합쳐 고른다).
  portalProgram: {
    available: { label: "신청 가능", tone: "info" },
    waiting_result: { label: "결과 기다리는 중", tone: "neutral" },
    submit_needed: { label: "자료 제출 필요", tone: "warning" },
    resubmit_requested: { label: "보완 요청", tone: "warning" },
    reviewing: { label: "검토 중", tone: "neutral" },
    approved: { label: "승인", tone: "success" },
    rejected: { label: "미선정", tone: "neutral" },
    closed: { label: "모집 마감", tone: "neutral" },
    // 추가(X1): 모집 중이지만 신청 시작일 전 / 선정됐지만 제출 마감일이 지남(제출·보완 전)
    not_started: { label: "신청 시작 전", tone: "neutral" },
    submit_closed: { label: "제출 마감", tone: "neutral" },
  },
  // 증빙 업로드 표의 행 상태 4개 + 진행 표시 2개. 중복 의심·신뢰도 낮음·금액 불일치는 상태가 아니라 "확인 필요"의 사유다.
  expenseRow: {
    needs_input: { label: "입력 필요", tone: "danger" },
    needs_review: { label: "확인 필요", tone: "warning" },
    ready: { label: "준비 완료", tone: "success" },
    excluded: { label: "제외", tone: "neutral" },
    scanning: { label: "인식 중", tone: "neutral" },
    saved: { label: "저장함", tone: "success" },
  },
  // 증빙 장부 점검. ok는 표시하지 않는다. check의 detail에는 사유 1개를 넣는다.
  expenseCheck: {
    ok: { label: "", tone: "neutral", hidden: true },
    check: { label: "확인 필요", tone: "warning" },
  },
  // 메일 기록. not_configured는 메일 발송 env가 없어 보내지 않은 기록(실패와 나눠 보인다).
  email: {
    sent: { label: "보냄", tone: "success" },
    failed: { label: "보내지 못함", tone: "danger" },
    queued: { label: "보내는 중", tone: "neutral" },
    not_configured: { label: "보내지 않음", tone: "neutral", detail: "메일 발송이 꺼져 있어요" },
  },
  // 문의: new만 따로, 그 밖의 값은 모두 "확인함"(아래 FALLBACK)
  inquiry: {
    new: { label: "새 문의", tone: "warning" },
  },
  note: {
    open: { label: "확인 필요", tone: "warning" },
    resolved: { label: "해결", tone: "neutral" },
  },
  // 데스크톱 앱 확인 대기함
  inbox: {
    pending: { label: "확인 필요", tone: "warning" },
    done: { label: "처리함", tone: "neutral" },
    dismissed: { label: "제외", tone: "neutral" },
  },
  // 월 마감 단계(Stepper·홈 한 줄). blocked의 구체 문구("먼저 1단계가 필요해요")는 CloseProgress.steps[].note에 있다.
  closeStep: {
    done: { label: "완료", tone: "success" },
    current: { label: "진행 중", tone: "info" },
    todo: { label: "시작 전", tone: "neutral" },
    attention: { label: "확인 필요", tone: "warning" },
    blocked: { label: "앞 단계 필요", tone: "neutral" },
  },
}

// 사전에 없는 값을 받았을 때의 도메인별 기본값(없으면 값 그대로 + neutral)
const FALLBACK: Partial<Record<StatusDomain, StatusMeta>> = {
  inquiry: { label: "확인함", tone: "neutral" },
}

/** 도메인·상태 값 → 문구·톤. 모르는 값은 원문 그대로 neutral(화면이 깨지지 않게). */
export function statusMeta(domain: StatusDomain, status: string | null | undefined): StatusMeta {
  const key = status ?? ""
  const hit = STATUS[domain]?.[key]
  if (hit) return hit
  return FALLBACK[domain] ?? { label: key || "-", tone: "neutral" }
}

// ── 청구서 배지 ───────────────────────────────────────────────────────────────

export type BillBadgeStatus = "draft" | "correcting" | "issued" | "late" | "overdue" | "paid"

/**
 * 청구서 화면 배지 고르기(관리자·포털 공용). DB 상태가 아니라 lib/receivables.ts 판정으로 고른다.
 *   draft + issued_at 있음 → correcting("정정 중", detail "다시 발행해야 포털에 보여요")
 *   issued/overdue 이고 기한 지남 → late("기한 지남", detail "21일 지남")
 *   issued 이고 기한 전 → issued("납부 대기", detail "9일 남음" — 기한 당일은 "오늘까지")
 *   issued 이고 기한 없음 → issued("납부 대기", detail "발행 후 52일")
 *   paid → paid("납부 완료", detail = 납부일 "9월 20일", paid_at이 있을 때)
 */
export function billBadge(
  bill: ReceivableInput & { paid_at?: string | Date | null },
  today: string = todayKST(),
): { status: BillBadgeStatus; detail: string | null } {
  const st = receivableState(bill, today)
  if (st.kind === "correcting") return { status: "correcting", detail: STATUS.bill.correcting.detail ?? null }
  if (bill.status === "paid") {
    const paid = toKstDate(bill.paid_at ?? null)
    return { status: "paid", detail: paid ? `${Number(paid.slice(5, 7))}월 ${Number(paid.slice(8, 10))}일` : null }
  }
  if (st.kind === "receivable") {
    if (st.bucket === "no_due") return { status: "issued", detail: sinceIssued(bill.issued_at, today) }
    if (st.bucket === "not_due") {
      const left = daysFrom(bill.due_date, today)
      return { status: "issued", detail: left === 0 ? "오늘까지" : left !== null ? `${left}일 남음` : null }
    }
    return { status: "late", detail: st.days !== null ? `${st.days}일 지남` : null }
  }
  return { status: bill.status === "draft" ? "draft" : (bill.status as BillBadgeStatus), detail: null }
}
