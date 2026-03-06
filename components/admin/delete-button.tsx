"use client"

import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

interface DeleteButtonProps {
  id: number
  type: "news" | "portfolio"
}

export function DeleteButton({ id, type }: DeleteButtonProps) {
  const router = useRouter()

  const handleDelete = async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return

    await fetch(`/api/admin/${type}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
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
