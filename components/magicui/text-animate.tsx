"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface TextAnimateProps {
  children: string
  className?: string
  delay?: number
  by?: "character" | "word"
  animation?: "fadeIn" | "blurIn" | "slideUp"
}

export function TextAnimate({
  children,
  className,
  delay = 0,
  by = "word",
  animation = "blurIn",
}: TextAnimateProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsInView(true)
      },
      { threshold: 0.3 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const segments = by === "character" ? children.split("") : children.split(" ")

  return (
    <span ref={ref} className={cn("inline-flex flex-wrap", className)}>
      {segments.map((segment, i) => {
        const segDelay = delay + i * 0.04

        const styles: React.CSSProperties = {
          opacity: isInView ? 1 : 0,
          filter: animation === "blurIn" ? (isInView ? "blur(0px)" : "blur(8px)") : undefined,
          transform:
            animation === "slideUp"
              ? isInView
                ? "translateY(0)"
                : "translateY(20px)"
              : undefined,
          transition: `all 0.4s ease ${segDelay}s`,
          display: "inline-block",
        }

        return (
          <span key={i} style={styles}>
            {segment}
            {by === "word" && <span>&nbsp;</span>}
          </span>
        )
      })}
    </span>
  )
}
