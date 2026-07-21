import { getSession, initAdminTable } from "@/lib/auth"
import { AdminSidebar, AdminMobileBar } from "@/components/admin/sidebar"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Initialize admin table on first load
  await initAdminTable()

  const session = await getSession()

  return (
    <div className="min-h-screen bg-warm-ivory">
      {session && <AdminSidebar user={session} />}
      {session && <AdminMobileBar user={session} />}
      <main className={session ? "md:ml-64" : ""}>{children}</main>
    </div>
  )
}
