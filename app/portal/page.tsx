import type { Metadata } from "next"
import { getPortalSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { getBillingBankInfo } from "@/lib/bank-info"
import { todayKST } from "@/lib/format"
import { PortalHome } from "@/components/portal/screens/home"
import {
  getPortalContactPhone,
  getTenantRooms,
  listPortalBills,
  listPortalPrograms,
  type PortalBillListRow,
} from "@/components/portal/screens/portal-data"
import type { PortalProgramRow } from "@/components/portal/screens/portal-model"

// 포털 홈(WP8, 계획서 4.5.3). 모든 조회는 세션 tenant_id로만. 실패한 조회는 null로 넘겨 화면이 오류 상태를 보이게 한다(0건으로 바꾸지 않음).
// 같은 세그먼트의 layout title.template은 이 page에 적용되지 않으므로 접미사까지 직접 쓴다.
export const metadata: Metadata = { title: { absolute: "홈 · 입주기업 포털" } }

async function attempt<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run()
  } catch (error) {
    console.error(`Portal home ${label} error:`, error)
    return null
  }
}

export default async function PortalHomePage() {
  const session = await getPortalSession()
  if (!session) return null // 레이아웃이 무효 세션 안내를 그린다
  const sql = getDb()
  const tenantId = session.tenant_id
  const [bills, programs, rooms, phone] = await Promise.all([
    sql ? attempt<PortalBillListRow[]>("bills", () => listPortalBills(sql, tenantId)) : Promise.resolve(null),
    sql ? attempt<PortalProgramRow[]>("programs", () => listPortalPrograms(sql, tenantId)) : Promise.resolve(null),
    sql ? attempt("rooms", () => getTenantRooms(sql, tenantId)) : Promise.resolve(null),
    getPortalContactPhone(),
  ])
  return (
    <PortalHome
      rooms={rooms ?? []}
      bills={bills}
      programs={programs}
      bank={getBillingBankInfo()}
      phone={phone}
      today={todayKST()}
    />
  )
}
