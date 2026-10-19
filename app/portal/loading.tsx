// 포털 범용 로딩 골격(WP8, 계획서 4.1.5). 자식 경로(로그인·메신저 등)에도 뜨므로 화면 모양을 흉내 내지 않는다: 제목 한 줄 + 카드 골격.
import { CardSkeleton } from "@/components/saas"

export default function PortalLoading() {
  return (
    <div>
      {/* 영문 머리말 줄 자리(PageHeader eyebrow) */}
      <div aria-hidden className="mb-2.5 mt-1 h-3 w-24 rounded-sm bg-warm-beige/70" />
      <div aria-hidden className="mb-6 h-7 w-48 rounded-sm bg-warm-beige" />
      <CardSkeleton lines={4} label="화면을 불러오는 중…" />
    </div>
  )
}
