// 관리자·포털 셸(사이드바·모바일 바·포털 상단 바·하단 탭)의 메뉴 정의와 화면 이름 — WP0b(계획서 3.1·3.3).
// 아이콘은 부품(components/admin/sidebar.tsx, components/portal/nav.tsx·bottom-tabs.tsx)이 key로 고른다.
// 여기에는 순수 데이터·순수 함수만 둔다(서버·클라이언트 어디서든 import 가능, 단위 테스트 가능).
//
// 사용 예:
//   import { ADMIN_NAV, adminScreenName, isActiveHref } from "@/lib/help/shell"
//   adminScreenName("/admin/billing/bills")   // "관리비 정산 · 청구서"
//   isActiveHref("/admin/news/3", "/admin/news") // true

import type { HelpTopic } from "./types"

/** 사이드바 배지 키(lib/admin-todo.ts의 SidebarBadges 키와 같다) */
export type AdminBadgeKey = "homeTotal" | "billing" | "expenses" | "rooms" | "programs" | "inquiries" | "emails"

export type AdminNavKey =
  | "home"
  | "billing"
  | "expenses"
  | "rooms"
  | "tenants"
  | "programs"
  | "messenger"
  | "inquiries"
  | "emails"
  | "site"
  | "news"
  | "popups"
  | "portfolio"
  | "stats"

export interface AdminNavItem {
  key: AdminNavKey
  href: string
  label: string
  /** 이름이 바뀐 메뉴의 옛 이름(다음 라운드까지 툴팁으로 보인다) */
  oldName?: string
  /** 건수 배지 */
  badge?: AdminBadgeKey
}

export interface AdminNavGroup {
  key: "monthly" | "tenants" | "talk" | "site"
  /** 그룹 제목(13px) */
  label: string
  /** true면 접을 수 있는 그룹(기본 접힘) */
  collapsible?: boolean
  items: AdminNavItem[]
}

/** 맨 위 "홈" 한 줄(그룹 밖) */
export const ADMIN_HOME_ITEM: AdminNavItem = {
  key: "home",
  href: "/admin",
  label: "홈",
  oldName: "대시보드",
  badge: "homeTotal",
}

/** 업무 빈도순: 매달 하는 일 → 입주기업·호실 → 소통 → 홈페이지(접힘). 경로는 모두 그대로다(계획서 7.1). */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    key: "monthly",
    label: "매달 하는 일",
    items: [
      { key: "billing", href: "/admin/billing", label: "관리비 정산", badge: "billing" },
      { key: "expenses", href: "/admin/expenses", label: "증빙 처리", oldName: "사업비 정산", badge: "expenses" },
    ],
  },
  {
    key: "tenants",
    label: "입주기업·호실",
    items: [
      { key: "rooms", href: "/admin/rooms", label: "호실 현황", badge: "rooms" },
      { key: "tenants", href: "/admin/tenants", label: "입주기업" },
      { key: "programs", href: "/admin/programs", label: "프로그램", badge: "programs" },
    ],
  },
  {
    key: "talk",
    label: "소통",
    items: [
      { key: "messenger", href: "/admin/messenger", label: "메신저" },
      { key: "inquiries", href: "/admin/inquiries", label: "문의", oldName: "문의 관리", badge: "inquiries" },
      { key: "emails", href: "/admin/emails", label: "메일", badge: "emails" },
    ],
  },
  {
    key: "site",
    label: "홈페이지",
    collapsible: true,
    items: [
      { key: "site", href: "/admin/site", label: "사이트 콘텐츠" },
      { key: "news", href: "/admin/news", label: "최신 소식" },
      { key: "popups", href: "/admin/popups", label: "팝업" },
      { key: "portfolio", href: "/admin/portfolio", label: "포트폴리오" },
      { key: "stats", href: "/admin/stats", label: "통계" },
    ],
  },
]

/** 배지의 화면 읽기용 문장 */
export function adminBadgeSrLabel(key: AdminBadgeKey, count: number): string {
  switch (key) {
    case "homeTotal":
      return `오늘 할 일 ${count}건`
    case "billing":
      // billing 배지 = receivable.late(기한 지남 + 기한 없이 발행 후 31일 넘음) + 정정 중 — 홈 할 일 줄과 같은 말
      return `기한 지남·발행 후 31일 넘음·정정 중 청구서 ${count}건`
    case "expenses":
      return `확인할 증빙 ${count}건`
    case "rooms":
      return `퇴실 예정 ${count}곳`
    case "programs":
      return `검토할 제출물 ${count}건`
    case "inquiries":
      return `새 문의 ${count}건`
    case "emails":
      return `보내지 못한 메일 ${count}건`
  }
}

