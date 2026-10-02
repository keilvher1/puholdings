"use client"

// 작업 전 안내(회색 상자). storageKey를 주면 [닫기]를 누른 뒤 다시 보이지 않는다(localStorage, 실패해도 정상 표시).
// notice.tsx가 다시 내보낸다 — import는 "@/components/saas"에서.
//
// 사용 예:
//   <Callout storageKey="home-whats-new-2026-10" title="이번에 바뀐 것">메뉴 이름이 바뀌었어요 …</Callout>

import { useEffect, useState, type ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1"
  } catch {
    return false
  }
}

export function Callout({
  storageKey,
  title,
  action,
  className,
  children,
}: {
  storageKey?: string
  title?: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  // 서버 렌더와 첫 화면을 맞추려고 처음에는 보이고, 마운트 뒤 기억된 값을 읽는다
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (storageKey && readDismissed(storageKey)) setHidden(true)
  }, [storageKey])
  if (hidden) return null
  const dismiss = () => {
    setHidden(true)
    if (!storageKey) return
    try {
      window.localStorage.setItem(storageKey, "1")
    } catch {
      // 저장하지 못해도 이번 화면에서는 닫힌다
    }
  }
  return (
    <div role="note" className={cn("flex items-start gap-3 rounded-md border border-warm-tan bg-warm-beige/50 px-4 py-3 text-base text-dark", className)}>
      <div className="min-w-0 flex-1 leading-relaxed [word-break:keep-all]">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn(title && "mt-1", "text-[#3f3f4e]")}>{children}</div>
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
      {storageKey && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="안내 닫기"
          className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[#3f3f4e] hover:bg-warm-beige"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}
