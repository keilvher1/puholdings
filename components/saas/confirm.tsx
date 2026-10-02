"use client"

// 확인 대화상자 — 브라우저 기본 확인 창(confirm)을 한 줄씩 바꾸는 useConfirm()과, 실행까지 맡는 ConfirmDialog(계획서 2.1).
// AppProviders(관리자·포털 레이아웃)가 ConfirmProvider를 이미 감싸고 있으므로 화면에서는 useConfirm만 부른다.
//
// 사용 예(변수 이름은 ask로 고정 — 2.0 팝업 금지 검사식에 걸리지 않게):
//   const ask = useConfirm()
//   if (!(await ask({
//     title: "‘(주)솔바람테크’를 삭제할까요?",
//     body: "청구서·계약 기록도 함께 지워져요.",
//     summary: [{ label: "청구서", value: "12건" }, { label: "받을 돈", value: won(1034000) }],
//     consequences: ["되돌릴 수 없어요"],
//     confirmLabel: "삭제하기",
//     tone: "danger",
//   }))) return
//   // 3버튼: const r = await ask({ …, altAction: { label: "저장만 하기" } }); if (r === "alt") …
//   // 블록 내용(라디오 등): ask({ title, content: <RadioGroup …/>, confirmLabel }) — body(<p> 안)에는 div를 넣지 않는다
//   // body가 없으면 설명(aria-describedby)을 비운다(제목이 두 번 읽히지 않게)
//
// 실행형(버튼이 "처리 중…"으로 잠기고, 실패하면 대화상자 안에 오류를 띄운 채 닫지 않는다):
//   <ConfirmDialog open={open} onOpenChange={setOpen} title="10월분 청구서 22건을 발행할까요?" confirmLabel="22건 발행하기"
//     retryable={false}            // 발행·일괄 납부처럼 서버가 일부를 처리했을 수 있으면 같은 버튼을 다시 누르게 하지 않는다
//     onConfirm={async () => { const r = await issue(); return r.ok ? undefined : { error: r.message } }}
//     onFailed={() => reloadStatus()} />   // 실패 뒤에는 화면이 서버 상태를 다시 읽어 실제 결과를 보여 준다
//
// 처음 포커스는 [닫기](위험 버튼에 기본 포커스를 두지 않는다). 위험 동작은 빨간 버튼. 제목은 해요체 질문, 버튼은 구체 동사.

