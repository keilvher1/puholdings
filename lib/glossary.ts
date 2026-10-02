// 용어 사전(계획서 2.5) — 화면 문구의 기준. 칸 힌트(FieldDescription)와 도움말 시트가 같은 정의 문장을 쓴다.
// 저장값·API·DB 컬럼 이름은 바꾸지 않는다. 화면 문구만 이 사전을 따른다. 순수 모듈.
//
// 사용 예:
//   import { GLOSSARY } from "@/lib/glossary"
//   <FieldLabel>{GLOSSARY.pyeongBilled.term}</FieldLabel>
//   <FieldDescription>{GLOSSARY.pyeongBilled.hint}</FieldDescription>
//   // 도움말: HelpTopic.terms: ["usageToBill", "prorated"] → 시트가 term·definition을 보여 준다

export interface GlossaryEntry {
  /** 화면에 쓰는 말 */
  term: string
  /** 도움말 시트의 용어 풀이(한두 문장) */
  definition: string
  /** 입력칸 아래 짧은 힌트(있을 때만) */
  hint?: string
  /** 화면에 쓰지 않는 옛 말·섞여 쓰이던 말(바꿀 때 grep 참고용) */
  avoid?: string[]
}

export const GLOSSARY = {
  moveOut: {
    term: "퇴실",
    definition: "계약을 끝내고 호실을 비우는 일이에요. 운영 메모·계약서의 ‘퇴거’와 같은 뜻이에요. 기업 상태 ‘퇴실’도 같은 말이에요.",
    avoid: ["퇴거", "퇴실예정"],
  },
  occupied: {
    term: "입주 중",
    definition: "진행 중인 계약이 있는 상태예요. ‘퇴실 예정’, ‘사용 불가’, ‘사용 가능’도 띄어 써요.",
    avoid: ["입주중"],
  },
  awaitingPayment: {
    term: "납부 대기",
    definition: "발행했고 아직 입금이 확인되지 않은 청구서예요. 납부 기한이 지나면 ‘기한 지남’이 돼요.",
    avoid: ["발행됨"],
  },
  pastDue: {
    term: "기한 지남",
    definition: "납부 기한이 지났는데 아직 입금이 확인되지 않은 청구서예요.",
    avoid: ["연체됨"],
  },
  receivable: {
    term: "받을 돈",
    definition: "납부 대기와 기한 지남을 합친 금액이에요. 청구월과 상관없이 아직 받지 못한 청구서 전체예요.",
    avoid: ["미납", "미수"],
  },
  payable: {
    term: "낼 관리비",
    definition: "아직 내지 않은 관리비예요. 납부 대기와 기한 지남 청구서를 합친 금액이에요.",
  },
  draft: {
    term: "작성 중",
    definition: "만들었지만 아직 발행하지 않은 청구서예요. 입주기업 포털에는 보이지 않아요.",
    avoid: ["초안", "발행 대기"],
  },
  correcting: {
    term: "정정 중",
    definition: "발행했다가 고치려고 되돌린 청구서예요. 다시 발행해야 포털에 보여요.",
  },
  billName: {
    term: "10월분 청구서",
    definition: "10월분 청구서에는 10월 임대료·관리비와 9월 전기료가 들어가요. 다른 해면 ‘2026년 10월분’처럼 연도를 붙여요.",
    avoid: ["10월 청구서"],
  },
  usageToBill: {
    term: "9월 사용분 → 10월 청구",
    definition: "전기는 쓴 달의 다음 달 청구서에 들어가요. 9월에 쓴 전기료는 10월분 청구서로 나가요.",
    avoid: ["전기 사용월", "period"],
  },
  needsReview: {
    term: "확인 필요",
    definition: "사람이 한 번 봐야 하는 항목이에요. 확인하면 풀려요.",
    avoid: ["확인 대기", "확인 전"],
  },
  setTenantMovedOut: {
    term: "기업 상태를 ‘퇴실’로 바꾸기",
    definition: "기업 상태만 바꿔요. 계약을 끝내는 ‘퇴실 처리’는 호실 현황에서 해요.",
    avoid: ["퇴실로 표시"],
  },
  invoice: {
    term: "청구서",
    definition: "입주기업에 보내는 관리비 청구 문서예요. 한전이 보내는 것만 ‘한전 고지서’라고 불러요.",
    avoid: ["고지서"],
  },
  expenses: {
    term: "증빙 처리",
    definition: "사업비(정부지원사업) 증빙을 올리고 정리하는 메뉴예요. 예전 이름은 ‘사업비 정산’이에요.",
    avoid: ["사업비 정산"],
  },
  tenants: {
    term: "입주기업",
    definition: "창업보육센터에 입주한 기업이에요. 메뉴·제목·안내가 같은 이름을 써요.",
    avoid: ["기업 관리", "입주기업 관리"],
  },
  mail: {
    term: "메일",
    definition: "시스템이 보낸 메일 기록과 새 메일을 보는 메뉴예요.",
    avoid: ["메일 발송"],
  },
  receipt: {
    term: "증빙",
    definition: "사업비를 쓴 근거 문서예요. 영수증·세금계산서·카드전표·이체확인증은 ‘문서 종류’로 나눠요.",
    avoid: ["영수증(메뉴 이름으로)"],
  },
  uploadRowStatus: {
    term: "입력 필요 · 확인 필요 · 준비 완료 · 제외",
    definition: "올린 증빙 행의 상태 4가지예요. 중복 의심·인식 신뢰도 낮음·금액 불일치는 ‘확인 필요’의 사유예요.",
  },
  autoRecognized: {
    term: "자동 인식",
    definition: "사진·파일에서 읽어 채운 값이에요. 판독 결과는 제안이에요. 저장은 직접 눌러야 해요.",
    avoid: ["AI", "판독"],
  },
  pyeongBilled: {
    term: "부과 면적(평)",
    definition: "임대료·관리비를 매기는 면적이에요.",
    hint: "임대료·관리비를 매기는 면적이에요",
    avoid: ["부과평형"],
  },
  depositActual: {
    term: "받은 보증금",
    definition: "실제로 받은 보증금이에요. 기준 보증금 = 면적 × 평당 20만 원이에요.",
    hint: "실제로 받은 보증금이에요. 기준 보증금 = 면적 × 평당 20만 원",
    avoid: ["실보증금"],
  },
  prorated: {
    term: "날짜만큼(일할)",
    definition: "입주일부터 그달 말일까지(또는 그달 1일부터 퇴실일까지) 날짜만큼만 청구해요.",
    hint: "입주일부터 그달 말일까지 날짜만큼만 청구해요",
    avoid: ["일할(단독)"],
  },
  overpaid: {
    term: "더 받은 금액(과납)",
    definition: "기록용 숫자예요. 청구서에서 자동으로 빠지지 않아요.",
    hint: "기록용 숫자예요. 청구서에서 자동으로 빠지지 않아요",
    avoid: ["과납잔액"],
  },
  offset: {
    term: "보증금에서 빼기(상계)",
    definition: "보증금 − 받을 돈 = 돌려줄 금액이에요.",
    avoid: ["상계(단독)"],
  },
  budgetItem: {
    term: "비목",
    definition: "예산 항목이에요(예: 재료비, 외주용역비).",
    hint: "예산 항목이에요(예: 재료비, 외주용역비)",
  },
  summaryNote: {
    term: "적요",
    definition: "무엇에 썼는지 한 줄로 적어요.",
    hint: "무엇에 썼는지 한 줄로 적어요",
  },
  attributionMonth: {
    term: "귀속월(일한 달)",
    definition: "급여를 다음 달에 주면 일한 달로 고쳐 주세요.",
    hint: "급여를 다음 달에 주면 일한 달로 고쳐 주세요",
    avoid: ["귀속월(단독)"],
  },
  inbox: {
    term: "데스크톱 앱에서 온 증빙",
    definition: "데스크톱 앱(포연기 증빙함)으로 올린 증빙이에요. 상태는 ‘확인 필요’로 보이고, 확인해서 저장하면 증빙 내역으로 옮겨져요.",
    avoid: ["확인 대기함", "데스크톱 앱 대기"],
  },
  home: {
    term: "홈",
    definition: "로그인하면 처음 보이는 화면이에요. 오늘 처리할 일을 모아 보여 줘요.",
    avoid: ["대시보드"],
  },
  billingSettings: {
    term: "기준 정보",
    definition: "단가·계약·호실처럼 매달 관리비 계산에 쓰는 기준 값이에요. 예전 이름은 ‘설정’이에요.",
    avoid: ["설정(관리비 탭)"],
  },
} as const satisfies Record<string, GlossaryEntry>

export type GlossaryKey = keyof typeof GLOSSARY

/** 키 → 항목(모르는 키는 undefined) */
export function glossaryEntry(key: GlossaryKey): GlossaryEntry {
  return GLOSSARY[key]
}
