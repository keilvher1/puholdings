// 관리자 홈 도움말(계획서 2.2 HelpTopic) — WP1. 홈 PageHeader help={HOME_HELP}로 넘긴다.
import type { HelpTopic } from "./types"

export const HOME_HELP: HelpTopic = {
  title: "홈",
  steps: [
    "‘오늘 할 일’에는 지금 처리할 것만 보여요. 줄을 누르면 그 조건이 걸린 화면으로 가요",
    "관리비는 정정 중 → 작성 중 → 받을 돈 순서로 먼저 봐요",
    "‘관리비 마감’ 줄에서 몇 단계까지 끝났는지 보고 [이어 하기]로 다음 단계를 열어요",
    "메모·확인 사항은 제목을 누르면 답변 칸이 펼쳐져요. 해결로 표시한 뒤에도 [되돌리기]로 다시 열 수 있어요",
  ],
  terms: ["home", "receivable", "correcting", "draft", "inbox"],
}
