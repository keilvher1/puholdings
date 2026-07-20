import * as XLSX from "xlsx"

// 정산 엑셀(면적별 시트) → 기업·계약·호실 마스터 추출.
// 헤더 행은 고정 번호가 아니라 '순번'·'업체명' 텍스트로 탐색한다.

export interface ImportRoom {
  code: string
  building: "본관" | "공장동"
  area_m2: number | null
  pyeong: number | null
  elec_method: "area" | "metered"
}
export interface ImportContract {
  room_code: string
  pyeong_billed: number | null
  pyeong_actual: number | null
  rent_unit_price: number | null
  mgmt_fee: number | null
  deposit_standard: number | null
  deposit_actual: number | null
  elec_method: "area" | "metered"
}
export interface ImportTenant {
  name: string
  business_no: string | null
  contract_date: string | null
  ceo_name: string | null
  contact_email: string | null
  manager_name: string | null
  tax_email: string | null
  contact_phone: string | null
  contracts: ImportContract[]
}
export interface ImportResult {
  tenants: ImportTenant[]
  vacantRooms: ImportRoom[] // '공실' 행 → 호실만 생성
  warnings: string[]
}

const FACTORY_CODES = /^F\d/i

function toStr(v: unknown): string {
  return v == null ? "" : String(v).trim()
}
function toNum(v: unknown): number | null {
  const n = Number(String(v).replace(/,/g, ""))
  return Number.isFinite(n) ? n : null
}
// 엑셀 serial date → 'YYYY-MM-DD'
function excelDate(v: unknown): string | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) {
    const s = toStr(v)
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
  }
  const d = XLSX.SSF ? XLSX.SSF.parse_date_code(n) : null
  if (!d) return null
  return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`
}
function buildingOf(code: string): "본관" | "공장동" {
  return FACTORY_CODES.test(code) ? "공장동" : "본관"
}

// 헤더 행 인덱스: '순번'과 '업체명'이 같은 행에 있는 곳
function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = (rows[i] || []).map(toStr)
    if (r.some((c) => c.includes("순번")) && r.some((c) => c.includes("업체명"))) return i
  }
  return -1
}

// 열 인덱스: 헤더 텍스트로 매핑 (열 위치가 바뀌어도 견고)
function columnMap(rows: unknown[][], hdr: number): Record<string, number> {
  const h1 = (rows[hdr - 1] || []).map(toStr)
  const h2 = (rows[hdr] || []).map(toStr)
  const label = (c: number) => `${h1[c] || ""} ${h2[c] || ""}`
  const find = (...keys: string[]) => {
    for (let c = 0; c < Math.max(h2.length, 40); c++) {
      const l = label(c)
      if (keys.some((k) => l.includes(k))) return c
    }
    return -1
  }
  return {
    no: find("순번"),
    name: find("업체명"),
    biz: find("사업자"),
    date: find("계약기준일"),
    room: find("호실"),
    area: find("전용"),
    pyeongBilled: find("부과"),
    pyeongActual: find("실제 평형"),
    depStd: find("계산식"),
    depActual: find("실제보증금"),
    unit: find("단가"),
    mgmt: find("관리비 (b)", "관리비\n(b)") >= 0 ? find("관리비 (b)", "관리비\n(b)") : 13,
    elec: find("산정"),
    ceo: find("대표자"),
    email: find("메일"),
    manager: find("담당자"),
    taxEmail: find("세금계산서"),
    phone: find("연락처"),
  }
}

export function parseSettlement(buf: Uint8Array): ImportResult {
  const wb = XLSX.read(buf, { type: "array" })
  // '임대료 면적'이 들어간 시트 우선, 없으면 첫 시트
  const sheetName = wb.SheetNames.find((n) => n.includes("면적")) || wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: "" }) as unknown[][]

  const hdr = findHeaderRow(rows)
  if (hdr < 0) return { tenants: [], vacantRooms: [], warnings: ["헤더 행(순번·업체명)을 찾지 못했습니다"] }
  const col = columnMap(rows, hdr)

  const tenants: ImportTenant[] = []
  const vacantRooms: ImportRoom[] = []
  const warnings: string[] = []
  let current: ImportTenant | null = null

  for (let i = hdr + 1; i < rows.length; i++) {
    const r = rows[i] || []
    const room = toStr(r[col.room])
    const name = toStr(r[col.name])

    // 소계/합계/집계 행 스킵: 호실에 쉼표(다중), '계', 빈 호실+빈 업체
    if (room === "계" || room.includes(",") || room.includes("호 ")) continue
    if (!room && !name) continue

    const mgmtCol = col.mgmt >= 0 ? col.mgmt : 13
    const elecMethod: "area" | "metered" = toStr(r[col.elec]).includes("실사용") ? "metered" : "area"

    // 공실 행 → 호실만
    if (name === "공실" || (name === "" && room && !current)) {
      if (room) vacantRooms.push({ code: room, building: buildingOf(room), area_m2: toNum(r[col.area]), pyeong: toNum(r[col.pyeongBilled]), elec_method: elecMethod })
      continue
    }

    const contract: ImportContract = {
      room_code: room,
      pyeong_billed: toNum(r[col.pyeongBilled]),
      pyeong_actual: toNum(r[col.pyeongActual]),
      rent_unit_price: toNum(r[col.unit]),
      mgmt_fee: toNum(r[mgmtCol]) ?? 15000,
      deposit_standard: toNum(r[col.depStd]),
      deposit_actual: toNum(r[col.depActual]),
      elec_method: elecMethod,
    }

    if (name) {
      // 새 기업
      current = {
        name,
        business_no: toStr(r[col.biz]) || null,
        contract_date: excelDate(r[col.date]),
        ceo_name: toStr(r[col.ceo]) || null,
        contact_email: toStr(r[col.email]) || null,
        manager_name: toStr(r[col.manager]) || null,
        tax_email: toStr(r[col.taxEmail]) || null,
        contact_phone: toStr(r[col.phone]).replace(/\n/g, " ") || null,
        contracts: room ? [contract] : [],
      }
      tenants.push(current)
    } else if (current && room) {
      // 같은 기업의 추가 호실
      current.contracts.push(contract)
    }
  }

  if (tenants.length === 0) warnings.push("추출된 기업이 없습니다 — 시트 형식을 확인하세요")
  return { tenants, vacantRooms, warnings }
}
