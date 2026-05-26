"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

export function PopupActiveToggle({ id, isActive }: { id: number; isActive: boolean }) {
  const router = useRouter()
  const [active, setActive] = useState(isActive)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    setLoading(true)
    const next = !active
    try {
      const res = await fetch(`/api/admin/popups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      })
      const data = await res.json()
      if (data.success) {
        setActive(next)
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      role="switch"
      aria-checked={active}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
        active ? "bg-gold" : "bg-warm-tan"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          active ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  )
}

export function PopupDeleteButton({ id }: { id: number }) {
  const router = useRouter()

  const handleDelete = async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return
    await fetch(`/api/admin/popups/${id}`, { method: "DELETE" })
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      className="rounded p-1.5 text-text-secondary hover:bg-destructive/10 hover:text-destructive transition-colors"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
