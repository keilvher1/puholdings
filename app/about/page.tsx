import { Navbar } from "@/components/sections/navbar"
import { PhilosophySection } from "@/components/sections/philosophy-section"
import { AboutSection } from "@/components/sections/about-section"
import { EcosystemSection } from "@/components/sections/ecosystem-section"
import { HistorySection } from "@/components/sections/history-section"
import { Footer } from "@/components/sections/footer"

export const metadata = {
  title: "회사소개 | 포항연합기술지주",
  description: "포항연합기술지주의 투자철학, 비전, 연혁을 소개합니다.",
}

export default function AboutPage() {
  return (
    <main className="overflow-x-hidden">
      <Navbar />
      {/* Page Header */}
      <section className="bg-dark pt-32 pb-16 lg:pt-40 lg:pb-20">
        <div className="mx-auto max-w-7xl px-8 lg:px-12">
          <div className="mb-6 flex items-center gap-4">
            <div className="editorial-rule bg-gold" />
            <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
              ABOUT US
            </span>
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-primary-foreground lg:text-6xl">
            회사소개
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-tertiary">
            포항연합기술지주의 투자철학과 비전, 그리고 지난 발자취를 소개합니다.
          </p>
        </div>
      </section>
      <PhilosophySection />
      <AboutSection />
      <EcosystemSection />
      <HistorySection />
      <Footer />
    </main>
  )
}
