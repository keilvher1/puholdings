"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { AlertCircle, CheckCircle2, FileText, RotateCw, X } from "lucide-react"
import { formatBytes } from "@/lib/client-image"
import type { UploadItem } from "./upload-model"
import { BusyText, Chip, Panel, StatusChip } from "./ui"

// 올린 파일 목록: 파일마다 대기 → 압축 중 → 인식 중 → 완료/실패(사유·다시 시도).
// 모두 끝나면 한 줄 요약으로 접고(실패한 파일만 남김), '전체 보기'로 다시 펼친다.

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
        className="h-10 w-10 shrink-0 rounded-md border border-warm-tan object-cover"
      />
    )
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-warm-tan bg-warm-beige/50 text-text-secondary">
      <FileText className="h-5 w-5" aria-label={item.kind === "pdf" ? "PDF" : "파일"} />
    </div>
  )
}

function StatusLine({ item, now, queuePos }: { item: UploadItem; now: number; queuePos: number }) {
  switch (item.status) {
    case "queued":
      return (
        <p className="text-xs text-text-secondary">
          대기{queuePos > 0 && ` · 앞에 ${queuePos}개`}
        </p>
      )
    case "compressing":
      return <BusyText>압축 중</BusyText>
    case "scanning": {
      const sec = item.startedAt ? Math.max(0, Math.floor((now - item.startedAt) / 1000)) : 0
      return (
        <div>
          <BusyText seconds={sec}>인식 중</BusyText>
          {sec >= 45 && <p className="mt-0.5 text-xs text-text-secondary">여러 쪽 PDF는 1~2분 소요</p>}
        </div>
      )
    }
    case "done":
      if (item.aiSkipped) {
        return <p className="text-xs text-dark">보관됨 · 직접 입력</p>
      }
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="flex items-center gap-1 text-xs text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {item.draftCount > 0 ? `완료 · ${item.draftCount}건` : "완료 · 인식 내용 없음"}
          </p>
          {item.duplicateCount > 0 && <StatusChip status="duplicate">이미 저장된 파일</StatusChip>}
        </div>
      )
    case "error":
      return (
        <p className="flex items-start gap-1 text-xs text-destructive [word-break:keep-all]">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{item.error || "처리 실패"}</span>
        </p>
      )
  }
}

function ItemActions({ item, onRetry, onManual }: { item: UploadItem; onRetry: (key: string) => void; onManual: (key: string) => void }) {
  if (item.status !== "error") return null
  return (
    <>
      {item.retryable && (
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onRetry(item.key)}>
          <RotateCw className="h-3.5 w-3.5" />
          다시 시도
        </Button>
      )}
      {item.fallback && (
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onManual(item.key)}>
          직접 입력
        </Button>
      )}
    </>
  )
}

// 데스크톱 앱(포연기 증빙함)에서 받아 확인 대기함에 있던 파일
function SourceChip({ item }: { item: UploadItem }) {
  if (item.inboxId == null) return null
  return <Chip title="데스크톱 앱에서 받은 파일 · 저장하면 대기함에서 빠짐">데스크톱 앱</Chip>
}

