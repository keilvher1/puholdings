"use client"

import { useEffect } from "react"
import Link from "next/link"
import { InlineNotice, type NoticeTone } from "@/components/admin/expenses/ui"

// 화면 위쪽에 잠깐 띄우는 안내(저장·삭제 결과 등). 관리자 화면에 전역 토스트가 없어 인라인으로 보여 준다.

export interface Notice {
  tone: "success" | "error" | "info"
  text: string
  link?: { href: string; label: string }
}

const TONE: Record<Notice["tone"], NoticeTone> = {
  success: "success",
  error: "danger",
  info: "info",
}

export function NoticeBanner({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  // 성공 안내는 8초 뒤 저절로 닫는다(오류는 사용자가 닫을 때까지 둔다)
  useEffect(() => {
    if (!notice || notice.tone !== "success") return
    const t = setTimeout(onClose, 8000)
    return () => clearTimeout(t)
  }, [notice, onClose])

  if (!notice) return null
  return (
    <InlineNotice tone={TONE[notice.tone]} onClose={onClose} className="mb-4">
      {notice.text}
      {notice.link && (
        <Link href={notice.link.href} className="ml-2 font-semibold underline underline-offset-2">
          {notice.link.label}
        </Link>
      )}
    </InlineNotice>
  )
}
