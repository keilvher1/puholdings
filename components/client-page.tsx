"use client"

import { Navbar } from "@/components/sections/navbar"
import { HeroSection } from "@/components/sections/hero-section"
import { AboutSection } from "@/components/sections/about-section"
import { StatsSection } from "@/components/sections/stats-section"
import { PhilosophySection } from "@/components/sections/philosophy-section"
import { PortfolioSection } from "@/components/sections/portfolio-section"
import { NewsSection } from "@/components/sections/news-section"
import { ContactSection } from "@/components/sections/contact-section"
import { Footer } from "@/components/sections/footer"

interface Props {
  stats: any[]
  portfolio: any[]
  news: any[]
}

export function ClientPage({ stats, portfolio, news }: Props) {
  return (
    <main>
      <Navbar />
      <HeroSection />
      <AboutSection />
      <StatsSection stats={stats} />
      <PhilosophySection />
      <PortfolioSection companies={portfolio} />
      <NewsSection news={news} />
      <ContactSection />
      <Footer />
    </main>
  )
}
