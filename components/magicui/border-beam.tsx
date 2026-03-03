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
  colorFrom = "#1e88e5",
  colorTo = "#00bcd4",
}: BorderBeamProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit]",
        className
      )}
      style={{
        overflow: "hidden",
        WebkitMask:
          "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
        padding: "1px",
        borderRadius: "inherit",
      }}
    >
      <div
        className="absolute"
        style={{
          width: size,
          height: size,
          background: `linear-gradient(${colorFrom}, ${colorTo})`,
          borderRadius: "50%",
          filter: "blur(4px)",
          animation: `border-beam-spin ${duration}s linear ${delay}s infinite`,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          offsetPath: `rect(0 auto auto 0)`,
        }}
      />
      <style>{`
        @keyframes border-beam-spin {
          0% { transform: rotate(0deg) translateX(calc(50% + 20px)); }
          100% { transform: rotate(360deg) translateX(calc(50% + 20px)); }
        }
      `}</style>
    </div>
  )
}
