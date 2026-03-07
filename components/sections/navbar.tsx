"use client"

import { useState, useEffect } from "react"
import { Menu, X } from "lucide-react"
import Image from "next/image"
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
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Lock body scroll when mobile menu open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [mobileOpen])

  const handleClick = (href: string) => {
    setMobileOpen(false)
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <>
      <nav
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-700",
          scrolled
            ? "glass-nav bg-dark/90 border-b border-dark-muted/30"
            : "bg-transparent"
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-5 lg:px-12">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="group flex items-center"
            aria-label="PU Holdings 홈으로 이동"
          >
            <Image
              src="/images/logo.png"
              alt="(주)포항연합기술지주 로고"
              width={220}
              height={60}
              className={cn(
                "h-10 w-auto transition-all duration-500",
                scrolled ? "brightness-0 invert" : "brightness-0 invert"
              )}
              priority
            />
          </button>

          {/* Desktop nav */}
          <div className="hidden items-center gap-10 md:flex">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.href}
                onClick={() => handleClick(item.href)}
                className="text-[11px] font-medium tracking-[0.2em] text-primary-foreground/50 transition-colors duration-300 hover:text-primary-foreground"
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Mobile toggle */}
          <button
            className="relative z-[60] text-primary-foreground md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile fullscreen menu */}
      <div
        className={cn(
          "fixed inset-0 z-[55] flex flex-col justify-center bg-dark transition-all duration-500 md:hidden",
          mobileOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
      >
        <div className="px-12">
          {NAV_ITEMS.map((item, i) => (
            <button
              key={item.href}
              onClick={() => handleClick(item.href)}
              className="block w-full border-b border-dark-muted/20 py-6 text-left text-2xl font-light tracking-wide text-primary-foreground/60 transition-all duration-300 hover:text-gold hover:pl-2"
              style={{
                opacity: mobileOpen ? 1 : 0,
                transform: mobileOpen ? "translateY(0)" : "translateY(12px)",
                transitionDelay: mobileOpen ? `${150 + i * 60}ms` : "0ms",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
