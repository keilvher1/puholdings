// 월 마감 화면의 fetch 도우미(클라이언트). 실패를 0건으로 바꾸지 않고 { ok:false, status, error }로 돌려준다.
// 화면 문구는 friendlyError(lib/messages.ts)로 바꿔 쓴다.

export interface ApiResult<T> {
  ok: boolean
  /** HTTP 상태(네트워크 실패면 0) */
  status: number
  data: T | null
  /** 서버가 준 error 문구(사용자용인지는 friendlyError가 판단) */
  error: string | null
}

export async function api<T = Record<string, unknown>>(url: string, init?: RequestInit & { json?: unknown }): Promise<ApiResult<T>> {
  try {
    const { json, ...rest } = init ?? {}
    const res = await fetch(url, {
      credentials: "include",
      ...rest,
      ...(json !== undefined ? { body: JSON.stringify(json), headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) } } : {}),
    })
    const data = (await res.json().catch(() => null)) as (T & { success?: boolean; error?: string }) | null
    const ok = res.ok && (data?.success ?? true) !== false
    return { ok, status: res.status, data, error: data && typeof data.error === "string" ? data.error : null }
  } catch {
    return { ok: false, status: 0, data: null, error: null }
  }
}

/** 서버가 Content-Disposition(filename*=UTF-8'')로 준 파일 이름 */
export function filenameFromResponse(res: Response, fallback: string): string {
  const cd = res.headers.get("Content-Disposition") || ""
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  if (!m) return fallback
  try {
    return decodeURIComponent(m[1].trim().replace(/^"|"$/g, ""))
  } catch {
    return fallback
  }
}
