"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ImageUpload } from "./image-upload"
import { FileUpload } from "./file-upload"
import type { Attachment } from "@/lib/db"

interface LinkedPopup {
  id: number
  start_at: string
  end_at: string
  priority: number
  is_active: boolean
}

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
    attachments?: Attachment[] | null
    popup?: LinkedPopup | null
  } | null
}

// Convert an ISO/timestamptz string to a value usable by <input type="datetime-local"> (local time).
function toLocalInput(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

// Default popup window: now -> now + 7 days.
function defaultPopupWindow() {
  const now = new Date()
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  return { start: toLocalInput(now.toISOString()), end: toLocalInput(end.toISOString()) }
}

export function NewsForm({ initialData }: NewsFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const linkedPopup = initialData?.popup
  const windowDefaults = defaultPopupWindow()

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

  const [attachments, setAttachments] = useState<Attachment[]>(
    Array.isArray(initialData?.attachments) ? initialData!.attachments! : []
  )

  const [popupEnabled, setPopupEnabled] = useState<boolean>(
    !!linkedPopup && linkedPopup.is_active !== false
  )
  const [popup, setPopup] = useState({
    start_at: linkedPopup ? toLocalInput(linkedPopup.start_at) : windowDefaults.start,
    end_at: linkedPopup ? toLocalInput(linkedPopup.end_at) : windowDefaults.end,
    priority: linkedPopup?.priority ?? 0,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (popupEnabled) {
      if (!popup.start_at || !popup.end_at) {
        setError("팝업 시작일과 종료일을 입력해주세요")
        return
      }
      if (new Date(popup.end_at) <= new Date(popup.start_at)) {
        setError("팝업 종료일은 시작일보다 뒤여야 합니다")
        return
      }
    }

    setLoading(true)

    const payload = {
      ...form,
      ...(initialData ? { id: initialData.id } : {}),
      attachments,
      popup_enabled: popupEnabled,
      // Send full ISO (with timezone) so the server stores an unambiguous instant.
      popup_start_at: popupEnabled ? new Date(popup.start_at).toISOString() : null,
      popup_end_at: popupEnabled ? new Date(popup.end_at).toISOString() : null,
      popup_priority: popupEnabled ? Number(popup.priority) || 0 : 0,
    }

    try {
      const res = await fetch("/api/admin/news", {
        method: initialData ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

        <div className="border-t border-warm-tan pt-4">
          <FileUpload value={attachments} onChange={setAttachments} folder="news" label="첨부파일" />
        </div>
      </div>

      {/* 팝업 설정 */}
      <div className="mt-4 space-y-4 rounded-lg border border-warm-tan bg-card p-6">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="popup_enabled"
            checked={popupEnabled}
            onChange={(e) => setPopupEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-warm-tan text-gold focus:ring-gold"
          />
          <label htmlFor="popup_enabled" className="text-sm font-medium text-dark">
            팝업으로도 띄우기
          </label>
        </div>

        {popupEnabled && (
          <div className="space-y-4 border-t border-warm-tan pt-4">
            <p className="text-xs text-text-secondary">
              이 공지가 설정한 기간 동안 사이트 메인에 팝업으로 노출됩니다. 제목·요약·이미지는 공지 내용을 그대로 사용합니다.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-dark">시작일</label>
                <input
                  type="datetime-local"
                  value={popup.start_at}
                  onChange={(e) => setPopup({ ...popup, start_at: e.target.value })}
                  className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-dark">종료일</label>
                <input
                  type="datetime-local"
                  value={popup.end_at}
                  onChange={(e) => setPopup({ ...popup, end_at: e.target.value })}
                  className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                />
              </div>
            </div>
            <div className="sm:w-1/2">
              <label className="mb-1.5 block text-sm font-medium text-dark">우선순위</label>
              <input
                type="number"
                value={popup.priority}
                onChange={(e) => setPopup({ ...popup, priority: Number(e.target.value) })}
                className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              />
              <p className="mt-1 text-xs text-text-secondary">숫자가 높을수록 먼저 노출됩니다 (기본 0).</p>
            </div>
          </div>
        )}
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
