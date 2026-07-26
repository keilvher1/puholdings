"use client"

import { useEffect } from "react"

// [data-speed] 요소를 뷰포트 중심 기준 거리 × 속도만큼 이동 (rAF 스로틀, CSS 변수 --py)
export function ScrollParallax() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-speed]"))
    if (els.length === 0) return

    let ticking = false
    const update = () => {
      const vh = window.innerHeight
      for (const el of els) {
        const speed = Number(el.dataset.speed || 0)
        if (!speed) continue
        const r = el.getBoundingClientRect()
        // 현재 적용된 --py를 제외한 원위치 기준으로 계산 (피드백 루프 방지)
        const currentPy = parseFloat(el.style.getPropertyValue("--py")) || 0
        const mid = r.top - currentPy + r.height / 2 - vh / 2
        el.style.setProperty("--py", `${(-mid * speed).toFixed(1)}px`)
      }
      ticking = false
    }
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(update)
      }
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [])

  return null
}
