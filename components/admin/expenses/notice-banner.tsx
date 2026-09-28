"use client"

import { useEffect } from "react"
import Link from "next/link"
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react"

// 화면 위쪽에 잠깐 띄우는 안내(저장·삭제 결과 등). 관리자 화면에 전역 토스트가 없어 인라인으로 보여 준다.

export interface Notice {
  tone: "success" | "error" | "info"
  text: string
  link?: { href: string; label: string }
}

const TONE: Record<Notice["tone"], string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-warm-tan bg-warm-beige/50 text-dark",
}

export function NoticeBanner({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  // 성공 안내는 8초 뒤 저절로 닫는다(오류는 사용자가 닫을 때까지 둔다)
  useEffect(() => {
    if (!notice || notice.tone !== "success") return
    const t = setTimeout(onClose, 8000)
    return () => clearTimeout(t)
  }, [notice, onClose])

  if (!notice) return null
  const Icon = notice.tone === "success" ? CheckCircle2 : notice.tone === "error" ? TriangleAlert : Info
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className={`mb-4 flex items-start gap-2 rounded-md border px-3.5 py-2.5 text-sm ${TONE[notice.tone]}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1 [word-break:keep-all]">
        {notice.text}
        {notice.link && (
          <Link href={notice.link.href} className="ml-2 font-semibold underline underline-offset-2">
            {notice.link.label} →
          </Link>
        )}
      </p>
      <button type="button" aria-label="안내 닫기" onClick={onClose} className="opacity-60 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
