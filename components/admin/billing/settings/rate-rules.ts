// 관리비 단가 규칙 — 화면 문장(단가·기본값 탭 규칙, 계약 시트 힌트·라디오 설명, 도움말)이 모두 여기 숫자를 쓴다.
// 단가 규칙이 바뀌면 이 파일만 고치면 된다. 저장소(billing_settings)가 없으므로 "규칙"은 문장이고, 실제 값은 계약마다 저장된다(계획서 4.3.9, 5장).
// 순수 데이터·순수 함수만 둔다(서버·클라이언트·lib/help 어디서든 import 가능).

import { won } from "@/lib/format"

export const RATE_RULES = {
  /** 평당 임대료 — 신규 입주·갱신 */
  rentRenewal: 21000,
  /** 평당 임대료 — 비갱신 기존 계약 */
  rentLegacy: 20000,
  /** 평당 임대료 — 공장동 */
  rentFactory: 15000,
  /** 관리비(월 정액) — 보통 */
  mgmtDefault: 15000,
  /** 관리비(월 정액) — 공장동 */
  mgmtFactory: 30000,
} as const

const R = RATE_RULES

/** "신규 입주·갱신 21,000원 · 비갱신 기존 계약 20,000원 · 공장동 15,000원" */
export const RENT_RULE_TEXT = `신규 입주·갱신 ${won(R.rentRenewal)} · 비갱신 기존 계약 ${won(R.rentLegacy)} · 공장동 ${won(R.rentFactory)}`

/** "보통 15,000원 · 공장동 30,000원" */
export const MGMT_RULE_TEXT = `보통 ${won(R.mgmtDefault)} · 공장동 ${won(R.mgmtFactory)}`

/** 계약 시트 관리비 칸 힌트(라우트가 비운 관리비를 기본값으로 저장한다) */
export const MGMT_FIELD_HINT = `보통 ${won(R.mgmtDefault)}, 공장동 ${won(R.mgmtFactory)}이에요. 비우면 ${won(R.mgmtDefault)}으로 저장돼요`

/** 계약 구분 라디오 설명 */
export const RENEWAL_HINT = `보통 평당 ${won(R.rentRenewal)}이에요(공장동은 ${won(R.rentFactory)})`
export const LEGACY_HINT = `예전 단가를 그대로 쓰는 계약이에요(보통 평당 ${won(R.rentLegacy)})`

/** 도움말 문장 */
export const RENT_RULE_SENTENCE = `평당 임대료는 신규 입주·갱신 ${won(R.rentRenewal)}, 비갱신 기존 계약 ${won(R.rentLegacy)}, 공장동 ${won(R.rentFactory)}이에요`
