import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { isMailEnabled, getSupportContact } from "@/lib/runtime-flags"
import { getBillingBankInfo } from "@/lib/bank-info"
import { getSiteContent } from "@/lib/site-content"
import { DEFAULT_CONTACT, type ContactInfo } from "@/components/sections/footer"
import { TenantsManager } from "@/components/admin/tenants-manager"

export const metadata: Metadata = { title: "입주기업" }

// 입주기업(WP5a). 메일 설정·입금 계좌·문의처는 서버에서 읽어 prop으로 넘긴다(클라이언트에는 env가 없다).
export default async function AdminTenantsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  let contactPhone: string | null = DEFAULT_CONTACT.phone
  try {
    const contact = await getSiteContent<ContactInfo>("contact")
    contactPhone = contact?.phone || DEFAULT_CONTACT.phone
  } catch {
    // 사이트 연락처를 못 읽어도 화면은 연다(공개 푸터 기본값)
  }

  return (
    <TenantsManager
      mailEnabled={isMailEnabled()}
      bank={getBillingBankInfo()}
      contactPhone={contactPhone}
      supportContact={getSupportContact()}
    />
  )
}
