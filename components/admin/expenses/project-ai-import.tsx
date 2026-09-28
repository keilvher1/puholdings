"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, RotateCcw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ProjectForm,
  formToInput,
  hasErrors,
  projectToForm,
  validateProjectForm,
  type ProjectFormErrors,
  type ProjectFormState,
} from "@/components/admin/expenses/project-form"
import { formatBytes, formatPeriod, normalizeName, requestJson } from "@/components/admin/expenses/client-helpers"
import {
  BusyText,
  DotList,
  HelpDetails,
  InlineNotice,
  Money,
  Panel,
  SectionTitle,
  StatusChip,
} from "@/components/admin/expenses/ui"
import { ClientImageError, compressImage, isHeicLike, isImageFile, isPdfFile } from "@/lib/client-image"
import {
  CONFIDENCE_LABELS,
  MAX_PROJECT_DOC_FILES,
  PROJECT_DOC_ACCEPT,
  type AnalyzeProjectsResponse,
  type ProjectDraft,
  type ProjectInput,
} from "@/lib/expenses"
import type { Attachment } from "@/lib/db"

// "자료에서 불러오기": 사업계획서·협약서·선정 공문을 자동 분석(lib/expense-ai)해 프로젝트 초안을 만든다.
// 초안은 제안일 뿐이다. 관리자가 폼에서 확인·수정하고 "이 프로젝트 등록"을 눌러야 저장된다.

// 서버 한도(각 4MB, 합계 4.4MB. Vercel 요청 본문 4.5MB 안쪽)와 같게 맞춘다.
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

const KIND_LABEL: Record<PickedDoc["kind"], string> = { image: "사진", pdf: "PDF", text: "텍스트" }

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
  if (/\.(hwp|hwpx)$/i.test(file.name)) return "한글(HWP) 파일은 바로 읽을 수 없습니다. 한글에서 'PDF로 저장'한 뒤 올리세요."
  if (/\.(docx?|xlsx?|pptx?)$/i.test(file.name))
    return "워드·엑셀·파워포인트 파일은 바로 읽을 수 없습니다. 'PDF로 저장(인쇄 → PDF)'한 뒤 올리세요."
  if (/\.zip$/i.test(file.name)) return "압축 파일은 풀어서 PDF·사진만 올리세요."
  return "PDF, 사진(JPG·PNG), 텍스트 파일만 올릴 수 있습니다."
}

