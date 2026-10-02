"use client"

// 쿼리 파라미터를 화면 상태로 쓰는 훅(탭·필터·월·열린 시트를 주소에 남긴다, 계획서 2.1·3.4). 기본값이면 파라미터를 지운다.
//   mode "shallow"(기본): 화면 안에서만 쓰는 값(보기 탭·필터·검색어·열린 시트 ?bill= ?card= ?receipt=)은
//     window.history.replaceState로 바꾼다 — 서버 왕복·loading.tsx 깜빡임·클라이언트 상태 초기화가 없다(Next가 useSearchParams와 맞춰 준다).
//   mode "server": 서버 컴포넌트가 조회 조건으로 쓰는 값(프로젝트·월)만 router.replace(…, { scroll: false }).
// 서버 컴포넌트에서는 이 훅 대신 page의 searchParams를 그대로 쓴다.
//
// 사용 예:
//   const [view, setView] = useUrlState("view", "receivable")               // 보기 탭
//   const [bill, setBill] = useUrlState("bill", "")                         // 상세 시트: setBill(String(id)) / setBill(null)
//   const [month, setMonth] = useUrlState("month", defaultMonth, { mode: "server" })
//   const [f, setF] = useUrlStates({ status: "", q: "", bucket: "" })      // 여러 값을 한 번에: setF({ status: "overdue", q: null })
//
// 주의: useSearchParams를 쓰므로 정적 렌더 페이지에서는 <Suspense>로 감싼다(관리자·포털 화면은 세션 때문에 동적이라 보통 필요 없다).

import { useCallback, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export type UrlStateMode = "shallow" | "server"

type Patch = Record<string, string | number | null | undefined>

function buildUrl(pathname: string, patch: Patch, defaults: Record<string, string>): string {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "")
  for (const [k, raw] of Object.entries(patch)) {
    const v = raw === null || raw === undefined ? "" : String(raw)
    if (v === "" || v === (defaults[k] ?? "")) params.delete(k)
    else params.set(k, v)
  }
  const qs = params.toString()
  const hash = typeof window !== "undefined" ? window.location.hash : ""
  return `${pathname}${qs ? `?${qs}` : ""}${hash}`
}

function useApply(mode: UrlStateMode) {
  const router = useRouter()
  const pathname = usePathname() ?? ""
  return useCallback(
    (patch: Patch, defaults: Record<string, string>) => {
      const url = buildUrl(pathname, patch, defaults)
      if (mode === "server") router.replace(url, { scroll: false })
      else window.history.replaceState(null, "", url)
    },
    [mode, pathname, router],
  )
}

/** 파라미터 하나. 반환 [값(없으면 기본값), 바꾸기(null·""·기본값이면 지움)] */
export function useUrlState(
  key: string,
  defaultValue = "",
  options: { mode?: UrlStateMode } = {},
): [string, (value: string | number | null) => void] {
  const searchParams = useSearchParams()
  const apply = useApply(options.mode ?? "shallow")
  const value = searchParams?.get(key) ?? defaultValue
  const set = useCallback((v: string | number | null) => apply({ [key]: v }, { [key]: defaultValue }), [apply, key, defaultValue])
  return [value, set]
}

/** 파라미터 여러 개. defaults의 키만 읽고, 바꾸기는 일부만 넘겨도 된다 */
export function useUrlStates<K extends string>(
  defaults: Record<K, string>,
  options: { mode?: UrlStateMode } = {},
): [Record<K, string>, (patch: Partial<Record<K, string | number | null>>) => void] {
  const searchParams = useSearchParams()
  const apply = useApply(options.mode ?? "shallow")
  const key = JSON.stringify(defaults)
  const values = useMemo(() => {
    const d = JSON.parse(key) as Record<K, string>
    const out = {} as Record<K, string>
    for (const k of Object.keys(d) as K[]) out[k] = searchParams?.get(k) ?? d[k]
    return out
  }, [searchParams, key])
  const set = useCallback(
    (patch: Partial<Record<K, string | number | null>>) => apply(patch as Patch, JSON.parse(key) as Record<string, string>),
    [apply, key],
  )
  return [values, set]
}