import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from "react"
import { ChevronRight, Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { Notice } from "./notice"

export interface ConfirmSummaryRow {
  label: ReactNode
  value: ReactNode
}

export interface ConfirmOptions {
  /** 해요체 질문("10월분 청구서 22건을 발행할까요?") */
  title: string
  /** 1~2문장(설명 글. AlertDialogDescription = <p> 안에 들어가므로 글자·인라인 요소만) */
  body?: ReactNode
  /** 본문 아래 블록 내용(라디오 묶음·표 등 div가 필요한 것). body와 summary 사이에 그린다 */
  content?: ReactNode
  /** 대상·건수·금액 표(값은 오른쪽 정렬) */
  summary?: ConfirmSummaryRow[]
  /** 불릿 최대 3줄: 함께 사라지는 것·되돌릴 수 있는지 */
  consequences?: string[]
  /** 접힌 "자세히" */
  details?: ReactNode
  /** 구체 동사("22건 발행하기", "삭제하기") */
  confirmLabel: string
  /** 기본 "닫기" */
  cancelLabel?: string
  tone?: "default" | "danger"
  /** 세 번째 버튼(반환값 "alt") */
  altAction?: { label: string; tone?: "default" | "danger" }
  /** 체크해야 주 버튼이 동작하는 확인 문구 */
  acknowledge?: string
}

export type ConfirmResult = boolean | "alt"
type AskFn = (options: ConfirmOptions) => Promise<ConfirmResult>

const ConfirmContext = createContext<AskFn | null>(null)

// ── 본문(제목 아래) ───────────────────────────────────────────────────────────

/** body 아래 블록(내용·표·불릿·자세히·확인 체크)이 하나라도 있는지 */
function hasBlock(o: Omit<ConfirmOptions, "confirmLabel">): boolean {
  return !!(o.content || (o.summary && o.summary.length > 0) || (o.consequences && o.consequences.length > 0) || o.details || o.acknowledge)
}

/**
 * 대화상자 설명(aria-describedby) 연결: body가 있으면 Radix 기본(Description), 없으면 블록 내용, 그것도 없으면 비운다.
 * (예전에는 body가 없을 때 제목을 sr-only 설명으로 넣어 화면 읽기 프로그램이 제목을 두 번 읽었다)
 */
function describedBy(o: Omit<ConfirmOptions, "confirmLabel">, blockId: string): { "aria-describedby"?: string } {
  if (o.body) return {}
  return { "aria-describedby": hasBlock(o) ? blockId : undefined }
}

function ConfirmContent({
  id,
  options,
  acknowledged,
  onAcknowledge,
  ackError,
}: {
  id?: string
  options: Omit<ConfirmOptions, "confirmLabel">
  acknowledged: boolean
  onAcknowledge: (v: boolean) => void
  ackError: boolean
}) {
  const ackId = useId()
  const { content, summary, consequences, details, acknowledge } = options
  if (!hasBlock(options)) return null
  return (
    <div id={id} className="space-y-3 text-base text-dark">
      {content && <div className="leading-relaxed [word-break:keep-all]">{content}</div>}
      {summary && summary.length > 0 && (
        <table className="w-full border-collapse overflow-hidden rounded-md border border-warm-tan text-[15px]">
          <tbody>
            {summary.map((row, i) => (
              <tr key={i} className="border-b border-warm-tan/70 last:border-b-0">
                <th scope="row" className="bg-warm-ivory px-3 py-2 text-left font-medium text-[#3f3f4e]">
                  {row.label}
                </th>
                <td className="px-3 py-2 text-right tabular-nums">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {consequences && consequences.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 leading-relaxed [word-break:keep-all]">
          {consequences.slice(0, 3).map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
      {details && (
        <details className="group rounded-md border border-warm-tan">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-sm font-medium text-dark [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 shrink-0 text-text-secondary group-open:rotate-90" aria-hidden />
            자세히
          </summary>
          <div className="border-t border-warm-tan px-3 py-2 text-sm leading-relaxed text-text-secondary [word-break:keep-all]">{details}</div>
        </details>
      )}
      {acknowledge && (
        <div>
          <div className="flex items-start gap-2">
            <Checkbox
              id={ackId}
              checked={acknowledged}
              onCheckedChange={(v) => onAcknowledge(v === true)}
              aria-invalid={ackError || undefined}
              aria-describedby={ackError ? `${ackId}-err` : undefined}
              className="mt-1"
            />
            <label htmlFor={ackId} className="cursor-pointer leading-relaxed [word-break:keep-all]">
              {acknowledge}
            </label>
          </div>
          {ackError && (
            <p id={`${ackId}-err`} role="alert" className="mt-1 text-sm text-red-800">
              위 확인 문구에 체크해 주세요
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function dangerClass(tone: "default" | "danger" | undefined) {
  return tone === "danger" ? "bg-destructive text-white hover:bg-destructive/90" : ""
}

const OUTLINE = "hover:bg-warm-beige hover:text-dark"

// ── useConfirm ───────────────────────────────────────────────────────────────

interface Pending {
  options: ConfirmOptions
  resolve: (r: ConfirmResult) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [open, setOpen] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [ackError, setAckError] = useState(false)
  const pendingRef = useRef<Pending | null>(null)
  const blockId = useId()

  const settle = useCallback((result: ConfirmResult) => {
    const p = pendingRef.current
    pendingRef.current = null
    setOpen(false)
    p?.resolve(result)
  }, [])

  const ask = useCallback<AskFn>((options) => {
    // 이미 열린 확인창이 있으면 그것은 "닫기"로 끝낸다
    pendingRef.current?.resolve(false)
    return new Promise<ConfirmResult>((resolve) => {
      const p = { options, resolve }
      pendingRef.current = p
      setPending(p)
      setAcknowledged(false)
      setAckError(false)
      setOpen(true)
    })
  }, [])

  const o = pending?.options
  const runConfirm = (result: ConfirmResult) => {
    if (o?.acknowledge && !acknowledged && result === true) {
      setAckError(true)
      return
    }
    settle(result)
  }

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(v) => {
          if (!v) settle(false)
        }}
      >
        {o && (
          <AlertDialogContent
            className="app-shell max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
            // body가 없으면 블록 내용으로 설명하거나 비운다(제목을 sr-only 설명으로 한 번 더 읽지 않게)
            {...describedBy(o, blockId)}
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold leading-snug text-dark [word-break:keep-all]">{o.title}</AlertDialogTitle>
              {o.body && (
                <AlertDialogDescription className="text-base leading-relaxed text-[#3f3f4e] [word-break:keep-all]">{o.body}</AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <ConfirmContent
              id={blockId}
              options={o}
              acknowledged={acknowledged}
              onAcknowledge={(v) => {
                setAcknowledged(v)
                if (v) setAckError(false)
              }}
              ackError={ackError}
            />
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className={OUTLINE}>{o.cancelLabel ?? "닫기"}</AlertDialogCancel>
              {o.altAction && (
                <Button type="button" variant="outline" className={cn(OUTLINE, o.altAction.tone === "danger" && "border-red-300 text-red-800")} onClick={() => settle("alt")}>
                  {o.altAction.label}
                </Button>
              )}
              <Button type="button" className={dangerClass(o.tone)} onClick={() => runConfirm(true)}>
                {o.confirmLabel}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

/**
 * 확인창 열기 함수를 돌려준다. 반환 Promise<true | false | "alt">.
 * Provider 밖에서 부르면 개발 중 콘솔 오류를 남기고 늘 false(실행하지 않음)로 끝난다.
 */
export function useConfirm(): AskFn {
  const ctx = useContext(ConfirmContext)
  if (ctx) return ctx
  return async (options) => {
    if (process.env.NODE_ENV !== "production") {
      console.error(`[useConfirm] ConfirmProvider(AppProviders) 밖에서 불렸어요. 레이아웃에 AppProviders가 있는지 확인하세요: "${options.title}"`)
    }
    return false
  }
}

// ── ConfirmDialog(실행형) ─────────────────────────────────────────────────────

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  onFailed,
  retryable = true,
  busyLabel = "처리 중…",
  failedTitle = "처리하지 못했어요",
  ...options
}: Omit<ConfirmOptions, "altAction"> & {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 실행. 성공이면 undefined, 실패면 { error: 화면 문구 }. 예외를 던져도 실패로 본다 */
  onConfirm: () => Promise<void | { error: string }>
  /** 실패했을 때(화면이 서버 상태를 다시 읽는 자리) */
  onFailed?: (error: string) => void
  /** false면 실패 뒤 같은 버튼을 다시 누르지 못하게 주 버튼을 숨긴다(발행·일괄 납부) */
  retryable?: boolean
  busyLabel?: string
  failedTitle?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedOnce, setFailedOnce] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [ackError, setAckError] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  const blockId = useId()
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setError(null)
      setFailedOnce(false)
      setAcknowledged(false)
      setAckError(false)
    }
  }

  const run = async () => {
    if (options.acknowledge && !acknowledged) {
      setAckError(true)
      return
    }
    setBusy(true)
    setError(null)
    let message: string | null = null
    try {
      const r = await onConfirm()
      if (r && typeof r === "object" && "error" in r) message = r.error
    } catch {
      message = "처리하지 못했어요. 인터넷 연결을 확인하고 화면을 새로 고쳐 결과를 확인해 주세요."
    }
    setBusy(false)
    if (message) {
      setError(message)
      setFailedOnce(true)
      onFailed?.(message)
      return
    }
    onOpenChange(false)
  }

  const hideConfirm = failedOnce && !retryable
  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return // 처리 중에는 닫지 않는다
        onOpenChange(v)
      }}
    >
      <AlertDialogContent
        className="app-shell max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
        {...describedBy(options, blockId)}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold leading-snug text-dark [word-break:keep-all]">{options.title}</AlertDialogTitle>
          {options.body && (
            <AlertDialogDescription className="text-base leading-relaxed text-[#3f3f4e] [word-break:keep-all]">{options.body}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <ConfirmContent
          id={blockId}
          options={options}
          acknowledged={acknowledged}
          onAcknowledge={(v) => {
            setAcknowledged(v)
            if (v) setAckError(false)
          }}
          ackError={ackError}
        />
        {error && (
          <Notice tone="danger" title={failedTitle}>
            {error}
            {!retryable && <p className="mt-1">이미 처리된 것이 있을 수 있어요. 화면에서 실제 결과를 확인한 뒤 남은 것만 다시 해 주세요.</p>}
          </Notice>
        )}
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={busy} className={OUTLINE}>
            {options.cancelLabel ?? "닫기"}
          </AlertDialogCancel>
          {!hideConfirm && (
            <Button type="button" disabled={busy} aria-busy={busy || undefined} className={dangerClass(options.tone)} onClick={run}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {busyLabel}
                </>
              ) : (
                options.confirmLabel
              )}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
