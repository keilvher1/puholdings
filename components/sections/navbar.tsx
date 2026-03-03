"use client"

import { useState, useEffect } from "react"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { label: "회사소개", href: "#about" },
  { label: "주요성과", href: "#stats" },
  { label: "투자철학", href: "#philosophy" },
  { label: "포트폴리오", href: "#portfolio" },
  { label: "뉴스", href: "#news" },
  { label: "문의하기", href: "#contact" },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const handleClick = (href: string) => {
    setMobileOpen(false)
    const el = document.querySelector(href)
    if (el) {
      el.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
        scrolled
          ? "glass-nav border-b border-navy-light/30 bg-navy-deep/80"
          : "bg-transparent"
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex items-center gap-3"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-accent">
            <span className="text-sm font-bold text-primary-foreground">PU</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold leading-tight text-primary-foreground">
              포항연합기술지주
            </span>
            <span className="text-[10px] font-light tracking-widest text-slate-400">
              PU HOLDINGS
            </span>
          </div>
        </button>

        {/* Desktop Nav */}
        <div className="hidden items-center gap-8 md:flex">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.href}
              onClick={() => handleClick(item.href)}
              className="relative text-sm font-medium text-slate-400 transition-colors hover:text-primary-foreground after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-0 after:bg-blue-accent after:transition-all hover:after:w-full"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Mobile Toggle */}
        <button
          className="text-primary-foreground md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "메뉴 닫기" : "메뉴 열기"}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="glass-nav border-t border-navy-light/30 bg-navy-deep/95 md:hidden">
          <div className="flex flex-col gap-1 px-6 py-4">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.href}
                onClick={() => handleClick(item.href)}
                className="rounded-lg px-4 py-3 text-left text-sm font-medium text-slate-400 transition-colors hover:bg-navy-light/50 hover:text-primary-foreground"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}
