// 화면별 도움말 타입(계획서 2.2). 본문은 그 화면을 만드는 WP가 자기 lib/help/<영역>.ts에 쓰고,
// 자기 화면의 <PageHeader help={topic}>에 넘긴다(모으는 index 파일은 두지 않는다).
//
// 사용 예(lib/help/billing-close.ts):
//   import type { HelpTopic } from "@/lib/help/types"
//   export const BILLING_CLOSE_HELP: HelpTopic = {
//     title: "월 마감",
//     steps: ["검침 4개를 입력해요", "한전 고지서 금액을 넣고 10평당 단가를 확정해요", "청구서를 만들고 확인해요", "발행해요"],
//     terms: ["usageToBill", "draft", "prorated"],
//   }

import type { GlossaryKey } from "../glossary"

export interface HelpTopic {
  /** 시트 제목(보통 화면 이름) */
  title: string
  /** 이 화면 절차 3~5줄(해요체, 마침표 없이도 됨) */
  steps: string[]
  /** 용어 풀이에 보일 용어(lib/glossary.ts의 키) */
  terms: GlossaryKey[]
}
