"use client"

import { BlurFade } from "@/components/magicui/blur-fade"
import { ArrowUpRight } from "lucide-react"

interface NewsItem {
  id: number
  title: string
  summary: string | null
  category: string
  published_at: string
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).replace(/\. /g, ".").replace(/\.$/, "")
}

export function NewsSection({ news }: { news: NewsItem[] }) {
  return (
    <section id="news" className="relative bg-warm-ivory py-28 lg:py-40">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* Header */}
        <BlurFade delay={0.1}>
          <div className="mb-6 flex items-center gap-4">
            <div className="editorial-rule" />
            <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
              NOTICE
            </span>
          </div>
          <div className="mb-16 flex items-end justify-between">
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground lg:text-5xl text-balance">
              {"최신 소식"}
            </h2>
            <button className="hidden text-[11px] font-medium tracking-[0.2em] text-text-secondary transition-colors hover:text-foreground lg:block">
              MORE
              <ArrowUpRight size={12} className="ml-1 inline-block" />
            </button>
          </div>
        </BlurFade>

        {/* News list - editorial table style */}
        <div className="space-y-0">
          {news.map((item, i) => (
            <BlurFade key={item.id} delay={0.12 + i * 0.06}>
              <article className="group grid grid-cols-12 gap-4 border-t border-warm-tan py-7 transition-colors hover:border-gold/40 cursor-pointer lg:py-8">
                <div className="col-span-12 lg:col-span-2">
                  <span className="text-[10px] font-medium tracking-[0.15em] text-gold">
                    {item.category.toUpperCase()}
                  </span>
                </div>
                <div className="col-span-10 lg:col-span-7">
                  <h3 className="text-sm font-bold text-foreground transition-colors group-hover:text-gold lg:text-base text-balance">
                    {item.title}
                  </h3>
                  {item.summary && (
                    <p className="mt-2 hidden text-sm leading-relaxed text-text-secondary line-clamp-1 lg:block">
                      {item.summary}
                    </p>
                  )}
                </div>
                <div className="col-span-2 flex items-start justify-end lg:col-span-3">
                  <span className="text-xs tabular-nums text-text-secondary">
                    {formatDate(item.published_at)}
                  </span>
                </div>
              </article>
            </BlurFade>
          ))}
          <div className="border-t border-warm-tan" />
        </div>
      </div>
    </section>
  )
}
