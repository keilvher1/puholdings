import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { Messenger } from "@/components/messenger/messenger"

// 사내 메신저(관리자 = 정회원). 관리자 레이아웃 안에서 화면 높이를 꽉 채운다
// (높이는 Messenger variant="admin"이 정한다: 모바일은 상단 바 h-14 제외, 데스크톱은 전체).
export const metadata: Metadata = { title: "메신저 | 포항연합기술지주" }

export default async function AdminMessengerPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  return <Messenger variant="admin" />
}
