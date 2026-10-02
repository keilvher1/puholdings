// 증빙 처리 > 증빙 내역·사업·프로젝트 화면 도움말(계획서 6.0 "화면별 도움말", WP3).
// 화면의 PageHeader help={…}로 넘긴다. 문장은 해요체, 용어 풀이는 lib/glossary.ts 키로.

import type { HelpTopic } from "./types"

export const EXPENSES_LEDGER_HELP: HelpTopic = {
  title: "증빙 내역",
  steps: [
    "프로젝트를 고르면 비목별 집행 현황(예산·집행액·잔액)이 보여요. 비목 행을 누르면 그 비목 증빙만 보여요",
    "‘점검 필요’ 보기에는 집행액에 영향을 주는 것만 모여요: 같은 거래로 보이는 쌍, 금액 불일치, 비목 미지정·예산 외, 사업 기간 밖 거래",
    "신뢰도 낮음·환율 직접 입력·원본 없음은 회색 ‘참고’로만 보여요. 업로드 때 확인했다면 그대로 두어도 돼요",
    "정산 보고 전에 [정산 전 점검]을 눌러 사유별로 한 번 훑어보고, [내려받기]에서 엑셀·원본 zip을 받아요",
    "‘지금 조건으로’ 받은 파일에는 파일 이름과 첫 줄에 조건이 적혀요. 제출용 전체 자료는 ‘프로젝트 전체 엑셀’로 받아요",
  ],
  terms: ["receipt", "budgetItem", "summaryNote", "attributionMonth", "needsReview", "autoRecognized"],
}

export const EXPENSES_PROJECTS_HELP: HelpTopic = {
  title: "사업·프로젝트",
  steps: [
    "정부지원사업 과제를 프로젝트로 등록해요. 사업계획서·협약서를 올리면 과제명·기간·비목별 예산을 자동으로 채워 줘요(저장은 직접 눌러야 해요)",
    "집행액은 저장한 증빙 합계(부가세 포함)이고, 집행률은 집행액 ÷ 총사업비예요",
    "카드의 ‘비목 초과’를 누르면 증빙 내역에서 그 비목 증빙만 볼 수 있어요",
    "사업이 끝나면 ⋯ 메뉴에서 ‘종료’해요. 증빙 올리기 목록에서만 빠지고 저장한 증빙은 그대로예요",
  ],
  terms: ["expenses", "budgetItem", "autoRecognized"],
}
