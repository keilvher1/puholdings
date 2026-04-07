"use client"

import { BlurFade } from "@/components/magicui/blur-fade"
import { ArrowUpRight } from "lucide-react"
import Image from "next/image"

interface NewsItem {
  id: number
  title: string
  summary: string | null
  category: string
  published_at: string
  image_url?: string | null
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}.${m}.${day}`
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
            <button className="hidden items-center gap-1 text-[11px] font-medium tracking-[0.2em] text-text-secondary transition-colors hover:text-foreground lg:flex">
              MORE
              <ArrowUpRight size={12} />
            </button>
          </div>
        </BlurFade>

        {/* News Grid with Images */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {news.slice(0, 6).map((item, i) => (
            <BlurFade key={item.id} delay={0.1 + i * 0.05}>
              <article className="group cursor-pointer overflow-hidden rounded-lg border border-warm-tan bg-white transition-all hover:border-gold/40 hover:shadow-lg">
                {/* Image */}
                <div className="relative aspect-[16/10] overflow-hidden bg-warm-tan/20">
                  {item.image_url ? (
                    <Image
                      src={`/api/file?pathname=${encodeURIComponent(item.image_url)}`}
                      alt={item.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gold/10 to-warm-tan/30">
                      <span className="text-3xl font-bold text-gold/30">NEWS</span>
                    </div>
                  )}
                </div>
                
                {/* Content */}
                <div className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[10px] font-medium tracking-[0.15em] text-gold">
                      {item.category.toUpperCase()}
                    </span>
                    <span className="text-[11px] tabular-nums text-text-secondary">
                      {formatDate(item.published_at)}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-gold lg:text-[15px] line-clamp-2">
                    {item.title}
                  </h3>
                  {item.summary && (
                    <p className="mt-2 text-xs leading-relaxed text-text-secondary line-clamp-2">
                      {item.summary}
                    </p>
                  )}
                </div>
              </article>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  )
}
