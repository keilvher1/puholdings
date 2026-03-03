"use client"

import { BlurFade } from "@/components/magicui/blur-fade"
import { Calendar, ArrowRight, Tag } from "lucide-react"

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
    month: "long",
    day: "numeric",
  })
}

export function NewsSection({ news }: { news: NewsItem[] }) {
  return (
    <section id="news" className="relative bg-background py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <BlurFade delay={0.1}>
          <div className="mb-4 text-center">
            <span className="text-xs font-semibold tracking-widest text-blue-accent">
              NEWS & UPDATES
            </span>
          </div>
          <h2 className="mb-4 text-center text-3xl font-bold text-foreground md:text-4xl text-balance">
            최신 소식
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center leading-relaxed text-muted-foreground">
            포항연합기술지주의 투자 소식과 주요 활동을 확인하세요.
          </p>
        </BlurFade>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {news.map((item, i) => (
            <BlurFade key={item.id} delay={0.15 + i * 0.08}>
              <article className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-blue-accent/30 hover:shadow-lg hover:shadow-blue-accent/5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-accent/10 px-3 py-1 text-[10px] font-semibold text-blue-accent">
                    <Tag size={10} />
                    {item.category}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar size={10} />
                    {formatDate(item.published_at)}
                  </span>
                </div>

                <h3 className="mb-3 text-base font-bold leading-snug text-foreground text-balance">
                  {item.title}
                </h3>

                {item.summary && (
                  <p className="mb-4 flex-1 text-sm leading-relaxed text-muted-foreground line-clamp-3">
                    {item.summary}
                  </p>
                )}

                <div className="mt-auto flex items-center gap-1 text-sm font-medium text-blue-accent transition-colors group-hover:text-blue-light">
                  {"자세히 보기"}
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </div>
              </article>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  )
}
