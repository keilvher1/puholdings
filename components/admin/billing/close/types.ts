// 월 마감(WP6) 공용 타입 — 서버(status-query.ts·close-status 라우트)와 화면이 같이 쓴다. 서버 import 없음.
//
// CloseStatus = getCloseProgress()(lib/admin-todo.ts, 단계 판정의 단일 기준) + 화면에 필요한 필드.
// 단계 상태(steps·nextStep)는 여기서 다시 만들지 않는다.

import type { CloseProgress } from "@/lib/admin-todo"

/** 3·4단계 표 한 행(청구월의 기업 청구서 1건 + 지난달 같은 기업 청구액) */
export interface ReviewRow {
  billId: number
  tenantId: number
  tenantName: string
  status: string
  isManual: boolean
  /** draft + issued_at 있음 */
  correcting: boolean
  total: number
  /** 지난 청구월 같은 기업 합계(없으면 신규) */
  prevTotal: number | null
  elecAmount: number
  /** 전기 라인이 있는데 0원 */
  zeroElec: boolean
  /** 받을 메일 주소 있음(COALESCE(NULLIF(tax_email,''), NULLIF(contact_email,''))) */
  hasEmail: boolean
  dueDate: string | null
  issuedAt: string | null
  /** 이 청구월에 시작·끝난 계약 사유("9월 15일 입주 · 일할") */
  events: string[]
  /** 발행 뒤 메일 결과(issued_at 이후 bill_issued 로그 중 마지막). 없으면 null */
  mail: { status: "sent" | "failed" | "queued" | string; error: string | null } | null
}

/** 최근 달 상태 글자(월 고르기 목록용) — 키는 사용월 */
export type MonthNotes = Record<string, string>

export interface CloseExtra {
  /** 정기 청구서가 발행된 가장 최근 청구월(L) */
  latestIssuedBillMonth: string | null
  monthNotes: MonthNotes
  kepco: {
    /** 지난달(사용월 −1) 한전 청구금액 */
    prevMonthTotal: number | null
    /** 작년 같은 달 한전 청구금액 */
    lastYearTotal: number | null
    /** 지난달 kWh 단가(“지난달 값 쓰기”) */
    prevUnitPrice: number | null
  }
  /** 청구월 청구서 전체(수기 포함), 정렬은 화면이 한다 */
  rows: ReviewRow[]
  /** 지난 청구월 정기 청구서 합계(“지난달보다 −5.6%”) */
  prevMonthTotal: number | null
  /** 4단계 발행 대상 = 그 청구월 draft 전부(수기·정정 중 포함, issue 라우트의 대상과 같음) */
  issue: {
    billIds: number[]
    count: number
    total: number
    mailable: number
    noEmail: { tenantId: number; name: string }[]
    correcting: number
    /** 이미 납부 기한이 있는 발행 대상(정정 재발행 등) — 기존 값을 그대로 둔다 */
    withDueDate: number
    /** 전기료가 0원으로 굳은 발행 대상 기업(issue 라우트의 needs_regenerate와 같은 판정) */
    staleElec: string[]
    /** 납부 기한 제안값(YYYY-MM-DD) */
    dueSuggestion: string
    /** 제안 근거 문장 */
    dueRule: string
  }
}

export type CloseStatus = CloseProgress & CloseExtra

/** 발행 응답(issue 라우트) — 화면에서 쓰는 부분 */
export interface IssueResponse {
  success: boolean
  issued?: number
  corrected?: number
  mail?: { sent: number; failed: number }
  no_email?: string[]
  failed_list?: { bill_id: number; tenant_id: number; tenant_name: string; error: string | null; not_configured: boolean }[]
  error?: string
  needs_regenerate?: boolean
  stale?: string[]
}

/** 생성 응답(generate 라우트, 수정 금지) — 화면에서 쓰는 부분 */
export interface GenerateResponse {
  success: boolean
  created?: number
  regenerated?: number
  reissued?: number
  reissuable?: number
  reissuable_elec_diff?: number
  removed?: number
  per10_billed?: number
  elec_sum?: number
  unmapped_metered?: string[]
  skipped?: { tenant_name: string; reason: string }[]
  error?: string
  needs_force?: boolean
}
