// 입주기업 포털 화면 도움말(WP8). 포털 화면의 <PageHeader help={…} helpContact="창업보육센터 054-279-8710">에 넘긴다.
// 문구는 해요체, 용어는 lib/glossary.ts 키로만 고른다(계획서 2.5).

import type { HelpTopic } from "./types"

/** 청구서 목록·상세 */
export const PORTAL_BILLS_HELP: HelpTopic = {
  title: "청구서",
  steps: [
    "‘낼 것’에서 아직 내지 않은 청구서를 확인해요",
    "청구서를 누르면 금액·납부 기한·항목 설명이 보여요",
    "[계좌번호 복사]를 눌러 은행 앱에 붙여 넣고 입금해요",
    "센터에서 입금을 확인하면 ‘납부 완료’로 바뀌어요",
  ],
  terms: ["payable", "awaitingPayment", "pastDue", "billName", "usageToBill", "prorated"],
}

/** 프로그램 목록·상세 */
export const PORTAL_PROGRAMS_HELP: HelpTopic = {
  title: "프로그램",
  steps: [
    "‘신청할 수 있어요’에서 모집 중인 프로그램을 골라 신청해요",
    "선정 결과는 프로그램 화면에 보여요",
    "선정되면 제출 마감 전까지 자료를 올려요(파일당 4MB까지)",
    "보완 요청이 오면 검토 의견을 읽고 다시 제출해요",
  ],
  terms: [],
}
