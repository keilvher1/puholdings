"use client"

import { useState, useEffect } from "react"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { label: "PORTFOLIO", href: "#portfolio" },
  { label: "INVESTMENT", href: "#philosophy" },
  { label: "ABOUT", href: "#about" },
  { label: "NOTICE", href: "#news" },
  { label: "CONTACT", href: "#contact" },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const handleClick = (href: string) => {
    setMobileOpen(false)
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-700",
        scrolled
          ? "glass-nav bg-dark/90 border-b border-dark-muted/40"
          : "bg-transparent"
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-5 lg:px-12">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex items-center gap-3 group"
        >
          <span className="text-lg font-bold tracking-tight text-primary-foreground">
            PU Holdings
          </span>
        </button>

        {/* Desktop */}
        <div className="hidden items-center gap-10 md:flex">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.href}
              onClick={() => handleClick(item.href)}
              className="text-[11px] font-medium tracking-[0.2em] text-primary-foreground/60 transition-colors duration-300 hover:text-primary-foreground"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Mobile */}
        <button
          className="text-primary-foreground md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          "fixed inset-0 top-0 z-40 bg-dark transition-all duration-500 md:hidden",
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="flex h-full flex-col justify-center px-12">
          {NAV_ITEMS.map((item, i) => (
            <button
              key={item.href}
              onClick={() => handleClick(item.href)}
              className="border-b border-dark-muted/30 py-6 text-left text-2xl font-light tracking-wide text-primary-foreground/70 transition-colors hover:text-gold"
              style={{ transitionDelay: mobileOpen ? `${i * 60}ms` : "0ms" }}
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute top-6 right-8 text-primary-foreground/60"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>
      </div>
    </nav>
  )
}
