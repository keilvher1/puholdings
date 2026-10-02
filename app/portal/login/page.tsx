import type { Metadata } from "next"
import { PortalLoginForm } from "@/components/portal/screens/login"
import { getPortalContactPhone } from "@/components/portal/screens/portal-data"
import { safeNext } from "@/lib/safe-next"

// 포털 로그인(WP8, 계획서 4.5.2). next(돌아갈 경로)는 서버에서 safeNext로 거른 값만 폼에 넘긴다.
export const metadata: Metadata = { title: "로그인" }

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const raw = Array.isArray(sp.next) ? sp.next[0] : sp.next
  const phone = await getPortalContactPhone()
  return <PortalLoginForm next={safeNext(raw ?? null, "/portal/")} phone={phone} />
}
