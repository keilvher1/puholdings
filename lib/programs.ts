// 프로그램(지원사업/교육) 공용 헬퍼

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  applied: "신청됨",
  accepted: "선정",
  rejected: "미선정",
  completed: "완료",
}

export const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  submitted: "제출됨",
  reviewing: "검토 중",
  approved: "승인",
  rejected: "반려",
  resubmit_requested: "재제출 요청",
}

export const PROGRAM_STATUS_LABELS: Record<string, string> = {
  draft: "작성 중",
  open: "모집 중",
  closed: "모집 마감",
  archived: "보관됨",
}

// KST 기준 오늘 날짜 'YYYY-MM-DD' (서버는 UTC로 돌므로 날짜 비교 전 변환 필요)
export function todayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
