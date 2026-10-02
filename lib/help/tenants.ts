// 입주기업 화면(/admin/tenants) 도움말 — PageHeader help={TENANTS_HELP}로 넘긴다(계획서 2.2, WP5a).
import type { HelpTopic } from "@/lib/help/types"

export const TENANTS_HELP: HelpTopic = {
  title: "입주기업",
  steps: [
    "기업을 누르면 오른쪽에 기업 카드가 열려요. 계약·청구·받을 돈·연락처·포털 계정·메모를 한곳에서 봐요",
    "청구서 받을 메일은 기업 카드의 [정보 수정]에서 고쳐요. 비워 두면 담당자 메일을 써요",
    "포털 계정은 기업 카드 ‘연락처·포털’ 탭에서 만들어요. 임시 비밀번호는 한 번만 보이니 안내문을 복사해 전달해 주세요",
    "입주·퇴실과 호실은 호실 현황에서 처리해요. 여기서는 기업 정보만 고쳐요",
    "퇴실한 기업은 삭제하지 말고 ‘기업 상태를 퇴실로 바꾸기’를 써 주세요. 삭제하면 청구서·계약 기록도 함께 지워져요",
  ],
  terms: ["tenants", "receivable", "setTenantMovedOut", "moveOut", "overpaid"],
}
