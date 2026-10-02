"use client"

// 입주기업 화면 — 실제 구현은 components/admin/tenants/ 아래로 옮겼다(WP5a). 예전 import 경로를 위해 같은 이름을 다시 내보낸다.
//   import { TenantsManager } from "@/components/admin/tenants-manager"

import { DEFAULT_BANK_TEXT, parseBankText } from "@/lib/bank-info"
import { TenantsPage, type TenantsPageProps } from "./tenants/tenants-page"

export type { TenantsPageProps }
export { TenantsPage }

/** props를 넘기지 않으면 메일 꺼짐·기본 계좌로 그린다(서버 값은 app/admin/tenants/page.tsx가 넘긴다) */
export function TenantsManager(props: Partial<TenantsPageProps>) {
  return (
    <TenantsPage
      mailEnabled={props.mailEnabled ?? false}
      bank={props.bank ?? { text: DEFAULT_BANK_TEXT, ...parseBankText(DEFAULT_BANK_TEXT) }}
      contactPhone={props.contactPhone ?? null}
      supportContact={props.supportContact ?? null}
    />
  )
}
