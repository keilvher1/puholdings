"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CheckCircle2, Loader2, Save, Undo2, X } from "lucide-react"
import {
  MAX_SCAN_FILE_BYTES,
  SCAN_CONCURRENCY,
  formatWon,
  type DuplicateReceipt,
  type InboxItem,
  type ReceiptDraft,
  type ReceiptFields,
} from "@/lib/expenses"
import { ClientImageError, compressImage, formatBytes, isHeicLike, isImageFile, isPdfFile, sha256File } from "@/lib/client-image"
import { UploadDropzone } from "./upload-dropzone"
import { UploadFileList } from "./upload-file-list"
import { ReceiptTable, type ReceiptTableActions } from "./receipt-table"
import { UploadReviewDialog } from "./upload-review-dialog"
import {
  BACKUP_KEY,
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
  serializeBackup,
  uploadItemFromInbox,
  toCreateInput,
  PROJECT_REQUIRED,
  type DraftRow,
  type UploadBackup,
  type UploadItem,
  type UploaderProject,
} from "./upload-model"
import { BusyText, HelpDetails, InlineNotice, KeyHint, Panel, PanelHeader } from "./ui"

export type { UploaderProject } from "./upload-model"

// 증빙 올리기(사업비 정산 기본 화면).
// 흐름: 파일 여러 개 올리기 → 브라우저에서 사진 줄이기 → 파일마다 /scan 호출(동시 3개) → 결과를 하나의 표로 모음
//       → 관리자가 확인·수정하고 마지막 열에서 프로젝트 선택 → 통과한 선택 행만 한 번에 저장.
// 인식 결과는 제안일 뿐이며, 저장 버튼을 누르기 전에는 아무것도 DB에 들어가지 않는다.

