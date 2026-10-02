// 증빙 처리 하위 탭(증빙 올리기 · 증빙 내역 · 사업·프로젝트 · 데스크톱 앱 설치) — 공통 SubNav로 다시 만들었다(export 이름 ExpensesNav 유지).
// "증빙 올리기" 탭에 데스크톱 앱에서 온 확인 필요 건수를 붙인다(예: "증빙 올리기 6").
//
// ExpensesNav는 서버 컴포넌트다. inboxCount를 넘기지 않으면 같은 요청에서 레이아웃이 이미 조회한 getAdminTodo()(React cache)에서
// 건수를 읽는다(추가 DB 조회 없음, 실패하면 건수 없이 그린다). 클라이언트 컴포넌트 안에서는
// <SubNav label="증빙 처리 메뉴" items={expensesNavItems(count)} />를 쓴다.
//
// 사용 예(서버 page.tsx):
//   <ExpensesNav />
//   <ExpensesNav inboxCount={pendingCount} />

import { SubNav, type SubNavItem } from "@/components/saas/page-header"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { getAdminTodo } from "@/lib/admin-todo"

export function expensesNavItems(inboxCount?: number | null): SubNavItem[] {
  return [
    { href: "/admin/expenses", label: "증빙 올리기", exact: true, count: inboxCount ?? null },
    { href: "/admin/expenses/receipts", label: "증빙 내역" },
    { href: "/admin/expenses/projects", label: "사업·프로젝트" },
    { href: "/admin/expenses/desktop", label: "데스크톱 앱 설치" },
  ]
}

async function cachedInboxCount(): Promise<number | null> {
  try {
    if (!(await getSession())) return null
    const sql = getDb()
    if (!sql) return null
    return (await getAdminTodo(sql)).expenseInbox.count
  } catch {
    return null
  }
}

export async function ExpensesNav({ inboxCount }: { inboxCount?: number | null } = {}) {
  const count = inboxCount === undefined ? await cachedInboxCount() : inboxCount
  return <SubNav label="증빙 처리 메뉴" items={expensesNavItems(count)} />
}
