import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { EmptyState, PageHeader } from "@/components/saas"
import { BillingNav } from "@/components/admin/billing-nav"
import { MonthCloseWizard } from "@/components/admin/month-close-wizard"
import { isMonthFinished } from "@/components/admin/billing/close/close-model"
import { getCloseStatus } from "@/components/admin/billing/close/status-query"
import type { CloseStatus } from "@/components/admin/billing/close/types"
import { todayKST } from "@/lib/format"
import { BILLING_CLOSE_HELP } from "@/lib/help/billing-close"
import { billingCloseHref, type CloseStepNumber } from "@/lib/links"
import { getSupportContact, isMailEnabled, isMeterScanEnabled } from "@/lib/runtime-flags"

// 관리비 정산 > 월 마감(계획서 4.4.1~4.4.6). ?month=전기 사용월(YYYY-MM)&step=1..4.
// 파라미터가 없거나 틀리면 기본 마감 월(2.2.1 규칙, getCloseProgress)과 "다음 할 단계"로 연다(오류 화면을 띄우지 않는다).
// 단계 상태는 서버 값(close-status)으로 그리므로 새로 고쳐도 같고, 홈 한 줄과 같다.

export const metadata = { title: "월 마감" }

export default async function AdminBillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession()
  if (!session) redirect("/admin/login")
  const sp = await searchParams
  const monthParam = typeof sp.month === "string" ? sp.month : null
  const stepParam = typeof sp.step === "string" ? Number(sp.step) : NaN

  const sql = getDb()
  let status: CloseStatus | null = null
  if (sql) {
    try {
      status = await getCloseStatus(sql, monthParam)
    } catch (e) {
      console.error("Month close status error:", e)
    }
  }
  const today = todayKST()
  // 발행이 끝난 달은 완료 화면(4단계)으로 연다 — 1·2단계 '확인 필요'만 남은 끝난 달을 2단계로 열지 않는다
  const initialStep: CloseStepNumber = [1, 2, 3, 4].includes(stepParam)
    ? (stepParam as CloseStepNumber)
    : status && isMonthFinished(status)
      ? 4
      : (status?.nextStep ?? 4)

  return (
    <div className="px-4 py-5 sm:p-6 lg:p-8">
      <PageHeader
        title="월 마감"
        breadcrumbs={[{ label: "관리비 정산" }, { label: "월 마감" }]}
        description="검침 → 전기료 배분 → 청구서 만들기 → 발행 순서로 한 달치 관리비를 마감해요"
        help={BILLING_CLOSE_HELP}
        helpContact={getSupportContact()}
        // 낮은 화면(1280×600 등)에서는 이동 경로·설명 줄을 숨겨 첫 입력칸이 첫 화면에 들어오게(바로 아래 하위 탭이 위치를 알려 준다)
        className="mb-4 lg:[@media(max-height:760px)]:[&>nav]:hidden lg:[@media(max-height:760px)]:[&>p]:hidden"
      />
      <BillingNav />
      {status ? (
        <MonthCloseWizard
          key={status.usageMonth}
          initial={status}
          initialStep={initialStep}
          mailEnabled={isMailEnabled()}
          scanEnabled={isMeterScanEnabled()}
          today={today}
        />
      ) : (
        <EmptyState
          kind="error"
          title="월 마감 상태를 불러오지 못했어요"
          description="인터넷 연결을 확인하고 다시 시도해 주세요."
          retryHref={billingCloseHref(monthParam, Number.isFinite(stepParam) ? (stepParam as CloseStepNumber) : null)}
          bordered
        />
      )}
    </div>
  )
}
