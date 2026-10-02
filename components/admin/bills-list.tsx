// 예전 청구서 목록 컴포넌트 자리 — 청구서 화면은 components/admin/billing/bills/로 옮겼다(WP7).
// 다른 곳의 import가 깨지지 않게 같은 이름(BillsList)을 다시 내보낸다. 새 코드는 BillsScreen을 직접 쓴다.
"use client"

import { BillsScreen } from "@/components/admin/billing/bills/bills-screen"
import { DEFAULT_BANK_TEXT, parseBankText } from "@/lib/bank-info"

/** @deprecated BillsScreen을 쓴다. 계좌는 기본값(서버 env를 읽지 못함), 메일은 꺼짐으로 본다 */
export function BillsList() {
  return <BillsScreen bank={{ text: DEFAULT_BANK_TEXT, ...parseBankText(DEFAULT_BANK_TEXT) }} phone={null} mailEnabled={false} />
}
