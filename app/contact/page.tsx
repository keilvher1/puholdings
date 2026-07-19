import { Navbar } from "@/components/sections/navbar"
import { ContactSection } from "@/components/sections/contact-section"
import { SiteFooter } from "@/components/site-footer"

export const metadata = {
  title: "문의 | 포항연합기술지주",
  description: "포항연합기술지주에 투자 문의, 제휴 제안 등 문의하세요.",
}

export default function ContactPage() {
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
        </div>
      </section>
      <ContactSection />
      <SiteFooter />
    </main>
  )
}
