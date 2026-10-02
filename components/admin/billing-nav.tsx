// 관리비 정산 하위 탭(월 마감 · 청구서 · 기준 정보) — 공통 SubNav로 다시 만들었다(export 이름 BillingNav 유지).
// 현재 탭에 aria-current="page". 서버·클라이언트 어디서든 쓸 수 있다(SubNav가 클라이언트 부품).
//
// 사용 예:
//   <BillingNav />
//   <BillingNav billsCount={badges?.billing} />                 // 청구서 탭에 건수(선택)
//   <SubNav label="관리비 정산 메뉴" items={billingNavItems({ billsCount: 4 })} />   // 클라이언트 컴포넌트 안에서 직접 그릴 때

import { SubNav, type SubNavItem } from "@/components/saas/page-header"

export function billingNavItems({ billsCount }: { billsCount?: number | null } = {}): SubNavItem[] {
  return [
    { href: "/admin/billing", label: "월 마감", exact: true },
    { href: "/admin/billing/bills", label: "청구서", count: billsCount ?? null },
    { href: "/admin/billing/settings", label: "기준 정보" },
  ]
}

export function BillingNav({ billsCount }: { billsCount?: number | null } = {}) {
  return <SubNav label="관리비 정산 메뉴" items={billingNavItems({ billsCount })} />
}
