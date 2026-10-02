"use client"

import { useId, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Upload, Loader2 } from "lucide-react"
import type { FieldDef } from "@/lib/content-schema"
import { friendlyError } from "@/lib/messages"

/** 업로드는 서버 함수(/api/admin/upload)를 거쳐 요청 본문 한도(약 4.5MB)에 걸린다(계획서 4.5.7·PORTAL-23). 운영 확인 뒤 값만 바꾼다 */
const UPLOAD_LIMIT_MB = 4

// 스키마 필드 하나를 렌더링/편집. value는 문자열/숫자/문자열배열.
export function ContentField({
  field,
  value,
  onChange,
}: {
  field: FieldDef
  value: unknown
  onChange: (v: unknown) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const id = useId()
  const errorId = `${id}-error`
  const helpId = `${id}-help`
  const describedBy = [uploadError ? errorId : null, field.help ? helpId : null].filter(Boolean).join(" ") || undefined

  const handleUpload = async (file: File) => {
    setUploadError("")
    if (file.size > UPLOAD_LIMIT_MB * 1024 * 1024) {
      setUploadError(`파일이 ${UPLOAD_LIMIT_MB}MB보다 커요. 더 작은 이미지로 올려 주세요`)
      if (fileRef.current) fileRef.current.value = ""
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("folder", "content")
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        onChange(`/api/file?pathname=${encodeURIComponent(data.pathname)}`)
      } else {
        setUploadError(
          `${friendlyError(res.status, data.error, "올리지 못했어요.")} PNG·JPG·GIF·WEBP·SVG 이미지를 ${UPLOAD_LIMIT_MB}MB 이하로 올려 주세요`,
        )
      }
    } catch {
      setUploadError(friendlyError(0, null, "올리지 못했어요."))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      {field.type === "textarea" ? (
        <Textarea
          id={id}
          aria-describedby={describedBy}
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      ) : field.type === "stringlist" ? (
        // 입력 중에는 원본 그대로 배열로 보관(줄바꿈 유지). 빈 줄 정리는 저장 시점에 수행.
        <Textarea
          id={id}
          aria-describedby={describedBy}
          rows={4}
          value={Array.isArray(value) ? value.join("\n") : ""}
          onChange={(e) => onChange(e.target.value.split("\n"))}
          placeholder={field.placeholder || "한 줄에 하나씩 입력"}
        />
      ) : field.type === "number" ? (
        <Input
          id={id}
          aria-describedby={describedBy}
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          placeholder={field.placeholder}
        />
      ) : field.type === "select" ? (
        <Select value={typeof value === "string" ? value : ""} onValueChange={onChange}>
          <SelectTrigger id={id} aria-describedby={describedBy}>
            <SelectValue placeholder="골라 주세요" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === "image" ? (
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={uploadError ? true : undefined}
              value={typeof value === "string" ? value : ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder="이미지 URL 또는 업로드"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label={`${field.label} 이미지 올리기`}
              className="flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-warm-tan px-3 py-2 text-sm text-dark hover:bg-warm-beige disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
              {uploading ? "올리는 중…" : "업로드"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.gif,.webp,.svg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
              }}
            />
          </div>
          {typeof value === "string" && value && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="미리보기" className="h-16 w-auto rounded border border-warm-tan bg-white object-contain p-1" />
          )}
        </div>
      ) : (
        <Input
          id={id}
          aria-describedby={describedBy}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      )}
      {uploadError && (
        <p id={errorId} className="text-sm text-red-800">
          {uploadError}
        </p>
      )}
      {field.help && (
        <p id={helpId} className="text-sm text-text-secondary">
          {field.help}
        </p>
      )}
    </div>
  )
}
