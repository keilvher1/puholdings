// 관리비 입금 계좌 — PDF 청구서와 포털·관리자 화면이 같은 계좌를 안내하게 하는 단일 기준(계획서 2.2, 가드 #28).
// text는 PDF에 찍히는 원문과 같은 값이다(lib/invoice-gen.ts도 DEFAULT_BANK_TEXT를 쓴다).
// BILLING_BANK_INFO env가 있으면 그 원문을 쓰고, "은행명 + 숫자·하이픈 계좌번호 + 예금주"로 나눌 수 없으면
// 기본 계좌로 떨어지지 않고 bank·account·holder를 null로 둔다(화면은 원문만 보이고 [계좌번호 복사]를 숨긴다).
//
// 사용 예(서버 컴포넌트·라우트):
//   import { getBillingBankInfo } from "@/lib/bank-info"
//   const bank = getBillingBankInfo()
//   // { text: "예금주 : ㈜ 포항연합기술지주\n계좌번호 : 910-910009-44304  하나은행",
//   //   bank: "하나은행", account: "910-910009-44304", holder: "㈜포항연합기술지주" }
//   {bank.account ? <CopyButton value={bank.account} label="계좌번호 복사" /> : null}
//
// 주의: 클라이언트에서 부르면 env가 없어 늘 기본값이 나온다. 서버에서 읽어 prop으로 넘긴다.

export interface BillingBankInfo {
  /** PDF에 찍히는 원문(줄바꿈 포함). 화면은 whitespace-pre-line으로 그대로 보여 준다 */
  text: string
  bank: string | null
  /** 숫자·하이픈만(은행 앱 붙여넣기용) */
  account: string | null
  holder: string | null
}

// 원본 청구서 양식과 동일한 2줄 표기. lib/invoice-gen.ts의 DEFAULT_BANK와 바이트 단위로 같다(테스트로 확인).
export const DEFAULT_BANK_TEXT = "예금주 : ㈜ 포항연합기술지주\n계좌번호 : 910-910009-44304  하나은행"

const BANK_NAME =
  /(카카오뱅크|토스뱅크|케이뱅크|새마을금고|산림조합|우체국|신협|수협|농협|[가-힣A-Za-z]{1,10}은행|[A-Za-z]{2,10}\s?BANK)/i
// 숫자로 시작·끝나고 하이픈으로 나뉜 계좌번호(하이픈 1개 이상), 또는 하이픈 없는 10~16자리
const ACCOUNT_HYPHEN = /\d{2,6}(?:-\d{1,8}){1,4}/g
const ACCOUNT_PLAIN = /(?<![\d-])\d{10,16}(?![\d-])/g

function normalizeHolder(s: string): string {
  return s
    .trim()
    .replace(/^(?:㈜|\(주\)|\(유\)|\(재\)|\(사\))\s+/, (m) => m.trim())
    .replace(/\s+/g, " ")
    .trim()
}

/** 원문을 은행·계좌·예금주로 나눈다. 셋 중 하나라도 확실하지 않으면 모두 null. */
export function parseBankText(text: string): Pick<BillingBankInfo, "bank" | "account" | "holder"> {
  const none = { bank: null, account: null, holder: null }
  const src = text.replace(/\r\n?/g, "\n").trim()
  if (!src) return none

  const hyphen = [...new Set(src.match(ACCOUNT_HYPHEN) ?? [])]
  const plain = [...new Set(src.match(ACCOUNT_PLAIN) ?? [])]
  const accounts = [...hyphen, ...plain]
  if (accounts.length !== 1) return none
  const account = accounts[0]

  const bankMatch = src.match(BANK_NAME)
  if (!bankMatch) return none
  const bank = bankMatch[1].trim()

  let holder = ""
  const labeled = src.match(/예금주\s*[:：]?\s*([^\n]+)/)
  if (labeled) {
    holder = labeled[1]
  } else {
    holder = src
      .replace(account, " ")
      .replace(bank, " ")
      .replace(/계좌번호|계좌|입금|은행명|[:：,/|]/g, " ")
  }
  holder = normalizeHolder(holder.replace(account, " ").replace(bank, " "))
  // 예금주에는 숫자가 없고, 너무 길지 않아야 한다(설명 문장이 섞인 원문은 나누지 않는다)
  if (!holder || /\d/.test(holder) || holder.length > 30 || holder.split(" ").length > 3) return none
  return { bank, account, holder }
}

/** 지금 설정의 입금 계좌. env가 없으면 기본 계좌(분해값 포함). */
export function getBillingBankInfo(): BillingBankInfo {
  const text = process.env.BILLING_BANK_INFO || DEFAULT_BANK_TEXT
  return { text, ...parseBankText(text) }
}
