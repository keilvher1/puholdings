"use client"

import { usePathname } from "next/navigation"
import { ScrollProgress } from "@/components/magicui/scroll-progress"

// 라우트 이동마다 리마운트되어 페이지 전환(커튼 와이프 + 블러 상승)을 재생한다.
// 관리자·포털은 업무 화면이므로 전환 연출과 진행바를 적용하지 않는다.
//
// 커튼·진행바는 .page-in "밖"에 두어야 한다: page-in의 filter 애니메이션이
// containing block을 만들어 내부 fixed 요소가 뷰포트가 아닌 페이지 전체 기준으로 잡히기 때문.
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // /services(통합 서비스 포털)도 업무용 입구라 전환 연출을 붙이지 않는다.
  // 홈(/)은 리뉴얼 시안을 그대로 옮긴 화면이라 시안에 없는 연출(커튼·진행바·page-in)을 빼고,
  // 시안의 position:absolute 헤더가 뷰포트 기준으로 잡히도록 감싸는 요소도 두지 않는다.
  const isBare =
    pathname === "/" || pathname.startsWith("/admin") || pathname.startsWith("/portal") || pathname.startsWith("/services")

  if (isBare) return <>{children}</>

  return (
    <>
      {/* 시네마틱 전환: 다크 → 골드 더블 커튼이 걷히며 새 페이지 공개 */}
      <div className="route-veil" aria-hidden>
        <span className="route-veil-gold" />
        <span className="route-veil-dark" />
      </div>
      <ScrollProgress />
      <div className="page-in">{children}</div>
    </>
  )
}
