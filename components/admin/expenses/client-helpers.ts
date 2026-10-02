// 사업비 정산 관리자 화면(사업·프로젝트, 증빙 내역)에서 함께 쓰는 브라우저 전용 도우미.
// 서버 전용 모듈을 import하지 않는다(타입 import만 허용).

// ── API 호출 ────────────────────────────────────────────────────────────────
// 응답이 JSON이 아니어도(413·504 같은 플랫폼 오류 페이지) 사람이 읽을 수 있는 한국어 오류로 바꿔 준다.
export type RequestResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number; needsSetup: boolean; aborted: boolean; data: Record<string, unknown> | null }

export function statusMessage(status: number): string {
  if (status === 401) return "로그인이 끝났어요. 새로고침한 뒤 다시 로그인해 주세요."
  if (status === 403) return "이 작업을 할 권한이 없어요."
  if (status === 404) return "찾는 항목이 없어요. 이미 지워졌을 수 있으니 새로고침해 주세요."
  if (status === 409) return "지금 상태에서는 처리할 수 없어요."
  if (status === 413) return "파일이 너무 커서 보낼 수 없어요. 파일 수를 줄이거나 더 작은 파일로 다시 시도해 주세요."
  if (status === 503) return "자동 인식을 쓸 수 없어요. 직접 입력은 그대로 할 수 있어요."
  if (status === 504 || status === 524) return "처리 시간이 너무 길어 멈췄어요. 파일 수를 줄여 다시 시도해 주세요."
  if (status >= 500) return "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요."
  return "요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요."
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<RequestResult<T>> {
  let res: Response
  try {
    res = await fetch(url, { credentials: "include", ...init })
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError"
    return {
      ok: false,
      error: aborted ? "취소했어요." : "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.",
      status: 0,
      needsSetup: false,
      aborted,
      data: null,
    }
  }
  let body: Record<string, unknown> | null = null
  try {
    body = (await res.json()) as Record<string, unknown>
  } catch {
    body = null
  }
  if (res.ok && body && body.success !== false) return { ok: true, data: body as T }
  const serverError = body && typeof body.error === "string" && body.error.trim() ? body.error : ""
  return {
    ok: false,
    error: serverError || statusMessage(res.status),
    status: res.status,
    needsSetup: Boolean(body?.needs_setup) || res.status === 503,
    aborted: false,
    data: body,
  }
}

export function jsonInit(method: "POST" | "PUT" | "DELETE", body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
}

// ── 파일 ────────────────────────────────────────────────────────────────────
// 원본은 Vercel Blob(private)에 있고 /api/file 프록시로만 열 수 있다(expenses/는 관리자 전용).
export function fileUrl(pathname: string, opts?: { download?: boolean; name?: string }): string {
  const q = new URLSearchParams({ pathname })
  if (opts?.download) q.set("download", "1")
  if (opts?.name) q.set("name", opts.name)
  return `/api/file?${q.toString()}`
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// 서버가 보낸 Content-Disposition의 filename*=UTF-8''... 을 그대로 저장 파일명으로 쓴다(bills-list와 같은 방식).
function filenameFromResponse(res: Response, fallback: string): string {
  const cd = res.headers.get("Content-Disposition") || ""
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  if (!m) return fallback
  try {
    return decodeURIComponent(m[1].trim().replace(/^"|"$/g, ""))
  } catch {
    return fallback
  }
}

// 링크로 열면 실패 시 오류 JSON 페이지로 이동해 버리므로 fetch → Blob URL로 저장한다.
// 성공하면 null, 실패하면 사람이 읽을 오류 메시지를 돌려준다.
export async function downloadFromApi(url: string, fallbackName: string): Promise<string | null> {
  let res: Response
  try {
    res = await fetch(url, { credentials: "include" })
  } catch {
    return "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."
  }
  if (!res.ok) {
    const d = (await res.json().catch(() => null)) as { error?: string } | null
    return d?.error || statusMessage(res.status)
  }
  try {
    const blob = await res.blob()
    const href = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = href
    a.download = filenameFromResponse(res, fallbackName)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 60_000)
    return null
  } catch {
    return "파일을 저장하지 못했어요. 다시 시도해 주세요."
  }
}

// ── 날짜 ────────────────────────────────────────────────────────────────────
function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function todayStr(): string {
  return localDate(new Date())
}

export function thisMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

// 'YYYY-MM' → 그 달의 첫날·마지막 날
export function monthRange(ym: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ym)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const last = new Date(y, mo, 0).getDate()
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${pad2(last)}` }
}

export function dotDate(s: string | null | undefined): string {
  return s ? s.replaceAll("-", ".") : ""
}

export function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return "기간 미입력"
  return `${start ? dotDate(start) : "시작일 미정"} ~ ${end ? dotDate(end) : "종료일 미정"}`
}

export function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime()
  const b = new Date(`${end}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000)
}

// ── 금액·집행률 ─────────────────────────────────────────────────────────────
export function wonNumber(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("ko-KR") : "-"
}

// 예산이 없거나 0이면 null(집행률을 계산할 수 없음)
export function usageRate(spent: number, budget: number | null | undefined): number | null {
  if (typeof budget !== "number" || !Number.isFinite(budget) || budget <= 0) return null
  return (spent / budget) * 100
}

export function formatRate(rate: number | null): string {
  if (rate === null) return "-"
  if (rate > 0 && rate < 0.1) return "0.1% 미만"
  return `${rate.toFixed(rate >= 100 || Number.isInteger(rate) ? 0 : 1)}%`
}

// 집행률 막대 색: 여유(기본) → 90% 이상(주황) → 초과(빨강)
export function rateTone(rate: number | null): "none" | "ok" | "warn" | "over" {
  if (rate === null) return "none"
  if (rate > 100) return "over"
  if (rate >= 90) return "warn"
  return "ok"
}

// 비목 이름 비교용(앞뒤·연속 공백 무시)
export function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, " ")
}
