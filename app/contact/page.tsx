import { Navbar } from "@/components/sections/navbar"
import { ContactSection } from "@/components/sections/contact-section"
import { DirectionsSection } from "@/components/sections/directions-section"
import { SiteFooter } from "@/components/site-footer"
import { getSiteContent } from "@/lib/site-content"
import { ArrowDown } from "lucide-react"
import type { ContactInfo } from "@/components/sections/footer"

// 관리자 화면에서 고친 연락처·지도 좌표가 재배포 없이 반영되도록 동적 렌더(홈·포트폴리오와 동일).
export const dynamic = "force-dynamic"

// 정적 metadata는 DB 값을 쓸 수 없는 유일한 지점이다. 주소·건물이 바뀌면 여기도 함께 수정할 것.
export const metadata = {
  title: "문의 · 오시는 길 | 포항연합기술지주",
  description:
    "포항연합기술지주에 투자 문의, 제휴 제안 등 문의하세요. 한동대학교 캠퍼스 내 창업보육센터 위치와 오시는 길을 안내합니다.",
}

export default async function ContactPage() {
  const contact = await getSiteContent<ContactInfo>("contact")
  return (
    <main className="overflow-x-hidden">
      <Navbar />
      {/* Page Header */}
      <section className="bg-dark pt-32 pb-16 lg:pt-40 lg:pb-20">
        <div className="mx-auto max-w-7xl px-8 lg:px-12">
          <div className="mb-6 flex items-center gap-4">
            <div className="editorial-rule bg-gold" />
            <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
              CONTACT
            </span>
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-primary-foreground lg:text-6xl">
            문의
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-tertiary">
            투자 문의, 제휴 제안 등 궁금하신 사항이 있으시면 연락해 주세요.
          </p>
          {/* 길을 찾으러 온 방문자가 문의 폼 전체를 스크롤로 지나치지 않도록 하는 점프 링크 */}
          <a
            href="#directions"
            className="mt-8 inline-flex items-center gap-2 border-b border-gold/40 pb-1 text-xs font-medium tracking-[0.15em] text-gold transition-colors hover:border-gold"
          >
            오시는 길 보기
            <ArrowDown size={13} />
          </a>
        </div>
      </section>
      <ContactSection contact={contact ?? undefined} />
      <DirectionsSection contact={contact ?? undefined} />
      <SiteFooter />
    </main>
  )
}
