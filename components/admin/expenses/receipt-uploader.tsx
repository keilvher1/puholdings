"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Undo2, X } from "lucide-react"
import {
  MAX_SCAN_FILE_BYTES,
  SCAN_CONCURRENCY,
  type DuplicateReceipt,
  type FxRateResponse,
  type InboxItem,
  type ReceiptDraft,
  type ReceiptFields,
} from "@/lib/expenses"
import { dateTime, won } from "@/lib/format"
import { receiptsHref } from "@/lib/links"
import { BusyButton, Callout, Notice, StickyActionBar, toastInfo, toastSuccess, useConfirm, useUrlState } from "@/components/saas"
import { ClientImageError, compressImage, formatBytes, isHeicLike, isImageFile, isPdfFile, sha256File } from "@/lib/client-image"
import { UploadDropzone } from "./upload-dropzone"
import { UploadFileList } from "./upload-file-list"
import { ReceiptTable, type ReceiptTableActions, type TableCounts } from "./receipt-table"
import { UploadReviewDialog, type ReviewMode } from "./upload-review-dialog"
import {
  AI_OFF_TEXT,
  BACKUP_KEY,
  acknowledgeAll,
  acknowledgeReason,
  applyFieldPatch,
  applyFxRate,
  assessRow,
  isFxFailureWarning,
  fxRequestKey,
  parseFxResponse,
  resetFxRate,
  blankRow,
  findTableMatches,
  httpErrorMessage,
  isUploadedFileMeta,
  newKey,
  normalizeFileMeta,
  toSimilarList,
  parseBackup,
  resolveInsertConflicts,
  rowErrors,
  rowsFromInbox,
  rowsFromScan,
  saveSummary,
  screenSafeError,
  serializeBackup,
  setIncluded,
  uploadItemFromInbox,
  toCreateInput,
  PROJECT_REQUIRED,
  type DraftRow,
  type ReasonField,
  type RowAssessment,
  type UploadBackup,
  type UploadItem,
  type UploaderProject,
} from "./upload-model"
import { BusyText, HelpDetails, KeyHint, Panel, PanelHeader } from "./ui"

export type { UploaderProject } from "./upload-model"

// 증빙 올리기(증빙 처리 기본 화면, 계획서 4.2.1·4.2.2).
// 흐름: 파일 여러 개 올리기 → 브라우저에서 사진 줄이기 → 파일마다 /scan 호출(동시 3개) → 결과를 하나의 표로 모음
//       → 상태 탭으로 확인할 것만 보며 사유를 확인하고 프로젝트를 고름 → 저장 대상(selected) 행을 한 번에 저장.
// 인식 결과는 제안일 뿐이며, 저장 버튼을 누르기 전에는 아무것도 DB에 들어가지 않는다(CLAUDE.md 9항).
// 지키는 것(7.2 #8·#9·#23): 3중 중복 검사·의심 건 자동 선택 해제·중복 저장 확인, 다른 창 선저장 건 건너뛰기,
// 임시 보관(새로고침 복구)·beforeunload·저장 중 표 잠금·행 삭제 20초 되돌리기·Ctrl+S·입력 필요 행 이동. 확인 처리는 selected를 바꾸지 않는다.

type ScreenNotice = {
  tone: "success" | "danger" | "info"
  text: string
  link?: { href: string; label: string }
}

class ScanError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public fallback: UploadItem["fallback"] = null
  ) {
    super(message)
  }
}

// 서버 오류 응답에 보관된 파일 정보가 함께 오면 '직접 입력'으로 이어갈 수 있다.
function fallbackFrom(data: Record<string, unknown> | null): UploadItem["fallback"] {
  if (!data || !isUploadedFileMeta(data.file)) return null
  return {
    file: normalizeFileMeta(data.file),
    duplicates: Array.isArray(data.duplicates) ? (data.duplicates as DuplicateReceipt[]) : [],
  }
}

const PDF_LIMIT_LABEL = formatBytes(MAX_SCAN_FILE_BYTES)

