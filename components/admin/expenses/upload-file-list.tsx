"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { AlertCircle, CheckCircle2, FileText, RotateCw } from "lucide-react"
import { formatBytes } from "@/lib/client-image"
import type { UploadItem } from "./upload-model"
import { BusyText, Chip, Panel, StatusChip } from "./ui"

// 올린 파일 목록(계획서 4.2.2 U-7). 한 줄 요약 "파일 6개 · 인식 끝 5 · 인식 중 0 · 실패 1 [실패 1건 보기]"이 기본이고,
// 인식 중일 때만 목록을 펼쳐 진행을 보여 준다. [실패 n건 보기]는 실패한 파일만 펼친다(그 안에서 [모든 파일 보기]).
// 펼쳤는지는 data-expanded로 알려 준다(부모가 드롭존 옆 한 줄 배치를 펼칠 때 전체 폭으로 바꾼다). 파일마다 X 대신 상태별 글자 버튼:
//   인식 중·대기 → [인식 멈추기] · 끝난 파일 → [목록에서 지우기](표의 행은 남아요) · 데스크톱 앱 대기함 파일 → [대기함에서 빼기](확인창)
// onRemove(key)는 부모가 상태에 맞게 처리한다(대기함 파일은 useConfirm 뒤에 지운다).

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
      <img src={item.localUrl} alt="" onError={() => setBroken(true)} className="h-10 w-10 shrink-0 rounded-md border border-warm-tan object-cover" />
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
      return <p className="text-sm text-text-secondary">차례를 기다려요{queuePos > 0 && ` · 앞에 ${queuePos}개`}</p>
    case "compressing":
      return <BusyText className="text-sm">사진 줄이는 중</BusyText>
    case "scanning": {
      const sec = item.startedAt ? Math.max(0, Math.floor((now - item.startedAt) / 1000)) : 0
      return (
        <div>
          <BusyText seconds={sec} className="text-sm">
            인식 중
          </BusyText>
          {sec >= 45 && <p className="mt-0.5 text-sm text-text-secondary">여러 쪽 PDF는 1~2분 걸려요</p>}
        </div>
      )
    }
    case "done":
      if (item.aiSkipped) return <p className="text-sm text-dark">보관했어요 · 표에 직접 입력해요</p>
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="flex items-center gap-1 text-sm text-green-800">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {item.draftCount > 0 ? `인식 끝 · ${item.draftCount}건` : "인식 끝 · 읽은 내용 없음"}
          </p>
          {item.duplicateCount > 0 && <StatusChip status="duplicate">이미 저장한 파일</StatusChip>}
        </div>
      )
    case "error":
      return (
        <p className="flex items-start gap-1 text-sm text-red-800 [word-break:keep-all]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{item.error || "처리하지 못했어요"}</span>
        </p>
      )
  }
}

// 파일 하나의 동작 버튼(글자). X 아이콘 하나로 세 가지 뜻을 겸하지 않는다.
function ItemButtons({
  item,
  onRetry,
  onManual,
  onRemove,
}: {
  item: UploadItem
  onRetry: (key: string) => void
  onManual: (key: string) => void
  onRemove: (key: string) => void
}) {
  const busy = item.status === "queued" || item.status === "compressing" || item.status === "scanning"
  const inbox = item.inboxId != null
  const btn = "h-8 px-2 text-sm hover:bg-warm-beige"
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {item.status === "error" && item.retryable && (
        <Button type="button" size="sm" variant="outline" className={btn} onClick={() => onRetry(item.key)}>
          <RotateCw className="h-3.5 w-3.5" />
          다시 시도
        </Button>
      )}
      {item.status === "error" && item.fallback && (
        <Button type="button" size="sm" variant="outline" className={btn} onClick={() => onManual(item.key)}>
          직접 입력
        </Button>
      )}
      {inbox ? (
        <Button type="button" size="sm" variant="ghost" className={cn(btn, "text-red-800 hover:text-red-900")} onClick={() => onRemove(item.key)} aria-label={`${item.name} 대기함에서 빼기`}>
          대기함에서 빼기
        </Button>
      ) : busy ? (
        <Button type="button" size="sm" variant="ghost" className={btn} onClick={() => onRemove(item.key)} aria-label={`${item.name} 인식 멈추기`}>
          인식 멈추기
        </Button>
      ) : (
        <span className="inline-flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" className={btn} onClick={() => onRemove(item.key)} aria-label={`${item.name} 목록에서 지우기`}>
            목록에서 지우기
          </Button>
          {item.status === "done" && <span className="text-sm text-text-secondary">표의 행은 남아요</span>}
        </span>
      )}
    </div>
  )
}

// 데스크톱 앱(포연기 증빙함)에서 받아 확인 대기함에 있던 파일
function SourceChip({ item }: { item: UploadItem }) {
  if (item.inboxId == null) return null
  return <Chip title="데스크톱 앱에서 온 파일 · 표의 행을 모두 저장하면 대기함에서 빠져요">데스크톱 앱</Chip>
}

