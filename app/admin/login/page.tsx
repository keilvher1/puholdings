import { getSupportContact } from "@/lib/runtime-flags"
import { AdminLoginForm } from "@/components/admin/dashboard/admin-login-form"

// 관리자 로그인(계획서 4.1.4). searchParams.next는 서버에서 읽어 prop으로 넘긴다(useSearchParams Suspense 경계 불필요).
// 돌아갈 경로 검사는 폼이 safeNext(next, "/admin/")로 한다(실패하면 /admin).
// 왼쪽 패널은 단색 진남색 + 로고 + "포항연합기술지주 관리자"만(그라데이션·흐린 원 없음).

export const metadata = { title: "관리자 로그인" }

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const raw = Array.isArray(sp.next) ? sp.next[0] : sp.next
  return <AdminLoginForm next={raw ?? null} supportContact={getSupportContact()} />
}
