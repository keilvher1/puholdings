"use client"

import { useRef, useState } from "react"
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

  const handleUpload = async (file: File) => {
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
      const data = await res.json()
      if (data.success) {
        onChange(`/api/file?pathname=${encodeURIComponent(data.pathname)}`)
      } else {
        alert(data.error || "업로드 실패")
      }
    } catch {
      alert("업로드 중 오류가 발생했습니다")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label>{field.label}</Label>
      {field.type === "textarea" ? (
        <Textarea
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      ) : field.type === "stringlist" ? (
        <Textarea
          rows={4}
          value={Array.isArray(value) ? value.join("\n") : ""}
          onChange={(e) => onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
          placeholder={field.placeholder || "한 줄에 하나씩 입력"}
        />
      ) : field.type === "number" ? (
        <Input
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          placeholder={field.placeholder}
        />
      ) : field.type === "select" ? (
        <Select value={typeof value === "string" ? value : ""} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="선택" />
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
              value={typeof value === "string" ? value : ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder="이미지 URL 또는 업로드"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex shrink-0 items-center gap-1 rounded-md border border-warm-tan px-3 py-2 text-sm text-text-secondary hover:bg-warm-beige disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              업로드
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
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      )}
      {field.help && <p className="text-xs text-text-tertiary">{field.help}</p>}
    </div>
  )
}
