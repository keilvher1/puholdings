// 기준 정보 화면이 API에서 받는 행 모양(필요한 칸만). 계약 행은 contract-sheet-model.ts의 ContractRow.

/** GET /api/admin/rooms 한 행(r.* + 진행 중 계약의 기업) */
export interface RoomRow {
  id: number
  code: string
  building: string
  floor: number | null
  pyeong: string | number | null
  area_m2: string | null
  status: string
  memo: string | null
  sort_order: number | null
  tenant_id?: number | null
  tenant_name?: string | null
  ended_at?: string | null
  [key: string]: unknown
}

/** GET /api/admin/tenants 한 행(필요한 칸만) */
export interface TenantRow {
  id: number
  name: string
  status?: string
}

/** fetch → JSON. 네트워크 실패는 status 0 */
export async function getJson<T>(url: string): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, { credentials: "include", cache: "no-store" })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    const b = body as { success?: boolean; error?: string } | null
    const ok = res.ok && b?.success !== false
    return { ok, status: res.status, data: ok ? (body as T) : null, error: b?.error ?? null }
  } catch {
    return { ok: false, status: 0, data: null, error: null }
  }
}

/** JSON 본문으로 POST·PUT. 네트워크 실패는 status 0 */
export async function sendJson<T = Record<string, unknown>>(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    let json: unknown = null
    try {
      json = await res.json()
    } catch {
      json = null
    }
    const b = json as { success?: boolean; error?: string } | null
    const ok = res.ok && b?.success === true
    return { ok, status: res.ok && !ok ? 500 : res.status, data: ok ? (json as T) : null, error: b?.error ?? null }
  } catch {
    return { ok: false, status: 0, data: null, error: null }
  }
}

/**
 * 오류 Notice 본문 — 제목("저장하지 못했어요")과 같은 첫 문장을 덜어 낸다.
 *   errorDetail("저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.", "저장하지 못했어요") → "인터넷 연결을 확인하고 다시 눌러 주세요."
 *   첫 문장이 다르면(서버가 준 사용자 문구 등) 그대로 둔다.
 */
export function errorDetail(message: string, title: string): string {
  const head = title.trim().replace(/[.?!]$/, "")
  const m = message.trim()
  if (!m.startsWith(head)) return m
  const rest = m.slice(head.length).replace(/^[.?!]\s*/, "").trim()
  return rest || m
}
