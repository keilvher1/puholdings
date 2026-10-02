// 관리비 정산 > 기준 정보 본문 — 실제 구현은 components/admin/billing/settings/로 옮겼다(계획서 7.4: 큰 컴포넌트는 새 폴더로 나누고
// 원래 파일은 같은 export를 다시 내보내는 얇은 파일로 남긴다). 이 경로를 import하던 곳은 그대로 동작한다.
export { BillingSettings, type BillingSettingsProps } from "./billing/settings/billing-settings"
