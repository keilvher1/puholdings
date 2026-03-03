"use client"

import { cn } from "@/lib/utils"

interface BorderBeamProps {
  className?: string
  size?: number
  duration?: number
  delay?: number
  colorFrom?: string
  colorTo?: string
}

export function BorderBeam({
  className,
  size = 200,
  duration = 8,
  delay = 0,
  colorFrom = "#c9a84c",
  colorTo = "#dbb960",
}: BorderBeamProps) {
  const id = `border-beam-${Math.random().toString(36).slice(2, 9)}`

  return (
    <>
      <style>{`
        @keyframes ${id} {
          0% { offset-distance: 0%; }
          100% { offset-distance: 100%; }
        }
      `}</style>
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          className
        )}
        style={{
          overflow: "hidden",
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: "1px",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: size,
            height: size,
            background: `conic-gradient(from 0deg, transparent 0%, ${colorFrom} 20%, ${colorTo} 40%, transparent 60%)`,
            borderRadius: "50%",
            filter: "blur(6px)",
            offsetPath: "rect(0 100% 100% 0 round 0)",
            animation: `${id} ${duration}s linear ${delay}s infinite`,
          }}
        />
      </div>
    </>
  )
}
