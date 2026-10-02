import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { getAdminTodo, sidebarBadges, type SidebarBadges } from "@/lib/admin-todo"
import { AdminShellFrame } from "@/components/admin/admin-shell"

// 관리자 셸 레이아웃(WP0a). 사이드바·모바일 바 자체는 components/admin/sidebar.tsx(WP0b).
// - AppProviders(확인창·토스트·툴팁)를 세션이 있는 분기와 없는 분기(로그인·최초 설정 화면) 모두에 감싼다(AdminShellFrame 안).
// - .app-shell(포커스 규칙), 맨 앞 "본문 바로가기", <main id="main">, 고정 사이드바는 lg(1024px) 이상, 인쇄 때 여백 없음.
// - 세션이 있을 때만 getAdminTodo()를 1회 조회해 사이드바 배지로 넘긴다(React cache — 같은 요청의 홈·하위 탭은 다시 조회하지 않는다).
//   조회가 실패하면 배지만 숨기고 메뉴는 정상으로 그린다.
// prop 계약: <AdminSidebar user badges={SidebarBadges | null} /> · <AdminMobileBar user badges={SidebarBadges | null} />
//
// 하이드레이션 구조(X1) — 간헐 "attributes didn't match"(Radix aria-controls·id가 서버와 다름) 방지:
// - 레이아웃 함수는 동기로 두고 .app-shell 틀과 display: contents 감싸개를 바로 그린다.
// - 세션·배지를 읽는 비동기 부분(AdminShell)과 셸의 클라이언트 부품(AdminShellFrame 한 덩어리)은 감싸개 안 "형제 없는 자리"에 둔다.
//   비동기 결과·클라이언트 JS 조각은 하이드레이션 시작 때 아직 없을 수 있는데, 그것이 형제 배열 안에 있으면 React가 배열의
//   부모를 다시 그리며 그 아래 useId를 모두 바꿔 버린다(자세한 설명: components/admin/admin-shell.tsx).
// - 그래서 이 파일에 클라이언트 컴포넌트를 형제로 더하지 않는다. 셸에 부품을 더할 때는 admin-shell.tsx에 넣는다.

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell min-h-screen bg-warm-ivory">
      <div className="contents">
        <AdminShell>{children}</AdminShell>
      </div>
    </div>
  )
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  // admins 테이블 생성은 scripts/migrations/2026-saas-08-admins.sql 로 옮겼다.
  // (예전에는 관리자 페이지를 열 때마다 CREATE TABLE이 돌았다. 최초 설치는 /api/admin/setup이 처리한다.)
  const session = await getSession()
  if (!session) return <AdminShellFrame user={null}>{children}</AdminShellFrame>

  let badges: SidebarBadges | null = null
  const sql = getDb()
  if (sql) {
    try {
      badges = sidebarBadges(await getAdminTodo(sql))
    } catch (error) {
      console.error("Admin layout badge lookup error:", error)
    }
  }
  return (
    <AdminShellFrame user={session} badges={badges}>
      {children}
    </AdminShellFrame>
  )
}
