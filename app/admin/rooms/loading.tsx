import { RoomsBoardSkeleton } from "@/components/admin/rooms/board-skeleton"

// 호실 현황 로딩 경계 — 머리 + 타일 모양 골격(움직임 없음).
export default function AdminRoomsLoading() {
  return (
    <div className="px-4 py-5 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">호실 현황</h1>
        <p className="mt-1 text-base text-text-secondary">입주·공실·퇴실 예정을 한눈에 보고, 입주·퇴실을 처리해요</p>
      </div>
      <RoomsBoardSkeleton />
    </div>
  )
}