/** 메뉴 활성 판정. "/admin"·"/portal" 같은 영역 첫 화면은 정확히 같을 때만 */
export function isActiveHref(pathname: string, href: string): boolean {
  if (href === "/admin" || href === "/portal") return pathname === href || pathname === `${href}/`
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** 하위 탭이 있는 메뉴의 하위 화면 이름(하위 탭 이름과 같다 — billing-nav.tsx·expenses-nav.tsx) */
const ADMIN_SUB_SCREENS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/admin/billing", label: "월 마감", exact: true },
  { href: "/admin/billing/bills", label: "청구서" },
  { href: "/admin/billing/settings", label: "기준 정보" },
  { href: "/admin/expenses", label: "증빙 올리기", exact: true },
  { href: "/admin/expenses/receipts", label: "증빙 내역" },
  { href: "/admin/expenses/projects", label: "사업·프로젝트" },
  { href: "/admin/expenses/desktop", label: "데스크톱 앱 설치" },
  { href: "/admin/emails/templates", label: "템플릿" },
]

/** 지금 화면이 속한 메뉴(그룹 정보 포함). 없으면 null */
export function findAdminNav(pathname: string): { group: AdminNavGroup | null; item: AdminNavItem } | null {
  if (isActiveHref(pathname, ADMIN_HOME_ITEM.href)) return { group: null, item: ADMIN_HOME_ITEM }
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      if (isActiveHref(pathname, item.href)) return { group, item }
    }
  }
  return null
}

/** 1024px 미만 상단 바에 보일 현재 화면 이름. 예: "관리비 정산 · 청구서". 모르는 경로는 "관리자" */
export function adminScreenName(pathname: string): string {
  const found = findAdminNav(pathname)
  if (!found) return "관리자"
  const sub = ADMIN_SUB_SCREENS.find((s) =>
    s.exact ? pathname === s.href || pathname === `${s.href}/` : isActiveHref(pathname, s.href),
  )
  return sub ? `${found.item.label} · ${sub.label}` : found.item.label
}

// ── 포털 ─────────────────────────────────────────────────────────────────────

export type PortalNavKey = "home" | "bills" | "programs" | "messenger" | "account"

export interface PortalNavItem {
  key: PortalNavKey
  href: string
  label: string
}

/** 포털 메뉴 5개(상단 바·하단 탭 공통, 계획서 3.3) */
export const PORTAL_NAV: PortalNavItem[] = [
  { key: "home", href: "/portal", label: "홈" },
  { key: "bills", href: "/portal/bills", label: "청구서" },
  { key: "programs", href: "/portal/programs", label: "프로그램" },
  { key: "messenger", href: "/portal/messenger", label: "메신저" },
  { key: "account", href: "/portal/settings", label: "계정" },
]

/** 전화 링크(tel:)용 숫자만 남긴 번호. "054-279-8710" → "0542798710" */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, "")}`
}

/** 하단 탭을 숨길 입력 대상인지(휴대폰 키보드가 열리는 칸) */
export function opensKeyboard(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el || !el.tagName) return false
  const tag = el.tagName.toUpperCase()
  if (tag === "TEXTAREA") return true
  if (el.isContentEditable) return true
  if (tag !== "INPUT") return false
  const type = (el.type || "text").toLowerCase()
  return !["checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "image", "hidden"].includes(type)
}

// ── 도움말 ───────────────────────────────────────────────────────────────────

/** 관리자 메뉴 안내(바뀐 이름 포함). 홈 화면(WP1)의 PageHeader help나 Callout이 쓸 수 있다 */
export const ADMIN_MENU_HELP: HelpTopic = {
  title: "관리자 메뉴",
  steps: [
    "메뉴는 자주 하는 일 순서예요. 매달 하는 일 → 입주기업·호실 → 소통 → 홈페이지",
    "메뉴 옆 숫자는 처리할 일 건수예요. 처리하면 숫자가 줄어요",
    "‘대시보드’는 ‘홈’, ‘사업비 정산’은 ‘증빙 처리’, ‘문의 관리’는 ‘문의’로 이름이 바뀌었어요. 주소는 그대로예요",
    "홈페이지 메뉴(사이트 콘텐츠·최신 소식·팝업·포트폴리오·통계)는 접혀 있어요. 눌러서 펼쳐요",
    "로그아웃과 홈페이지 보기는 맨 아래 이름을 누르면 나와요",
  ],
  terms: ["home", "expenses"],
}
