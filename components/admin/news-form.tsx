"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ImageUpload } from "./image-upload"

interface NewsFormProps {
  initialData?: {
    id: number
    title: string
    summary: string
    content: string
    category: string
    is_visible: boolean
    published_at: string
    image_url?: string
  } | null
}

export function NewsForm({ initialData }: NewsFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [form, setForm] = useState({
    title: initialData?.title || "",
    summary: initialData?.summary || "",
    content: initialData?.content || "",
    category: initialData?.category || "일반",
    is_visible: initialData?.is_visible !== false,
    published_at: initialData?.published_at
      ? new Date(initialData.published_at).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
    image_url: initialData?.image_url || "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/admin/news", {
        method: initialData ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initialData ? { ...form, id: initialData.id } : form),
      })

      const data = await res.json()

      if (data.success) {
        router.push("/admin/news")
        router.refresh()
      } else {
        setError(data.error || "저장에 실패했습니다")
      }
    } catch {
      setError("서버 오류가 발생했습니다")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-warm-tan bg-card p-6">
        {/* 이미지 업로드 */}
        <ImageUpload
          value={form.image_url}
          onChange={(url) => setForm({ ...form, image_url: url })}
          folder="news"
          label="썸네일 이미지"
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-dark">제목</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
            required
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-dark">요약</label>
          <textarea
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            rows={2}
            className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold resize-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-dark">내용</label>
          <textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={8}
            className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold resize-none"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-dark">카테고리</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
            >
              <option value="일반">일반</option>
              <option value="투자">투자</option>
              <option value="펀드">펀드</option>
              <option value="실적">실적</option>
              <option value="행사">행사</option>
              <option value="수상">수상</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-dark">발행일</label>
            <input
              type="date"
              value={form.published_at}
              onChange={(e) => setForm({ ...form, published_at: e.target.value })}
              className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_visible"
            checked={form.is_visible}
            onChange={(e) => setForm({ ...form, is_visible: e.target.checked })}
            className="h-4 w-4 rounded border-warm-tan text-gold focus:ring-gold"
          />
          <label htmlFor="is_visible" className="text-sm text-dark">
            공개
          </label>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-dark px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-dark-muted transition-colors disabled:opacity-50"
        >
          {loading ? "저장 중..." : "저장"}
        </button>
        <Link
          href="/admin/news"
          className="rounded-md border border-warm-tan px-6 py-2.5 text-sm font-medium text-dark hover:bg-warm-beige transition-colors"
        >
          취소
        </Link>
      </div>
    </form>
  )
}
