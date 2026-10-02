"use client"

// 소식·포트폴리오 목록의 삭제 버튼(계획서 4.1.7). 브라우저 확인 창 대신 useConfirm(위험).
// itemName이 없으면 "이 항목"으로 묻는다. 실패하면 버튼 옆에 짧은 오류 글자를 남긴다(입력값이 없는 동작이라 Notice 대신).

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { toastSuccess, useConfirm } from "@/components/saas"
import { friendlyError, MSG } from "@/lib/messages"

interface DeleteButtonProps {
  id: number
  type: "news" | "portfolio"
  /** 확인창·토스트에 보일 이름(소식 제목·기업명) */
  itemName?: string
}

const KIND: Record<DeleteButtonProps["type"], string> = { news: "소식", portfolio: "포트폴리오" }
/** 목적격 조사까지 붙인 이름(받침 있음 → 을, 없음 → 를) */
const KIND_OBJ: Record<DeleteButtonProps["type"], string> = { news: "소식을", portfolio: "포트폴리오를" }

export function DeleteButton({ id, type, itemName }: DeleteButtonProps) {
  const router = useRouter()
  const ask = useConfirm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const name = itemName?.trim() ? `‘${itemName.trim()}’` : "이 항목"

  const handleDelete = async () => {
    if (
      !(await ask({
        title: `${name} ${KIND_OBJ[type]} 삭제할까요?`,
        consequences: ["홈페이지에서 바로 사라져요", "되돌릴 수 없어요"],
        confirmLabel: "삭제하기",
        tone: "danger",
      }))
    )
      return
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/admin/${type}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success !== false) {
        toastSuccess(`${name} ${KIND_OBJ[type]} 삭제했어요`)
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
        aria-label={`${itemName?.trim() || KIND[type]} 삭제`}
        title="삭제"
        className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </span>
  )
}
