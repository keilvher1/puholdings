// 증빙 처리 > 증빙 올리기·인건비 등록·데스크톱 앱 설치 화면 도움말(계획서 6.0 "화면별 도움말", WP2).
// 화면의 PageHeader help={…}로 넘긴다. 문장은 해요체, 용어 풀이는 lib/glossary.ts 키로.

import type { HelpTopic } from "./types"

export const EXPENSES_UPLOAD_HELP: HelpTopic = {
  title: "증빙 올리기",
  steps: [
    "증빙 파일을 끌어다 놓거나 [파일 추가]를 눌러요. 휴대폰은 [촬영]도 돼요. 파일마다 10~30초 동안 자동 인식해요",
    "‘확인 필요’ 탭이나 [확인할 것 보기]로 확인할 행만 봐요. 사유마다 [확인했어요]를 누르거나 원본을 보며 고쳐요",
    "행마다 프로젝트를 고르고(자동 추천이 있으면 미리 골라져 있어요) 아래 [n건 저장]을 눌러요. 저장 전에는 아무것도 기록되지 않아요",
    "한 거래에 서류가 여럿(세금계산서+이체확인증)이면 한 건만 저장해요. 같은 거래로 보이는 행은 자동으로 ‘제외’돼요",
    "인건비는 파일 없이 [인건비 등록]으로 입력해요. 지난달 내역을 불러와 날짜만 확인하면 돼요",
  ],
  terms: ["uploadRowStatus", "autoRecognized", "budgetItem", "summaryNote", "attributionMonth", "inbox"],
}

export const EXPENSES_DESKTOP_HELP: HelpTopic = {
  title: "데스크톱 앱 설치",
  steps: [
    "내 컴퓨터에 맞는 설치 파일을 받아 설치해요(맥은 Apple 칩·Intel 칩을 확인해요)",
    "앱 화면 가장자리의 둥근 버튼에 증빙 파일을 끌어다 놓으면 서버에 보관되고 자동 인식돼요",
    "앱에 넣은 파일은 ‘증빙 올리기’ 탭에 모여요. 거기서 확인하고 저장해요",
  ],
  terms: ["inbox", "autoRecognized"],
}
