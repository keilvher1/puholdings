// 관리비 정산 > 청구서 화면 도움말(WP7). PageHeader help={BILLING_BILLS_HELP}로 넘긴다.
import type { HelpTopic } from "./types"

export const BILLING_BILLS_HELP: HelpTopic = {
  title: "청구서",
  steps: [
    "‘받을 돈’에서 아직 입금 확인 전인 청구서를 월과 상관없이 한 번에 봐요. 구간 카드를 누르면 그 구간만 보여요",
    "통장에서 입금을 확인하면 행을 체크하고 [납부 처리]를 눌러 입금일을 넣어요. 잘못 바꿨다면 [되돌리기]나 [납부 처리 취소]로 되돌려요",
    "청구서를 누르면 오른쪽에 항목·금액·납부 기한이 보여요. 작성 중이면 조정 항목(할인·차감·추가)만 더하거나 고칠 수 있어요",
    "임대료·관리비·전기료를 바꾸려면 계약·단가를 고친 뒤 월 마감 3단계에서 청구서를 다시 만들어요. 정기 청구서 발행은 월 마감 4단계에서 해요",
    "퇴실 정산처럼 따로 받을 돈은 [추가 청구 만들기]로 그 달 청구서에 항목을 더하거나 수기 청구서를 만들어요",
  ],
  terms: ["receivable", "awaitingPayment", "pastDue", "draft", "correcting", "billName", "usageToBill"],
}
