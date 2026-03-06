"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"

interface Stat {
  id?: number
  label: string
  value: number
  suffix: string
  sort_order: number
}

interface StatsFormProps {
  initialData: Stat[]
}

export function StatsForm({ initialData }: StatsFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [stats, setStats] = useState<Stat[]>(initialData)

  const handleAdd = () => {
    setStats([
      ...stats,
      { label: "", value: 0, suffix: "", sort_order: stats.length + 1 },
    ])
  }

  const handleRemove = (index: number) => {
    setStats(stats.filter((_, i) => i !== index))
  }

  const handleChange = (index: number, field: keyof Stat, value: string | number) => {
    const newStats = [...stats]
    newStats[index] = { ...newStats[index], [field]: value }
    setStats(newStats)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/admin/stats", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stats }),
      })

      const data = await res.json()

      if (data.success) {
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
    <form onSubmit={handleSubmit} className="max-w-3xl">
      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {stats.map((stat, index) => (
          <div
            key={stat.id || index}
            className="flex items-center gap-3 rounded-lg border border-warm-tan bg-card p-4"
          >
            <div className="flex-1 grid gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">레이블</label>
                <input
                  type="text"
                  value={stat.label}
                  onChange={(e) => handleChange(index, "label", e.target.value)}
                  className="w-full rounded-md border border-warm-tan bg-card px-3 py-2 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                  placeholder="예: 포트폴리오 기업"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">숫자</label>
                <input
                  type="number"
                  value={stat.value}
                  onChange={(e) => handleChange(index, "value", parseInt(e.target.value) || 0)}
                  className="w-full rounded-md border border-warm-tan bg-card px-3 py-2 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">단위</label>
                <input
                  type="text"
                  value={stat.suffix}
                  onChange={(e) => handleChange(index, "suffix", e.target.value)}
                  className="w-full rounded-md border border-warm-tan bg-card px-3 py-2 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                  placeholder="예: 개+"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">순서</label>
                <input
                  type="number"
                  value={stat.sort_order}
                  onChange={(e) => handleChange(index, "sort_order", parseInt(e.target.value) || 0)}
                  className="w-full rounded-md border border-warm-tan bg-card px-3 py-2 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="rounded p-2 text-text-secondary hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-warm-tan py-3 text-sm font-medium text-text-secondary hover:border-gold hover:text-gold transition-colors"
      >
        <Plus className="h-4 w-4" />
        항목 추가
      </button>

      <div className="mt-6">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-dark px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-dark-muted transition-colors disabled:opacity-50"
        >
          {loading ? "저장 중..." : "모두 저장"}
        </button>
      </div>
    </form>
  )
}
