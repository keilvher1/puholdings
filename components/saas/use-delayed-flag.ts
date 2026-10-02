"use client"

// 깜빡임 방지 지연 플래그 — active가 delay(기본 300ms) 넘게 이어질 때만 true. 짧은 조회에는 골격·스피너를 보이지 않는다.
//
// 사용 예:
//   const showSkeleton = useDelayedFlag(loading)
//   if (loading && !rows) return showSkeleton ? <TableSkeleton rows={5} columns={4} /> : null

import { useEffect, useState } from "react"

export function useDelayedFlag(active: boolean, delay = 300): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!active) {
      setShown(false)
      return
    }
    const t = setTimeout(() => setShown(true), delay)
    return () => clearTimeout(t)
  }, [active, delay])
  return active && shown
}
