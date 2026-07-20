import { NextResponse } from "next/server"
import type { NeonQueryFunction } from "@neondatabase/serverless"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import type { ImportTenant, ImportRoom } from "@/lib/billing-import"

type Sql = NeonQueryFunction<false, false>

function buildingOf(code: string): "본관" | "공장동" {
  return /^F\d/i.test(code) ? "공장동" : "본관"
}

async function ensureRoom(sql: Sql, code: string, area: number | null, pyeong: number | null): Promise<number> {
  const found = await sql`SELECT id FROM rooms WHERE code = ${code}`
  if (found.length > 0) return found[0].id
  const ins = await sql`
    INSERT INTO rooms (code, building, area_m2, pyeong)
    VALUES (${code}, ${buildingOf(code)}, ${area}, ${pyeong})
    RETURNING id
  `
  return ins[0].id
}

const DEPOSIT_PER_PYEONG = 200000

// POST /api/admin/billing/import-master/confirm — 미리보기 데이터를 실제 반영
// body: { tenants: ImportTenant[](matched_tenant_id 포함), vacant_rooms: ImportRoom[] }
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  const sql = getDb()
  if (!sql) return NextResponse.json({ success: false, error: "데이터베이스 연결 실패" }, { status: 500 })
  try {
    const body = await request.json()
    const tenants: (ImportTenant & { matched_tenant_id?: number | null })[] = body.tenants ?? []
    const vacantRooms: ImportRoom[] = body.vacant_rooms ?? []

    let tenantsCreated = 0
    let contractsCreated = 0
    let roomsCreated = 0

    // 공실 호실 먼저
    for (const v of vacantRooms) {
      const before = await sql`SELECT id FROM rooms WHERE code = ${v.code}`
      await ensureRoom(sql, v.code, v.area_m2, v.pyeong)
      if (before.length === 0) roomsCreated++
    }

    for (const t of tenants) {
      if (!t.name) continue
      // 기업: 매칭 있으면 재사용, 없으면 생성
      let tenantId = t.matched_tenant_id ?? null
      if (!tenantId) {
        const ins = await sql`
          INSERT INTO tenants (name, business_no, ceo_name, contact_email, manager_name, tax_email, contact_phone, status)
          VALUES (${t.name}, ${t.business_no}, ${t.ceo_name}, ${t.contact_email}, ${t.manager_name}, ${t.tax_email}, ${t.contact_phone}, 'active')
          RETURNING id
        `
        tenantId = ins[0].id
        tenantsCreated++
      } else {
        // 세금계산서 메일·담당자 보강 (비어 있을 때만)
        await sql`
          UPDATE tenants SET
            tax_email = COALESCE(tax_email, ${t.tax_email}),
            manager_name = COALESCE(manager_name, ${t.manager_name}),
            business_no = COALESCE(business_no, ${t.business_no})
          WHERE id = ${tenantId}
        `
      }

      for (const c of t.contracts) {
        if (!c.room_code) continue
        const roomBefore = await sql`SELECT id FROM rooms WHERE code = ${c.room_code}`
        const roomId = await ensureRoom(sql, c.room_code, null, c.pyeong_billed)
        if (roomBefore.length === 0) roomsCreated++

        // 이미 이 기업×호실 active 계약이 있으면 스킵
        const dup = await sql`SELECT id FROM contracts WHERE tenant_id = ${tenantId} AND room_id = ${roomId} AND status = 'active'`
        if (dup.length > 0) continue

        const pyeongActual = c.pyeong_actual ?? c.pyeong_billed
        const depStd = c.deposit_standard ?? (pyeongActual ? Math.round(DEPOSIT_PER_PYEONG * pyeongActual) : null)
        await sql`
          INSERT INTO contracts (
            tenant_id, room_id, contract_date, renewal_type, pyeong_billed, pyeong_actual,
            rent_unit_price, mgmt_fee, deposit_standard, deposit_actual, elec_method, status)
          VALUES (
            ${tenantId}, ${roomId}, ${t.contract_date},
            ${(c.rent_unit_price ?? 0) >= 21000 ? "renewal" : "new"},
            ${c.pyeong_billed ?? 0}, ${pyeongActual},
            ${c.rent_unit_price ?? 0}, ${c.mgmt_fee ?? 15000},
            ${depStd}, ${c.deposit_actual}, ${c.elec_method}, 'active')
        `
        contractsCreated++
      }
    }

    return NextResponse.json({
      success: true,
      tenants_created: tenantsCreated,
      contracts_created: contractsCreated,
      rooms_created: roomsCreated,
    })
  } catch (error) {
    console.error("Import confirm error:", error)
    return NextResponse.json({ success: false, error: "반영에 실패했습니다" }, { status: 500 })
  }
}
