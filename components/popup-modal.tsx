"use client"

import { useEffect, useState, useCallback } from "react"
import { usePathname } from "next/navigation"
import { X } from "lucide-react"

interface Popup {
  id: number
  title: string
  content: string | null
  image_url: string | null
  link_url: string | null
  link_label: string | null
}

const DISMISS_PREFIX = "puholdings_popup_dismiss_"

// Resolve an image reference: absolute URLs / root paths are used as-is,
// otherwise it's treated as a private blob pathname served via /api/file.
function resolveImage(src: string | null): string | null {
  if (!src) return null
  if (/^https?:\/\//.test(src) || src.startsWith("/")) return src
  return `/api/file?pathname=${encodeURIComponent(src)}`
}

function isDismissed(id: number): boolean {
  try {
    const raw = localStorage.getItem(`${DISMISS_PREFIX}${id}`)
    if (!raw) return false
    return new Date(raw).getTime() > Date.now()
  } catch {
    return false
  }
}

function dismissForToday(id: number) {
  try {
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    localStorage.setItem(`${DISMISS_PREFIX}${id}`, end.toISOString())
  } catch {
    // ignore storage failures
  }
}

export function PopupModal() {
  const pathname = usePathname()
  const [queue, setQueue] = useState<Popup[]>([])
  const [index, setIndex] = useState(0)

  // Do not render on admin / login pages.
  const isAdminArea = pathname?.startsWith("/admin") || pathname?.startsWith("/login")

  useEffect(() => {
    if (isAdminArea) return
    let cancelled = false

    fetch("/api/popups", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Popup[]) => {
        if (cancelled || !Array.isArray(data)) return
        // Already ordered by priority DESC, id DESC server-side. Skip dismissed ones.
        const visible = data.filter((p) => !isDismissed(p.id))
        setQueue(visible)
        setIndex(0)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [isAdminArea, pathname])

  const current = queue[index]

  const next = useCallback(() => {
    setIndex((i) => i + 1)
  }, [])

  const handleClose = useCallback(() => {
    next()
  }, [next])

  const handleDismissToday = useCallback(() => {
    if (current) dismissForToday(current.id)
    next()
  }, [current, next])

  // ESC key closes the current popup.
  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [current, handleClose])

  if (isAdminArea || !current) return null

  const imageSrc = resolveImage(current.image_url)
  const linkLabel = current.link_label || "자세히 보기"

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label={current.title}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close (top-right) */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="닫기"
          className="absolute right-3 top-3 z-10 rounded-full bg-black/30 p-1.5 text-white transition-colors hover:bg-black/50"
        >
          <X className="h-4 w-4" />
        </button>

        {imageSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc} alt={current.title} className="max-h-72 w-full object-cover" />
        )}

        <div className="p-6">
          <h2 className="text-lg font-bold text-dark">{current.title}</h2>
          {current.content && (
            <p className="mt-2 whitespace-pre-line text-sm text-text-secondary">{current.content}</p>
          )}

          {current.link_url && (
            <a
              href={current.link_url}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-dark px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-dark-muted"
            >
              {linkLabel}
            </a>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-warm-tan px-6 py-3">
          <button
            type="button"
            onClick={handleDismissToday}
            className="text-xs text-text-secondary transition-colors hover:text-dark"
          >
            오늘 하루 보지 않기
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="text-xs font-medium text-dark transition-colors hover:text-gold"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
