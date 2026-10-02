"use client"

// 문의 목록의 [확인함으로 표시]·[삭제](계획서 4.1.7: 브라우저 확인 창 → useConfirm(위험)).

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MailOpen, Trash2 } from "lucide-react"
import { toastSuccess, useConfirm } from "@/components/saas"
import { friendlyError, MSG } from "@/lib/messages"

interface InquiryActionsProps {
  id: number
  isRead: boolean
  /** 확인창에 보일 이름(문의한 사람·회사) */
  label?: string
}

export function InquiryActions({ id, isRead, label }: InquiryActionsProps) {
  const router = useRouter()
  const ask = useConfirm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const handleMarkRead = async () => {
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/admin/inquiries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_read: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success !== false) router.refresh()
      else setError(friendlyError(res.status, data.error, MSG.saveFailed))
    } catch {
      setError(friendlyError(0, null, MSG.saveFailed))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (
      !(await ask({
        title: label?.trim() ? `‘${label.trim()}’ 문의를 삭제할까요?` : "이 문의를 삭제할까요?",
        consequences: ["되돌릴 수 없어요"],
        confirmLabel: "삭제하기",
        tone: "danger",
      }))
    )
      return
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/admin/inquiries", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success !== false) {
        toastSuccess("문의를 삭제했어요")
        router.refresh()
      } else setError(friendlyError(res.status, data.error, MSG.deleteFailed))
    } catch {
      setError(friendlyError(0, null, MSG.deleteFailed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-1">
      {error && (
        <span role="alert" className="max-w-48 text-sm text-red-800">
          {error}
        </span>
      )}
      {!isRead && (
        <button
          type="button"
          onClick={handleMarkRead}
          disabled={busy}
          className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-warm-beige hover:text-dark disabled:opacity-50"
          title="확인함으로 표시"
          aria-label={`${label?.trim() ? `${label.trim()} ` : ""}문의 확인함으로 표시`}
        >
          <MailOpen className="h-4 w-4" aria-hidden />
        </button>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
        title="삭제"
        aria-label={`${label?.trim() ? `${label.trim()} ` : ""}문의 삭제`}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
