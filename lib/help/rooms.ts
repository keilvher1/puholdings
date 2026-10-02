// 호실 현황 화면 도움말(계획서 4.3.1~4.3.4). app/admin/rooms/page.tsx의 <PageHeader help={ROOMS_HELP}>로 넘긴다.
// 지난 화면의 안내 문장("위 버튼으로 바로 입주 계약을 만들거나…", "계약 조건 수정은 설정 > 계약 관리에서…")도 여기로 옮겼다.
import type { HelpTopic } from "./types"

export const ROOMS_HELP: HelpTopic = {
  title: "호실 현황",
  steps: [
    "칸을 누르면 오른쪽에 호실 정보가 열려요. 위쪽 상태 칩을 누르면 그 상태 호실만 보여요",
    "공실을 눌러 [입주 처리]로 계약을 만들어요. 입주기업에 없는 기업은 그 자리에서 바로 등록할 수 있어요",
    "입주 중인 호실을 눌러 [퇴실 처리]를 해요. 실행 전에 받을 돈과 돌려줄 금액을 먼저 보여 줘요",
    "퇴실 처리를 하면 호실이 바로 공실로 바뀌고 되돌릴 수 없어요. 퇴실하는 달에 처리해 주세요",
    "계약 단가·면적을 고치려면 호실 정보의 ‘계약 조건 고치기’를 눌러요(관리비 정산 › 기준 정보)",
  ],
  terms: ["occupied", "moveOut", "pyeongBilled", "depositActual", "prorated", "receivable", "offset", "setTenantMovedOut"],
}
