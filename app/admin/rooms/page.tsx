import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getSupportContact } from "@/lib/runtime-flags"
import { PageHeader } from "@/components/saas"
import { ROOMS_HELP } from "@/lib/help/rooms"
import { RoomsBoard } from "@/components/admin/rooms-board"

// 호실 현황(계획서 4.3.1~4.3.4). 주소: ?state=occupied|leaving|vacant|unavailable · ?q= · ?room=호실코드 · ?action=movein|moveout
// 입주·퇴실·호실 상태는 이 화면의 호실 시트 한 곳에서만 처리한다(4.3 정보 구조 결정).
export default async function AdminRoomsPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")
  return (
    <div className="px-4 py-5 sm:p-6 lg:p-8">
      <PageHeader
        title="호실 현황"
        description="입주·공실·퇴실 예정을 한눈에 보고, 입주·퇴실을 처리해요"
        help={ROOMS_HELP}
        helpContact={getSupportContact()}
      />
      <RoomsBoard />
    </div>
  )
}
