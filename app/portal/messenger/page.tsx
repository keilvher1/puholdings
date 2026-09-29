import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getPortalSession } from "@/lib/auth"
import { Messenger } from "@/components/messenger/messenger"

// 입주기업 포털 메신저(게스트). 초대받은 토픽·대화방만 보인다.
// 포털 레이아웃의 본문 폭(max-w-5xl)으로는 3단 화면이 좁아서, 상단 내비(h-16) 아래를 가득 채우도록 고정 배치한다.
export const metadata: Metadata = { title: "메신저 | 입주기업 포털" }

export default async function PortalMessengerPage() {
  const session = await getPortalSession()
  if (!session) redirect("/portal/login")

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-30 overflow-hidden bg-warm-ivory">
      <Messenger variant="portal" className="h-full min-h-0 rounded-none border-0" />
    </div>
  )
}
