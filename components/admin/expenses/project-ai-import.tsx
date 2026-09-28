"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  CheckCircle2,
  FileText,
  FileUp,
  ImageIcon,
  Loader2,
  PenLine,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HelpNote } from "@/components/admin/admin-ui"
import {
  ProjectForm,
  formToInput,
  hasErrors,
  projectToForm,
  validateProjectForm,
  type ProjectFormErrors,
  type ProjectFormState,
} from "@/components/admin/expenses/project-form"
import { formatBytes, normalizeName, requestJson } from "@/components/admin/expenses/client-helpers"
import { ClientImageError, compressImage, isHeicLike, isImageFile, isPdfFile } from "@/lib/client-image"
import {
  CONFIDENCE_LABELS,
  MAX_PROJECT_DOC_FILES,
  PROJECT_DOC_ACCEPT,
  type AnalyzeProjectsResponse,
  type Confidence,
  type ProjectDraft,
  type ProjectInput,
} from "@/lib/expenses"
import type { Attachment } from "@/lib/db"

// "사업 자료로 자동 입력(AI)" — 사업계획서·협약서·선정 공문을 올리면 AI가 프로젝트 초안을 만든다.
// 초안은 제안일 뿐이다. 관리자가 폼에서 확인·수정하고 "이 프로젝트 등록"을 눌러야 저장된다.

// 서버 한도(각 4MB, 합계 4.4MB — Vercel 요청 본문 4.5MB 안쪽)와 같게 맞춘다.
const MAX_DOC_BYTES = 4 * 1024 * 1024
const MAX_TOTAL_BYTES = Math.floor(4.4 * 1024 * 1024)

type AnalyzeOk = Extract<AnalyzeProjectsResponse, { success: true }>

interface PickedDoc {
  key: string
  file: File // 서버로 보낼 파일(사진은 줄인 JPEG)
  originalName: string
  originalSize: number
  kind: "image" | "pdf" | "text"
}

interface Rejected {
  name: string
  reason: string
}

type CardStatus = "editing" | "saving" | "saved" | "skipped"

interface DraftCard {
  key: string
  draft: ProjectDraft
  form: ProjectFormState
  errors: ProjectFormErrors
  status: CardStatus
  error: string
}

const CONFIDENCE_CLASS: Record<Confidence, string> = {
  high: "border-green-200 bg-green-50 text-green-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-destructive/30 bg-destructive/10 text-destructive",
}

let keySeq = 0
const nextKey = (p: string) => `${p}${++keySeq}-${Date.now()}`

function isAttachment(v: unknown): v is Attachment {
  if (!v || typeof v !== "object") return false
  const a = v as Record<string, unknown>
  return typeof a.pathname === "string" && typeof a.name === "string"
}

function isTextLike(file: File): boolean {
  return file.type.startsWith("text/") || (!file.type && /\.(txt|md|csv)$/i.test(file.name))
}

function unsupportedReason(file: File): string {
  if (/\.(hwp|hwpx)$/i.test(file.name)) return "한글(HWP) 파일은 바로 읽을 수 없습니다. 한글에서 'PDF로 저장'한 뒤 올려 주세요."
  if (/\.(docx?|xlsx?|pptx?)$/i.test(file.name))
    return "워드·엑셀·파워포인트 파일은 바로 읽을 수 없습니다. 'PDF로 저장(인쇄 → PDF)'한 뒤 올려 주세요."
  if (/\.zip$/i.test(file.name)) return "압축 파일은 풀어서 PDF·사진만 올려 주세요."
  return "PDF, 사진(JPG·PNG), 텍스트 파일만 올릴 수 있습니다."
}

function progressText(sec: number): string {
  if (sec < 8) return "자료를 올리고 있습니다…"
  if (sec < 30) return "AI가 자료를 읽고 있습니다…"
  if (sec < 75) return "과제명·기간·예산표를 정리하고 있습니다…"
  return "자료가 많아 조금 더 걸리고 있습니다. 창을 닫지 말고 기다려 주세요…"
}

