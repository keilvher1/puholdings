import { PageHeader } from "@/components/saas"
import { RoomsBoardSkeleton } from "@/components/admin/rooms/board-skeleton"
import { adminEyebrow } from "@/lib/help/shell"

// 호실 현황 로딩 경계 — 머리(실제 화면과 같은 PageHeader, 도움말 버튼만 뺌) + 타일 모양 골격(움직임 없음).
export default function AdminRoomsLoading() {
  return (
    <div className="px-4 py-5 sm:p-6 lg:p-8">
      <PageHeader
        title="호실 현황"
        eyebrow={adminEyebrow("rooms")}
        description="입주·공실·퇴실 예정을 한눈에 보고, 입주·퇴실을 처리해요"
      />
      <RoomsBoardSkeleton />
    </div>
  )
}
