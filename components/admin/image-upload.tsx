"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import { Upload, X, Loader2 } from "lucide-react"

interface ImageUploadProps {
  value: string
  onChange: (url: string) => void
  folder?: string
  label?: string
}

export function ImageUpload({ value, onChange, folder = "uploads", label = "이미지" }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError("")
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("folder", folder)

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()

      if (data.success) {
        onChange(data.url)
      } else {
        setError(data.error || "업로드에 실패했습니다")
      }
    } catch {
      setError("서버 오류가 발생했습니다")
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleRemove = async () => {
    if (!value) return

    try {
      await fetch("/api/admin/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      })
    } catch {
      // Ignore delete errors
    }

    onChange("")
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-dark">{label}</label>
      
      {error && (
        <div className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {value ? (
        <div className="relative inline-block">
          <div className="relative h-32 w-32 overflow-hidden rounded-lg border border-warm-tan">
            <Image
              src={value}
              alt="Uploaded image"
              fill
              className="object-cover"
            />
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-white hover:bg-destructive/80 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex h-32 w-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-warm-tan bg-warm-beige/30 hover:bg-warm-beige/50 transition-colors"
        >
          {uploading ? (
            <Loader2 size={24} className="animate-spin text-gold" />
          ) : (
            <>
              <Upload size={24} className="text-warm-tan" />
              <span className="mt-2 text-xs text-text-tertiary">클릭하여 업로드</span>
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <p className="mt-1.5 text-xs text-text-tertiary">
        JPG, PNG, GIF, WebP (최대 10MB)
      </p>
    </div>
  )
}