function RemoveButton({ item, onRemove }: { item: UploadItem; onRemove: (key: string) => void }) {
  const cancel = item.status === "compressing" || item.status === "scanning" || item.status === "queued"
  const inbox = item.inboxId != null
  return (
    <button
      type="button"
      onClick={() => onRemove(item.key)}
      title={inbox ? "대기함에서 제외(표의 행도 함께 빠짐)" : cancel ? "인식 취소" : "목록에서 제거(표의 행은 유지)"}
      aria-label={`${item.name} ${inbox ? "대기함에서 제외" : item.status === "scanning" || item.status === "queued" ? "인식 취소" : "목록에서 제거"}`}
      className="shrink-0 rounded p-1 text-text-secondary transition-colors hover:bg-warm-beige hover:text-dark"
    >
      <X className="h-4 w-4" />
    </button>
  )
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
  const [expanded, setExpanded] = useState(false)
  if (items.length === 0) return null

  const count = (s: UploadItem["status"]) => items.filter((i) => i.status === s).length
  const done = count("done")
  const failed = count("error")
  const queued = count("queued")
  const running = count("compressing") + count("scanning")
  const retryableFailed = items.filter((i) => i.status === "error" && i.retryable).length
  const finished = done + failed
  const pct = Math.round((finished / items.length) * 100)
  // 모두 끝나면 접는다: 실패한 파일만 보이고 나머지는 '전체 보기'로.
  const allDone = !busy && queued === 0
  const collapsed = allDone && !expanded
  const shown = collapsed ? items.filter((i) => i.status === "error") : items
  const hiddenCount = items.length - shown.length

  let queueIdx = 0
  const queuePos = new Map<string, number>()
  for (const it of items) {
    if (it.status === "queued") queuePos.set(it.key, queueIdx++)
  }

  return (
    <Panel aria-label="올린 파일">
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3", shown.length > 0 && "border-b border-warm-tan")}>
        <h2 className="text-base font-semibold text-dark">
          올린 파일 <span className="font-normal tabular-nums text-text-secondary">{items.length}개</span>
        </h2>
        <p className="text-xs tabular-nums text-text-secondary" aria-live="polite">
          완료 {done}
          {running > 0 && ` · 인식 중 ${running}`}
          {queued > 0 && ` · 대기 ${queued}`}
          {failed > 0 && <span className="font-medium text-destructive"> · 실패 {failed}</span>}
        </p>
        <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1">
          {/* 접힌 상태에서 실패가 1건이면 그 줄의 '다시 시도'와 같은 동작이므로 머리 버튼은 두지 않는다. */}
          {(retryableFailed > 1 || (retryableFailed > 0 && !collapsed)) && (
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onRetryAllFailed}>
              <RotateCw className="h-3.5 w-3.5" />
              실패 {retryableFailed}건 다시 시도
            </Button>
          )}
          {finished > 0 && (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onClearFinished}>
              완료 항목 지우기
            </Button>
          )}
          {allDone && (expanded || hiddenCount > 0) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "접기" : `전체 보기(${items.length})`}
            </Button>
          )}
        </div>
        {(running > 0 || queued > 0) && (
          <Progress
            value={pct}
            className="h-1.5 basis-full rounded-sm bg-warm-beige [&>[data-slot=progress-indicator]]:bg-dark/70"
            aria-label="전체 진행률"
          />
        )}
      </div>

      {shown.length > 0 &&
        (collapsed ? (
          // 접힌 상태: 실패한 파일만 한 줄씩(파일명 · 크기 · 사유 · 동작)
          <ul className="divide-y divide-warm-tan">
            {shown.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium text-dark" title={item.name}>
                      {item.name}
                    </span>
                    <span className="shrink-0 text-xs text-text-secondary">{formatBytes(item.size)}</span>
                    <SourceChip item={item} />
                  </p>
                  <div className="mt-0.5">
                    <StatusLine item={item} now={now} queuePos={0} />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <ItemActions item={item} onRetry={onRetry} onManual={onManual} />
                  <RemoveButton item={item} onRemove={onRemove} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((item) => (
              <li
                key={item.key}
                className={cn(
                  "flex items-start gap-3 rounded-md border bg-card p-2.5",
                  item.status === "error" ? "border-destructive/40" : "border-warm-tan"
                )}
              >
                <Thumb item={item} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-dark" title={item.name}>
                    {item.name}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-text-secondary">
                    {formatBytes(item.size)}
                    <SourceChip item={item} />
                  </p>
                  <div className="mt-1">
                    <StatusLine item={item} now={now} queuePos={queuePos.get(item.key) ?? 0} />
                  </div>
                  {item.status === "error" && (item.retryable || item.fallback) && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <ItemActions item={item} onRetry={onRetry} onManual={onManual} />
                    </div>
                  )}
                </div>
                <RemoveButton item={item} onRemove={onRemove} />
              </li>
            ))}
          </ul>
        ))}
    </Panel>
  )
}
