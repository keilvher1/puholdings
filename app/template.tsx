"use client"

import { usePathname } from "next/navigation"
import { ScrollProgress } from "@/components/magicui/scroll-progress"

// 라우트 이동마다 리마운트되어 페이지 전환(블러+상승)을 재생한다.
// 관리자·포털은 업무 화면이므로 전환 연출과 진행바를 적용하지 않는다.
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isApp = pathname.startsWith("/admin") || pathname.startsWith("/portal")

  if (isApp) return <>{children}</>

  return (
    <div className="page-in">
      <ScrollProgress />
      {children}
    </div>
  )
}
