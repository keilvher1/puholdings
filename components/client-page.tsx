"use client"

import { Navbar } from "@/components/sections/navbar"
import { HeroSection, type HeroContent } from "@/components/sections/hero-section"
import { StatsSection } from "@/components/sections/stats-section"
import { PhilosophySection } from "@/components/sections/philosophy-section"
import { AboutSection } from "@/components/sections/about-section"
import { PortfolioPreviewSection } from "@/components/sections/portfolio-preview-section"
import { NewsSection } from "@/components/sections/news-section"
import { ContactSection } from "@/components/sections/contact-section"
import { Footer, type ContactInfo } from "@/components/sections/footer"
import { Marquee } from "@/components/magicui/marquee"
import { ScrollParallax } from "@/components/magicui/scroll-parallax"

interface Props {
  stats: any[]
  portfolio: any[]
  news: any[]
  contact?: ContactInfo
  hero?: HeroContent
}

const MARQUEE_KEYWORDS = [
  "TECH COMMERCIALIZATION",
  "VENTURE INVESTMENT",
  "TIPS · LIPS",
  "ACCELERATING",
  "OPEN INNOVATION",
  "STARTUP INCUBATION",
  "POSTECH",
  "PU HOLDINGS",
]

export function ClientPage({ stats, portfolio, news, contact, hero }: Props) {
  return (
    <main className="overflow-x-hidden">
      <ScrollParallax />
      <Navbar />
      <HeroSection hero={hero} />
      <StatsSection stats={stats} />
      <div className="bg-dark">
        <Marquee items={MARQUEE_KEYWORDS} className="border-y border-gold/10" />
      </div>
      <PhilosophySection />
      <AboutSection />
      <NewsSection news={news} />
      <PortfolioPreviewSection companies={portfolio} />
      <ContactSection contact={contact} />
      <Footer contact={contact} />
    </main>
  )
}
