import { getSession } from "@/lib/auth"
import { AdminSidebar, AdminMobileBar } from "@/components/admin/sidebar"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // admins 테이블 생성은 scripts/migrations/2026-saas-08-admins.sql 로 옮겼다.
  // (예전에는 관리자 페이지를 열 때마다 CREATE TABLE이 돌았다. 최초 설치는 /api/admin/setup이 처리한다.)
  const session = await getSession()

  return (
    <div className="min-h-screen bg-warm-ivory">
      {session && <AdminSidebar user={session} />}
      {session && <AdminMobileBar user={session} />}
      <main className={session ? "md:ml-64" : ""}>{children}</main>
    </div>
  )
}
