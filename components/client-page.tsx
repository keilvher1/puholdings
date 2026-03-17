"use client"

import { Navbar } from "@/components/sections/navbar"
import { HeroSection } from "@/components/sections/hero-section"
import { StatsSection } from "@/components/sections/stats-section"
import { PortfolioSection } from "@/components/sections/portfolio-section"
import { PhilosophySection } from "@/components/sections/philosophy-section"
import { AboutSection } from "@/components/sections/about-section"
import { OrganizationSection } from "@/components/sections/organization-section"
import { HistorySection } from "@/components/sections/history-section"
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
    <main className="overflow-x-hidden">
      <Navbar />
      <HeroSection />
      <StatsSection stats={stats} />
      <PortfolioSection companies={portfolio} />
      <PhilosophySection />
      <AboutSection />
      <OrganizationSection />
      <HistorySection />
      <NewsSection news={news} />
      <ContactSection />
      <Footer />
    </main>
  )
}
