import { getPortalSession } from "@/lib/auth"
import { ChangePasswordForm } from "@/components/portal/change-password-form"

export default async function PortalSettingsPage() {
  const session = await getPortalSession()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">설정</h1>
        <p className="mt-1 text-sm text-text-secondary">계정 설정을 관리합니다</p>
      </div>

      <ChangePasswordForm mustChange={session?.must_change_password ?? false} />
    </div>
  )
}
