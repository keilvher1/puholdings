"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Loader2,
  PenLine,
  RotateCw,
  X,
} from "lucide-react"
import { formatBytes } from "@/lib/client-image"
import type { UploadItem } from "./upload-model"

// 올린 파일 카드 목록: 파일마다 대기 → 사진 줄이는 중 → AI 분석 중 → 완료/실패(사유·다시 시도).

function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [active])
  return now
}

function Thumb({ item }: { item: UploadItem }) {
  const [broken, setBroken] = useState(false)
  if (item.localUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 로컬 object URL 미리보기(next/image 불필요)
      <img
        src={item.localUrl}
        alt=""
        onError={() => setBroken(true)}
        className="h-12 w-12 shrink-0 rounded-md border border-warm-tan object-cover"
      />
    )
  }
  return (
    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md border border-warm-tan bg-warm-beige/50 text-text-secondary">
      <FileText className="h-5 w-5" />
      <span className="mt-0.5 text-[9px] font-semibold uppercase">{item.kind === "pdf" ? "PDF" : "FILE"}</span>
    </div>
  )
}

function StatusLine({ item, now, queuePos }: { item: UploadItem; now: number; queuePos: number }) {
  switch (item.status) {
    case "queued":
      return (
        <p className="flex items-center gap-1 text-xs text-text-secondary">
          <Clock className="h-3.5 w-3.5" />
          대기 중{queuePos > 0 && ` · 앞에 ${queuePos}개`}
        </p>
      )
    case "compressing":
      return (
        <p className="flex items-center gap-1 text-xs text-text-secondary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          사진 크기 줄이는 중…
        </p>
      )
    case "scanning": {
      const sec = item.startedAt ? Math.max(0, Math.floor((now - item.startedAt) / 1000)) : 0
      return (
        <div>
          <p className="flex items-center gap-1 text-xs text-dark">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />
            업로드·AI 분석 중… <span className="tabular-nums text-text-tertiary">{sec}초</span>
          </p>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-warm-beige">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-gold/70" />
          </div>
          {sec >= 45 && <p className="mt-1 text-[11px] text-text-tertiary">여러 장이 든 PDF는 1~2분 걸릴 수 있어요</p>}
        </div>
      )
    }
    case "done":
      if (item.aiSkipped) {
        return (
          <p className="flex items-center gap-1 text-xs text-amber-800">
            <PenLine className="h-3.5 w-3.5" />
            보관 완료 · 표에서 직접 입력하세요
          </p>
        )
      }
      return (
        <div className="space-y-0.5">
          <p className="flex items-center gap-1 text-xs text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            완료 · {item.draftCount > 0 ? `증빙 ${item.draftCount}건 인식` : "인식한 내용 없음(직접 입력)"}
          </p>
          {item.duplicateCount > 0 && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <Copy className="h-3.5 w-3.5" />
              이미 저장된 증빙과 같은 파일
            </p>
          )}
        </div>
      )
    case "error":
      return (
        <p className="flex items-start gap-1 text-xs text-destructive [word-break:keep-all]">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{item.error || "처리하지 못했습니다"}</span>
        </p>
      )
  }
}

export function UploadFileList({
  items,
  onRetry,
  onManual,
  onRemove,
  onRetryAllFailed,
  onClearFinished,
}: {
  items: UploadItem[]
  onRetry: (key: string) => void
  onManual: (key: string) => void
  onRemove: (key: string) => void
  onRetryAllFailed: () => void
  onClearFinished: () => void
}) {
  const busy = items.some((i) => i.status === "compressing" || i.status === "scanning")
  const now = useTicker(busy)
  if (items.length === 0) return null

  const count = (s: UploadItem["status"]) => items.filter((i) => i.status === s).length
  const done = count("done")
  const failed = count("error")
  const queued = count("queued")
  const running = count("compressing") + count("scanning")
  const retryableFailed = items.filter((i) => i.status === "error" && i.retryable).length
  const finished = done + failed
  const pct = Math.round((finished / items.length) * 100)

  let queueIdx = 0
  const queuePos = new Map<string, number>()
  for (const it of items) {
    if (it.status === "queued") queuePos.set(it.key, queueIdx++)
  }

  return (
    <section aria-label="올린 파일" className="rounded-xl border border-warm-tan bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-sm font-semibold text-dark">올린 파일 {items.length}개</h2>
        <p className="text-xs text-text-secondary" aria-live="polite">
          완료 {done}
          {running > 0 && ` · 분석 중 ${running}`}
          {queued > 0 && ` · 대기 ${queued}`}
          {failed > 0 && <span className="text-destructive"> · 실패 {failed}</span>}
        </p>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {retryableFailed > 0 && (
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onRetryAllFailed}>
              <RotateCw className="h-3.5 w-3.5" />
              실패한 {retryableFailed}개 다시 시도
            </Button>
          )}
          {finished > 0 && (
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onClearFinished}>
              끝난 파일 목록에서 치우기
            </Button>
          )}
        </div>
      </div>
      {(running > 0 || queued > 0) && (
        <Progress value={pct} className="mt-3 h-1.5 bg-warm-beige [&>[data-slot=progress-indicator]]:bg-gold" aria-label="전체 진행률" />
      )}

      <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.key}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-2.5",
              item.status === "error" ? "border-destructive/30 bg-destructive/5" : "border-warm-tan/80 bg-warm-ivory/40",
              item.status === "done" && !item.aiSkipped && item.duplicateCount === 0 && "border-green-200 bg-green-50/40"
            )}
          >
            <Thumb item={item} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-dark" title={item.name}>
                {item.name}
              </p>
              <p className="text-[11px] text-text-tertiary">{formatBytes(item.size)}</p>
              <div className="mt-1">
                <StatusLine item={item} now={now} queuePos={queuePos.get(item.key) ?? 0} />
              </div>
              {item.status === "error" && (item.retryable || item.fallback) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.retryable && (
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onRetry(item.key)}>
                      <RotateCw className="h-3.5 w-3.5" />
                      다시 시도
                    </Button>
                  )}
                  {item.fallback && (
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onManual(item.key)}>
                      <PenLine className="h-3.5 w-3.5" />
                      직접 입력하기
                    </Button>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onRemove(item.key)}
              title={item.status === "compressing" || item.status === "scanning" || item.status === "queued" ? "분석 취소" : "목록에서 치우기(표의 행은 남습니다)"}
              aria-label={`${item.name} ${item.status === "scanning" || item.status === "queued" ? "분석 취소" : "목록에서 치우기"}`}
              className="rounded p-1 text-text-tertiary transition-colors hover:bg-warm-beige hover:text-dark"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
