"use client"

import { useRouter } from "next/navigation"
import { MailOpen, Trash2 } from "lucide-react"

interface InquiryActionsProps {
  id: number
  isRead: boolean
}

export function InquiryActions({ id, isRead }: InquiryActionsProps) {
  const router = useRouter()

  const handleMarkRead = async () => {
    await fetch("/api/admin/inquiries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_read: true }),
    })
    router.refresh()
  }

  const handleDelete = async () => {
    if (!confirm("이 문의를 삭제하시겠습니까?")) return
    
    await fetch("/api/admin/inquiries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1">
      {!isRead && (
        <button
          onClick={handleMarkRead}
          className="rounded p-2 text-text-secondary hover:bg-warm-beige hover:text-dark transition-colors"
          title="읽음으로 표시"
        >
          <MailOpen className="h-4 w-4" />
        </button>
      )}
      <button
        onClick={handleDelete}
        className="rounded p-2 text-text-secondary hover:bg-destructive/10 hover:text-destructive transition-colors"
        title="삭제"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
