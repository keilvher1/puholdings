import { getPortalSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { PortalNav } from "@/components/portal/nav"

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getPortalSession()

  // 세션이 없으면 로그인 페이지 등 비인증 화면 (접근 제어는 middleware가 담당)
  if (!session) {
    return <div className="min-h-screen bg-warm-ivory">{children}</div>
  }

  let tenantName = ""
  const sql = getDb()
  if (sql) {
    try {
      const rows = await sql`SELECT name FROM tenants WHERE id = ${session.tenant_id}`
      tenantName = rows[0]?.name ?? ""
    } catch (error) {
      console.error("Portal layout tenant lookup error:", error)
    }
  }

  return (
    <div className="min-h-screen bg-warm-ivory">
      <PortalNav tenantName={tenantName} userName={session.name} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
    </div>
  )
}