// 실제 진행 단계를 알 수 없으므로 단계를 지어내지 않는다. 경과 초는 아래 줄에 따로 보인다.
function progressText(sec: number): string {
  return sec < 75 ? "자료 분석 중" : "자료 분석 중 · 창을 닫지 마세요"
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
          reason: `한 번에 ${MAX_PROJECT_DOC_FILES}개까지 분석할 수 있습니다. 목록에서 필요 없는 자료를 빼고 다시 올리세요.`,
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
              bad.push({ name: f.name, reason: "압축 후에도 4MB를 넘습니다. 화면을 캡처해 다시 올리세요." })
              continue
            }
            ready.push({ key: nextKey("d"), file: small, originalName: f.name, originalSize: f.size, kind: "image" })
          } else if (isPdfFile(f)) {
            if (f.size > MAX_DOC_BYTES) {
              bad.push({
                name: f.name,
                reason: `PDF 용량 초과(${formatBytes(f.size)} / 최대 4MB). 필요한 쪽(사업 개요·예산표)만 PDF로 저장해 올리세요.`,
              })
              continue
            }
            const pdf = f.type === "application/pdf" ? f : new File([f], f.name, { type: "application/pdf" })
            ready.push({ key: nextKey("d"), file: pdf, originalName: f.name, originalSize: f.size, kind: "pdf" })
          } else if (isTextLike(f)) {
            if (f.size > MAX_DOC_BYTES) {
              bad.push({ name: f.name, reason: "텍스트 파일 용량 초과(최대 4MB). 필요한 부분만 남기세요." })
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
            reason: e instanceof ClientImageError ? e.message : "파일을 읽지 못했습니다. 다른 파일로 다시 시도하세요.",
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
      updateCard(card.key, { errors, error: "빨간 칸을 확인하세요." })
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
        <div>
          <SectionTitle count={cards.length > 0 ? `${cards.length}건` : undefined}>
            {cards.length > 0 ? "초안" : "프로젝트 정보 없음"}
          </SectionTitle>
          <p className="mt-1 text-sm text-text-secondary [word-break:keep-all]">
            {cards.length > 0
              ? `원본 자료와 대조한 뒤 등록하세요.${cards.length > 1 ? " 해당 없는 초안은 건너뛰세요." : ""}`
              : "사업계획서 개요·예산표 쪽을 포함해 다시 분석하거나 직접 입력하세요."}
          </p>
        </div>

        {result.warnings.length > 0 && (
          <InlineNotice tone="warning">
            <ul className="space-y-0.5">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </InlineNotice>
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
            <Button onClick={() => onManual(result.files)}>직접 입력</Button>
            <Button variant="outline" onClick={restart}>
              <RotateCcw className="h-4 w-4" />
              다른 자료로 다시 분석
            </Button>
          </div>
        )}
        {cards.length > 0 && !allHandled && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={restart} className="-ml-2">
              <RotateCcw className="h-3.5 w-3.5" />
              다른 자료로 다시 분석
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onManual(result.files)}>
              직접 입력
            </Button>
          </div>
        )}
      </div>
    )
  }

  // ── 화면: 분석 중 ─────────────────────────────────────────────────────────
  if (analyzing) {
    return (
      <Panel className="px-5 py-8 text-center">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-dark" aria-live="polite">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-secondary" aria-hidden />
          {progressText(elapsed)}
        </p>
        <p className="mt-1 text-xs tabular-nums text-text-secondary">{elapsed}초 경과 · 보통 20초~1분</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={cancel}>
          취소
        </Button>
      </Panel>
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
        aria-label="사업 자료 파일 선택"
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
        className={`flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
          dragOver ? "border-dark bg-warm-ivory" : "border-dark/50 bg-card hover:border-dark/70 hover:bg-warm-ivory/60"
        }`}
      >
        <p className="text-sm font-semibold text-dark">{dragOver ? "놓으면 추가됩니다" : "사업 자료를 끌어다 놓거나 선택하세요"}</p>
        <p className="mt-1 text-xs text-text-secondary [word-break:keep-all]">
          사업계획서 · 협약서 · 선정 공문 · 예산표(PDF·사진·텍스트) · 최대 {MAX_PROJECT_DOC_FILES}개 · Ctrl+V 붙여넣기
        </p>
      </div>

      {rejected.length > 0 && (
        <InlineNotice tone="danger" onClose={() => setRejected([])}>
          <p className="font-medium">추가하지 못한 파일</p>
          <ul className="mt-1 grid gap-0.5 text-xs">
            {rejected.map((r, i) => (
              <li key={i}>
                <b className="font-semibold text-dark">{r.name}</b>: <span className="text-text-secondary">{r.reason}</span>
              </li>
            ))}
          </ul>
        </InlineNotice>
      )}

      {(docs.length > 0 || preparing > 0) && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {docs.map((d) => (
            <li key={d.key} className="flex items-center gap-2.5 rounded-md border border-warm-tan bg-card px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-dark" title={d.originalName}>
                  {d.originalName}
                </p>
                <p className="text-xs tabular-nums text-text-secondary">
                  <DotList
                    items={[
                      KIND_LABEL[d.kind],
                      d.kind === "image" && d.file.size < d.originalSize
                        ? `${formatBytes(d.originalSize)} → ${formatBytes(d.file.size)}`
                        : formatBytes(d.file.size),
                    ]}
                  />
                </p>
              </div>
              <button
                type="button"
                aria-label={`${d.originalName} 제거`}
                title="제거"
                onClick={() => removeDoc(d.key)}
                className="rounded-sm p-1 text-text-secondary outline-none hover:bg-warm-beige hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
          {preparing > 0 && (
            <li className="flex items-center rounded-md border border-warm-tan bg-card px-3 py-2">
              <BusyText>사진 {preparing}장 압축 중</BusyText>
            </li>
          )}
        </ul>
      )}

      {overTotal && (
        <InlineNotice tone="danger">
          파일 합계 <span className="tabular-nums">{formatBytes(totalBytes)}</span> · 한 번에 4.4MB까지 가능합니다. 파일을 빼거나 나눠서
          분석하세요.
        </InlineNotice>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="ai-hint">참고 사항 (선택)</Label>
        <Input
          id="ai-hint"
          value={hint}
          maxLength={500}
          onChange={(e) => setHint(e.target.value)}
          placeholder="예: 과제명 ‘스마트 물류’ · 2차년도 예산만"
        />
      </div>

      {error && (
        <InlineNotice tone="danger">
          {error}
          {!needsSetup && <p className="mt-1 text-xs text-text-secondary">다시 시도하거나 직접 입력하세요.</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onManual(keptFiles)}>
              직접 입력
            </Button>
            {keptFiles.length > 0 && (
              <span className="text-xs text-text-secondary">올린 자료 {keptFiles.length}개는 프로젝트에 보관됩니다</span>
            )}
          </div>
        </InlineNotice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={analyze} disabled={docs.length === 0 || overTotal || preparing > 0}>
          {error && !needsSetup && <RotateCcw className="h-4 w-4" />}
          {error && !needsSetup ? "다시 분석" : "자료 분석"}
        </Button>
        {docs.length === 0 && <span className="text-xs text-text-secondary">자료를 1개 이상 올리세요</span>}
      </div>

      <HelpDetails
        title="자료 안내"
        className="mt-0"
        items={[
          "필요한 쪽: 협약서·사업계획서 첫 장(과제명·기간), 예산표(비목별 금액)",
          "큰 PDF는 필요한 쪽만 저장하거나 캡처해 붙여넣기",
          "과제가 여러 개면 초안도 여러 건 생성 · 해당 과제만 등록",
          "올린 자료는 프로젝트에 보관(사업·프로젝트에서 다운로드)",
          "자료에 없는 값은 빈칸으로 남습니다.",
        ]}
      />
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
  const label = total > 1 ? `초안 ${index + 1}` : "초안"
  const f = card.form
  const confidence = card.draft.confidence

  if (card.status === "saved") {
    return (
      <InlineNotice tone="success">
        <b className="font-semibold">{f.name}</b> 등록 완료
      </InlineNotice>
    )
  }

  if (card.status === "skipped") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-warm-tan bg-warm-ivory px-4 py-2.5 text-sm text-text-secondary">
        <span className="min-w-0 truncate">
          <DotList items={[label, f.name || "(이름 없음)", "건너뜀"]} />
        </span>
        <Button variant="ghost" size="sm" onClick={onUndoSkip}>
          <RotateCcw className="h-3.5 w-3.5" />
          되돌리기
        </Button>
      </div>
    )
  }

  const saving = card.status === "saving"
  const headerItems = [
    f.name.trim() && <span className="text-dark">{f.name.trim()}</span>,
    typeof f.total_budget === "number" && <Money value={f.total_budget} unit className="inline" />,
    (f.start_date || f.end_date) && <span className="tabular-nums">{formatPeriod(f.start_date || null, f.end_date || null)}</span>,
  ].filter(Boolean)
  return (
    <Panel as="article">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warm-tan px-4 py-2.5">
        <span className="text-sm font-semibold text-dark">{label}</span>
        <span className="order-last w-full min-w-0 text-sm text-text-secondary [word-break:keep-all] sm:order-none sm:w-auto sm:flex-1">
          {headerItems.map((item, i) => (
            <span key={i}>
              {item}
              {/* 구분점은 앞 항목 끝에 붙인다(U+2060로 줄바꿈 금지): 줄이 바뀌어도 "·"로 시작하지 않게 */}
              {i < headerItems.length - 1 && (
                <span aria-hidden className="ml-1.5 mr-0.5 text-text-tertiary">
                  {"\u2060·"}
                </span>
              )}{" "}
            </span>
          ))}
        </span>
        {confidence === "low" ? (
          <StatusChip status="review" className="ml-auto sm:ml-0">
            신뢰도 낮음
          </StatusChip>
        ) : (
          <span className="ml-auto text-xs text-text-secondary sm:ml-0">신뢰도 {CONFIDENCE_LABELS[confidence]}</span>
        )}
      </div>
      <div className="grid gap-4 p-4">
        {(card.draft.note || confidence === "low") && (
          <div className="grid gap-0.5 text-xs [word-break:keep-all]">
            {confidence === "low" && <p className="font-medium text-amber-800">불확실한 값 다수 · 원본 대조 필요</p>}
            {card.draft.note && <p className="text-text-secondary">비고: {card.draft.note}</p>}
          </div>
        )}

        <ProjectForm value={f} onChange={onChange} errors={card.errors} idPrefix={card.key} disabled={saving} />

        {duplicateName && <InlineNotice tone="warning">같은 이름의 프로젝트가 이미 있습니다.</InlineNotice>}
        {card.error && <InlineNotice tone="danger">{card.error}</InlineNotice>}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-warm-tan pt-3">
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
    </Panel>
  )
}
