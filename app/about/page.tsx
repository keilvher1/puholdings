import { Navbar } from "@/components/sections/navbar"
import { PhilosophySection } from "@/components/sections/philosophy-section"
import { AboutSection } from "@/components/sections/about-section"
import { CoreFunctionsSection, type CoreActivities } from "@/components/sections/core-functions-section"
import { EcosystemSection } from "@/components/sections/ecosystem-section"
import { HistorySection } from "@/components/sections/history-section"
import { SiteFooter } from "@/components/site-footer"
import { getContentItems, getSiteContent } from "@/lib/site-content"

export const metadata = {
  title: "회사소개 | 포항연합기술지주",
  description: "포항연합기술지주의 투자철학, 비전, 연혁을 소개합니다.",
}

interface HistoryData {
  year: number
  date: string
  text: string
}
interface ActivityData {
  group: string
  text: string
}

export default async function AboutPage() {
  const [historyItems, activityItems, intro] = await Promise.all([
    getContentItems<HistoryData>("history"),
    getContentItems<ActivityData>("core_activity"),
    getSiteContent<{ paragraphs: string[] }>("core_functions_intro"),
  ])

  // 연혁을 연도별로 그룹화 (DB 없으면 undefined → 컴포넌트 기본값)
  let historyGroups: { year: number; items: { date: string; text: string }[] }[] | undefined
  if (historyItems.length > 0) {
    const byYear = new Map<number, { date: string; text: string }[]>()
    for (const item of historyItems) {
      const year = Number(item.data.year)
      if (!byYear.has(year)) byYear.set(year, [])
      byYear.get(year)!.push({ date: item.data.date, text: item.data.text })
    }
    historyGroups = [...byYear.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, items]) => ({ year, items }))
  }

  // 운영도 활동 그룹화
  let activities: CoreActivities | undefined
  if (activityItems.length > 0) {
    const grouped: CoreActivities = { handong: [], puholdings: [], external: [] }
    for (const item of activityItems) {
      const g = item.data.group as keyof CoreActivities
      if (g in grouped) grouped[g].push(item.data.text)
    }
    activities = grouped
  }

  return (
    <main className="overflow-x-hidden">
      <Navbar />
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
      <CoreFunctionsSection activities={activities} intro={intro?.paragraphs} />
      <EcosystemSection />
      <HistorySection groups={historyGroups} />
      <SiteFooter />
    </main>
  )
}
