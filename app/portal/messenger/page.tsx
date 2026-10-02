import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getPortalSession } from "@/lib/auth"
import { Messenger } from "@/components/messenger/messenger"

// 입주기업 포털 메신저(게스트). 초대받은 토픽·대화방만 보인다.
// 포털 레이아웃의 본문 폭(max-w-5xl)으로는 3단 화면이 좁아서, 상단 바 아래를 가득 채우도록 고정 배치한다.
// 위치: 상단 바(휴대폰 h-14, 640px 이상 h-16, + 아래 테두리 1px) 아래 ~ 휴대폰 하단 탭(56px + 위 테두리 1px + safe-area) 위.
// 입력칸 포커스로 하단 탭이 숨으면(<html data-portal-tabs="hidden">, bottom-tabs.tsx) 아래 끝을 화면 끝까지 내린다.
export const metadata: Metadata = { title: "메신저" }

export default async function PortalMessengerPage() {
  const session = await getPortalSession()
  if (!session) redirect("/portal/login")

  return (
    <div className="fixed inset-x-0 top-[calc(3.5rem+1px)] bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-30 overflow-hidden bg-warm-ivory sm:top-[calc(4rem+1px)] sm:bottom-0 [[data-portal-tabs=hidden]_&]:bottom-0">
      <Messenger variant="portal" className="h-full min-h-0 rounded-none border-0" />
    </div>
  )
}
