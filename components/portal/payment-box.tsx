"use client"

// 입금 계좌 상자(포털 홈·청구서 목록 시트·청구서 상세) — 계획서 4.5.3·4.5.5.
//   은행·계좌번호·예금주 + [계좌번호 복사](주 버튼, 휴대폰은 가로 꽉) + [금액 복사](보조, 선택).
//   [계좌번호 복사]는 계좌번호만(숫자·하이픈) 복사한다 — 은행 앱 계좌번호 칸은 숫자만 받는 경우가 많다.
//   계좌 원문이 분해되지 않으면(bank.account === null) 원문만 보이고 복사 버튼을 숨긴다(가드 #28, 기본 계좌로 떨어지지 않음).
// 계좌 값은 서버에서 getBillingBankInfo()로 읽어 prop으로 넘긴다(클라이언트에는 env가 없다).
//
// 사용 예:
//   <PaymentBox bank={bankInfo} />                                   // 홈
//   <PaymentBox bank={bankInfo} amount={bill.total_amount} />        // 상세(금액 복사 포함)
//   <PaymentBox bank={bankInfo} collapsible defaultOpen={false} />   // 납부 완료 청구서: "입금 계좌 보기"로 접힘

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { CopyButton } from "@/components/saas"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { toNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { BillingBankInfo } from "@/lib/bank-info"

/** 입금 안내 한 줄(문구는 운영 확인 대상, 계획서 5장) */
export const PAYMENT_NOTE = "입금자명은 회사 이름으로 해 주세요. 확인까지 1~2일 걸릴 수 있어요."

// 복사 버튼: 휴대폰에서 가로 꽉(fullWidth="mobile") + 누름 영역 44px·글자 16px, sm 이상은 내용 폭
const MOBILE_TAP = "[&>button]:h-11 [&>button]:text-base"

function Body({ bank, amount, showNote }: { bank: BillingBankInfo; amount?: string | number | null; showNote: boolean }) {
  const amountDigits = toNumber(amount ?? null)
  return (
    <div className="space-y-3">
      {bank.account ? (
        <dl className="space-y-1 text-base">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <dt className="w-[4.25rem] shrink-0 text-text-secondary">입금 계좌</dt>
            <dd className="min-w-0 text-dark [word-break:keep-all]">
              {bank.bank} <span className="whitespace-nowrap font-semibold tabular-nums">{bank.account}</span>
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <dt className="w-[4.25rem] shrink-0 text-text-secondary">예금주</dt>
            <dd className="min-w-0 text-dark [word-break:keep-all]">{bank.holder}</dd>
          </div>
        </dl>
      ) : (
        <div className="text-base">
          <p className="text-text-secondary">입금 계좌</p>
          <p className="whitespace-pre-line text-dark [word-break:keep-all]">{bank.text}</p>
        </div>
      )}
      {(bank.account || amountDigits !== null) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {bank.account && (
            <CopyButton
              value={bank.account}
              label="계좌번호 복사"
              successMessage="계좌번호를 복사했어요"
              variant="default"
              size="lg"
              fullWidth="mobile"
              className={MOBILE_TAP}
            />
          )}
          {amountDigits !== null && amountDigits > 0 && (
            <CopyButton
              value={String(Math.round(amountDigits))}
              label="금액 복사"
              successMessage="금액을 복사했어요"
              variant="outline"
              size="lg"
              fullWidth="mobile"
              className={MOBILE_TAP}
            />
          )}
        </div>
      )}
      {showNote && <p className="text-sm leading-relaxed text-text-secondary [word-break:keep-all]">{PAYMENT_NOTE}</p>}
    </div>
  )
}

export function PaymentBox({
  bank,
  amount = null,
  showNote = true,
  collapsible = false,
  defaultOpen = true,
  className,
}: {
  bank: BillingBankInfo
  /** 있으면 [금액 복사](숫자만)를 함께 보인다 */
  amount?: string | number | null
  showNote?: boolean
  /** 접을 수 있게(납부 완료 청구서) */
  collapsible?: boolean
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (!collapsible) {
    return (
      <div className={className}>
        <Body bank={bank} amount={amount} showNote={showNote} />
      </div>
    )
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger className="inline-flex min-h-11 items-center gap-1.5 text-base font-medium text-link underline underline-offset-2 hover:text-dark">
        입금 계좌 보기
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <Body bank={bank} amount={amount} showNote={showNote} />
      </CollapsibleContent>
    </Collapsible>
  )
}