// 표의 행(tr)과 휴대폰 카드(li)가 같은 data-row-key를 가진다. 지금 화면에 보이는 쪽을 고른다.
function findRowElement(key: string): HTMLElement | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-row-key="${key}"]`))
  return els.find((el) => el.getClientRects().length > 0) ?? els[0] ?? null
}

type ReviewState = { key: string; mode: ReviewMode; order: string[]; field: ReasonField | null }

export function ReceiptUploader({
  projects,
  aiReady = true,
  defaultProjectId = null,
  inbox = [],
  supportContact = null,
}: {
  projects: UploaderProject[]
  aiReady?: boolean
  defaultProjectId?: number | null
  // 데스크톱 앱이 올려 확인 대기함에 있는 증빙(pending). 처음 열 때 완료된 파일 카드 + 표 행으로 채운다.
  inbox?: InboxItem[]
  // 자동 인식을 켜 달라고 요청할 곳(ADMIN_SUPPORT_CONTACT). 없으면 그 문장을 숨긴다.
  supportContact?: string | null
}) {
  const router = useRouter()
  const ask = useConfirm()
  const [items, setItems] = useState<UploadItem[]>([])
  const [rows, setRows] = useState<DraftRow[]>([])
  const [aiOff, setAiOff] = useState(!aiReady)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<ScreenNotice | null>(null)
  const [undo, setUndo] = useState<{ entries: { row: DraftRow; index: number }[] } | null>(null)
  const [review, setReview] = useState<ReviewState | null>(null)
  const [backup, setBackup] = useState<UploadBackup | null>(null)
  const [backupLoaded, setBackupLoaded] = useState(false)
  const [focusRowKey, setFocusRowKey] = useState<string | null>(null)
  const [inboxParam, setInboxParam] = useUrlState("inbox", "")
  const inboxOnly = inboxParam === "1"
  const saveButtonRef = useRef<HTMLButtonElement>(null)

  const rowsRef = useRef(rows)
  const itemsRef = useRef(items)
  useEffect(() => {
    rowsRef.current = rows
    itemsRef.current = items
  })
  const askRef = useRef(ask)
  useEffect(() => {
    askRef.current = ask
  })
  const startedRef = useRef(new Set<string>())
  const abortRef = useRef(new Map<string, AbortController>())
  const urlsRef = useRef(new Set<string>())
  const seqRef = useRef(0)
  const fileSeqRef = useRef(new Map<string, number>())
  const savingRef = useRef(false)
  const cleanupAfterSaveRef = useRef(false)
  // 확인 대기함에서 온 파일 카드(key → 대기함 번호). 이 파일의 행은 서버에 남아 있으므로 임시 보관하지 않는다.
  const inboxKeysRef = useRef(new Map<string, number>())
  // 이번 화면에서 행을 하나라도 저장한 대기함 파일(key). 남은 행을 표에서 지워 행이 없어지면 대기함에서 뺀다.
  const savedInboxKeysRef = useRef(new Set<string>())

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const projectByIdRef = useRef(projectById)
  useEffect(() => {
    projectByIdRef.current = projectById
  })

  // ── 확인 대기함(데스크톱 앱) 항목 채우기 — 처음 한 번만 ─────────────────────────
  // 서버 렌더링과 key가 어긋나지 않도록 화면이 뜬 뒤에 넣는다.
  const inboxSeededRef = useRef(false)
  useEffect(() => {
    if (inboxSeededRef.current) return
    inboxSeededRef.current = true
    if (inbox.length === 0) return
    const seededItems: UploadItem[] = []
    let seededRows: DraftRow[] = []
    for (const entry of inbox) {
      const key = newKey()
      fileSeqRef.current.set(key, ++seqRef.current)
      inboxKeysRef.current.set(key, entry.id)
      const added = rowsFromInbox(key, entry, projects, defaultProjectId)
      const { prev, added: resolved } = resolveInsertConflicts(seededRows, added)
      seededRows = [...prev, ...resolved]
      seededItems.push(uploadItemFromInbox(key, entry))
    }
    setItems((prev) => [...seededItems, ...prev])
    setRows((prev) => {
      const { prev: kept, added } = resolveInsertConflicts(prev, seededRows)
      return [...added, ...kept]
    })
  }, [inbox, projects, defaultProjectId])

  // 대기함 항목의 행을 모두 저장했으면 대기함에서 뺀다(실패해도 다음에 열 때 다시 보일 뿐이다).
  const markInboxDone = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return
    for (const [k, v] of inboxKeysRef.current) {
      if (ids.includes(v)) {
        inboxKeysRef.current.delete(k)
        savedInboxKeysRef.current.delete(k)
      }
    }
    try {
      await fetch("/api/admin/expenses/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids, status: "done" }),
      })
    } catch {
      // 네트워크 오류 — 무시(다음에 열 때 서버가 저장된 증빙과 대조해 저장한 초안은 빼고, 다 저장된 파일은 대기함에서 정리한다)
    }
  }, [])

// ── 외화 행: 결제일 환율 받기 ─────────────────────────────────────────────────
  // 통화·거래일자가 정해졌는데 환율이 없는 외화 행(직접 입력 제외)이면 /fx로 받아 원화 합계를 계산한다.
  // 같은 (통화, 날짜)는 한 번만 요청하고, 실패하면 그 행은 '다시 조회'를 누를 때까지 다시 요청하지 않는다.
  const fxCacheRef = useRef(new Map<string, Promise<FxRateResponse>>())
  const fxAttemptRef = useRef(new Map<string, string>()) // 행 key → 마지막으로 요청한 'USD|2026-09-18'
  const loadFx = useCallback(async (rowKey: string, reqKey: string) => {
    const [currency, date] = reqKey.split("|")
    const stillWanted = (r: DraftRow) => r.key === rowKey && fxRequestKey(r.fields) === reqKey
    setRows((prev) => prev.map((r) => (stillWanted(r) ? { ...r, fx: { status: "loading" } } : r)))
    let p = fxCacheRef.current.get(reqKey)
    if (!p) {
      p = fetch(`/api/admin/expenses/fx?currency=${encodeURIComponent(currency)}&date=${encodeURIComponent(date)}`, { credentials: "include" })
        .then(async (res) => {
          let data: unknown = null
          try {
            data = await res.json()
          } catch {
            data = null
          }
          const parsed = parseFxResponse(data)
          if (!parsed.success && !res.ok) return { success: false as const, error: httpErrorMessage(res.status, (data as { error?: string } | null)?.error || "환율을 받지 못했어요") }
          return parsed
        })
        .catch(() => ({ success: false as const, error: "인터넷 연결이 끊겨 환율을 받지 못했어요" }))
      fxCacheRef.current.set(reqKey, p)
    }
    const res = await p
    if (!res.success) fxCacheRef.current.delete(reqKey) // 실패는 기억하지 않는다('다시 조회'로 재요청)
    setRows((prev) =>
      prev.map((r) => {
        if (!stillWanted(r)) return r.key === rowKey && r.fx?.status === "loading" && !fxRequestKey(r.fields) ? { ...r, fx: null } : r
        if (!res.success) return { ...r, fx: { status: "error", message: res.error || "환율을 받지 못했어요" } }
        const fields = applyFxRate(r.fields, res, date)
        const warnings = fields.exchange_rate !== null ? r.warnings.filter((w) => !isFxFailureWarning(w)) : r.warnings
        return { ...r, fields, fx: null, warnings: warnings.length === r.warnings.length ? r.warnings : warnings }
      })
    )
  }, [])

  useEffect(() => {
    const attempts = fxAttemptRef.current
    const live = new Set<string>()
    for (const r of rows) {
      live.add(r.key)
      const k = fxRequestKey(r.fields)
      if (!k) {
        attempts.delete(r.key)
        continue
      }
      if (attempts.get(r.key) === k) continue
      attempts.set(r.key, k)
      void loadFx(r.key, k)
    }
    for (const k of attempts.keys()) if (!live.has(k)) attempts.delete(k)
  }, [rows, loadFx])

  // ── 행 삽입 순서: 파일을 올린 순서대로(끝난 순서가 아니라) ─────────────────────
  // 넣기 전에 표에 이미 있는 행과 견줘, 같은 파일을 다시 올렸거나 같은 거래의 다른 서류(세금계산서+이체확인증 등)면
  // 한쪽 선택을 해제한다(두 번 계상 방지). 행에는 이유가 표시되고, 다른 거래라면 다시 체크하면 된다.
  const insertRows = useCallback((prevRows: DraftRow[], addedRows: DraftRow[], fileKey: string): DraftRow[] => {
    const { prev, added } = resolveInsertConflicts(prevRows, addedRows)
    const seqOf = (k: string | null) => (k ? (fileSeqRef.current.get(k) ?? -1) : -1)
    const seq = seqOf(fileKey)
    const idx = prev.findIndex((r) => seqOf(r.fileKey) > seq)
    if (idx === -1) return [...prev, ...added]
    return [...prev.slice(0, idx), ...added, ...prev.slice(idx)]
  }, [])

  const updateItem = useCallback((key: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  }, [])

  const trackUrl = (url: string) => {
    urlsRef.current.add(url)
    return url
  }
  const releaseUrl = (url: string | null) => {
    if (!url) return
    URL.revokeObjectURL(url)
    urlsRef.current.delete(url)
  }

  // ── 파일 한 개 처리: (사진이면) 줄이기 → 업로드·AI 분석 → 행 추가 ─────────────
  const processItem = useCallback(
    async (item: UploadItem) => {
      const key = item.key
      const ctrl = new AbortController()
      abortRef.current.set(key, ctrl)
      try {
        let toSend = item.prepared
        let originalHash = item.originalHash
        if (!toSend) {
          if (item.kind === "image") updateItem(key, { status: "compressing" })
          // 줄이기 전 원본의 해시 — 같은 사진을 다른 기기·브라우저에서 올려도 같은 파일로 알아본다(실패하면 서버가 전송본 해시를 쓴다).
          originalHash = await sha256File(item.file)
          if (item.kind === "image") {
            try {
              toSend = await compressImage(item.file)
            } catch (e) {
              throw new ScanError(e instanceof ClientImageError ? e.message : "사진을 처리하지 못했어요. JPG·PNG로 저장해 다시 올려 주세요.", false)
            }
          } else {
            toSend = item.file
          }
          if (toSend.size > MAX_SCAN_FILE_BYTES) {
            throw new ScanError(`파일이 너무 커요(${formatBytes(toSend.size)} · 최대 ${PDF_LIMIT_LABEL}). 쪽을 나눠 올려 주세요.`, false)
          }
          // HEIC처럼 원본을 미리 볼 수 없던 사진은 줄인 JPEG로 썸네일을 만든다.
          const thumb = item.kind === "image" && !item.localUrl && !ctrl.signal.aborted ? trackUrl(URL.createObjectURL(toSend)) : null
          updateItem(key, thumb ? { prepared: toSend, originalHash, localUrl: thumb } : { prepared: toSend, originalHash })
        }
        if (ctrl.signal.aborted) return
        updateItem(key, { status: "scanning", startedAt: Date.now() })

        const fd = new FormData()
        fd.append("file", toSend, toSend.name)
        if (originalHash) fd.append("original_hash", originalHash)
        let res: Response
        try {
          res = await fetch("/api/admin/expenses/scan", { method: "POST", body: fd, credentials: "include", signal: ctrl.signal })
        } catch (e) {
          if (ctrl.signal.aborted) return
          void e
          throw new ScanError("인터넷 연결이 끊겨 파일을 보내지 못했어요. 연결을 확인하고 다시 시도해 주세요.", true)
        }
        let data: Record<string, unknown> | null = null
        try {
          data = (await res.json()) as Record<string, unknown>
        } catch {
          data = null
        }
        if (ctrl.signal.aborted) return

        if (data && data.success === true) {
          const meta = isUploadedFileMeta(data.file) ? normalizeFileMeta(data.file) : null
          if (!meta) throw new ScanError("파일을 보관하지 못했어요. 다시 시도해 주세요.", true)
          const drafts = Array.isArray(data.drafts) ? (data.drafts as ReceiptDraft[]) : []
          const dups = Array.isArray(data.duplicates) ? (data.duplicates as DuplicateReceipt[]) : []
          const similar = Array.isArray(data.possible_duplicates) ? (data.possible_duplicates as unknown[]).map(toSimilarList) : []
          const added = rowsFromScan(key, meta, drafts, dups, projects, defaultProjectId, similar)
          // 표에 이미 있는 행과 같은 파일·같은 거래라 선택을 해제하게 되면 잠깐 알려 준다(행에도 이유가 표시된다).
          const preview = resolveInsertConflicts(rowsRef.current, added)
          if (preview.deselected > 0) {
            toastInfo(`같은 증빙으로 보이는 ${preview.deselected}건을 저장 대상에서 뺐어요`, { description: "‘제외’ 탭에서 확인할 수 있어요" })
          }
          setRows((prev) => insertRows(prev, added, key))
          // 인식한 내용이 없어 빈 초안만 온 경우는 '인식 내용 없음'으로 보여 준다.
          const recognized = drafts.filter((d) => d.vendor_name || d.issue_date || d.total_amount !== null).length
          updateItem(key, { status: "done", uploaded: meta, draftCount: recognized, duplicateCount: dups.length, error: "", fallback: null })
          return
        }

        if (data && data.needs_setup) {
          // 자동 인식 미설정: 파일은 서버에 보관되고(file 정보가 오면) 빈 행을 만들어 직접 입력하게 한다.
          setAiOff(true)
          const meta = isUploadedFileMeta(data.file) ? normalizeFileMeta(data.file) : null
          if (meta) {
            const dups = Array.isArray(data.duplicates) ? (data.duplicates as DuplicateReceipt[]) : []
            const added = [blankRow(key, meta, projects, defaultProjectId, { duplicates: dups })]
            setRows((prev) => insertRows(prev, added, key))
            updateItem(key, { status: "done", aiSkipped: true, uploaded: meta, draftCount: 0, duplicateCount: dups.length, error: "", fallback: null })
            return
          }
          throw new ScanError(AI_OFF_TEXT, true)
        }

        const serverMsg = data && typeof data.error === "string" && data.error ? screenSafeError(data.error) : undefined
        throw new ScanError(
          httpErrorMessage(res.status, serverMsg ?? (data ? undefined : "응답을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.")),
          true,
          fallbackFrom(data)
        )
      } catch (e) {
        if (ctrl.signal.aborted) return
        const err = e instanceof ScanError ? e : new ScanError("처리하지 못했어요. 다시 시도해 주세요.", true)
        updateItem(key, { status: "error", error: err.message, retryable: err.retryable, fallback: err.fallback })
      } finally {
        abortRef.current.delete(key)
        startedRef.current.delete(key)
      }
    },
    [projects, defaultProjectId, insertRows, updateItem]
  )

  // ── 대기열: 동시에 SCAN_CONCURRENCY(3)개까지만 처리 ───────────────────────────
  useEffect(() => {
    const running = items.filter(
      (i) => i.status === "compressing" || i.status === "scanning" || (i.status === "queued" && startedRef.current.has(i.key))
    ).length
    let slots = SCAN_CONCURRENCY - running
    for (const it of items) {
      if (slots <= 0) break
      if (it.status === "queued" && !startedRef.current.has(it.key)) {
        startedRef.current.add(it.key)
        slots--
        void processItem(it)
      }
    }
  }, [items, processItem])

  // 화면을 떠나면 진행 중인 요청을 멈추고 미리보기 URL을 정리한다.
  useEffect(() => {
    const aborts = abortRef.current
    const urls = urlsRef.current
    return () => {
      aborts.forEach((c) => c.abort())
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  // ── 파일 받기 ────────────────────────────────────────────────────────────────
  const addFiles = useCallback((files: File[]) => {
    const existing = itemsRef.current
    const sig = (f: File) => `${f.name}|${f.size}|${f.lastModified}`
    const known = new Set(existing.filter((i) => i.status !== "error").map((i) => sig(i.file)))
    let skipped = 0
    const added: UploadItem[] = []
    for (const file of files) {
      if (known.has(sig(file))) {
        skipped++
        continue
      }
      known.add(sig(file))
      const kind: UploadItem["kind"] = isPdfFile(file) ? "pdf" : isImageFile(file) ? "image" : "other"
      const key = newKey()
      fileSeqRef.current.set(key, ++seqRef.current)
      let error = ""
      if (kind === "other") {
        error = "올릴 수 없는 형식이에요. JPG·PNG·HEIC·PDF만 돼요(엑셀·한글은 PDF로 바꿔 주세요)."
      } else if (file.size === 0) {
        error = "빈 파일이에요. 파일을 확인해 주세요."
      } else if (kind === "pdf" && file.size > MAX_SCAN_FILE_BYTES) {
        error = `PDF가 너무 커요(${formatBytes(file.size)} · 최대 ${PDF_LIMIT_LABEL}). 쪽을 나눠 올려 주세요.`
      }
      const canPreview = kind === "image" && !isHeicLike(file)
      added.push({
        key,
        file,
        prepared: null,
        originalHash: null,
        name: file.name || "이름 없는 파일",
        size: file.size,
        kind,
        localUrl: canPreview ? trackUrl(URL.createObjectURL(file)) : null,
        status: error ? "error" : "queued",
        error,
        retryable: false,
        startedAt: null,
        uploaded: null,
        draftCount: 0,
        duplicateCount: 0,
        aiSkipped: false,
        fallback: null,
      })
    }
    if (added.length > 0) setItems((prev) => [...prev, ...added])
    if (skipped > 0) {
      toastInfo(`이미 목록에 있는 파일 ${skipped}개는 빼고 올렸어요`)
    }
  }, [])

  const retryItem = useCallback((key: string) => {
    setItems((prev) => prev.map((i) => (i.key === key && i.status === "error" ? { ...i, status: "queued", error: "", retryable: false, startedAt: null } : i)))
  }, [])

  const retryAllFailed = useCallback(() => {
    setItems((prev) => prev.map((i) => (i.status === "error" && i.retryable ? { ...i, status: "queued", error: "", retryable: false, startedAt: null } : i)))
  }, [])

  // 인식이 실패한 파일을 빈 행으로 만들어 직접 입력한다(원본은 이미 서버에 보관됨).
  const manualItem = useCallback(
    (key: string) => {
      const it = itemsRef.current.find((i) => i.key === key)
      if (!it?.fallback) return
      const { file, duplicates } = it.fallback
      const row = blankRow(key, file, projects, defaultProjectId, { duplicates })
      setRows((prev) => insertRows(prev, [row], key))
      updateItem(key, { status: "done", aiSkipped: true, uploaded: file, draftCount: 0, duplicateCount: duplicates.length, error: "", fallback: null })
      setFocusRowKey(row.key)
    },
    [projects, defaultProjectId, insertRows, updateItem]
  )

  const removeItem = useCallback(async (key: string) => {
    const it = itemsRef.current.find((i) => i.key === key)
    const inboxId = inboxKeysRef.current.get(key)
    if (inboxId !== undefined) {
      // 확인 대기함 파일: 대기함에서 빼고(원본도 정리) 이 파일의 표 행도 함께 뺀다. 되돌릴 수 없으므로 먼저 묻는다.
      const rowCount = rowsRef.current.filter((r) => r.fileKey === key).length
      const ok = await askRef.current({
        title: `‘${it?.name ?? "파일"}’을 대기함에서 뺄까요?`,
        body: rowCount > 0 ? `표의 행 ${rowCount}건과 보관된 원본도 함께 지워져요.` : "보관된 원본도 함께 지워져요.",
        consequences: ["되돌릴 수 없어요", "같은 원본을 쓰는 저장된 증빙이 있으면 원본은 남겨요"],
        confirmLabel: "대기함에서 빼기",
        tone: "danger",
      })
      if (ok !== true) return
      abortRef.current.get(key)?.abort()
      inboxKeysRef.current.delete(key)
      savedInboxKeysRef.current.delete(key)
      setRows((prev) => prev.filter((r) => r.fileKey !== key))
      setItems((prev) => prev.filter((i) => i.key !== key))
      try {
        const res = await fetch("/api/admin/expenses/inbox", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: inboxId }),
        })
        if (!res.ok) setNotice({ tone: "danger", text: httpErrorMessage(res.status, "대기함에서 빼지 못했어요. 새로고침한 뒤 다시 시도해 주세요.") })
        else {
          toastSuccess(`‘${it?.name ?? "파일"}’을 대기함에서 뺐어요`)
          router.refresh()
        }
      } catch {
        setNotice({ tone: "danger", text: "인터넷 연결이 끊겨 대기함에서 빼지 못했어요. 새로고침한 뒤 다시 시도해 주세요." })
      }
      return
    }
    abortRef.current.get(key)?.abort()
    releaseUrl(it?.localUrl ?? null)
    setItems((prev) => prev.filter((i) => i.key !== key))
  }, [router])

  // 확인 대기함 파일 카드는 남긴다(빼려면 [대기함에서 빼기]).
  const clearFinished = useCallback(() => {
    const clearable = (i: UploadItem) => (i.status === "done" || i.status === "error") && !inboxKeysRef.current.has(i.key)
    for (const i of itemsRef.current) if (clearable(i)) releaseUrl(i.localUrl)
    setItems((prev) => prev.filter((i) => !clearable(i)))
  }, [])

  // ── 행 상태(4개 + 사유) ──────────────────────────────────────────────────────
  const tableMatches = useMemo(() => findTableMatches(rows), [rows])
  const assessments = useMemo(() => {
    const m = new Map<string, RowAssessment>()
    for (const r of rows) m.set(r.key, assessRow(r, r.project_id ? projectById.get(r.project_id) : undefined, tableMatches.get(r.key)))
    return m
  }, [rows, projectById, tableMatches])
  const assessmentsRef = useRef(assessments)
  useEffect(() => {
    assessmentsRef.current = assessments
  })
  const counts: TableCounts = useMemo(() => {
    const c = { all: rows.length, review: 0, input: 0, ready: 0, excluded: 0 }
    for (const a of assessments.values()) {
      if (a.status === "needs_review") c.review++
      else if (a.status === "needs_input") c.input++
      else if (a.status === "ready") c.ready++
      else c.excluded++
    }
    return c
  }, [rows.length, assessments])

  const todoKeys = useCallback(
    () =>
      rowsRef.current
        .filter((r) => {
          const s = assessmentsRef.current.get(r.key)?.status
          return s === "needs_review" || s === "needs_input"
        })
        .map((r) => r.key),
    []
  )

  // ── 검토 창 열기: 기본 "확인할 것만", 정상 행을 열면 전체 순회 ─────────────────
  const openReview = useCallback(
    (key: string, opts: { field?: ReasonField; mode?: ReviewMode } = {}) => {
      const todo = todoKeys()
      let mode: ReviewMode = opts.mode ?? (todo.includes(key) ? "todo" : "all")
      if (mode === "todo" && !todo.includes(key)) mode = "all"
      setReview({ key, mode, order: mode === "todo" ? todo : rowsRef.current.map((r) => r.key), field: opts.field ?? null })
    },
    [todoKeys]
  )
  const changeReviewMode = (mode: ReviewMode) =>
    setReview((prev) => {
      if (!prev) return prev
      if (mode === "all") return { ...prev, mode, order: rowsRef.current.map((r) => r.key), field: null }
      const todo = new Set([...todoKeys(), prev.key])
      return { ...prev, mode, order: rowsRef.current.map((r) => r.key).filter((k) => todo.has(k)), field: null }
    })

  // ── 표 조작 ──────────────────────────────────────────────────────────────────
  const actions: ReceiptTableActions = useMemo(
    () => ({
      // 통화·외화 금액·환율·거래일자 수정은 applyFieldPatch 규칙으로 원화 합계를 맞춘다(환율 재조회는 위 effect가 한다).
      patchFields: (key: string, patch: Partial<ReceiptFields>) =>
        setRows((prev) =>
          prev.map((r) => {
            if (r.key !== key) return r
            const fields = applyFieldPatch(r.fields, patch)
            const fx = fxRequestKey(fields) === fxRequestKey(r.fields) ? r.fx : null
            // 환율을 직접 넣었거나(원화 합계 입력 포함) 원화로 바꿨으면 판독 때의 '환율 못 가져옴' 경고는 더는 맞지 않는다.
            const fxResolved = fields.currency === "KRW" || fields.exchange_rate !== null
            const warnings = fxResolved ? r.warnings.filter((w) => !isFxFailureWarning(w)) : r.warnings
            return { ...r, fields, fx, serverErrors: [], warnings: warnings.length === r.warnings.length ? r.warnings : warnings }
          })
        ),
      refetchFx: (key: string) => {
        fxAttemptRef.current.delete(key)
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, fields: resetFxRate(r.fields), fx: null, serverErrors: [] } : r)))
      },
      setProject: (key: string, projectId: number) =>
        setRows((prev) =>
          prev.map((r) =>
            r.key === key
              ? {
                  ...r,
                  project_id: projectId,
                  projectSource: r.aiRaw?.suggested_project_id === projectId ? "ai" : "user",
                  serverErrors: [],
                }
              : r
          )
        ),
      checkField: (key: string, field: keyof ReceiptFields) =>
        setRows((prev) => {
          const hit = prev.some((r) => r.key === key && r.lowFields.includes(field) && !r.checkedFields.includes(field))
          if (!hit) return prev
          return prev.map((r) => (r.key === key ? { ...r, checkedFields: [...r.checkedFields, field] } : r))
        }),
      // 검토 창 "확인했어요 · 다음": 그 행의 남은 사유를 모두 접는다. 저장 대상(selected)은 바꾸지 않는다.
      checkAll: (key: string) =>
        setRows((prev) => {
          const matches = findTableMatches(prev)
          return prev.map((r) => (r.key === key ? acknowledgeAll(r, r.project_id ? projectByIdRef.current.get(r.project_id) : undefined, matches.get(r.key)) : r))
        }),
      acknowledge: (key: string, reasonId: string) => setRows((prev) => prev.map((r) => (r.key === key ? acknowledgeReason(r, reasonId) : r))),
      // 저장 대상 포함 스위치 — 중복 의심 행을 다시 넣는 유일한 길(가드 7.2 #23)
      setSelected: (key: string, selected: boolean) => setRows((prev) => prev.map((r) => (r.key === key ? setIncluded(r, selected) : r))),
      setSelectedMany: (keys: string[], selected: boolean) => {
        const set = new Set(keys)
        setRows((prev) => prev.map((r) => (set.has(r.key) ? setIncluded(r, selected) : r)))
      },
      bulkProject: (keys: string[], projectId: number) => {
        const set = new Set(keys)
        setRows((prev) => prev.map((r) => (set.has(r.key) ? { ...r, project_id: projectId, projectSource: "bulk", serverErrors: [] } : r)))
        const name = projects.find((p) => p.id === projectId)?.name ?? "선택한 프로젝트"
        toastSuccess(`${keys.length}건을 ‘${name}’ 프로젝트로 지정했어요`)
      },
      removeRows: (keys: string[]) => {
        const set = new Set(keys)
        const entries = rowsRef.current.map((row, index) => ({ row, index })).filter((e) => set.has(e.row.key))
        if (entries.length === 0) return
        setRows((prev) => prev.filter((r) => !set.has(r.key)))
        setUndo({ entries })
        // 확인 대기함 파일의 마지막 행을 지운 경우: 이번에 일부를 저장한 파일이면 대기함에서 빼고(done),
        // 저장한 적이 없으면 파일을 남겨 두고 [대기함에서 빼기]로 빼도록 안내한다.
        const left = new Set(rowsRef.current.filter((r) => !set.has(r.key)).map((r) => r.fileKey))
        const emptied = [...new Set(entries.map((e) => e.row.fileKey))].filter(
          (fk): fk is string => !!fk && inboxKeysRef.current.has(fk) && !left.has(fk)
        )
        const doneKeys = new Set(emptied.filter((fk) => savedInboxKeysRef.current.has(fk)))
        const unsaved = emptied.length - doneKeys.size
        if (doneKeys.size > 0) {
          void markInboxDone([...doneKeys].map((fk) => inboxKeysRef.current.get(fk) as number))
          setItems((prev) => prev.filter((i) => !doneKeys.has(i.key)))
        }
        if (unsaved > 0) toastInfo("표에 남은 행이 없는 대기함 파일은 파일 목록의 [대기함에서 빼기]로 빼 주세요")
      },
      addRowForFile: (rowKey: string) => {
        const src = rowsRef.current.find((r) => r.key === rowKey)
        if (!src) return
        const nr = blankRow(src.fileKey, src.file, projects, defaultProjectId, { project_id: src.project_id })
        nr.fields.doc_type = src.fields.doc_type
        nr.fields.payment_method = src.fields.payment_method
        setRows((prev) => {
          const last = prev.map((r) => r.file.pathname).lastIndexOf(src.file.pathname)
          return last === -1 ? [...prev, nr] : [...prev.slice(0, last + 1), nr, ...prev.slice(last + 1)]
        })
        setReview(null)
        setFocusRowKey(nr.key)
      },
      openReview,
    }),
    [projects, defaultProjectId, markInboxDone, openReview]
  )

  const undoRemove = () => {
    if (!undo) return
    const entries = [...undo.entries].sort((a, b) => a.index - b.index)
    setRows((prev) => {
      const next = [...prev]
      for (const e of entries) next.splice(Math.min(e.index, next.length), 0, e.row)
      return next
    })
    setUndo(null)
  }

  // 행 삭제 되돌리기는 20초 동안 보인다.
  useEffect(() => {
    if (!undo) return
    const t = window.setTimeout(() => setUndo(null), 20000)
    return () => window.clearTimeout(t)
  }, [undo])

  // "이 파일로 한 건 더" 뒤에 새 행의 첫 칸으로 이동
  useEffect(() => {
    if (!focusRowKey) return
    const tr = findRowElement(focusRowKey)
    if (tr) {
      tr.scrollIntoView({ block: "center", behavior: "smooth" })
      tr.querySelector<HTMLInputElement>('input[data-grid-col="issue_date"]')?.focus()
    }
    setFocusRowKey(null)
  }, [focusRowKey, rows])

  // ── 저장 ─────────────────────────────────────────────────────────────────────
  const focusRow = (key: string) => {
    window.setTimeout(() => {
      const tr = findRowElement(key)
      if (!tr) return
      tr.scrollIntoView({ block: "center", behavior: "smooth" })
      const bad = tr.querySelector<HTMLElement>('[aria-invalid="true"]')
      bad?.focus({ preventScroll: true })
    }, 60)
  }

  // confirmed: 같은 증빙이 두 번 계상될 수 있다는 확인 창에서 '그대로 저장'을 누른 경우
  const save = useCallback(async (opts: { confirmed?: boolean } = {}) => {
    if (savingRef.current) return
    const current = rowsRef.current
    const selected = current.filter((r) => r.selected)
    if (selected.length === 0) {
      setNotice({ tone: "info", text: "저장할 증빙이 없어요. 원본을 열어 ‘저장 대상에 포함’을 켜 주세요." })
      return
    }
    const invalid = selected.filter((r) => rowErrors(r).length > 0)
    const invalidKeys = new Set(invalid.map((r) => r.key))
    const valid = selected.filter((r) => !invalidKeys.has(r.key))
    if (invalid.length > 0) {
      setRows((prev) => prev.map((r) => (invalidKeys.has(r.key) && !r.showErrors ? { ...r, showErrors: true } : r)))
    }
    if (valid.length === 0) {
      const onlyProject = invalid.every((r) => rowErrors(r).every((e) => e === PROJECT_REQUIRED))
      setNotice({
        tone: "danger",
        text: onlyProject
          ? `저장할 ${selected.length}건 모두 프로젝트가 없어요. 프로젝트 칸에서 고르거나 [일괄 작업]에서 한 번에 지정해 주세요.`
          : `저장할 ${selected.length}건 모두 채울 칸이 있어요. 빨간 칸을 채운 뒤 저장해 주세요.`,
      })
      focusRow(invalid[0].key)
      return
    }

    // 이미 저장된 증빙과 같은 파일·같은 거래로 보이는 행, 표 안에서 같은 거래로 보이는 행이 함께 저장 대상이면 한 번 더 묻는다.
    if (!opts.confirmed) {
      const numberOf = new Map(current.map((r, i) => [r.key, i + 1]))
      const matches = findTableMatches(current)
      const lines: string[] = []
      let firstKey = ""
      let count = 0
      for (const r of valid) {
        const why: string[] = []
        if (r.duplicates.length > 0) why.push("이미 저장한 파일")
        if (r.similar.length > 0) why.push("이미 저장한 증빙과 같은 거래로 보임")
        for (const m of matches.get(r.key) ?? []) {
          if (m.otherSelected) why.push(`${m.otherNumber}번 행과 ${m.kind === "same_file" ? "같은 파일" : "같은 거래로 보임"}`)
        }
        if (why.length === 0) continue
        count++
        if (!firstKey) firstKey = r.key
        if (lines.length < 6) lines.push(`${numberOf.get(r.key) ?? "?"}번 행: ${why.join(", ")}`)
      }
      if (count > 0) {
        if (count > lines.length) lines.push(`외 ${count - lines.length}건`)
        const ok = await askRef.current({
          title: `같은 증빙으로 보이는 ${count}건이 저장 대상에 있어요`,
          body: "같은 거래의 다른 서류(세금계산서와 이체확인증 등)면 한 건만 저장해요. 그대로 저장하면 두 번 계상될 수 있어요.",
          details: (
            <ul className="list-disc space-y-0.5 pl-5">
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ),
          confirmLabel: "그대로 저장",
          cancelLabel: "돌아가기",
        })
        if (ok !== true) {
          focusRow(firstKey)
          return
        }
      }
    }

    savingRef.current = true
    setSaving(true)
    setNotice(null)
    const savedKeys: string[] = []
    let skippedCount = 0
    let failure: string | null = null
    let focusedError = false
    try {
      for (let i = 0; i < valid.length; i += 100) {
        const chunk = valid.slice(i, i + 100)
        let res: Response
        try {
          res = await fetch("/api/admin/expenses/receipts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ receipts: chunk.map(toCreateInput) }),
          })
        } catch {
          failure = "저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요."
          break
        }
        let data: Record<string, unknown> | null = null
        try {
          data = (await res.json()) as Record<string, unknown>
        } catch {
          data = null
        }
        if (res.ok && data?.success === true) {
          // skipped: 확인 뒤 저장 직전에 다른 창에서 같은 증빙이 먼저 저장돼 건너뛴 행 — 이미 저장된 상태다.
          if (Array.isArray(data.skipped)) skippedCount += data.skipped.length
          savedKeys.push(...chunk.map((r) => r.key))
          continue
        }
        const rowErrs = Array.isArray(data?.row_errors) ? (data.row_errors as { index: number; errors: unknown }[]) : []
        if (rowErrs.length > 0) {
          const map = new Map<string, string[]>()
          for (const re of rowErrs) {
            const r = chunk[re.index]
            if (r && Array.isArray(re.errors)) map.set(r.key, re.errors.map(String))
          }
          setRows((prev) => prev.map((r) => (map.has(r.key) ? { ...r, serverErrors: map.get(r.key) ?? [], showErrors: true } : r)))
          const first = chunk.find((r) => map.has(r.key))
          if (first) {
            focusRow(first.key)
            focusedError = true
          }
          failure = `서버 확인에서 ${map.size}건에 문제가 있어 이 묶음(${chunk.length}건)을 저장하지 않았어요. 행 아래 빨간 안내를 보고 고친 뒤 다시 저장해 주세요.`
          break
        }
        failure = httpErrorMessage(res.status, typeof data?.error === "string" && data.error ? data.error : "저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.")
        break
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }

    if (savedKeys.length > 0) {
      const saved = new Set(savedKeys)
      const savedRows = valid.filter((r) => saved.has(r.key))
      // 저장 요청은 누른 순간의 값을 보낸다. 저장하는 동안에는 표를 잠그지만, 혹시 그사이 값이 바뀐 행이 있으면
      // 조용히 버리지 않고 알려 준다(저장된 것은 누른 순간의 값).
      const latest = new Map(rowsRef.current.map((r) => [r.key, r]))
      const editedDuring = savedRows.filter((r) => {
        const cur = latest.get(r.key)
        return !!cur && (cur.fields !== r.fields || cur.project_id !== r.project_id)
      })
      cleanupAfterSaveRef.current = true
      // 확인 대기함 파일 중 표에 남은 행이 없어진 것은 대기함에서 뺀다.
      const remainingFileKeys = new Set(rowsRef.current.filter((r) => !saved.has(r.key)).map((r) => r.fileKey))
      const doneInbox = new Set<number>()
      for (const r of savedRows) {
        const inboxId = r.fileKey ? inboxKeysRef.current.get(r.fileKey) : undefined
        if (inboxId === undefined || !r.fileKey) continue
        savedInboxKeysRef.current.add(r.fileKey)
        if (!remainingFileKeys.has(r.fileKey)) doneInbox.add(inboxId)
      }
      void markInboxDone([...doneInbox]).then(() => router.refresh())
      setRows((prev) => prev.filter((r) => !saved.has(r.key)))
      setUndo(null)
      const projectIds = Array.from(new Set(savedRows.map((r) => r.project_id)))
      const sum = savedRows.reduce((acc, r) => acc + (r.fields.total_amount ?? 0), 0)
      const parts = [`${savedKeys.length}건 ${won(sum)}을 저장했어요.`]
      if (skippedCount > 0) parts.push(`그중 ${skippedCount}건은 다른 창에서 먼저 저장돼 있어서 한 번만 기록했어요.`)
      if (editedDuring.length > 0) {
        parts.push(`저장하는 동안 고친 ${editedDuring.length}건은 고치기 전 값으로 저장됐어요. 증빙 내역에서 다시 고쳐 주세요.`)
      }
      if (invalid.length > 0) parts.push(`입력 필요 ${invalid.length}건은 표에 남아 있어요.`)
      if (failure) parts.push(`나머지는 저장하지 못했어요. ${failure}`)
      setNotice({
        tone: failure || editedDuring.length > 0 ? "danger" : "success",
        text: parts.join(" "),
        link: {
          href: projectIds.length === 1 && projectIds[0] ? receiptsHref({ project_id: projectIds[0] }) : receiptsHref(),
          label: "증빙 내역 보기",
        },
      })
    } else if (failure) {
      setNotice({ tone: "danger", text: failure })
    }
    // 결과 안내가 화면 위쪽에 뜨므로 그쪽으로 올려 준다(고칠 행으로 이동한 경우는 제외).
    if (!focusedError) window.scrollTo({ top: 0, behavior: "smooth" })
  }, [markInboxDone, router])

  // 저장이 끝나면, 표에 더 남은 행이 없는 완료 파일 카드는 치운다.
  useEffect(() => {
    if (!cleanupAfterSaveRef.current) return
    cleanupAfterSaveRef.current = false
    const inUse = new Set(rows.map((r) => r.fileKey))
    // 확인 대기함 파일(아직 done 처리 전)은 남긴다 — 치우면 [대기함에서 빼기]를 누를 수 없고 다음에 열면 다시 나타난다.
    const gone = items.filter((i) => i.status === "done" && !inUse.has(i.key) && !inboxKeysRef.current.has(i.key))
    if (gone.length === 0) return
    for (const g of gone) releaseUrl(g.localUrl)
    const goneKeys = new Set(gone.map((g) => g.key))
    setItems((prev) => prev.filter((i) => !goneKeys.has(i.key)))
  }, [rows, items])

  // ── 임시 보관(새로고침·실수로 닫아도 이어서 하기) ──────────────────────────────
  // 처음 열 때 한 번만 확인한다(이후에는 지금 표의 내용이 저장소에 쓰이므로 다시 읽으면 중복된다).
  const backupCheckedRef = useRef(false)
  useEffect(() => {
    if (backupCheckedRef.current) return
    backupCheckedRef.current = true
    try {
      setBackup(parseBackup(window.localStorage.getItem(BACKUP_KEY), projects))
    } catch {
      // 사생활 보호 모드 등에서는 저장소를 못 쓸 수 있다 — 없이 동작한다.
    }
    setBackupLoaded(true)
  }, [projects])

  useEffect(() => {
    if (!backupLoaded) return
    const t = window.setTimeout(() => {
      try {
        // 확인 대기함 파일의 행은 서버에 남아 다음에 열 때 다시 채워지므로 임시 보관하지 않는다.
        const local = rows.filter((r) => !r.fileKey || !inboxKeysRef.current.has(r.fileKey))
        const all = backup ? [...backup.rows, ...local] : local
        if (all.length === 0) window.localStorage.removeItem(BACKUP_KEY)
        else window.localStorage.setItem(BACKUP_KEY, serializeBackup(all))
      } catch {
        // 용량 초과·차단 시 조용히 넘어간다(beforeunload 경고는 그대로 동작).
      }
    }, 400)
    return () => window.clearTimeout(t)
  }, [rows, backup, backupLoaded])

  const restoreBackup = () => {
    if (!backup) return
    // 지금 표에 같은 파일·같은 거래로 보이는 행이 있으면 불러온 쪽의 선택을 해제한다(두 번 저장 방지).
    setRows((prevRows) => {
      const { prev, added } = resolveInsertConflicts(prevRows, backup.rows)
      return [...added, ...prev]
    })
    toastSuccess(`임시 보관한 증빙 ${backup.rows.length}건을 불러왔어요`)
    setBackup(null)
  }

  // ── 떠나기 전 경고 ────────────────────────────────────────────────────────────
  // 탭 닫기·새로고침은 브라우저 기본 창(beforeunload). 화면 안 링크는 클릭을 먼저 막고(preventDefault) 확인 대화상자로 묻는다.
  // 같은 경로에서 쿼리만 바뀌는 링크(?inbox=1 · ?view=)는 화면을 떠나지 않으므로 묻지 않는다.
  const processing = items.filter((i) => i.status === "queued" || i.status === "compressing" || i.status === "scanning").length
  const dirty = rows.length > 0 || processing > 0
  const dirtyInfoRef = useRef({ rows: 0, inboxRows: 0, processing: 0 })
  useEffect(() => {
    // 데스크톱 앱 대기함 행은 임시 보관하지 않는다(서버 대기함에 남아 다음에 다시 채워진다) — 이동 경고 문구를 나눠 쓴다.
    const inboxRows = rows.filter((r) => !!r.fileKey && inboxKeysRef.current.has(r.fileKey)).length
    dirtyInfoRef.current = { rows: rows.length, inboxRows, processing }
  })

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    const onClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return
      let url: URL
      try {
        url = new URL(a.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (url.pathname.startsWith("/api/")) return
      if (url.pathname === window.location.pathname) return
      e.preventDefault()
      e.stopPropagation()
      const info = dirtyInfoRef.current
      const href = `${url.pathname}${url.search}${url.hash}`
      void askRef
        .current({
          title: info.rows > 0 ? `저장하지 않은 증빙 ${info.rows}건이 있어요` : `인식 중인 파일 ${info.processing}개가 있어요`,
          body: [
            info.rows - info.inboxRows > 0
              ? `${info.inboxRows > 0 ? `직접 올린 ${info.rows - info.inboxRows}건은 ` : ""}이 브라우저에 임시 보관돼서 돌아오면 불러올 수 있어요.`
              : "",
            info.inboxRows > 0
              ? `데스크톱 앱에서 온 ${info.inboxRows}건은 대기함에 남지만, 여기서 고친 내용(프로젝트·확인 처리 등)은 사라져요.`
              : "",
            info.processing > 0 ? `인식 중인 파일 ${info.processing}개는 멈춰요.` : "",
          ]
            .filter(Boolean)
            .join(" "),
          confirmLabel: "그냥 이동",
          cancelLabel: "이 화면에 있기",
        })
        .then((ok) => {
          if (ok === true) router.push(href)
        })
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("click", onClickCapture, true)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("click", onClickCapture, true)
    }
  }, [dirty, router])

  // Ctrl+S(⌘+S)로 저장
  useEffect(() => {
    if (rows.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [rows.length, save])

  // ── 화면 ─────────────────────────────────────────────────────────────────────
  const summary = useMemo(() => saveSummary(rows, (r) => assessments.get(r.key) as RowAssessment), [rows, assessments])
  const inboxFileKeys = useMemo(() => new Set(items.filter((i) => i.inboxId != null).map((i) => i.key)), [items])
  const inboxCount = inboxFileKeys.size
  // 처리 중 표시: 파일 목록과 같은 기준(인식 중 = 압축·인식, 대기 = 차례 기다림)
  const runningCount = items.filter((i) => i.status === "compressing" || i.status === "scanning").length
  const waitingCount = processing - runningCount
  const busyLabel = runningCount > 0 ? `인식 중 ${runningCount}개${waitingCount > 0 ? ` · 대기 ${waitingCount}개` : ""}` : `대기 ${waitingCount}개`
  const todoCount = summary.review + summary.input

  // 저장 바 [확인할 것 보기]: 확인 필요·입력 필요 행을 "확인할 것만" 검토 창으로 순회한다.
  const openTodo = () => {
    const todo = todoKeys()
    if (todo.length === 0) return
    const bad = rowsRef.current.filter((r) => r.selected && rowErrors(r).length > 0).map((r) => r.key)
    if (bad.length > 0) setRows((prev) => prev.map((r) => (bad.includes(r.key) && !r.showErrors ? { ...r, showErrors: true } : r)))
    openReview(todo[0], { mode: "todo" })
  }

  // 저장 바의 "입력 필요 n건": 그 행들의 빨간 칸을 켜고 첫 행으로 이동한다(저장·검증 로직은 그대로).
  const jumpToNeeded = () => {
    const bad = rowsRef.current.filter((r) => r.selected && rowErrors(r).length > 0)
    if (bad.length === 0) return
    const badKeys = new Set(bad.map((r) => r.key))
    setRows((prev) => prev.map((r) => (badKeys.has(r.key) && !r.showErrors ? { ...r, showErrors: true } : r)))
    focusRow(bad[0].key)
  }

  const finishReview = () => {
    setReview(null)
    window.setTimeout(() => saveButtonRef.current?.focus(), 80)
  }

  return (
    <div className="space-y-3">
      {/* 순서 안내: 넓은 화면은 한 줄(순서 · 한 거래 한 건), 좁으면 두 줄, 휴대폰은 순서만. 1280×600 첫 화면에 표 첫 행이 보이도록 낮게 둔다. */}
      <Callout storageKey="puh:expenses:upload-steps:v1" className="py-2">
        <p className="font-medium text-dark">
          <span className="hidden sm:inline">① 파일 올리기 → ② 확인할 것만 보기 → ③ 저장</span>
          <span className="sm:hidden">① 올리기 ② 확인 ③ 저장</span>
          <span className="hidden text-[15px] font-normal sm:inline">
            <span className="hidden xl:inline"> · </span>
            <br className="xl:hidden" />한 거래에 서류가 여럿(세금계산서+이체확인증)이면 한 건만 저장해요.
          </span>
        </p>
      </Callout>

      {/* 자동 인식 꺼짐 · 데스크톱 앱 대기함 알림은 한 상자에 모은다(첫 화면 높이 절약). ?inbox=1일 때는 표 머리에 "모두 보기"가 있어 여기서는 숨긴다. */}
      {(aiOff || (inboxCount > 0 && !inboxOnly)) && (
        <Notice tone="info" className="py-2 text-[15px]">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
            {aiOff && (
              <span>
                <span className="hidden sm:inline">자동 인식이 꺼져 있어요. 표에 직접 입력하면 돼요.</span>
                <span className="sm:hidden">자동 인식이 꺼져 있어 직접 입력해요.</span>
                {supportContact && <> 켜려면 {supportContact}에게 ‘사진 자동 인식 설정’을 요청해 주세요.</>}
              </span>
            )}
            {inboxCount > 0 && !inboxOnly && (
              <span className="inline-flex flex-wrap items-center gap-x-1">
                <span className="hidden sm:inline">데스크톱 앱에서 온 증빙 {inboxCount}건이 확인을 기다려요</span>
                <span className="sm:hidden">앱에서 온 증빙 {inboxCount}건</span>
                <button
                  type="button"
                  className="inline-flex h-8 items-center rounded-sm px-1 font-medium text-link underline underline-offset-2 hover:bg-warm-beige"
                  onClick={() => setInboxParam("1")}
                >
                  이 {inboxCount}건만 보기
                </button>
              </span>
            )}
          </span>
        </Notice>
      )}

      {backup && (
        <Notice
          tone="info"
          title={`저장하지 않은 증빙 ${backup.rows.length}건이 임시 보관돼 있어요`}
          action={
            <>
              <Button type="button" size="sm" onClick={restoreBackup}>
                불러오기
              </Button>
              <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige" onClick={() => setBackup(null)}>
                버리기
              </Button>
            </>
          }
        >
          {dateTime(backup.savedAt ? new Date(backup.savedAt) : null)}에 이 브라우저에 보관했어요.
        </Notice>
      )}

      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
          {notice.link && (
            <Link href={notice.link.href} className="ml-2 font-semibold text-link underline underline-offset-2">
              {notice.link.label}
            </Link>
          )}
        </Notice>
      )}

      {/* 넓은 화면: 접힌 파일 요약을 드롭존 옆 같은 줄에 둔다. 파일 목록을 펼치면(data-expanded) 아래 줄 전체 폭으로 내려간다. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-stretch lg:has-[>[data-expanded=true]]:grid-cols-1">
        <UploadDropzone onFiles={addFiles} compact={items.length > 0 || rows.length > 0} />

        {items.length > 0 && (
          <UploadFileList
            items={items}
            onRetry={retryItem}
            onManual={manualItem}
            onRemove={(k) => void removeItem(k)}
            onRetryAllFailed={retryAllFailed}
            onClearFinished={clearFinished}
            className="lg:flex lg:flex-col lg:justify-center"
          />
        )}
      </div>

      {rows.length === 0 && processing > 0 && (
        <Panel>
          <PanelHeader title="인식 결과" actions={<BusyText className="text-sm">{busyLabel}</BusyText>} />
          <p className="px-4 py-6 text-[15px] text-text-secondary">파일 하나에 10~30초 걸려요 · 끝난 것부터 표에 들어와요.</p>
        </Panel>
      )}

      {rows.length > 0 && (
        <Panel>
          <ReceiptTable
            rows={rows}
            projects={projects}
            actions={actions}
            matches={tableMatches}
            assessments={assessments}
            counts={counts}
            saving={saving}
            inboxFileKeys={inboxFileKeys}
            inboxOnly={inboxOnly}
            onShowAll={() => setInboxParam(null)}
            undoBar={
              undo && (
                <div className="flex items-center gap-3 border-b border-warm-tan bg-warm-ivory px-4 py-1.5 text-[15px]" role="status">
                  <p className="flex-1 text-dark">{undo.entries.length}건을 표에서 지웠어요</p>
                  <Button type="button" size="sm" variant="outline" className="h-8 hover:bg-warm-beige" onClick={undoRemove}>
                    <Undo2 className="h-3.5 w-3.5" />
                    되돌리기
                  </Button>
                  <button
                    type="button"
                    onClick={() => setUndo(null)}
                    aria-label="되돌리기 안내 닫기"
                    className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-warm-beige hover:text-dark"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )
            }
          />
        </Panel>
      )}

      <HelpDetails
        title="업로드 안내"
        className="mt-0"
        items={[
          "올릴 수 있는 것: 카드 매출전표 · 간이영수증 · 세금계산서 · 거래명세서 · 계좌이체 확인증(JPG·PNG·HEIC·PDF). 여러 파일을 한 번에 올리면 3개씩 차례로 인식해요",
          "한 파일에 증빙이 여러 건이면 건마다 행으로 나눠요(썸네일에 1/2, 2/2)",
          "해외 결제(외화): 결제일 환율로 원화를 계산해요(주말·공휴일은 직전 영업일 환율). 카드 명세서의 원화 금액이 있으면 원화 합계에 넣어 주세요",
          "인건비는 파일 없이 위의 [인건비 등록]으로 입력해요(이체확인증·급여명세서 첨부는 선택)",
          "촬영: 정면에서, 그림자·반사 없이, 글자가 화면을 채우도록 찍어 주세요",
          "노란 칸은 자동 인식이 불확실한 칸이에요. 썸네일을 누르면 원본을 보며 고칠 수 있어요",
          "이미 저장한 파일이나 같은 거래로 보이는 행은 저장 대상에서 자동으로 빠져요(‘제외’ 탭)",
        ]}
      />

      {rows.length > 0 && (
        <StickyActionBar
          className="-mx-5 px-5 sm:-mx-5 sm:rounded-none md:-mx-8 md:px-8"
          summary={
            <span aria-live="polite">
              {summary.count > 0 ? (
                <>
                  <span className="hidden sm:inline">저장할 증빙 </span>
                  <b className="font-semibold text-dark">{summary.count}건</b> ·{" "}
                  <b className="whitespace-nowrap font-bold tabular-nums text-dark">{won(summary.sum)}</b>
                  {summary.review > 0 && (
                    <span className="block whitespace-nowrap text-sm sm:inline sm:text-[15px]"> (확인 필요 {summary.review}건 포함)</span>
                  )}
                  {summary.input > 0 && (
                    <>
                      {" · "}
                      <button type="button" onClick={jumpToNeeded} className="inline-flex min-h-8 items-center whitespace-nowrap font-medium text-red-800 underline underline-offset-2">
                        입력 필요 {summary.input}건은 채워야 저장돼요
                      </button>
                    </>
                  )}
                </>
              ) : (
                "저장할 증빙이 없어요"
              )}
              {processing > 0 && <span className="whitespace-nowrap text-text-secondary"> · {busyLabel}</span>}
              <span className="hidden text-text-secondary lg:inline">
                {" · "}
                <KeyHint>Ctrl+S</KeyHint>
              </span>
            </span>
          }
          secondary={
            todoCount > 0 ? (
              <Button type="button" variant="outline" className="hidden h-10 hover:bg-warm-beige sm:inline-flex" onClick={openTodo} disabled={saving}>
                확인할 것 보기
              </Button>
            ) : undefined
          }
          primary={
            <BusyButton ref={saveButtonRef} type="button" className="h-10 min-w-[112px]" busy={saving} busyLabel="저장 중…" onClick={() => void save()}>
              {summary.count > 0 ? `${summary.count}건 저장` : "저장"}
            </BusyButton>
          }
        />
      )}

      <UploadReviewDialog
        rows={rows}
        openKey={review?.key ?? null}
        order={review?.order ?? []}
        mode={review?.mode ?? "todo"}
        focusField={review?.field ?? null}
        projects={projects}
        actions={actions}
        matches={tableMatches}
        assessments={assessments}
        saving={saving}
        onClose={() => setReview(null)}
        onNavigate={(key) => setReview((prev) => (prev ? { ...prev, key, field: null } : prev))}
        onModeChange={changeReviewMode}
        onFinish={finishReview}
      />
    </div>
  )
}
