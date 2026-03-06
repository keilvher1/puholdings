"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface PortfolioFormProps {
  initialData?: {
    id: number
    name: string
    name_en: string
    category: string
    description: string
    website: string
    investment_year: number
    status: string
    sort_order: number
  } | null
}

export function PortfolioForm({ initialData }: PortfolioFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [form, setForm] = useState({
    name: initialData?.name || "",
    name_en: initialData?.name_en || "",
    category: initialData?.category || "AI/IT",
    description: initialData?.description || "",
    website: initialData?.website || "",
    investment_year: initialData?.investment_year || new Date().getFullYear(),
    status: initialData?.status || "active",
    sort_order: initialData?.sort_order || 0,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/admin/portfolio", {
        method: initialData ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initialData ? { ...form, id: initialData.id } : form),
      })

      const data = await res.json()

      if (data.success) {
        router.push("/admin/portfolio")
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-dark">기업명 (한글)</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-dark">기업명 (영문)</label>
            <input
              type="text"
              value={form.name_en}
              onChange={(e) => setForm({ ...form, name_en: e.target.value })}
              className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-dark">설명</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
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
              <option value="AI/IT">AI/IT</option>
              <option value="바이오/헬스케어">바이오/헬스케어</option>
              <option value="소재/화학">소재/화학</option>
              <option value="에너지/환경">에너지/환경</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-dark">투자연도</label>
            <input
              type="number"
              value={form.investment_year}
              onChange={(e) => setForm({ ...form, investment_year: parseInt(e.target.value) })}
              min="2000"
              max="2030"
              className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-dark">웹사이트</label>
          <input
            type="url"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
            placeholder="https://"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-dark">상태</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
            >
              <option value="active">활성</option>
              <option value="inactive">비활성</option>
              <option value="exited">회수완료</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-dark">정렬 순서</label>
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) })}
              className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
            />
          </div>
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
          href="/admin/portfolio"
          className="rounded-md border border-warm-tan px-6 py-2.5 text-sm font-medium text-dark hover:bg-warm-beige transition-colors"
        >
          취소
        </Link>
      </div>
    </form>
  )
}
