"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileText, Download, Eye, Loader2 } from "lucide-react"
import { getPreviewInfo, isImageFile } from "@/lib/convert"
import type { Attachment } from "@/lib/db"

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / Math.pow(1024, i)
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

const POLL_INTERVAL_MS = 5000
const POLL_MAX_MS = 3 * 60 * 1000

function fileUrl(pathname: string, name?: string, download?: boolean): string {
  const params = new URLSearchParams({ pathname })
  if (download) params.set("download", "1")
  if (name) params.set("name", name)
  return `/api/file?${params}`
}

function PreviewDialog({
  open,
  onOpenChange,
  attachment,
  previewPathname,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  attachment: Attachment | null
  previewPathname: string | null
}) {
  if (!attachment || !previewPathname) return null
  const image = isImageFile(attachment)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[100dvh] w-screen max-w-none rounded-none p-0 sm:h-[80vh] sm:w-[90vw] sm:max-w-4xl sm:rounded-lg">
        <DialogHeader className="border-b border-warm-tan px-4 py-3">
          <DialogTitle className="truncate pr-8 text-sm">{attachment.name}</DialogTitle>
        </DialogHeader>
        <div className="h-full w-full overflow-auto bg-warm-beige/40 p-2">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fileUrl(previewPathname)}
              alt={attachment.name}
              className="mx-auto max-h-full max-w-full object-contain"
            />
          ) : (
            <iframe
              src={fileUrl(previewPathname)}
              className="h-full w-full border-0"
              title={attachment.name}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// 단일 첨부의 미리보기 버튼 + Dialog (편집 위젯 등에서 재사용).
// 미리보기가 불가능하면 아무것도 렌더링하지 않는다.
export function AttachmentPreviewButton({ attachment }: { attachment: Attachment }) {
  const [open, setOpen] = useState(false)
  const preview = getPreviewInfo(attachment)
  if (!preview.previewable || !preview.pathname) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded p-1.5 text-text-secondary transition-colors hover:bg-warm-beige hover:text-dark"
        title="미리보기"
      >
        <Eye className="h-4 w-4" />
      </button>
      <PreviewDialog
        open={open}
        onOpenChange={setOpen}
        attachment={attachment}
        previewPathname={preview.pathname}
      />
    </>
  )
}

function AttachmentRow({ attachment }: { attachment: Attachment }) {
  const [att, setAtt] = useState(attachment)
  const [previewOpen, setPreviewOpen] = useState(false)
  const pollStartRef = useRef<number | null>(null)

  // 다른 첨부로 교체될 때만 로컬 상태·폴링 예산을 리셋한다.
  // (같은 pathname으로 부모가 재렌더될 때 폴링으로 얻은 done 상태를 덮어쓰지 않도록)
  useEffect(() => {
    setAtt((prev) => (prev.pathname === attachment.pathname ? prev : attachment))
    pollStartRef.current = null
  }, [attachment])

  const converting = att.preview_status === "pending" || att.preview_status === "processing"

  // 변환 중이면 5초 간격 폴링 (최대 3분)
  useEffect(() => {
    if (!converting) return
    if (pollStartRef.current === null) pollStartRef.current = Date.now()
    let cancelled = false

    const timer = setInterval(async () => {
      if (pollStartRef.current !== null && Date.now() - pollStartRef.current > POLL_MAX_MS) {
        clearInterval(timer)
        return
      }
      try {
        const res = await fetch(`/api/conversions?pathname=${encodeURIComponent(att.pathname)}`, {
          credentials: "include",
        })
        const data = await res.json()
        if (cancelled) return
        if (data.success && data.status === "done" && data.preview_pathname) {
          setAtt((prev) => ({ ...prev, preview_status: "done", preview_pathname: data.preview_pathname }))
          clearInterval(timer)
        } else if (data.success && data.status === "failed") {
          setAtt((prev) => ({ ...prev, preview_status: "failed" }))
          clearInterval(timer)
        }
      } catch {
        // 폴링 실패는 조용히 무시 (다음 주기 재시도)
      }
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [converting, att.pathname])

  const preview = getPreviewInfo(att)

  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-warm-tan bg-warm-beige/30 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-text-secondary" />
        <span className="truncate text-sm text-dark">{att.name}</span>
        {att.size > 0 && <span className="shrink-0 text-xs text-text-tertiary">({formatBytes(att.size)})</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {converting && (
          <span className="flex items-center gap-1 px-1.5 text-xs text-text-secondary">
            <Loader2 className="h-3 w-3 animate-spin" /> 변환 중…
          </span>
        )}
        {preview.previewable && preview.pathname && !converting && (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="flex items-center gap-1 rounded p-1.5 text-text-secondary transition-colors hover:bg-warm-beige hover:text-dark"
            title="미리보기"
          >
            <Eye className="h-4 w-4" />
          </button>
        )}
        <a
          href={fileUrl(att.pathname, att.name, true)}
          className="rounded p-1.5 text-text-secondary transition-colors hover:bg-warm-beige hover:text-dark"
          title="다운로드"
        >
          <Download className="h-4 w-4" />
        </a>
      </div>

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        attachment={att}
        previewPathname={preview.pathname ?? null}
      />
    </li>
  )
}

export function AttachmentList({
  attachments,
  className = "",
}: {
  attachments: Attachment[] | null | undefined
  className?: string
}) {
  if (!Array.isArray(attachments) || attachments.length === 0) return null
  return (
    <ul className={`space-y-2 ${className}`}>
      {attachments.map((att) => (
        <AttachmentRow key={att.pathname} attachment={att} />
      ))}
    </ul>
  )
}
