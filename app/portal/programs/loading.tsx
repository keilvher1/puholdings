// 포털 프로그램 로딩 골격(WP8) — 제목 + 묶음 카드 2개. 움직임 없음.
import { CardSkeleton } from "@/components/saas"

export default function PortalProgramsLoading() {
  return (
    <div>
      <div aria-hidden className="mb-6 h-7 w-32 rounded-sm bg-warm-beige" />
      <div className="space-y-4">
        <CardSkeleton lines={3} label="프로그램을 불러오는 중…" />
        <CardSkeleton lines={2} label="" />
      </div>
    </div>
  )
}
