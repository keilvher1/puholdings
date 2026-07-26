"use client"

import { cn } from "@/lib/utils"

interface MarqueeProps {
  items: string[]
  className?: string
}

// 키워드 마퀴 밴드 — 2벌 복제해 translateX(-50%) 무한 루프, 호버 시 일시정지
export function Marquee({ items, className }: MarqueeProps) {
  const row = (key: string) => (
    <div key={key} aria-hidden={key === "b"} className="flex shrink-0 items-center">
      {items.map((item, i) => (
        <span key={i} className="flex items-center">
          <span className="px-8 text-[13px] font-semibold tracking-[0.35em] text-gold/35 lg:text-sm">
            {item}
          </span>
          <span className="h-1 w-1 rounded-full bg-gold/30" />
        </span>
      ))}
    </div>
  )

  return (
    <div className={cn("marquee py-6", className)}>
      <div className="marquee-track">
        {row("a")}
        {row("b")}
      </div>
    </div>
  )
}
