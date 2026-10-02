import type { Metadata } from "next"
import { cookies } from "next/headers"
import { getPortalSession, verifyPortalToken } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { getSiteContent } from "@/lib/site-content"
import { RECEIVABLE_SQL } from "@/lib/receivables"
import { DEFAULT_CONTACT, type ContactInfo } from "@/components/sections/footer"
import { PortalShellFrame } from "@/components/portal/portal-shell"

// 입주기업 포털 셸 레이아웃(WP0a). 상단 바·하단 탭의 모양은 components/portal/nav.tsx·bottom-tabs.tsx(WP0b).
// - AppProviders를 세션 있는/없는(로그인 화면) 분기 모두에 감싼다(PortalShellFrame 안). 루트에 .app-shell.
// - 탭 제목은 "%s · 입주기업 포털"(화면별 제목은 WP8이 서버 page.tsx metadata로).
// - 무효 세션(토큰 서명은 유효하지만 계정 삭제·기업 퇴실 등으로 세션이 거절됨)이면 안내 화면.
//   [로그인 화면으로]는 POST /api/portal/logout으로 쿠키를 지운 뒤 /portal/login?next=로 간다(되돌림 고리 방지).
// - 임시 비밀번호 상태(must_change_password)는 restricted로 넘겨 메뉴·탭을 숨기게 한다.
// prop 계약: <PortalNav restricted tenantName userName contact={{ phone }} /> · <BottomTabs restricted unpaidCount />
// 하이드레이션 구조는 관리자 레이아웃과 같다(동기 레이아웃 + display: contents 감싸개 안 비동기 셸 + 클라이언트 셸 한 덩어리).
// 이 파일에 클라이언트 컴포넌트를 형제로 더하지 말고 components/portal/portal-shell.tsx에 넣는다.

export const metadata: Metadata = {
  title: { template: "%s · 입주기업 포털", default: "입주기업 포털" },
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell min-h-screen bg-warm-ivory">
      <div className="contents">
        <PortalShell>{children}</PortalShell>
      </div>
    </div>
  )
}

async function PortalShell({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession()

  if (!session) {
    // 서명이 유효한 토큰이 있는데 세션이 거절됐으면(퇴실·삭제 기업, 계정 삭제) 무효 세션 안내.
    // 토큰이 없거나 만료·위조면 로그인 화면 등 비인증 화면을 그대로 그린다(접근 제어는 middleware).
    const token = (await cookies()).get("portal_token")?.value
    const revoked = token ? (await verifyPortalToken(token)) !== null : false
    return (
      <PortalShellFrame nav={null} revoked={revoked}>
        {children}
      </PortalShellFrame>
    )
  }

  let tenantName = ""
  let unpaidCount = 0
  const sql = getDb()
  if (sql) {
    try {
      const R = RECEIVABLE_SQL("b")
      const rows = await sql`
        SELECT t.name,
          (SELECT COUNT(*)::int FROM bills b WHERE b.tenant_id = t.id AND ${sql.unsafe(R.isReceivable)}) AS unpaid
        FROM tenants t WHERE t.id = ${session.tenant_id}
      `
      tenantName = rows[0]?.name ?? ""
      unpaidCount = Number(rows[0]?.unpaid ?? 0)
    } catch (error) {
      console.error("Portal layout tenant lookup error:", error)
    }
  }
  const contactInfo = await getSiteContent<ContactInfo>("contact")
  const contact = { phone: contactInfo?.phone || DEFAULT_CONTACT.phone }
  const restricted = session.must_change_password === true

  return (
    <PortalShellFrame nav={{ tenantName, userName: session.name, restricted, contact }} unpaidCount={unpaidCount}>
      {children}
    </PortalShellFrame>
  )
}
