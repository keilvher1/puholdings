// 기존 정산 엑셀 가져오기 — 미리보기 응답 모양과 확인창 숫자(순수, tests/contracts-put-roundtrip.test.ts가 확인).

interface PreviewContract {
  room_code: string
}
export interface PreviewTenant {
  name: string
  matched_tenant_id: number | null
  contracts: PreviewContract[]
}
export interface ImportPreview {
  tenants: PreviewTenant[]
  vacant_rooms: { code: string }[]
  warnings: string[]
  summary: { tenants: number; matched: number; vacant: number }
}

/** 미리보기 → 확인창 숫자(기업·계약·호실). 호실은 계약 호실 + 공실 호실(코드 중복 제거) */
export function importCounts(p: Pick<ImportPreview, "tenants" | "vacant_rooms">) {
  const contracts = p.tenants.reduce((s, t) => s + t.contracts.filter((c) => c.room_code).length, 0)
  const rooms = new Set<string>([...p.tenants.flatMap((t) => t.contracts.map((c) => c.room_code).filter(Boolean)), ...p.vacant_rooms.map((v) => v.code)])
  return {
    tenants: p.tenants.length,
    newTenants: p.tenants.filter((t) => !t.matched_tenant_id).length,
    matched: p.tenants.filter((t) => t.matched_tenant_id).length,
    contracts,
    rooms: rooms.size,
  }
}

