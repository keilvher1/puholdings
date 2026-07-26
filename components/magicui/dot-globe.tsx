"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface DotGlobeProps {
  className?: string
  /** 캔버스 한 변 크기(px) */
  size?: number
  dots?: number
  color?: string
}

// 피보나치 구 분포 도트 글로브 — three.js 없이 캔버스 원근 투영만 사용
export function DotGlobe({ className, size = 480, dots = 500, color = "#c9a84c" }: DotGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // 피보나치 구
    const GA = Math.PI * (3 - Math.sqrt(5))
    const pts: { x: number; y: number; z: number }[] = []
    for (let i = 0; i < dots; i++) {
      const y = 1 - (i / (dots - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const th = GA * i
      pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r })
    }

    // 펄스 아크: 인덱스 기반 결정적 점 쌍 (SSR/리렌더 안정)
    const arcs = Array.from({ length: 6 }, (_, i) => ({
      a: (i * 83 + 17) % dots,
      b: (i * 149 + 61) % dots,
      phase: (i * 0.9) % (Math.PI * 2),
    }))

    const rgb = (() => {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color)
      return m
        ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
        : { r: 201, g: 168, b: 76 }
    })()

    const cx = size / 2
    const cy = size / 2
    const R = size * 0.36
    const tiltX = -0.35
    let rotY = 0

    const project = (p: { x: number; y: number; z: number }) => {
      // Y축 회전
      const cosY = Math.cos(rotY)
      const sinY = Math.sin(rotY)
      let x = p.x * cosY + p.z * sinY
      let z = -p.x * sinY + p.z * cosY
      // X축 틸트
      const cosX = Math.cos(tiltX)
      const sinX = Math.sin(tiltX)
      const y = p.y * cosX - z * sinX
      z = p.y * sinX + z * cosX
      // 원근 투영
      const persp = 1.6 / (1.6 + z * 0.6)
      return { sx: cx + x * R * persp, sy: cy + y * R * persp, z, persp }
    }

    let t = 0
    const animate = () => {
      ctx.clearRect(0, 0, size, size)
      rotY += 0.0022
      t += 0.016

      const projected = pts.map(project)

      // 도트 (깊이에 따라 크기/투명도 차등)
      for (const q of projected) {
        const depth = (q.z + 1) / 2 // 0(뒤) ~ 1(앞)
        const alpha = 0.08 + (1 - depth) * 0.5
        const r = 0.6 + (1 - depth) * 1.3
        ctx.beginPath()
        ctx.arc(q.sx, q.sy, r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
        ctx.fill()
      }

      // 펄스 아크 (quadratic curve)
      for (const arc of arcs) {
        const pulse = (Math.sin(t * 0.8 + arc.phase) + 1) / 2
        if (pulse < 0.15) continue
        const a = projected[arc.a]
        const b = projected[arc.b]
        const mx = (a.sx + b.sx) / 2
        const my = (a.sy + b.sy) / 2 - size * 0.08
        ctx.beginPath()
        ctx.moveTo(a.sx, a.sy)
        ctx.quadraticCurveTo(mx, my, b.sx, b.sy)
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${pulse * 0.22})`
        ctx.lineWidth = 0.8
        ctx.stroke()
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()
    return () => cancelAnimationFrame(animationRef.current)
  }, [size, dots, color])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn("pointer-events-none select-none", className)}
    />
  )
}
