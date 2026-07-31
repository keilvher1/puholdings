"use client"

import { useLayoutEffect, useRef, useState } from "react"

// 첫 방문 시네마틱 랜딩 인트로 — 브랜드 워드마크 리빌 후 더블 커튼(다크→골드)이 걷히며 히어로 공개.
// 세션당 1회만 재생하고, 클릭하면 즉시 건너뛴다. 모션 최소화 설정이면 재생하지 않는다.
//
// 하이드레이션 직후 상위 트리가 리마운트되어도 이어서 재생되도록, 시작 시각을 모듈 스코프에
// 보관하고 경과 시간만큼 음수 animation-delay(--cine-elapsed)로 보정한다.
const SEEN_KEY = "pu-cine-intro"
const TOTAL_MS = 3300 // CSS 타임라인(골드 커튼 2.4s+0.85s)과 동기

let startedAt = 0 // 이 페이지 로드에서 인트로가 시작된 시각 (0 = 아직)

export function CinematicIntro() {
  const [gone, setGone] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const skippedRef = useRef(false)

  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGone(true)
      return
    }
    if (startedAt === 0) {
      if (sessionStorage.getItem(SEEN_KEY)) {
        setGone(true)
        return
      }
      sessionStorage.setItem(SEEN_KEY, "1")
      startedAt = performance.now()
    }
    const elapsed = performance.now() - startedAt
    if (elapsed >= TOTAL_MS) {
      setGone(true)
      return
    }
    rootRef.current?.style.setProperty("--cine-elapsed", `-${Math.round(elapsed)}ms`)
    document.documentElement.classList.add("cine-lock")
    const timer = setTimeout(() => {
      document.documentElement.classList.remove("cine-lock")
      setGone(true)
    }, TOTAL_MS - elapsed)
    return () => {
      clearTimeout(timer)
      document.documentElement.classList.remove("cine-lock")
    }
  }, [])

  if (gone) return null

  const skip = () => {
    if (skippedRef.current) return
    skippedRef.current = true
    startedAt = -TOTAL_MS // 이후 리마운트에서도 즉시 종료되도록
    rootRef.current?.classList.add("cine-skip")
    setTimeout(() => {
      document.documentElement.classList.remove("cine-lock")
      setGone(true)
    }, 240)
  }

  return (
    <div ref={rootRef} className="cine-intro" aria-hidden onClick={skip}>
      <div className="cine-curtain cine-curtain-gold" />
      <div className="cine-curtain cine-curtain-dark">
        <div className="cine-center">
          <p className="cine-kicker">POHANG UNION TECHNOLOGY HOLDINGS</p>
          <p className="cine-title">포항연합기술지주</p>
          <span className="cine-line" />
        </div>
      </div>
    </div>
  )
}
