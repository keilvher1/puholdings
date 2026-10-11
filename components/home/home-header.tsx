"use client"

/* eslint-disable @next/next/no-img-element -- home-page.tsx와 같은 이유(시안 렌더링 유지) */
import { useEffect, useState } from "react"

// 시안의 app.js와 같은 동작: 좁은 화면(760px 이하)에서 메뉴 버튼으로 nav를 열고 닫는다.
// 메뉴 링크를 누르거나 Esc를 누르면 닫힌다.
export function HomeHeader() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  const close = () => setOpen(false)

  return (
    <header>
      <a className="brand official-brand" href="#home" aria-label="포항연합기술지주 홈">
        <img src="/home/pu-holdings-logo.png" alt="포항연합기술지주" width="621" height="196" />
      </a>
      <button
        className="menu"
        aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        메뉴 ☰
      </button>
      <nav aria-label="주 메뉴" className={open ? "open" : undefined}>
        <a href="#company" onClick={close}>Company</a>
        <a href="#investment" onClick={close}>Investment Areas</a>
        <a href="#portfolio" onClick={close}>Portfolio</a>
        <a href="#team" onClick={close}>Team</a>
        <a href="#signature" aria-label="Program 프로그램" onClick={close}>Program</a>
      </nav>
    </header>
  )
}
