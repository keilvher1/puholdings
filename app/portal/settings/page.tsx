import type { Metadata } from "next"
import Link from "next/link"
import { getPortalSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { PageHeader, Section } from "@/components/saas"
import { ChangePasswordForm } from "@/components/portal/change-password-form"
import { PortalLogoutButton } from "@/components/portal/screens/settings"
import { getPortalCompany, getPortalContactPhone, type PortalCompanyInfo } from "@/components/portal/screens/portal-data"

// 포털 계정(WP8, 계획서 4.5.8). 한 열 카드 4개: 내 계정 · 비밀번호 바꾸기 · 회사 정보(읽기 전용, 세션 tenant_id) · 도움·로그아웃.
// 임시 비밀번호 상태(must_change_password)면 메뉴 없는 화면에 "비밀번호를 새로 정해 주세요"만.

export async function generateMetadata(): Promise<Metadata> {
  const session = await getPortalSession()
  return { title: session?.must_change_password ? "비밀번호 정하기" : "계정" }
}

function tel(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[15px] text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-base break-words text-dark">{children}</dd>
    </div>
  )
}

export default async function PortalSettingsPage() {
  const session = await getPortalSession()
  if (!session) return null
  const phone = await getPortalContactPhone()

  if (session.must_change_password) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="비밀번호를 새로 정해 주세요" description="센터에서 받은 임시 비밀번호를 넣고, 앞으로 쓸 비밀번호를 정하면 끝나요" />
        <Section>
          <ChangePasswordForm mustChange />
        </Section>
        {/* 로그아웃은 상단 바(임시 비밀번호 상태에서 늘 보임)에만 둔다 */}
        <p className="mt-4 text-[15px] text-text-secondary">
          도움이 필요하면{" "}
          <a href={tel(phone)} className="whitespace-nowrap text-link underline underline-offset-2 hover:text-dark">
            {phone}
          </a>
        </p>
      </div>
    )
  }

  const sql = getDb()
  let company: PortalCompanyInfo | null = null
  if (sql) {
    try {
      company = await getPortalCompany(sql, session.tenant_id)
    } catch (error) {
      console.error("Portal settings company error:", error)
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="계정" description="로그인 정보와 회사 정보를 확인해요" />
      <div className="space-y-4">
        <Section title="내 계정">
          <dl className="divide-y divide-warm-tan">
            <Row label="이름">{session.name || "-"}</Row>
            <Row label="로그인 이메일">{session.email}</Row>
          </dl>
        </Section>

        <Section title="비밀번호 바꾸기">
          <ChangePasswordForm mustChange={false} />
        </Section>

        <Section title="회사 정보" description="바뀐 내용이 있으면 센터에 알려 주세요.">
          {company ? (
            <dl className="divide-y divide-warm-tan">
              <Row label="회사명">{company.name || "-"}</Row>
              <Row label="호실">{company.rooms.length > 0 ? company.rooms.map((r) => `${r}호`).join(", ") : "-"}</Row>
              <Row label="청구서 받을 메일">{company.billEmail ?? "등록되지 않았어요"}</Row>
            </dl>
          ) : (
            <p role="alert" className="text-base text-red-800">
              회사 정보를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.
            </p>
          )}
          <p className="mt-2 text-[15px] text-text-secondary">
            고칠 곳은{" "}
            <a href={tel(phone)} className="whitespace-nowrap text-link underline underline-offset-2 hover:text-dark">
              {phone}
            </a>
            으로 알려 주세요.
          </p>
        </Section>

        <Section title="도움·로그아웃">
          <p className="text-base text-dark [word-break:keep-all]">
            궁금한 점은 창업보육센터{" "}
            <a href={tel(phone)} className="whitespace-nowrap text-link underline underline-offset-2 hover:text-dark">
              {phone}
            </a>{" "}
            또는{" "}
            <Link href="/portal/messenger" className="text-link underline underline-offset-2 hover:text-dark">
              메신저
            </Link>
            로 물어봐 주세요.
          </p>
          <PortalLogoutButton className="mt-3 h-11 w-full text-base hover:bg-warm-beige hover:text-dark sm:w-auto" />
        </Section>
      </div>
    </div>
  )
}
