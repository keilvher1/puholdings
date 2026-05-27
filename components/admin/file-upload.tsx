"use client"

import { useRef, useState } from "react"
import { Paperclip, FileText, X, Loader2, Download } from "lucide-react"
import type { Attachment } from "@/lib/db"

interface FileUploadProps {
  value: Attachment[]
  onChange: (files: Attachment[]) => void
  folder?: string
  label?: string
}

const ACCEPT =
  ".pdf,.doc,.docx,.hwp,.hwpx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.jpg,.jpeg,.png,.gif,.webp"

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / Math.pow(1024, i)
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function FileUpload({ value, onChange, folder = "attachments", label = "첨부파일" }: FileUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setError("")
    setUploading(true)

    const uploaded: Attachment[] = []
    for (const file of files) {
      try {
        const formData = new FormData()
        formData.append("file", file)
        formData.append("folder", folder)

        const res = await fetch("/api/admin/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        })
        const data = await res.json()

        if (data.success) {
          uploaded.push({
            name: file.name,
            pathname: data.pathname,
            size: file.size,
            type: file.type || "",
          })
        } else {
          setError(`${file.name}: ${data.error || "업로드 실패"}`)
        }
      } catch {
        setError(`${file.name}: 서버 오류가 발생했습니다`)
      }
    }

    if (uploaded.length > 0) onChange([...value, ...uploaded])
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ""
  }

  const handleRemove = async (pathname: string) => {
    try {
      await fetch("/api/admin/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathname }),
        credentials: "include",
      })
    } catch {
      // ignore delete errors; still remove from the list
    }
    onChange(value.filter((f) => f.pathname !== pathname))
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-dark">{label}</label>

      {error && (
        <div className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>
      )}

      {value.length > 0 && (
        <ul className="mb-3 space-y-2">
          {value.map((file) => (
            <li
              key={file.pathname}
              className="flex items-center justify-between gap-3 rounded-md border border-warm-tan bg-warm-beige/30 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-text-secondary" />
                <span className="truncate text-sm text-dark">{file.name}</span>
                <span className="shrink-0 text-xs text-text-tertiary">({formatBytes(file.size)})</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={`/api/file?pathname=${encodeURIComponent(file.pathname)}&download=1&name=${encodeURIComponent(file.name)}`}
                  className="rounded p-1.5 text-text-secondary transition-colors hover:bg-warm-beige hover:text-dark"
                  title="다운로드"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => handleRemove(file.pathname)}
                  className="rounded p-1.5 text-text-secondary transition-colors hover:bg-destructive/10 hover:text-destructive"
                  title="삭제"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 rounded-md border border-dashed border-warm-tan bg-warm-beige/20 px-4 py-2.5 text-sm text-text-secondary transition-colors hover:bg-warm-beige/40 disabled:opacity-50"
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-gold" /> 업로드 중...
          </>
        ) : (
          <>
            <Paperclip className="h-4 w-4" /> 파일 추가
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={handleSelect}
        className="hidden"
      />

      <p className="mt-1.5 text-xs text-text-tertiary">
        PDF, Word(docx), HWP, Excel, PPT, 이미지 등 (파일당 최대 20MB)
      </p>
    </div>
  )
}
