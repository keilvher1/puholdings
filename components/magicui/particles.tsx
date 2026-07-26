"use client"

import { useEffect, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"

interface ParticlesProps {
  className?: string
  quantity?: number
  color?: string
  size?: number
  speed?: number
  /** 마우스 인력 + 마우스 연결선 (히어로용) */
  interactive?: boolean
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  alpha: number
  targetAlpha: number
}

const LINK_DIST = 130

export function Particles({
  className,
  quantity = 60,
  color = "#c9a84c",
  size = 1.5,
  speed = 0.3,
  interactive = false,
}: ParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animationRef = useRef<number>(0)
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false })

  const hexToRgb = useCallback((hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
      ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
      : { r: 30, g: 136, b: 229 }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0

    const resize = () => {
      w = canvas.offsetWidth
      h = canvas.offsetHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    window.addEventListener("resize", resize)

    particlesRef.current = Array.from({ length: quantity }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * speed,
      vy: (Math.random() - 0.5) * speed,
      size: Math.random() * size + 0.5,
      alpha: 0,
      targetAlpha: Math.random() * 0.6 + 0.1,
    }))

    const onMouseMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top, active: true }
    }
    const onMouseLeave = () => {
      mouseRef.current.active = false
    }
    if (interactive) {
      window.addEventListener("mousemove", onMouseMove)
      document.addEventListener("mouseleave", onMouseLeave)
    }

    const rgb = hexToRgb(color)
    const mouse = mouseRef.current

    const animate = () => {
      ctx.clearRect(0, 0, w, h)

      particlesRef.current.forEach((p) => {
        p.x += p.vx
        p.y += p.vy

        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1

        // 마우스 인력 (가까운 점만 약하게)
        if (interactive && mouse.active) {
          const dx = mouse.x - p.x
          const dy = mouse.y - p.y
          if (dx * dx + dy * dy < 180 * 180) {
            p.x += dx * 0.004
            p.y += dy * 0.004
          }
        }

        p.alpha += (p.targetAlpha - p.alpha) * 0.02

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${p.alpha})`
        ctx.fill()
      })

      // Draw connections
      for (let i = 0; i < particlesRef.current.length; i++) {
        for (let j = i + 1; j < particlesRef.current.length; j++) {
          const a = particlesRef.current[i]
          const b = particlesRef.current[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < LINK_DIST) {
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.09 * (1 - dist / LINK_DIST)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
        // 마우스와의 연결선
        if (interactive && mouse.active) {
          const a = particlesRef.current[i]
          const dx = a.x - mouse.x
          const dy = a.y - mouse.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < LINK_DIST) {
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(mouse.x, mouse.y)
            ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.28 * (1 - dist / LINK_DIST)})`
            ctx.lineWidth = 0.6
            ctx.stroke()
          }
        }
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", resize)
      if (interactive) {
        window.removeEventListener("mousemove", onMouseMove)
        document.removeEventListener("mouseleave", onMouseLeave)
      }
      cancelAnimationFrame(animationRef.current)
    }
  }, [quantity, color, size, speed, interactive, hexToRgb])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    />
  )
}
