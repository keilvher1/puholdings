// 관리비 정산 > 기준 정보(/admin/billing/settings) 도움말 — WP5b. 화면 PageHeader help={BILLING_SETTINGS_HELP}로 넘긴다.
// 예전 설정 화면의 안내 문장(평당 단가 규칙, 입주월 전기료 제외)을 여기로 옮겼다.

import { RENT_RULE_SENTENCE } from "@/components/admin/billing/settings/rate-rules"
import type { HelpTopic } from "./types"

export const BILLING_SETTINGS_HELP: HelpTopic = {
  title: "기준 정보",
  steps: [
    `‘단가·기본값’에서 지금 쓰는 평당 임대료·관리비와 계약 수를 봐요. ${RENT_RULE_SENTENCE}`,
    "계약 조건(면적·단가·관리비·보증금·청구 방식)은 ‘계약’ 탭에서 계약을 눌러 고쳐요. 고친 조건은 다음에 만드는 청구서부터 들어가요",
    "작성 중인 청구서에 넣으려면 월 마감 3단계에서 청구서를 다시 만들어요. 이미 발행한 청구서는 바뀌지 않아요",
    "입주·퇴실은 호실 현황에서 처리해요. ‘호실’ 탭에서는 호실 추가와 면적 수정만 해요",
    "입주한 달 청구서에는 전기료(지난달 사용분)가 빠져요. 월별 정산표(작성 중 포함)는 ‘가져오기·내보내기’에서 내려받아요",
  ],
  terms: ["billingSettings", "pyeongBilled", "depositActual", "prorated", "usageToBill", "moveOut", "draft"],
}
