import { redirect } from "next/navigation"
import { getSession, initAdminTable } from "@/lib/auth"
import { AdminSidebar } from "@/components/admin/sidebar"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Initialize admin table on first load
  await initAdminTable()
  
  const session = await getSession()
  
  // Check if this is the login or setup page
  const isAuthPage = false // Will be handled by specific pages

  return (
    <div className="flex min-h-screen bg-warm-ivory">
      {session && <AdminSidebar user={session} />}
      <main className={session ? "flex-1 ml-64" : "flex-1"}>
        {children}
      </main>
    </div>
  )
}
