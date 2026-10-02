"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { toastSuccess, useConfirm } from "@/components/saas"
import { friendlyError, MSG } from "@/lib/messages"

// 팝업 목록의 표시 스위치·삭제 버튼(계획서 4.1.7: 브라우저 확인 창 → useConfirm(위험)).

export function PopupActiveToggle({ id, isActive, title }: { id: number; isActive: boolean; title?: string }) {
  const router = useRouter()
  const [active, setActive] = useState(isActive)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const toggle = async () => {
    setLoading(true)
    setError("")
    const next = !active
    try {
      const res = await fetch(`/api/admin/popups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setActive(next)
        router.refresh()
      } else setError(friendlyError(res.status, data.error, MSG.saveFailed))
    } catch {
      setError(friendlyError(0, null, MSG.saveFailed))
    } finally {
      setLoading(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      role="switch"
      aria-checked={active}
      aria-label={`${title ? `‘${title}’ ` : ""}팝업 홈페이지에 표시`}
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
      {error && (
        <span role="alert" className="text-sm text-red-800">
          {error}
        </span>
      )}
    </span>
  )
}

export function PopupDeleteButton({ id, title }: { id: number; title?: string }) {
  const router = useRouter()
  const ask = useConfirm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const name = title?.trim() ? `‘${title.trim()}’` : "이"

  const handleDelete = async () => {
    if (
      !(await ask({
        title: `${name} 팝업을 삭제할까요?`,
        body: "홈페이지에서 바로 사라지고 되돌릴 수 없어요.",
        confirmLabel: "삭제하기",
        tone: "danger",
      }))
    )
      return
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/admin/popups/${id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success !== false) {
        toastSuccess(`${name} 팝업을 삭제했어요`)
        router.refresh()
      } else setError(friendlyError(res.status, data.error, MSG.deleteFailed))
    } catch {
      setError(friendlyError(0, null, MSG.deleteFailed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      {error && (
        <span role="alert" className="max-w-48 text-sm text-red-800">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        aria-label={`${title?.trim() || "팝업"} 삭제`}
        title="삭제"
        className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </span>
  )
}
