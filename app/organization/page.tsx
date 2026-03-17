import { Navbar } from "@/components/sections/navbar"
import { OrganizationSection } from "@/components/sections/organization-section"
import { Footer } from "@/components/sections/footer"

export const metadata = {
  title: "조직 | 포항연합기술지주",
  description: "포항연합기술지주의 조직도, 구성원, 우수기술, 협력기관을 소개합니다.",
}

export default function OrganizationPage() {
  return (
    <main className="overflow-x-hidden">
      <Navbar />
      {/* Page Header */}
      <section className="bg-dark pt-32 pb-16 lg:pt-40 lg:pb-20">
        <div className="mx-auto max-w-7xl px-8 lg:px-12">
          <div className="mb-6 flex items-center gap-4">
            <div className="editorial-rule bg-gold" />
            <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
              ORGANIZATION
            </span>
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-primary-foreground lg:text-6xl">
            조직
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-tertiary">
            포항연합기술지주의 조직 구조와 구성원, 우수기술 및 협력기관을 소개합니다.
          </p>
        </div>
      </section>
      <OrganizationSection />
      <Footer />
    </main>
  )
}