export function ProjectAiImport({
  onCreate,
  onFinished,
  onManual,
  existingNames = [],
}: {
  onCreate: (input: ProjectInput) => Promise<string | null>
  onFinished: (createdCount: number) => void
  onManual: (sourceFiles: Attachment[]) => void
  existingNames?: string[]
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const finishedRef = useRef(false)

  const [docs, setDocs] = useState<PickedDoc[]>([])
  // 자리 예약: 목록에 있는 자료 + 아직 준비(사진 줄이기) 중인 자료 수. 사진을 줄이는 동안 또 끌어다 놓아도
  // 5개를 넘겨 받지 않도록 상태(docs)가 아니라 이 값으로 남은 자리를 센다.
  const reservedRef = useRef(0)
  const inFlightRef = useRef(0)
  const [rejected, setRejected] = useState<Rejected[]>([])
  const [preparing, setPreparing] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [hint, setHint] = useState("")

  const [analyzing, setAnalyzing] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState("")
  const [needsSetup, setNeedsSetup] = useState(false)
  // 분석은 실패했지만 서버에 보관된 자료 — "직접 입력으로 계속" 할 때 프로젝트에 첨부한다
  const [keptFiles, setKeptFiles] = useState<Attachment[]>([])

  const [result, setResult] = useState<{ files: Attachment[]; warnings: string[] } | null>(null)
  const [cards, setCards] = useState<DraftCard[]>([])

  const totalBytes = docs.reduce((s, d) => s + d.file.size, 0)
  const overTotal = totalBytes > MAX_TOTAL_BYTES
  const existing = new Set(existingNames.map(normalizeName))

  // ── 파일 받기 ────────────────────────────────────────────────────────────
  const addFiles = useCallback(
    async (list: File[]) => {
      if (list.length === 0) return
      setError("")
      setNeedsSetup(false)
      // 새로 고른 묶음이면 지난 안내를 비우고, 앞 묶음이 아직 준비 중이면 안내를 이어 붙인다.
      if (inFlightRef.current === 0) setRejected([])
      inFlightRef.current++
      const room = Math.max(0, MAX_PROJECT_DOC_FILES - reservedRef.current)
      const bad: Rejected[] = []
      const accepted = list.slice(0, room)
      reservedRef.current += accepted.length
      for (const f of list.slice(room)) {
        bad.push({
          name: f.name,
          reason: `한 번에 ${MAX_PROJECT_DOC_FILES}개까지 분석할 수 있습니다. 목록에서 필요 없는 자료를 빼고 다시 올려 주세요.`,
        })
      }
      setPreparing((n) => n + accepted.length)
      const ready: PickedDoc[] = []
      for (const f of accepted) {
        const before = bad.length
        try {
          if (isImageFile(f) || isHeicLike(f)) {
            const small = await compressImage(f)
            if (small.size > MAX_DOC_BYTES) {
              bad.push({ name: f.name, reason: "사진을 줄여도 4MB가 넘습니다. 화면을 캡처해 다시 올려 주세요." })
              continue
            }
            ready.push({ key: nextKey("d"), file: small, originalName: f.name, originalSize: f.size, kind: "image" })
          } else if (isPdfFile(f)) {
            if (f.size > MAX_DOC_BYTES) {
              bad.push({
                name: f.name,
                reason: `PDF가 4MB를 넘습니다(${formatBytes(f.size)}). 필요한 쪽(사업 개요·예산표)만 따로 PDF로 저장하거나 압축해서 올려 주세요.`,
              })
              continue
            }
            const pdf = f.type === "application/pdf" ? f : new File([f], f.name, { type: "application/pdf" })
            ready.push({ key: nextKey("d"), file: pdf, originalName: f.name, originalSize: f.size, kind: "pdf" })
          } else if (isTextLike(f)) {
            if (f.size > MAX_DOC_BYTES) {
              bad.push({ name: f.name, reason: "텍스트 파일이 4MB를 넘습니다. 필요한 부분만 남겨 주세요." })
              continue
            }
            const txt = f.type === "text/plain" ? f : new File([f], f.name, { type: "text/plain" })
            ready.push({ key: nextKey("d"), file: txt, originalName: f.name, originalSize: f.size, kind: "text" })
          } else {
            bad.push({ name: f.name, reason: unsupportedReason(f) })
          }
        } catch (e) {
          bad.push({
            name: f.name,
            reason: e instanceof ClientImageError ? e.message : "파일을 읽지 못했습니다. 다른 파일로 다시 시도해 주세요.",
          })
        } finally {
          // 받지 못한 파일은 예약한 자리를 돌려준다.
          if (bad.length > before) reservedRef.current -= 1
          setPreparing((n) => n - 1)
        }
      }
      inFlightRef.current--
      if (ready.length > 0) setDocs((prev) => [...prev, ...ready].slice(0, MAX_PROJECT_DOC_FILES))
      if (bad.length > 0) setRejected((prev) => [...prev, ...bad])
    },
    []
  )

  // Ctrl+V로 붙여넣은 이미지·파일도 받는다(텍스트 붙여넣기는 그대로 둔다)
  useEffect(() => {
    if (result || analyzing) return
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      void addFiles(files)
    }
    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
  }, [addFiles, result, analyzing])

  // 분석 경과 시간
  useEffect(() => {
    if (!analyzing) return
    setElapsed(0)
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [analyzing])

  // 창을 닫으면 진행 중인 요청을 끊는다
  useEffect(() => () => abortRef.current?.abort(), [])

  // 모든 초안을 등록하거나 건너뛰었으면 부모에게 알린다(한 번만)
  useEffect(() => {
    if (finishedRef.current || cards.length === 0) return
    const pending = cards.some((c) => c.status === "editing" || c.status === "saving")
    const saved = cards.filter((c) => c.status === "saved").length
    if (!pending && saved > 0) {
      finishedRef.current = true
      onFinished(saved)
    }
  }, [cards, onFinished])

  const removeDoc = (key: string) => {
    if (!docs.some((d) => d.key === key)) return
    reservedRef.current = Math.max(0, reservedRef.current - 1)
    setDocs((prev) => prev.filter((d) => d.key !== key))
  }

  // ── 분석 ────────────────────────────────────────────────────────────────
  const analyze = async () => {
    if (docs.length === 0 || overTotal || preparing > 0) return
    setAnalyzing(true)
    setError("")
    setNeedsSetup(false)
    setRejected([])
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const fd = new FormData()
    for (const d of docs) fd.append("files", d.file, d.file.name)
    fd.append("hint", hint.trim())
    const r = await requestJson<AnalyzeOk>("/api/admin/expenses/projects/analyze", {
      method: "POST",
      body: fd,
      signal: ctrl.signal,
    })
    abortRef.current = null
    setAnalyzing(false)
    if (!r.ok) {
      if (r.aborted) return
      setError(r.error)
      setNeedsSetup(r.needsSetup)
      const kept = r.data?.files
      setKeptFiles(Array.isArray(kept) ? (kept as unknown[]).filter(isAttachment) : [])
      return
    }
    const files = Array.isArray(r.data.files) ? r.data.files : []
    const drafts = Array.isArray(r.data.drafts) ? r.data.drafts : []
    finishedRef.current = false
    setResult({ files, warnings: Array.isArray(r.data.warnings) ? r.data.warnings : [] })
    setCards(
      drafts.map((draft) => ({
        key: nextKey("c"),
        draft,
        form: projectToForm({ ...draft, source_files: files }),
        errors: {},
        status: "editing" as const,
        error: "",
      }))
    )
  }

  const cancel = () => abortRef.current?.abort()

  const restart = () => {
    setResult(null)
    setCards([])
    setError("")
    setNeedsSetup(false)
    finishedRef.current = false
  }

  // ── 초안 등록 ───────────────────────────────────────────────────────────
  const updateCard = (key: string, patch: Partial<DraftCard>) =>
    setCards((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)))

  const register = async (card: DraftCard) => {
    const errors = validateProjectForm(card.form)
    if (hasErrors(errors)) {
      updateCard(card.key, { errors, error: "빨간색으로 표시된 칸을 확인해 주세요." })
      return
    }
    updateCard(card.key, { status: "saving", errors: {}, error: "" })
    const err = await onCreate(formToInput(card.form))
    if (err) updateCard(card.key, { status: "editing", error: err })
    else updateCard(card.key, { status: "saved" })
  }

  // ── 화면: 분석 결과 ───────────────────────────────────────────────────────
  if (result) {
    const saved = cards.filter((c) => c.status === "saved").length
    const allHandled = cards.length > 0 && cards.every((c) => c.status === "saved" || c.status === "skipped")
    return (
      <div className="grid gap-4">
        <div className="rounded-md border border-gold/40 bg-gold/5 px-4 py-3 text-sm leading-relaxed text-text-secondary [word-break:keep-all]">
          <div className="flex items-center gap-2 font-semibold text-dark">
            <Sparkles className="h-4 w-4 text-gold" />
            {cards.length > 0 ? `AI가 프로젝트 ${cards.length}개를 찾았습니다` : "자료에서 프로젝트 정보를 찾지 못했습니다"}
          </div>
          <p className="mt-1">
            {cards.length > 0 ? (
              <>
                AI가 채운 값은 <b className="text-dark">제안</b>입니다. 원본 자료와 비교해 틀린 곳을 고친 뒤
                <b className="text-dark"> “이 프로젝트 등록”</b>을 누르세요.
                {cards.length > 1 && " 우리 과제가 아닌 초안은 “건너뛰기” 하면 됩니다."}
              </>
            ) : (
              "사업계획서의 개요·예산표가 들어간 쪽을 올리면 더 잘 찾습니다. 직접 입력으로 계속해도 됩니다."
            )}
          </p>
        </div>

        {result.warnings.length > 0 && (
          <ul className="grid gap-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            {result.warnings.map((w, i) => (
              <li key={i} className="flex gap-1.5 text-xs text-amber-800 [word-break:keep-all]">
                <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        )}

        {cards.map((card, i) => (
          <DraftCardView
            key={card.key}
            index={i}
            total={cards.length}
            card={card}
            duplicateName={existing.has(normalizeName(card.form.name))}
            onChange={(form) => updateCard(card.key, { form, error: "" })}
            onRegister={() => register(card)}
            onSkip={() => updateCard(card.key, { status: "skipped", error: "" })}
            onUndoSkip={() => updateCard(card.key, { status: "editing" })}
          />
        ))}

        {(cards.length === 0 || (allHandled && saved === 0)) && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onManual(result.files)}>
              <PenLine className="h-4 w-4" />
              직접 입력으로 계속
            </Button>
            <Button variant="outline" onClick={restart}>
              <RotateCcw className="h-4 w-4" />
              다른 자료로 다시 분석
            </Button>
          </div>
        )}
        {cards.length > 0 && !allHandled && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
            <button type="button" onClick={restart} className="inline-flex items-center gap-1 underline-offset-2 hover:text-dark hover:underline">
              <RotateCcw className="h-3 w-3" />
              다른 자료로 다시 분석
            </button>
            <button
              type="button"
              onClick={() => onManual(result.files)}
              className="inline-flex items-center gap-1 underline-offset-2 hover:text-dark hover:underline"
            >
              <PenLine className="h-3 w-3" />
              AI 초안 없이 직접 입력
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── 화면: 분석 중 ─────────────────────────────────────────────────────────
  if (analyzing) {
    return (
      <div className="rounded-lg border border-warm-tan bg-card px-5 py-8 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-gold" />
        <p className="mt-3 text-sm font-medium text-dark" aria-live="polite">
          {progressText(elapsed)}
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          {elapsed}초 경과 · 보통 20초~1분, 자료가 많으면 2~3분 걸립니다
        </p>
        <div className="mx-auto mt-4 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-warm-beige">
          <div
            className="h-full rounded-full bg-gold transition-[width] duration-1000 ease-out"
            style={{ width: `${Math.min(95, 8 + elapsed * 1.4)}%` }}
          />
        </div>
        <Button variant="ghost" size="sm" className="mt-4" onClick={cancel}>
          취소
        </Button>
      </div>
    )
  }

  // ── 화면: 자료 고르기 ─────────────────────────────────────────────────────
  return (
    <div className="grid gap-4">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={PROJECT_DOC_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ""
          void addFiles(files)
        }}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label="사업 자료 파일 고르기"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void addFiles(Array.from(e.dataTransfer.files ?? []))
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
          dragOver ? "border-gold bg-gold/10" : "border-warm-tan bg-warm-beige/30 hover:border-gold hover:bg-gold/5"
        }`}
      >
        <FileUp className={`h-8 w-8 ${dragOver ? "text-gold" : "text-text-tertiary"}`} />
        <p className="mt-2 text-sm font-medium text-dark">
          {dragOver ? "여기에 놓으세요" : "사업 자료를 끌어다 놓거나, 눌러서 고르세요"}
        </p>
        <p className="mt-1 text-xs text-text-secondary [word-break:keep-all]">
          사업계획서 · 협약서 · 선정 공문 · 예산표 (PDF, 사진, 텍스트) · 최대 {MAX_PROJECT_DOC_FILES}개 · 캡처 이미지는 Ctrl+V로 붙여넣기
        </p>
      </div>

      {rejected.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-destructive">올리지 못한 파일이 있습니다</p>
            <button
              type="button"
              aria-label="안내 닫기"
              onClick={() => setRejected([])}
              className="text-text-tertiary hover:text-dark"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="mt-1 grid gap-0.5">
            {rejected.map((r, i) => (
              <li key={i} className="text-xs text-text-secondary [word-break:keep-all]">
                <b className="text-dark">{r.name}</b> — {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(docs.length > 0 || preparing > 0) && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {docs.map((d) => (
            <li key={d.key} className="flex items-center gap-2.5 rounded-md border border-warm-tan bg-card px-3 py-2">
              {d.kind === "image" ? (
                <ImageIcon className="h-4 w-4 shrink-0 text-text-secondary" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-text-secondary" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-dark" title={d.originalName}>
                  {d.originalName}
                </p>
                <p className="text-[11px] text-text-tertiary">
                  {d.kind === "image" && d.file.size < d.originalSize
                    ? `${formatBytes(d.originalSize)} → ${formatBytes(d.file.size)}로 줄임`
                    : formatBytes(d.file.size)}
                </p>
              </div>
              <button
                type="button"
                aria-label={`${d.originalName} 빼기`}
                onClick={() => removeDoc(d.key)}
                className="rounded p-1 text-text-tertiary hover:bg-warm-beige hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
          {preparing > 0 && (
            <li className="flex items-center gap-2 rounded-md border border-dashed border-warm-tan px-3 py-2 text-xs text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              사진 {preparing}장을 보내기 좋게 줄이는 중…
            </li>
          )}
        </ul>
      )}

      {overTotal && (
        <p className="flex gap-1.5 text-xs text-destructive [word-break:keep-all]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          파일 합계가 {formatBytes(totalBytes)}입니다. 한 번에 4.4MB까지 보낼 수 있으니 파일을 빼거나 나눠서 분석해 주세요.
        </p>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="ai-hint">AI에게 알려 줄 내용 (선택)</Label>
        <Input
          id="ai-hint"
          value={hint}
          maxLength={500}
          onChange={(e) => setHint(e.target.value)}
          placeholder="예: 우리 회사 과제는 ‘스마트 물류’ 하나입니다. 2차년도 예산만 봐 주세요."
        />
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive [word-break:keep-all]">
          {error}
          {!needsSetup && (
            <p className="mt-1 text-xs text-text-secondary">같은 자료로 다시 시도하거나, 직접 입력으로 계속할 수 있습니다.</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onManual(keptFiles)}>
              <PenLine className="h-3.5 w-3.5" />
              직접 입력으로 계속
            </Button>
            {keptFiles.length > 0 && (
              <span className="text-xs text-text-secondary">올린 자료 {keptFiles.length}개는 프로젝트에 함께 보관됩니다</span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={analyze} disabled={docs.length === 0 || overTotal || preparing > 0}>
          <Sparkles className="h-4 w-4" />
          {error && !needsSetup ? "다시 분석하기" : "AI로 분석하기"}
        </Button>
        {docs.length === 0 && <span className="text-xs text-text-tertiary">먼저 자료를 1개 이상 올려 주세요</span>}
      </div>

      <HelpNote title="어떤 자료를 올리면 좋나요?">
        <ul className="list-disc space-y-0.5 pl-4">
          <li>
            <b>협약서·사업계획서의 첫 장(과제명·기간)</b>과 <b>예산표(비목별 금액)</b>가 들어간 쪽이면 충분합니다.
          </li>
          <li>PDF가 너무 크면 필요한 쪽만 따로 저장하거나, 해당 화면을 캡처해 붙여넣으세요.</li>
          <li>자료에 과제가 여러 개 있으면 초안도 여러 개 만들어집니다. 우리 과제만 골라 등록하세요.</li>
          <li>올린 자료는 프로젝트에 함께 보관되어 나중에 “사업·프로젝트”에서 다시 내려받을 수 있습니다.</li>
          <li>AI는 자료에 없는 값을 지어내지 않도록 되어 있습니다. 빈칸은 직접 채우거나 비워 두세요.</li>
        </ul>
      </HelpNote>
    </div>
  )
}

function DraftCardView({
  index,
  total,
  card,
  duplicateName,
  onChange,
  onRegister,
  onSkip,
  onUndoSkip,
}: {
  index: number
  total: number
  card: DraftCard
  duplicateName: boolean
  onChange: (form: ProjectFormState) => void
  onRegister: () => void
  onSkip: () => void
  onUndoSkip: () => void
}) {
  const label = total > 1 ? `초안 ${index + 1}` : "AI 초안"

  if (card.status === "saved") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="[word-break:keep-all]">
          <b>{card.form.name}</b> 프로젝트를 등록했습니다.
        </span>
      </div>
    )
  }

  if (card.status === "skipped") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-warm-tan px-4 py-3 text-sm text-text-secondary">
        <span className="truncate">
          {label} · {card.form.name || "(이름 없음)"} — 건너뜀
        </span>
        <Button variant="ghost" size="sm" onClick={onUndoSkip}>
          되돌리기
        </Button>
      </div>
    )
  }

  const saving = card.status === "saving"
  return (
    <div className="overflow-hidden rounded-lg border border-warm-tan bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-warm-tan bg-warm-beige/40 px-4 py-2.5">
        <span className="text-sm font-semibold text-dark">{label}</span>
        <span className={`rounded border px-1.5 py-0.5 text-[11px] ${CONFIDENCE_CLASS[card.draft.confidence]}`}>
          AI 확신도 {CONFIDENCE_LABELS[card.draft.confidence]}
        </span>
      </div>
      <div className="grid gap-4 p-4">
        {(card.draft.note || card.draft.confidence === "low") && (
          <div className="flex gap-2 rounded-md bg-warm-beige/40 px-3 py-2 text-xs leading-relaxed text-text-secondary [word-break:keep-all]">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
            <div>
              {card.draft.note && <p>AI 메모: {card.draft.note}</p>}
              {card.draft.confidence === "low" && (
                <p className="font-medium text-amber-800">
                  확실하지 않은 값이 많습니다. 원본 자료와 한 칸씩 대조해 주세요.
                </p>
              )}
            </div>
          </div>
        )}

        <ProjectForm value={card.form} onChange={onChange} errors={card.errors} idPrefix={card.key} disabled={saving} />

        {duplicateName && (
          <p className="flex gap-1.5 text-xs text-amber-800 [word-break:keep-all]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            같은 이름의 프로젝트가 이미 있습니다. 중복 등록이 아닌지 확인하세요(이름을 조금 바꾸면 구분하기 쉽습니다).
          </p>
        )}
        {card.error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive [word-break:keep-all]">{card.error}</p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-warm-tan/60 pt-3">
          {total > 1 && (
            <Button variant="ghost" onClick={onSkip} disabled={saving}>
              건너뛰기
            </Button>
          )}
          <Button onClick={onRegister} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                등록 중…
              </>
            ) : (
              "이 프로젝트 등록"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
