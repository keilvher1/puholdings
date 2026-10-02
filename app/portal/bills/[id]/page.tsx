import type { Metadata } from "next"
import { cache } from "react"
import Link from "next/link"
import { getPortalSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { billMonth, todayKST } from "@/lib/format"
import { portalBillsHref } from "@/lib/links"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/saas"
import { PortalBillCorrecting, PortalBillDetailView } from "@/components/portal/screens/bill-detail"
import { getPortalBillDetail, getPortalContactPhone, type PortalBillDetailResult } from "@/components/portal/screens/portal-data"

// 포털 청구서 상세(WP8, 계획서 4.5.5). 서버에서 세션 tenant_id로만 읽는다(다른 기업 id는 '찾을 수 없음').
// 탭 제목은 "2026년 9월분 청구서". 같은 요청 안의 metadata와 본문은 cache()로 한 번만 조회한다.

type Loaded = { kind: "error" } | PortalBillDetailResult

const load = cache(async (rawId: string): Promise<Loaded> => {
  const session = await getPortalSession()
  if (!session) return { kind: "not_found" }
  const billId = Number(rawId)
  if (!Number.isInteger(billId) || billId <= 0) return { kind: "not_found" }
  const sql = getDb()
  if (!sql) return { kind: "error" }
  try {
    return await getPortalBillDetail(sql, session.tenant_id, billId)
  } catch (error) {
    console.error("Portal bill detail page error:", error)
    return { kind: "error" }
  }
})

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const r = await load((await params).id)
  if (r.kind === "ok") return { title: `${billMonth(r.bill.period)} 청구서` }
  if (r.kind === "correcting") return { title: `${billMonth(r.period)} 청구서(고치는 중)` }
  return { title: "청구서" }
}

export default async function PortalBillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [r, phone] = await Promise.all([load(id), getPortalContactPhone()])
  if (r.kind === "ok") {
    return <PortalBillDetailView bill={r.bill} lines={r.lines} previous={r.previous} bank={r.bank_info} phone={phone} today={todayKST()} />
  }
  if (r.kind === "correcting") return <PortalBillCorrecting period={r.period} phone={phone} />
  if (r.kind === "error") {
    return <EmptyState kind="error" bordered title="청구서를 불러오지 못했어요" description="잠시 뒤 새로고침해 주세요." retryHref={`/portal/bills/${encodeURIComponent(id)}`} />
  }
  return (
    <EmptyState
      bordered
      title="청구서를 찾을 수 없어요"
      description="주소를 다시 확인해 주세요."
      action={
        <Button asChild variant="outline" className="h-11 hover:bg-warm-beige hover:text-dark">
          <Link href={portalBillsHref({ view: "all" })}>청구서 목록</Link>
        </Button>
      }
    />
  )
}
