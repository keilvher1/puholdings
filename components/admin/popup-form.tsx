"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { ImageUpload } from "./image-upload"
import type { Popup } from "@/lib/db"

// Convert an ISO/timestamptz string to a <input type="datetime-local"> value (local time).
function toLocalInput(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function defaultEnd(): string {
  const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  return toLocalInput(end.toISOString())
}

export function PopupForm({ initialData }: { initialData?: Popup | null }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [form, setForm] = useState({
    title: initialData?.title || "",
    content: initialData?.content || "",
    image_url: initialData?.image_url || "",
    link_url: initialData?.link_url || "",
    link_label: initialData?.link_label || "",
    start_at: initialData ? toLocalInput(initialData.start_at) : toLocalInput(),
    end_at: initialData ? toLocalInput(initialData.end_at) : defaultEnd(),
    is_active: initialData ? initialData.is_active : true,
    priority: initialData?.priority ?? 0,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!form.start_at || !form.end_at) {
      setError("시작일과 종료일을 입력해주세요")
      return
    }
    if (new Date(form.end_at) <= new Date(form.start_at)) {
      setError("종료일은 시작일보다 뒤여야 합니다")
      return
    }

    setLoading(true)

    const payload = {
      title: form.title,
      content: form.content,
      image_url: form.image_url,
      link_url: form.link_url,
      link_label: form.link_label,
      start_at: new Date(form.start_at).toISOString(),
      end_at: new Date(form.end_at).toISOString(),
      is_active: form.is_active,
      priority: Number(form.priority) || 0,
    }

    try {
      const res = await fetch(
        initialData ? `/api/admin/popups/${initialData.id}` : "/api/admin/popups",
        {
          method: initialData ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )
      const data = await res.json()
      if (data.success) {
        router.push("/admin/popups")
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
        {initialData?.related_news_id && (
          <div className="rounded-md bg-warm-beige px-3 py-2 text-xs text-text-secondary">
            이 팝업은 공지 #{initialData.related_news_id} 와(과) 연결되어 있습니다. 공지 수정 시 제목·내용·이미지가 함께 갱신됩니다.
          </div>
        )}

        <ImageUpload
          value={form.image_url}
          onChange={(url) => setForm({ ...form, image_url: url })}
          folder="popups"
          label="팝업 이미지"
        />

        <div className="space-y-1.5">
          <Label htmlFor="popup-title">제목</Label>
          <Input
            id="popup-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="popup-content">내용</Label>
          <Textarea
            id="popup-content"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={5}
            className="resize-none"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="popup-link-url">링크 URL</Label>
            <Input
              id="popup-link-url"
              value={form.link_url}
              onChange={(e) => setForm({ ...form, link_url: e.target.value })}
              placeholder="/news 또는 https://..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="popup-link-label">링크 버튼 라벨</Label>
            <Input
              id="popup-link-label"
              value={form.link_label}
              onChange={(e) => setForm({ ...form, link_label: e.target.value })}
              placeholder="자세히 보기"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="popup-start-at">시작일</Label>
            <Input
              id="popup-start-at"
              type="datetime-local"
              value={form.start_at}
              onChange={(e) => setForm({ ...form, start_at: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="popup-end-at">종료일</Label>
            <Input
              id="popup-end-at"
              type="datetime-local"
              value={form.end_at}
              onChange={(e) => setForm({ ...form, end_at: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="popup-priority">우선순위</Label>
            <Input
              id="popup-priority"
              type="number"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
            />
            <p className="text-xs text-text-secondary">숫자가 높을수록 먼저 노출됩니다 (기본 0).</p>
          </div>
          <div className="flex items-end pb-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v === true })}
              />
              <Label htmlFor="is_active" className="font-normal">
                활성화
              </Label>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "저장 중..." : "저장"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/admin/popups">취소</Link>
        </Button>
      </div>
    </form>
  )
}
