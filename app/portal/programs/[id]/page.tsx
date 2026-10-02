import type { Metadata } from "next"
import { getDb } from "@/lib/db"
import { isMailEnabled } from "@/lib/runtime-flags"
import { PortalProgramDetail } from "@/components/portal/screens/program-detail"
import { getPortalContactPhone, getPortalProgramTitle } from "@/components/portal/screens/portal-data"

// 포털 프로그램 상세(WP8, 계획서 4.5.7). 본문은 클라이언트(신청·제출), 탭 제목만 서버에서 공고 제목으로.
// 신청·제출 상태는 본문이 /api/portal/programs?id=(세션 tenant_id 스코프)로 읽는다.

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = Number((await params).id)
  const sql = getDb()
  if (!sql || !Number.isInteger(id) || id <= 0) return { title: "프로그램" }
  try {
    const title = await getPortalProgramTitle(sql, id)
    return { title: title ?? "프로그램" }
  } catch {
    return { title: "프로그램" }
  }
}

export default async function PortalProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const phone = await getPortalContactPhone()
  return <PortalProgramDetail programId={id} mailEnabled={isMailEnabled()} phone={phone} />
}