type Notice = {
  tone: "success" | "error" | "info"
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

function NoticeBar({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  return (
    <InlineNotice tone={notice.tone === "error" ? "danger" : notice.tone} onClose={onClose} className="mb-3">
      {notice.text}
      {notice.link && (
        <Link href={notice.link.href} className="ml-2 font-semibold underline underline-offset-2">
          {notice.link.label}
        </Link>
      )}
    </InlineNotice>
  )
}

// 표의 행(tr)과 모바일 카드(li)가 같은 data-row-key를 가진다. 지금 화면에 보이는 쪽을 고른다.
function findRowElement(key: string): HTMLElement | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-row-key="${key}"]`))
  return els.find((el) => el.getClientRects().length > 0) ?? els[0] ?? null
}

function formatSavedAt(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function ReceiptUploader({
  projects,
  aiReady = true,
  defaultProjectId = null,
  inbox = [],
}: {
  projects: UploaderProject[]
  aiReady?: boolean
  defaultProjectId?: number | null
  // 데스크톱 앱이 올려 확인 대기함에 있는 증빙(pending). 처음 열 때 완료된 파일 카드 + 표 행으로 채운다.
  inbox?: InboxItem[]
}) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [rows, setRows] = useState<DraftRow[]>([])
  const [aiOff, setAiOff] = useState(!aiReady)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [undo, setUndo] = useState<{ entries: { row: DraftRow; index: number }[] } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [reviewKey, setReviewKey] = useState<string | null>(null)
  const [backup, setBackup] = useState<UploadBackup | null>(null)
  const [backupLoaded, setBackupLoaded] = useState(false)
  const [focusRowKey, setFocusRowKey] = useState<string | null>(null)
  // 같은 증빙이 두 번 계상될 수 있는 행이 저장 대상에 있으면 한 번 더 묻는다.
  const [confirmSave, setConfirmSave] = useState<{ lines: string[]; count: number; firstKey: string } | null>(null)

  const rowsRef = useRef(rows)
  const itemsRef = useRef(items)
  useEffect(() => {
    rowsRef.current = rows
    itemsRef.current = items
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
              throw new ScanError(e instanceof ClientImageError ? e.message : "사진을 처리하지 못했습니다. JPG·PNG로 저장해 다시 올리세요.", false)
            }
          } else {
            toSend = item.file
          }
          if (toSend.size > MAX_SCAN_FILE_BYTES) {
            throw new ScanError(`파일 용량 초과(${formatBytes(toSend.size)} / 최대 ${PDF_LIMIT_LABEL}). 페이지를 나누어 올리세요.`, false)
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
          throw new ScanError("네트워크 오류로 파일을 보내지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.", true)
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
          if (!meta) throw new ScanError("서버 응답에 파일 정보가 없습니다. 다시 시도하세요.", true)
          const drafts = Array.isArray(data.drafts) ? (data.drafts as ReceiptDraft[]) : []
          const dups = Array.isArray(data.duplicates) ? (data.duplicates as DuplicateReceipt[]) : []
          const similar = Array.isArray(data.possible_duplicates) ? (data.possible_duplicates as unknown[]).map(toSimilarList) : []
          const added = rowsFromScan(key, meta, drafts, dups, projects, defaultProjectId, similar)
          // 표에 이미 있는 행과 같은 파일·같은 거래라 선택을 해제하게 되면 잠깐 알려 준다(행에도 이유가 표시된다).
          const preview = resolveInsertConflicts(rowsRef.current, added)
          if (preview.deselected > 0) {
            setFlash(`중복 의심 ${preview.deselected}건을 저장 대상에서 제외했습니다.`)
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
          throw new ScanError(
            typeof data.error === "string" && data.error ? data.error : "자동 인식이 설정되지 않았습니다(OPENAI_API_KEY). 시스템 관리자에게 문의하세요.",
            true
          )
        }

        const serverMsg = data && typeof data.error === "string" && data.error ? data.error : undefined
        throw new ScanError(
          httpErrorMessage(res.status, serverMsg ?? (data ? undefined : "서버 응답을 읽지 못했습니다. 잠시 후 다시 시도하세요.")),
          true,
          fallbackFrom(data)
        )
      } catch (e) {
        if (ctrl.signal.aborted) return
        const err = e instanceof ScanError ? e : new ScanError("처리 중 알 수 없는 오류가 발생했습니다. 다시 시도하세요.", true)
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
        error = "지원하지 않는 형식입니다. JPG·PNG·HEIC·PDF만 가능합니다(엑셀·한글은 PDF로 변환)."
      } else if (file.size === 0) {
        error = "빈 파일입니다. 파일을 확인하세요."
      } else if (kind === "pdf" && file.size > MAX_SCAN_FILE_BYTES) {
        error = `PDF 용량 초과(${formatBytes(file.size)} / 최대 ${PDF_LIMIT_LABEL}). 페이지를 나누어 올리세요.`
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
      setNotice({ tone: "info", text: `이미 목록에 있는 파일 ${skipped}개 제외` })
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

  const removeItem = useCallback((key: string) => {
    abortRef.current.get(key)?.abort()
    const it = itemsRef.current.find((i) => i.key === key)
    const inboxId = inboxKeysRef.current.get(key)
    if (inboxId !== undefined) {
      // 확인 대기함 파일: 대기함에서 제외하고(원본도 정리) 이 파일의 표 행도 함께 뺀다.
      const rowCount = rowsRef.current.filter((r) => r.fileKey === key).length
      const ok = window.confirm(
        `'${it?.name ?? "파일"}'을(를) 확인 대기함에서 제외합니다.${rowCount > 0 ? `\n표의 행 ${rowCount}건도 함께 빠집니다.` : ""}\n\n제외할까요?`
      )
      if (!ok) return
      inboxKeysRef.current.delete(key)
      savedInboxKeysRef.current.delete(key)
      setRows((prev) => prev.filter((r) => r.fileKey !== key))
      setItems((prev) => prev.filter((i) => i.key !== key))
      void fetch("/api/admin/expenses/inbox", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: inboxId }),
      })
        .then((res) => {
          if (!res.ok) setNotice({ tone: "error", text: httpErrorMessage(res.status, "대기함에서 제외하지 못했습니다. 새로고침 후 다시 시도하세요.") })
        })
        .catch(() => setNotice({ tone: "error", text: "네트워크 오류로 대기함에서 제외하지 못했습니다. 새로고침 후 다시 시도하세요." }))
      return
    }
    releaseUrl(it?.localUrl ?? null)
    setItems((prev) => prev.filter((i) => i.key !== key))
  }, [])

  // 확인 대기함 파일 카드는 남긴다(빼려면 카드의 X — 대기함에서 제외).
  const clearFinished = useCallback(() => {
    const clearable = (i: UploadItem) => (i.status === "done" || i.status === "error") && !inboxKeysRef.current.has(i.key)
    for (const i of itemsRef.current) if (clearable(i)) releaseUrl(i.localUrl)
    setItems((prev) => prev.filter((i) => !clearable(i)))
  }, [])

  // ── 표 조작 ──────────────────────────────────────────────────────────────────
  const actions: ReceiptTableActions = useMemo(
    () => ({
      patchFields: (key: string, patch: Partial<ReceiptFields>) =>
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, fields: { ...r.fields, ...patch }, serverErrors: [] } : r))),
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
      // 검토 창에서 '확인'을 누르면 그 행의 노란(인식 불확실) 표시를 모두 끈다.
      checkAll: (key: string) =>
        setRows((prev) => {
          const hit = prev.some((r) => r.key === key && r.lowFields.some((f) => !r.checkedFields.includes(f)))
          if (!hit) return prev
          return prev.map((r) => (r.key === key ? { ...r, checkedFields: Array.from(new Set([...r.checkedFields, ...r.lowFields])) } : r))
        }),
      setSelected: (key: string, selected: boolean) =>
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, selected } : r))),
      setSelectedMany: (keys: string[], selected: boolean) => {
        const set = new Set(keys)
        setRows((prev) => prev.map((r) => (set.has(r.key) && r.selected !== selected ? { ...r, selected } : r)))
      },
      bulkProject: (keys: string[], projectId: number) => {
        const set = new Set(keys)
        setRows((prev) =>
          prev.map((r) => (set.has(r.key) ? { ...r, project_id: projectId, projectSource: "bulk", serverErrors: [] } : r))
        )
        const name = projects.find((p) => p.id === projectId)?.name ?? "선택한 프로젝트"
        setFlash(`${keys.length}건을 '${name}' 프로젝트로 지정했습니다.`)
      },
      removeRows: (keys: string[]) => {
        const set = new Set(keys)
        const entries = rowsRef.current.map((row, index) => ({ row, index })).filter((e) => set.has(e.row.key))
        if (entries.length === 0) return
        setRows((prev) => prev.filter((r) => !set.has(r.key)))
        setUndo({ entries })
        // 확인 대기함 파일의 마지막 행을 지운 경우: 이번에 일부를 저장한 파일이면 대기함에서 빼고(done),
        // 저장한 적이 없으면 카드를 남겨 두고 X로 빼도록 안내한다.
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
        if (unsaved > 0) setFlash("표에 남은 행이 없는 대기함 파일은 파일 카드의 X로 대기함에서 제외하세요.")
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
        setFocusRowKey(nr.key)
      },
      openReview: (key: string) => setReviewKey(key),
    }),
    [projects, defaultProjectId, markInboxDone]
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

  // 되돌리기 안내·일괄 지정 안내는 잠시 뒤 사라진다.
  useEffect(() => {
    if (!undo) return
    const t = window.setTimeout(() => setUndo(null), 20000)
    return () => window.clearTimeout(t)
  }, [undo])
  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), flash.length > 40 ? 8000 : 3500)
    return () => window.clearTimeout(t)
  }, [flash])

  // "이 파일로 행 추가" 뒤에 새 행의 첫 칸으로 이동
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

  // confirmed: 같은 증빙이 두 번 계상될 수 있다는 확인 창에서 '그래도 저장'을 누른 경우
  const save = useCallback(async (opts: { confirmed?: boolean } = {}) => {
    if (savingRef.current) return
    const current = rowsRef.current
    const selected = current.filter((r) => r.selected)
    if (selected.length === 0) {
      setNotice({ tone: "info", text: "저장할 행을 선택하세요." })
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
        tone: "error",
        text: onlyProject
          ? `선택한 ${selected.length}건 모두 프로젝트가 없습니다. 프로젝트 칸에서 고르거나 '프로젝트 일괄 지정'을 쓰세요.`
          : `선택한 ${selected.length}건 모두 미입력 항목이 있습니다. 빨간 칸을 채운 뒤 저장하세요.`,
      })
      focusRow(invalid[0].key)
      return
    }

    // 이미 저장된 증빙과 같은 파일·같은 거래로 보이는 행, 표 안에서 같은 거래로 보이는 행이 함께 선택돼 있으면 한 번 더 묻는다.
    if (!opts.confirmed) {
      const numberOf = new Map(current.map((r, i) => [r.key, i + 1]))
      const matches = findTableMatches(current)
      const lines: string[] = []
      let firstKey = ""
      let count = 0
      for (const r of valid) {
        const why: string[] = []
        if (r.duplicates.length > 0) why.push("중복(이미 저장된 파일)")
        if (r.similar.length > 0) why.push("중복 의심(저장된 증빙과 같은 거래로 보임)")
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
        setConfirmSave({ lines, count, firstKey })
        return
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
          failure = "네트워크 오류로 저장하지 못했습니다. 인터넷 연결을 확인하고 다시 저장하세요."
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
          failure = `서버 확인에서 ${map.size}건에 문제가 있어 이 묶음(${chunk.length}건)을 저장하지 않았습니다. 빨간 안내를 확인해 고친 뒤 다시 저장하세요.`
          break
        }
        failure = httpErrorMessage(res.status, typeof data?.error === "string" && data.error ? data.error : "저장하지 못했습니다. 잠시 후 다시 시도하세요.")
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
      void markInboxDone([...doneInbox])
      setRows((prev) => prev.filter((r) => !saved.has(r.key)))
      setUndo(null)
      const projectIds = Array.from(new Set(savedRows.map((r) => r.project_id)))
      const sum = savedRows.reduce((acc, r) => acc + (r.fields.total_amount ?? 0), 0)
      const parts = [`${savedKeys.length}건(${formatWon(sum)})을 저장했습니다.`]
      if (skippedCount > 0) parts.push(`그중 ${skippedCount}건은 다른 창에서 먼저 저장되어 있어 한 번만 기록했습니다.`)
      if (editedDuring.length > 0) {
        parts.push(`저장 중에 고친 ${editedDuring.length}건은 고치기 전 값으로 저장되었습니다. 증빙 내역에서 다시 수정하세요.`)
      }
      if (invalid.length > 0) parts.push(`입력 필요 ${invalid.length}건은 표에 남아 있습니다.`)
      if (failure) parts.push(`나머지는 저장하지 못했습니다. ${failure}`)
      setNotice({
        tone: failure || editedDuring.length > 0 ? "error" : "success",
        text: parts.join(" "),
        link: {
          href: projectIds.length === 1 ? `/admin/expenses/receipts?project_id=${projectIds[0]}` : "/admin/expenses/receipts",
          label: "증빙 내역 보기",
        },
      })
    } else if (failure) {
      setNotice({ tone: "error", text: failure })
    }
    // 결과 안내가 화면 위쪽에 뜨므로 그쪽으로 올려 준다(고칠 행으로 이동한 경우는 제외).
    if (!focusedError) window.scrollTo({ top: 0, behavior: "smooth" })
  }, [markInboxDone])

  // 저장이 끝나면, 표에 더 남은 행이 없는 완료 파일 카드는 치운다.
  useEffect(() => {
    if (!cleanupAfterSaveRef.current) return
    cleanupAfterSaveRef.current = false
    const inUse = new Set(rows.map((r) => r.fileKey))
    // 확인 대기함 카드(아직 done 처리 전)는 남긴다 — 치우면 X(대기함에서 제외)를 누를 수 없고 다음에 열면 다시 나타난다.
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
    setBackup(null)
    setNotice({ tone: "info", text: `임시 보관된 증빙 ${backup.rows.length}건을 불러왔습니다.` })
  }

  // ── 떠나기 전 경고 ────────────────────────────────────────────────────────────
  const processing = items.filter((i) => i.status === "queued" || i.status === "compressing" || i.status === "scanning").length
  const dirty = rows.length > 0 || processing > 0
  const dirtyInfoRef = useRef({ rows: 0, processing: 0 })
  useEffect(() => {
    dirtyInfoRef.current = { rows: rows.length, processing }
  })

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    // 관리자 메뉴 등 화면 안 링크로 이동할 때도 한 번 묻는다(beforeunload는 앱 내부 이동에서 울리지 않는다).
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
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      const info = dirtyInfoRef.current
      const what = [info.rows > 0 ? `저장하지 않은 증빙 ${info.rows}건` : "", info.processing > 0 ? `인식 중인 파일 ${info.processing}개` : ""]
        .filter(Boolean)
        .join(", ")
      const ok = window.confirm(
        `${what}이(가) 있습니다.\n다른 화면으로 가면 인식 중인 파일은 중단됩니다.\n(표에 있는 내용은 이 브라우저에 임시 보관되어, 다시 오면 불러올 수 있습니다)\n\n그래도 이동할까요?`
      )
      if (!ok) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("click", onClickCapture, true)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("click", onClickCapture, true)
    }
  }, [dirty])

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
  const selected = rows.filter((r) => r.selected)
  const errorsByKey = new Map(rows.map((r) => [r.key, rowErrors(r)]))
  const readyRows = selected.filter((r) => (errorsByKey.get(r.key) ?? []).length === 0)
  const needCount = selected.length - readyRows.length
  const readySum = readyRows.reduce((acc, r) => acc + (r.fields.total_amount ?? 0), 0)
  const projectNames = projects.map((p) => p.name)
  const tableMatches = useMemo(() => findTableMatches(rows), [rows])
  const inboxCount = items.filter((i) => i.inboxId != null).length
  // 처리 중 표시: 파일 목록과 같은 기준(인식 중 = 압축·인식, 대기 = 차례 기다림)
  const runningCount = items.filter((i) => i.status === "compressing" || i.status === "scanning").length
  const waitingCount = processing - runningCount
  const busyLabel = runningCount > 0 ? `인식 중 ${runningCount}개${waitingCount > 0 ? ` · 대기 ${waitingCount}개` : ""}` : `대기 ${waitingCount}개`

  // 저장 바의 '입력 필요 N건': 해당 행들의 빨간 칸을 켜고 첫 행으로 이동한다(저장·검증 로직은 그대로).
  const jumpToNeeded = () => {
    const bad = rowsRef.current.filter((r) => r.selected && rowErrors(r).length > 0)
    if (bad.length === 0) return
    const badKeys = new Set(bad.map((r) => r.key))
    setRows((prev) => prev.map((r) => (badKeys.has(r.key) && !r.showErrors ? { ...r, showErrors: true } : r)))
    focusRow(bad[0].key)
  }

  return (
    <div>
      {aiOff && (
        <InlineNotice tone="warning" className="mb-3">
          <b className="font-semibold">자동 인식 미설정</b> · 올린 파일은 보관되며 표에서 직접 입력합니다. (설정: 시스템 관리자에게
          OPENAI_API_KEY 요청)
        </InlineNotice>
      )}

      {backup && (
        <InlineNotice
          tone="info"
          className="mb-3 items-center"
          action={
            <>
              <Button type="button" size="sm" onClick={restoreBackup}>
                불러오기
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setBackup(null)}>
                버리기
              </Button>
            </>
          }
        >
          저장하지 않은 증빙 <b className="font-semibold">{backup.rows.length}건</b>이 임시 보관되어 있습니다({formatSavedAt(backup.savedAt)}).
        </InlineNotice>
      )}

      {notice && <NoticeBar notice={notice} onClose={() => setNotice(null)} />}

      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
        <span>진행 중 프로젝트 {projects.length}개:</span>
        <span className="min-w-0 truncate text-dark">
          {projectNames.slice(0, 3).join(" · ")}
          {projectNames.length > 3 && ` 외 ${projectNames.length - 3}개`}
        </span>
        <Link href="/admin/expenses/projects" className="ml-1 font-medium text-dark underline underline-offset-2 hover:text-dark/80">
          프로젝트 관리
        </Link>
      </div>

      <UploadDropzone onFiles={addFiles} compact={items.length > 0 || rows.length > 0} />

      {inboxCount > 0 && (
        <p className="mt-3 text-sm text-dark" role="status">
          데스크톱 앱에서 받은 증빙 <b className="font-semibold tabular-nums">{inboxCount}건</b>
          <span className="text-text-secondary"> · 확인 후 프로젝트를 골라 저장</span>
        </p>
      )}

      {items.length > 0 && (
        <div className={inboxCount > 0 ? "mt-2" : "mt-3"}>
          <UploadFileList
            items={items}
            onRetry={retryItem}
            onManual={manualItem}
            onRemove={removeItem}
            onRetryAllFailed={retryAllFailed}
            onClearFinished={clearFinished}
          />
        </div>
      )}

      {rows.length === 0 && processing > 0 && (
        <Panel className="mt-3">
          <PanelHeader title="인식 결과" actions={<BusyText>{busyLabel}</BusyText>} />
          <p className="px-4 py-6 text-sm text-text-secondary">파일당 10~30초 · 완료된 건부터 표에 추가됩니다.</p>
        </Panel>
      )}

      {rows.length > 0 && (
        <Panel className="mt-3">
          <PanelHeader
            title={aiOff && rows.every((r) => r.manual) ? "직접 입력할 증빙" : "인식 결과"}
            count={`${rows.length}건`}
            meta="저장 전에는 기록되지 않습니다."
            actions={processing > 0 ? <BusyText>{busyLabel}</BusyText> : undefined}
          />
          {undo && (
            <div className="flex items-center gap-3 border-b border-warm-tan bg-warm-ivory px-4 py-2 text-sm" role="status">
              <p className="flex-1 text-dark">{undo.entries.length}건 삭제됨</p>
              <Button type="button" size="sm" variant="outline" className="h-7" onClick={undoRemove}>
                <Undo2 className="h-3.5 w-3.5" />
                되돌리기
              </Button>
              <button type="button" onClick={() => setUndo(null)} aria-label="닫기" className="rounded p-0.5 text-text-secondary hover:text-dark">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {flash && (
            <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 [word-break:keep-all]" role="status">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {flash}
            </div>
          )}
          <ReceiptTable rows={rows} projects={projects} actions={actions} matches={tableMatches} saving={saving} />
        </Panel>
      )}

      <HelpDetails
        title="업로드 안내"
        items={[
          "대상: 카드 매출전표 · 간이영수증 · 세금계산서 · 거래명세서 · 계좌이체 확인증(JPG·PNG·HEIC·PDF) · 여러 파일 동시 가능(3개씩 순차 인식)",
          "한 파일에 증빙이 여러 건이면 건별 행으로 분리",
          "촬영: 정면에서, 그림자·반사 없이, 글자가 화면을 채우도록",
          "인식 값은 저장 전 원본과 대조(노란 칸 = 인식 불확실, 썸네일 클릭 시 원본)",
          <>
            <b className="font-semibold text-dark">한 거래에 서류가 여럿이면 한 건만 저장</b>(예: 세금계산서+이체확인증). 이미 저장된 파일·같은
            거래로 보이는 행은 자동으로 선택 해제
          </>,
        ]}
      />

      {rows.length > 0 && (
        <div className="sticky bottom-0 z-30 -mx-5 mt-4 border-t border-warm-tan bg-card px-5 py-3 md:-mx-8 md:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-dark [word-break:keep-all] sm:text-base" aria-live="polite">
                {readyRows.length > 0 ? (
                  <>
                    저장 가능 <b className="font-semibold">{readyRows.length}건</b> ·{" "}
                    <b className="whitespace-nowrap font-bold tabular-nums">{formatWon(readySum)}</b>
                  </>
                ) : selected.length > 0 ? (
                  "선택한 행에 미입력 항목 있음"
                ) : (
                  "저장할 행을 선택하세요"
                )}
                {needCount > 0 && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={jumpToNeeded}
                      title="해당 행으로 이동"
                      className="whitespace-nowrap font-semibold text-destructive underline-offset-2 hover:underline"
                    >
                      입력 필요 {needCount}건
                    </button>
                  </>
                )}
              </p>
              <p className="text-xs text-text-secondary">
                선택 {selected.length}/{rows.length}건
                {processing > 0 && ` · ${busyLabel}`}
                <span className="hidden md:inline">
                  {" · "}
                  <KeyHint>Ctrl+S</KeyHint>
                </span>
              </p>
            </div>
            <Button type="button" size="lg" onClick={() => void save()} disabled={saving || selected.length === 0} className="min-w-[112px] sm:min-w-[140px]" aria-busy={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  저장 중…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {readyRows.length > 0 ? `${readyRows.length}건 저장` : "저장"}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <UploadReviewDialog
        rows={rows}
        openKey={reviewKey}
        projects={projects}
        actions={actions}
        matches={tableMatches}
        saving={saving}
        onClose={() => setReviewKey(null)}
        onNavigate={setReviewKey}
      />

      <AlertDialog open={!!confirmSave} onOpenChange={(o) => !o && setConfirmSave(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>중복 저장 확인</AlertDialogTitle>
            <AlertDialogDescription className="[word-break:keep-all]">
              아래 {confirmSave?.count ?? 0}건은 기존 증빙 또는 표의 다른 행과 같은 파일·같은 거래로 보입니다. 같은 거래의 다른 서류면 한
              건만 선택하세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm text-dark marker:text-text-secondary [word-break:keep-all]">
            {confirmSave?.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                const k = confirmSave?.firstKey
                setConfirmSave(null)
                if (k) focusRow(k)
              }}
            >
              돌아가기
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmSave(null)
                void save({ confirmed: true })
              }}
            >
              그대로 저장
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