export function UploadFileList({
  items,
  onRetry,
  onManual,
  onRemove,
  onRetryAllFailed,
  onClearFinished,
  className,
}: {
  className?: string
  items: UploadItem[]
  onRetry: (key: string) => void
  onManual: (key: string) => void
  onRemove: (key: string) => void
  onRetryAllFailed: () => void
  onClearFinished: () => void
}) {
  const busy = items.some((i) => i.status === "compressing" || i.status === "scanning")
  const now = useTicker(busy)
  const [open, setOpen] = useState<false | "failed" | "all">(false)
  if (items.length === 0) return null

  const count = (s: UploadItem["status"]) => items.filter((i) => i.status === s).length
  const done = count("done")
  const failed = count("error")
  const queued = count("queued")
  const running = count("compressing") + count("scanning")
  const retryableFailed = items.filter((i) => i.status === "error" && i.retryable).length
  const finished = done + failed
  const pct = Math.round((finished / items.length) * 100)
  const processing = running + queued > 0
  // 인식 중이면 진행을 보이도록 펼친다. 끝나면 요약 한 줄로 접히고, 펼치면 실패한 파일이 먼저 온다.
  const expanded = processing || !!open
  const failedOnly = !processing && open === "failed" && failed > 0
  const shown = failedOnly ? items.filter((i) => i.status === "error") : [...items].sort((a, b) => Number(b.status === "error") - Number(a.status === "error"))

  let queueIdx = 0
  const queuePos = new Map<string, number>()
  for (const it of items) {
    if (it.status === "queued") queuePos.set(it.key, queueIdx++)
  }

  return (
    <Panel aria-label="올린 파일" data-expanded={expanded ? "true" : "false"} className={className}>
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5 sm:px-4 sm:py-2", expanded && "border-b border-warm-tan")}>
        <h2 className="min-w-0 text-[15px] font-semibold text-dark">
          파일 {items.length}개
          <span className="ml-1.5 font-normal tabular-nums text-text-secondary" aria-live="polite">
            <span className={cn(!processing && "hidden sm:inline")}>
              · 인식 끝 {done} · 인식 중 {running}
              {queued > 0 && ` · 대기 ${queued}`}
            </span>{" "}
            ·{" "}
            <span className={cn(failed > 0 && "font-medium text-red-800")}>실패 {failed}</span>
          </span>
        </h2>
        {!processing && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto h-8 px-2 text-sm hover:bg-warm-beige"
            aria-expanded={!!open}
            onClick={() => setOpen((v) => (v ? false : failed > 0 ? "failed" : "all"))}
          >
            {open ? "접기" : failed > 0 ? `실패 ${failed}건 보기` : "파일 목록 보기"}
          </Button>
        )}
        {processing && (
          <Progress
            value={pct}
            className="h-1.5 basis-full rounded-sm bg-warm-beige [&>[data-slot=progress-indicator]]:bg-dark/70"
            aria-label="전체 진행률"
          />
        )}
      </div>

      {expanded && (
        <>
          <ul className="divide-y divide-warm-tan">
            {shown.map((item) => (
              <li key={item.key} className={cn("flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-2.5", item.status === "error" && "bg-red-50/40")}>
                <Thumb item={item} />
                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex min-w-0 flex-wrap items-center gap-x-2">
                    <span className="min-w-0 truncate text-[15px] font-medium text-dark" title={item.name}>
                      {item.name}
                    </span>
                    <span className="shrink-0 text-sm text-text-secondary">{formatBytes(item.size)}</span>
                    <SourceChip item={item} />
                  </p>
                  <div className="mt-0.5">
                    <StatusLine item={item} now={now} queuePos={queuePos.get(item.key) ?? 0} />
                  </div>
                </div>
                <ItemButtons item={item} onRetry={onRetry} onManual={onManual} onRemove={onRemove} />
              </li>
            ))}
          </ul>
          {(retryableFailed > 1 || finished > 0 || failedOnly) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-warm-tan px-4 py-2">
              {failedOnly && (
                <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-sm hover:bg-warm-beige" onClick={() => setOpen("all")}>
                  모든 파일 보기({items.length}개)
                </Button>
              )}
              {retryableFailed > 1 && (
                <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-sm hover:bg-warm-beige" onClick={onRetryAllFailed}>
                  <RotateCw className="h-3.5 w-3.5" />
                  실패 {retryableFailed}건 다시 시도
                </Button>
              )}
              {finished > 0 && (
                <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-sm hover:bg-warm-beige" onClick={onClearFinished}>
                  끝난 파일 목록에서 지우기
                </Button>
              )}
              <span className="text-sm text-text-secondary">표의 행은 지워지지 않아요 · 대기함 파일은 남아요</span>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
