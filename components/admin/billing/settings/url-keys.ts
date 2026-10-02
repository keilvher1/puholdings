// 기준 정보 화면의 주소 값 기본값(탭 묶음과 계약 탭이 같은 키를 쓴다). 기본값과 같으면 주소에서 지운다.
//   status: 계약 상태 보기(active|ended|all), q: 기업·호실 검색, tenant: 그 기업 계약만(3.4),
//   rent·mgmt: 단가·기본값 탭의 "이 단가 쓰는 계약 보기"(화면 안에서만 쓰는 조건)
export const CONTRACT_FILTER_DEFAULTS = { status: "active", q: "", tenant: "", rent: "", mgmt: "" }

export type SettingsTab = "rates" | "contracts" | "rooms" | "data"
export const SETTINGS_TABS: readonly SettingsTab[] = ["rates", "contracts", "rooms", "data"]

/**
 * 주소 → 열 탭. tab이 맞는 값이면 그대로, 없거나 모르는 값이면 contract·tenant가 있을 때 계약 탭, 아니면 단가·기본값.
 * fill이 true면 주소에 tab=contracts를 채워야 한다(시트를 닫거나 기업 조건을 지워도 단가 탭으로 튀지 않게).
 *   resolveSettingsTab({ tab: "rates", contract: "14", tenant: "" }) → { tab: "contracts", fill: true }
 */
export function resolveSettingsTab(url: { tab: string; contract: string; tenant: string }): { tab: SettingsTab; fill: boolean } {
  const explicit = url.tab !== "rates" && (SETTINGS_TABS as readonly string[]).includes(url.tab)
  if (explicit) return { tab: url.tab as SettingsTab, fill: false }
  if (url.contract || url.tenant) return { tab: "contracts", fill: true }
  return { tab: "rates", fill: false }
}
