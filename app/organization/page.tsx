import { Navbar } from "@/components/sections/navbar"
import { OrganizationSection, type OrgTeams } from "@/components/sections/organization-section"
import { SiteFooter } from "@/components/site-footer"
import { getContentItems } from "@/lib/site-content"

export const metadata = {
  title: "조직 | 포항연합기술지주",
  description: "포항연합기술지주의 조직도, 구성원, 우수기술, 협력기관을 소개합니다.",
}

interface MemberData {
  team: string
  name: string
  position: string
  role: string
  details: string[]
}
interface PartnerData {
  name: string
  logo_url: string
  description: string
}

const TEAM_KEYS: (keyof OrgTeams)[] = ["management", "strategy", "investment", "incubation", "venture"]

export default async function OrganizationPage() {
  const [memberItems, partnerItems] = await Promise.all([
    getContentItems<MemberData>("org_member"),
    getContentItems<PartnerData>("partner_org"),
  ])

  // 팀별로 그룹화; DB에 구성원이 없으면 undefined로 전달해 컴포넌트 기본값 사용
  let teams: OrgTeams | undefined
  if (memberItems.length > 0) {
    const empty: OrgTeams = { management: [], strategy: [], investment: [], incubation: [], venture: [] }
    for (const item of memberItems) {
      const key = item.data.team as keyof OrgTeams
      if (TEAM_KEYS.includes(key)) {
        empty[key].push({
          name: item.data.name,
          position: item.data.position,
          role: item.data.role,
          details: Array.isArray(item.data.details) ? item.data.details : [],
        })
      }
    }
    teams = empty
  }

  const partnerOrgs =
    partnerItems.length > 0
      ? partnerItems.map((p) => ({ name: p.data.name, logo: p.data.logo_url, description: p.data.description }))
      : undefined

  return (
    <main className="overflow-x-hidden">
      <Navbar />
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
      <OrganizationSection teams={teams} partnerOrgs={partnerOrgs} />
      <SiteFooter />
    </main>
  )
}
