"use client"

import { cn } from "@/lib/utils"
import type { ComponentPropsWithoutRef } from "react"

interface ShimmerButtonProps extends ComponentPropsWithoutRef<"button"> {
  shimmerColor?: string
  shimmerSize?: string
  borderRadius?: string
  shimmerDuration?: string
  background?: string
  className?: string
  children?: React.ReactNode
}

export function ShimmerButton({
  shimmerColor = "#ffffff",
  shimmerSize = "0.1em",
  borderRadius = "100px",
  shimmerDuration = "2s",
  background = "linear-gradient(135deg, #1a1a2e, #c9a84c)",
  className,
  children,
  ...props
}: ShimmerButtonProps) {
  return (
    <button
      className={cn(
        "group relative inline-flex items-center justify-center overflow-hidden whitespace-nowrap px-8 py-3 text-sm font-medium text-primary-foreground transition-all duration-300 hover:scale-105",
        className
      )}
      style={{
        borderRadius,
        background,
      }}
      {...props}
    >
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ borderRadius }}
      >
        <div
          className="absolute inset-0 animate-shimmer"
          style={{
            background: `linear-gradient(90deg, transparent, ${shimmerColor}20, transparent)`,
            backgroundSize: "200% 100%",
            animationDuration: shimmerDuration,
          }}
        />
      </div>
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </button>
  )
}
