"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Eye, FileArchive, FileSpreadsheet, Loader2, RefreshCw, Search, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { BudgetUsageTable } from "@/components/admin/expenses/ledger-budget-table"
import { ReceiptEditSheet, foreignWithCode, formatFxRate, fxCaption } from "@/components/admin/expenses/receipt-edit-sheet"
import { PayrollEntryButton, type PayrollProject } from "@/components/admin/expenses/payroll-entry"
import { NoticeBanner, type Notice } from "@/components/admin/expenses/notice-banner"
import {
  BusyText,
  Chip,
  DotList,
  EmptyState,
  InlineNotice,
  Money,
  Panel,
  PanelHeader,
  RateValue,
  RecordCard,
  SummaryItem,
  SummaryStrip,
  TABLE_CLASS,
  TableFrame,
  UsageBar,
} from "@/components/admin/expenses/ui"
import {
  downloadFromApi,
  fileUrl,
  jsonInit,
  monthRange,
  normalizeName,
  requestJson,
  thisMonthStr,
  todayStr,
  usageRate,
  wonNumber,
} from "@/components/admin/expenses/client-helpers"
import {
  DOC_TYPE_LABELS,
  EXPENSE_DOC_TYPES,
  PAYMENT_LABELS,
  amountMismatch,
  formatWon,
  isValidDate,
  type ExpenseDocType,
  type ExpenseProject,
  type ExpenseReceipt,
} from "@/lib/expenses"
import { cn } from "@/lib/utils"

// 증빙 내역 — 저장된 증빙을 찾아보고(프로젝트·기간·검색), 고치고, 엑셀·원본 zip으로 내려받는다.

type Preset = "all" | "this_month" | "last_month" | "last_3" | "this_year" | "month" | "custom"

const PRESET_LABELS: Record<Preset, string> = {
  all: "전체 기간",
  this_month: "이번 달",
  last_month: "지난 달",
  last_3: "최근 3개월",
  this_year: "올해",
  month: "월 선택",
  custom: "직접 지정",
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function computeRange(preset: Preset, month: string, from: string, to: string): { from: string; to: string; invalid: boolean } {
  const cur = thisMonthStr()
  switch (preset) {
    case "this_month":
      return { ...(monthRange(cur) ?? { from: "", to: "" }), invalid: false }
    case "last_month":
      return { ...(monthRange(shiftMonth(cur, -1)) ?? { from: "", to: "" }), invalid: false }
    case "last_3": {
      const a = monthRange(shiftMonth(cur, -2))
      const b = monthRange(cur)
      return { from: a?.from ?? "", to: b?.to ?? "", invalid: false }
    }
    case "this_year": {
      const y = new Date().getFullYear()
      return { from: `${y}-01-01`, to: `${y}-12-31`, invalid: false }
    }
    case "month":
      return { ...(monthRange(month) ?? { from: "", to: "" }), invalid: false }
    case "custom": {
      const f = isValidDate(from) ? from : ""
      const t = isValidDate(to) ? to : ""
      if (f && t && f > t) return { from: "", to: "", invalid: true }
      return { from: f, to: t, invalid: false }
    }
    default:
      return { from: "", to: "", invalid: false }
  }
}

function isForeignRow(r: ExpenseReceipt): boolean {
  return Boolean(r.currency) && r.currency !== "KRW" && typeof r.foreign_amount === "number"
}

// 외화 행 툴팁: "USD 20.00 × 1,388.10 · 2026-09-18 기준 · 유럽중앙은행"
function foreignTitle(r: ExpenseReceipt): string {
  return [`${foreignWithCode(r.currency, r.foreign_amount)} × ${formatFxRate(r.exchange_rate)}`, fxCaption(r)].filter(Boolean).join(" · ")
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-")
  return `${y}년 ${Number(m)}월`
}

// 최근 36개월 — 월 선택 목록
function recentMonths(): string[] {
  const cur = thisMonthStr()
  return Array.from({ length: 36 }, (_, i) => shiftMonth(cur, -i))
}

export function ReceiptLedger({ initialProjectId = null }: { initialProjectId?: number | null }) {
  const [projects, setProjects] = useState<ExpenseProject[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [projectsError, setProjectsError] = useState("")

  const [projectId, setProjectId] = useState<string>(initialProjectId ? String(initialProjectId) : "all")
  const [preset, setPreset] = useState<Preset>("all")
  const [month, setMonth] = useState(thisMonthStr())
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [q, setQ] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  const [docType, setDocType] = useState<"all" | ExpenseDocType>("all")

  const [receipts, setReceipts] = useState<ExpenseReceipt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [projectAll, setProjectAll] = useState<ExpenseReceipt[] | null>(null)
  const [projectAllLoading, setProjectAllLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const [editing, setEditing] = useState<ExpenseReceipt | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExpenseReceipt | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState<"xlsx" | "zip" | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const clearNotice = useCallback(() => setNotice(null), [])

  const range = useMemo(() => computeRange(preset, month, from, to), [preset, month, from, to])
  // 문서 종류는 불러온 목록을 화면에서 거른다(서버 조회 조건 아님)
  const filtersActive = Boolean(range.from || range.to || debouncedQ || docType !== "all")
  const anyFilter = filtersActive || projectId !== "all" || preset !== "all" || q.trim() !== ""
  const selectedProject = projects.find((p) => String(p.id) === projectId) ?? null
  const months = useMemo(recentMonths, [])

  // ── 데이터 불러오기 ─────────────────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    const r = await requestJson<{ projects: ExpenseProject[] }>("/api/admin/expenses/projects")
    if (r.ok) {
      setProjects(Array.isArray(r.data.projects) ? r.data.projects : [])
      setProjectsError("")
    } else {
      setProjectsError(r.error)
    }
    setProjectsLoaded(true)
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  // 주소로 넘어온 프로젝트가 없으면(삭제됨 등) 전체로 돌린다
  useEffect(() => {
    if (!projectsLoaded || projectsError || projectId === "all") return
    if (!projects.some((p) => String(p.id) === projectId)) {
      setProjectId("all")
      setNotice({ tone: "info", text: "프로젝트를 찾을 수 없어 전체 프로젝트를 표시합니다." })
    }
  }, [projectsLoaded, projectsError, projects, projectId])

  // 선택한 프로젝트를 주소에 남겨 새로고침·공유해도 그대로 보이게 한다(서버 왕복 없이)
  useEffect(() => {
    const url = projectId === "all" ? "/admin/expenses/receipts" : `/admin/expenses/receipts?project_id=${projectId}`
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url)
  }, [projectId])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const ctrl = new AbortController()
    const qs = new URLSearchParams()
    if (projectId !== "all") qs.set("project_id", projectId)
    if (range.from) qs.set("from", range.from)
    if (range.to) qs.set("to", range.to)
    if (debouncedQ) qs.set("q", debouncedQ)
    setLoading(true)
    void requestJson<{ receipts: ExpenseReceipt[] }>(`/api/admin/expenses/receipts?${qs.toString()}`, {
      signal: ctrl.signal,
    }).then((r) => {
      if (r.ok) {
        setReceipts(Array.isArray(r.data.receipts) ? r.data.receipts : [])
        setError("")
        setLoading(false)
      } else if (!r.aborted) {
        setError(r.error)
        setLoading(false)
      }
    })
    return () => ctrl.abort()
  }, [projectId, range.from, range.to, debouncedQ, reloadKey])

  // 비목별 집행 현황은 기간·검색과 무관하게 프로젝트 전체로 계산한다
  useEffect(() => {
    if (projectId === "all" || !filtersActive) {
      setProjectAll(null)
      return
    }
    const ctrl = new AbortController()
    setProjectAllLoading(true)
    void requestJson<{ receipts: ExpenseReceipt[] }>(`/api/admin/expenses/receipts?project_id=${projectId}`, {
      signal: ctrl.signal,
    }).then((r) => {
      if (r.ok) setProjectAll(Array.isArray(r.data.receipts) ? r.data.receipts : [])
      if (!r.ok && r.aborted) return
      setProjectAllLoading(false)
    })
    return () => ctrl.abort()
  }, [projectId, filtersActive, reloadKey])

  const refreshAll = useCallback(() => {
    setReloadKey((k) => k + 1)
    void loadProjects()
  }, [loadProjects])

  const resetFilters = () => {
    setProjectId("all")
    setPreset("all")
    setFrom("")
    setTo("")
    setQ("")
    setDebouncedQ("")
    setDocType("all")
  }

  const shown = useMemo(
    () => (docType === "all" ? receipts : receipts.filter((r) => r.doc_type === docType)),
    [receipts, docType]
  )

  // 인건비 직접 등록: 진행 중 프로젝트만(종료된 프로젝트에는 증빙을 추가할 수 없다)
  const payrollProjects = useMemo<PayrollProject[]>(
    () =>
      projects
        .filter((p) => p.status === "active")
        .map((p) => ({ id: p.id, name: p.name, budget_items: p.budget_items.filter((b) => b.name.trim()) })),
    [projects]
  )

  // ── 요약 ─────────────────────────────────────────────────────────────────
  const sums = useMemo(() => {
    let total = 0
    let supply = 0
    let vat = 0
    const byProject = new Map<number, { name: string; count: number; total: number }>()
    for (const r of shown) {
      const t = typeof r.total_amount === "number" ? r.total_amount : 0
      total += t
      supply += typeof r.supply_amount === "number" ? r.supply_amount : 0
      vat += typeof r.vat_amount === "number" ? r.vat_amount : 0
      const cur = byProject.get(r.project_id) ?? { name: r.project_name, count: 0, total: 0 }
      cur.count += 1
      cur.total += t
      byProject.set(r.project_id, cur)
    }
    return { total, supply, vat, byProject: [...byProject.values()].sort((a, b) => b.total - a.total) }
  }, [shown])

  const budgetNameSet = useMemo(
    () => new Set((selectedProject?.budget_items ?? []).map((b) => normalizeName(b.name))),
    [selectedProject]
  )

  const scopeText = [
    selectedProject ? selectedProject.name : "전체 프로젝트",
    preset === "month" ? monthLabel(month) : preset === "custom" ? `${range.from || "처음"} ~ ${range.to || "오늘"}` : PRESET_LABELS[preset],
    docType !== "all" ? DOC_TYPE_LABELS[docType] : "",
    debouncedQ ? `“${debouncedQ}” 검색` : "",
  ]
    .filter(Boolean)
    .join(" · ")

  const onPayrollSaved = (count: number) => {
    setNotice({ tone: "success", text: `인건비 지급 ${count.toLocaleString("ko-KR")}건을 등록했습니다.` })
    refreshAll()
  }

  // ── 동작 ─────────────────────────────────────────────────────────────────
  const download = async (kind: "xlsx" | "zip") => {
    if (!selectedProject) return
    setDownloading(kind)
    const stamp = todayStr().replaceAll("-", "")
    const err = await downloadFromApi(
      kind === "xlsx"
        ? `/api/admin/expenses/export?project_id=${selectedProject.id}`
        : `/api/admin/expenses/download?project_id=${selectedProject.id}`,
      kind === "xlsx" ? `사업비_증빙_${selectedProject.name}_${stamp}.xlsx` : `사업비_증빙파일_${selectedProject.name}_${stamp}.zip`
    )
    setDownloading(null)
    setNotice(
      err
        ? { tone: "error", text: err }
        : {
            tone: "success",
            text: kind === "xlsx" ? "엑셀 파일을 내려받았습니다." : "원본 zip을 내려받았습니다.",
          }
    )
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const r = await requestJson("/api/admin/expenses/receipts", jsonInit("DELETE", { id: deleteTarget.id }))
    setDeleting(false)
    const target = deleteTarget
    setDeleteTarget(null)
    if (!r.ok) {
      setNotice({ tone: "error", text: r.error })
      return
    }
    if (editing?.id === target.id) setEditing(null)
    setNotice({ tone: "success", text: `${target.vendor_name} ${formatWon(target.total_amount)} 증빙을 삭제했습니다.` })
    refreshAll()
  }


  // ── 화면 ─────────────────────────────────────────────────────────────────
  if (projectsLoaded && !projectsError && projects.length === 0) {
    return (
      <Panel>
        <EmptyState
          title="등록된 프로젝트 없음"
          description="증빙은 프로젝트별로 관리됩니다. 사업·프로젝트를 먼저 등록하세요."
          action={
            <Button asChild>
              <Link href="/admin/expenses/projects">프로젝트 등록</Link>
            </Button>
          }
        />
      </Panel>
    )
  }

  const projectRate = selectedProject ? usageRate(selectedProject.spent_total, selectedProject.total_budget) : null
  const projectRemain =
    selectedProject && selectedProject.total_budget !== null ? selectedProject.total_budget - selectedProject.spent_total : null
  const topProjects = sums.byProject.slice(0, 3)
  const showProjectCol = !selectedProject
  const downloadDisabled = !selectedProject || downloading !== null || selectedProject.receipt_count === 0
  const listMeta = selectedProject
    ? downloading === "zip"
      ? "원본 파일 압축 중… (최대 약 1분)"
      : "엑셀·zip: 조회 조건과 무관하게 프로젝트 전체 증빙"
    : "엑셀·zip 다운로드는 프로젝트 선택 후 가능"
  const TH = (extra?: string) => cn(TABLE_CLASS.th, "sticky top-0 z-[1]", extra)
  const TD = (extra?: string) => cn(TABLE_CLASS.td, extra)

  return (
    <div>
      <NoticeBanner notice={notice} onClose={clearNotice} />
      {projectsError && (
        <InlineNotice
          tone="danger"
          className="mb-4"
          action={
            <Button size="sm" variant="outline" onClick={() => void loadProjects()}>
              <RefreshCw className="h-3.5 w-3.5" />
              다시 시도
            </Button>
          }
        >
          프로젝트 목록을 불러오지 못했습니다. {projectsError}
        </InlineNotice>
      )}

      {/* 조회 조건: 모바일은 2열(프로젝트 한 줄 · 기간+검색 한 줄)에 라벨을 숨겨 첫 화면에 기록이 보이게 한다. */}
      <div className="mb-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-3">
          <div className="col-span-2 grid gap-1.5 md:col-span-1">
            <Label htmlFor="lf-project" className="sr-only text-xs font-medium text-text-secondary md:not-sr-only">
              프로젝트
            </Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="lf-project" className="w-full bg-card">
                <SelectValue placeholder="전체 프로젝트" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 프로젝트</SelectItem>
                {projects.length > 0 && <SelectSeparator />}
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                    {p.status === "closed" && " (종료)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={cn("grid gap-1.5 md:col-span-1", preset === "month" && "col-span-2")}>
            <Label htmlFor="lf-period" className="sr-only text-xs font-medium text-text-secondary md:not-sr-only">
              거래 기간
            </Label>
            <div className="flex gap-2">
              <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
                <SelectTrigger id="lf-period" className={cn("bg-card", preset === "month" ? "w-28 shrink-0" : "w-full")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRESET_LABELS) as Preset[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {PRESET_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {preset === "month" && (
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="w-full bg-card" aria-label="월">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {months.map((m) => (
                      <SelectItem key={m} value={m}>
                        {monthLabel(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="lf-doc" className="sr-only text-xs font-medium text-text-secondary md:not-sr-only">
              문서 종류
            </Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as "all" | ExpenseDocType)}>
              <SelectTrigger id="lf-doc" className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 문서</SelectItem>
                <SelectSeparator />
                {EXPENSE_DOC_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {DOC_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={cn("grid gap-1.5 md:col-span-1", preset === "month" ? "col-span-1" : "col-span-2")}>
            <Label htmlFor="lf-q" className="sr-only text-xs font-medium text-text-secondary md:not-sr-only">
              검색
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                id="lf-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="거래처·적요·비목·금액"
                className={cn("bg-card pl-8 text-ellipsis", q ? "pr-8" : "pr-2")}
              />
              {q && (
                <button
                  type="button"
                  aria-label="검색어 지우기"
                  onClick={() => setQ("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-secondary hover:text-dark"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {preset === "custom" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-auto bg-card" aria-label="시작일" />
            <span className="text-sm text-text-secondary">~</span>
            <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-auto bg-card" aria-label="종료일" />
            {range.invalid && <span className="text-xs text-destructive">시작일이 종료일보다 늦습니다</span>}
            {!from && !to && <span className="text-xs text-text-secondary">시작일 또는 종료일만 입력 가능</span>}
          </div>
        )}

        {anyFilter && (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
            <span className="[word-break:keep-all]">조회 조건: {scopeText}</span>
            <button type="button" onClick={resetFilters} className="font-medium text-dark underline-offset-2 hover:underline">
              조건 초기화
            </button>
          </div>
        )}
      </div>

      {/* 요약 */}
      <SummaryStrip className="mb-4">
        <SummaryItem
          label="조회된 증빙"
          value={`${shown.length.toLocaleString("ko-KR")}건`}
          sub={loading ? "불러오는 중" : scopeText}
        />
        <SummaryItem
          label="합계 금액"
          value={formatWon(sums.total)}
          sub={<DotList items={[`공급가액 ${wonNumber(sums.supply)}`, `부가세 ${wonNumber(sums.vat)}`]} />}
        />
        {selectedProject ? (
          <>
            <SummaryItem
              label="집행률"
              value={<RateValue rate={projectRate} className="font-bold" />}
              sub={
                selectedProject.total_budget === null
                  ? "총사업비 미입력"
                  : `집행 ${wonNumber(selectedProject.spent_total)} / 총사업비 ${wonNumber(selectedProject.total_budget)}`
              }
            >
              <UsageBar className="mt-2" rate={projectRate} />
            </SummaryItem>
            <SummaryItem
              label="남은 예산"
              value={projectRemain === null ? "-" : formatWon(projectRemain)}
              tone={projectRemain !== null && projectRemain < 0 ? "danger" : "default"}
              sub={`저장된 증빙 ${selectedProject.receipt_count.toLocaleString("ko-KR")}건`}
            />
          </>
        ) : (
          <SummaryItem
            wide
            label="프로젝트별"
            value={`${sums.byProject.length}개`}
            sub={sums.byProject.length === 0 ? "프로젝트 선택 시 예산 대비 집행 표시" : undefined}
          >
            {topProjects.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-sm">
                {topProjects.map((p, i) => (
                  <li key={`${i}-${p.name}`} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate text-dark" title={p.name}>
                      {p.name}
                    </span>
                    <Money value={p.total} />
                  </li>
                ))}
              </ul>
            )}
            {sums.byProject.length > 3 && (
              <p className="mt-0.5 text-xs text-text-secondary">외 {sums.byProject.length - 3}개</p>
            )}
          </SummaryItem>
        )}
      </SummaryStrip>

      {selectedProject && (
        <div className="mb-4">
          <BudgetUsageTable
            project={selectedProject}
            receipts={filtersActive ? projectAll : receipts}
            loading={filtersActive ? projectAllLoading : loading}
          />
        </div>
      )}

      {/* 목록 */}
      <Panel>
        <PanelHeader
          title="증빙 목록"
          count={loading && shown.length === 0 ? undefined : `${shown.length.toLocaleString("ko-KR")}건`}
          meta={listMeta}
          actions={
            <>
              {loading && shown.length > 0 && <BusyText>불러오는 중</BusyText>}
              <PayrollEntryButton
                size="sm"
                projects={payrollProjects}
                defaultProjectId={selectedProject?.status === "active" ? selectedProject.id : null}
                onSaved={onPayrollSaved}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={downloadDisabled}
                onClick={() => void download("xlsx")}
                title={selectedProject ? "프로젝트 전체 증빙 엑셀" : "프로젝트를 선택하세요"}
              >
                {downloading === "xlsx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                엑셀 다운로드
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={downloadDisabled}
                onClick={() => void download("zip")}
                title={selectedProject ? "프로젝트 전체 원본 zip" : "프로젝트를 선택하세요"}
              >
                {downloading === "zip" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileArchive className="h-3.5 w-3.5" />}
                원본 zip
              </Button>
            </>
          }
        />

        {error ? (
          <EmptyState
            title="증빙 목록을 불러오지 못했습니다"
            description={error}
            action={
              <Button variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
                <RefreshCw className="h-4 w-4" />
                다시 시도
              </Button>
            }
          />
        ) : loading && shown.length === 0 ? (
          <p className="px-4 py-8 text-center" aria-busy="true">
            <BusyText>불러오는 중</BusyText>
          </p>
        ) : shown.length === 0 ? (
          filtersActive ? (
            <EmptyState
              title="조건에 맞는 증빙 없음"
              description="기간 또는 검색어를 변경하세요."
              action={
                <Button variant="outline" onClick={resetFilters}>
                  조건 초기화
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="저장된 증빙 없음"
              description="증빙 올리기에서 저장한 증빙과 직접 등록한 인건비가 여기에 표시됩니다."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild>
                    <Link href="/admin/expenses">증빙 올리기</Link>
                  </Button>
                  <PayrollEntryButton
                    projects={payrollProjects}
                    defaultProjectId={selectedProject?.status === "active" ? selectedProject.id : null}
                    onSaved={onPayrollSaved}
                  />
                </div>
              }
            />
          )
        ) : (
          <div className={cn("transition-opacity", loading && "opacity-60")}>
            {/* md 이상: 표 */}
            <TableFrame className="hidden md:block">
              <table className="w-full min-w-[900px] caption-bottom text-sm">
                <TableHeader>
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableHead className={TH("w-[104px] pl-4")}>거래일자</TableHead>
                    <TableHead className={TH("w-[104px]")}>문서 종류</TableHead>
                    <TableHead className={TH()}>거래처</TableHead>
                    <TableHead className={TH("w-[150px]")}>비목</TableHead>
                    <TableHead className={TH()}>적요</TableHead>
                    <TableHead className={TH("w-[128px] text-right")}>합계</TableHead>
                    <TableHead className={TH("w-[80px]")}>결제</TableHead>
                    {showProjectCol && <TableHead className={TH("w-[180px]")}>프로젝트</TableHead>}
                    <TableHead className={TH("w-[72px]")}>파일</TableHead>
                    <TableHead className={TH("w-[48px] pr-4")}>
                      <span className="sr-only">삭제</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((r) => {
                    const mismatch = amountMismatch(r)
                    const offBudget =
                      selectedProject !== null &&
                      selectedProject.budget_items.length > 0 &&
                      r.budget_item.trim() !== "" &&
                      !budgetNameSet.has(normalizeName(r.budget_item))
                    return (
                      <TableRow
                        key={r.id}
                        tabIndex={0}
                        onClick={() => setEditing(r)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setEditing(r)
                          }
                        }}
                        className={cn(TABLE_CLASS.row, "cursor-pointer focus-visible:bg-warm-beige/60 focus-visible:outline-none")}
                        title="클릭하여 수정"
                      >
                        <TableCell className={TD("pl-4 tabular-nums text-dark")}>{r.issue_date}</TableCell>
                        <TableCell className={TD("text-text-secondary")}>
                          <div className="whitespace-nowrap">{DOC_TYPE_LABELS[r.doc_type] ?? r.doc_type}</div>
                          {r.doc_type === "payroll" && r.payroll_month && (
                            <div className="text-xs tabular-nums text-text-secondary">{r.payroll_month} 귀속</div>
                          )}
                        </TableCell>
                        <TableCell
                          className={TD("max-w-[220px]")}
                          title={r.vendor_biz_no ? `${r.vendor_name} · 사업자번호 ${r.vendor_biz_no}` : r.vendor_name}
                        >
                          <div className="truncate font-medium text-dark">{r.vendor_name}</div>
                        </TableCell>
                        <TableCell className={TD()}>
                          {r.budget_item ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className={offBudget ? "text-amber-800" : "text-dark"}>{r.budget_item}</span>
                              {offBudget && <Chip tone="warning">예산 외</Chip>}
                            </span>
                          ) : (
                            <Chip tone="warning">비목 미지정</Chip>
                          )}
                        </TableCell>
                        <TableCell className={TD("max-w-[260px]")}>
                          <div className="truncate text-text-secondary" title={r.purpose || undefined}>
                            {r.purpose || "-"}
                          </div>
                        </TableCell>
                        <TableCell className={TD(TABLE_CLASS.num)}>
                          <Money value={r.total_amount} strong flag={mismatch ? "금액 불일치: 공급가액+부가세 ≠ 합계" : null} />
                          {isForeignRow(r) && (
                            <div className="text-xs text-text-secondary" title={foreignTitle(r)}>
                              {foreignWithCode(r.currency, r.foreign_amount)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className={TD("text-text-secondary")}>{PAYMENT_LABELS[r.payment_method] ?? r.payment_method}</TableCell>
                        {showProjectCol && (
                          <TableCell className={TD("max-w-[180px]")}>
                            <div className="truncate text-sm text-dark" title={r.project_name}>
                              {r.project_name}
                            </div>
                          </TableCell>
                        )}
                        <TableCell className={TD()}>
                          {!r.file_pathname ? (
                            <span className="px-1.5 text-sm text-text-secondary" title="증빙 파일 없이 수기 등록">
                              수기
                            </span>
                          ) : (
                            <a
                              href={fileUrl(r.file_pathname)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-sm text-dark underline-offset-2 hover:underline"
                              title={`${r.file_name} 원본 보기`}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              보기
                            </a>
                          )}
                        </TableCell>
                        <TableCell className={TD("pr-4")}>
                          <button
                            type="button"
                            aria-label={`${r.vendor_name} 증빙 삭제`}
                            title="증빙 삭제"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteTarget(r)
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="rounded p-1.5 text-text-secondary hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <TableFooter className="border-t-0 bg-transparent">
                  <TableRow className={cn(TABLE_CLASS.foot, "hover:bg-warm-ivory")}>
                    <TableCell colSpan={5} className={TD("pl-4")}>
                      합계 {shown.length.toLocaleString("ko-KR")}건
                    </TableCell>
                    <TableCell className={TD(TABLE_CLASS.num)}>
                      <Money value={sums.total} strong />
                    </TableCell>
                    <TableCell colSpan={showProjectCol ? 4 : 3} className={TD()} />
                  </TableRow>
                </TableFooter>
              </table>
            </TableFrame>

            {/* md 미만: 카드 목록 */}
            <div className="md:hidden">
              <ul className="space-y-2 p-3">
                {shown.map((r) => {
                  const mismatch = amountMismatch(r)
                  const offBudget =
                    selectedProject !== null &&
                    selectedProject.budget_items.length > 0 &&
                    r.budget_item.trim() !== "" &&
                    !budgetNameSet.has(normalizeName(r.budget_item))
                  return (
                    <li key={r.id}>
                      <RecordCard
                        title={r.vendor_name}
                        amount={<Money value={r.total_amount} unit flag={mismatch ? "금액 불일치: 공급가액+부가세 ≠ 합계" : null} />}
                        meta={
                          <DotList
                            items={[
                              r.issue_date,
                              r.doc_type === "payroll" && r.payroll_month
                                ? `${DOC_TYPE_LABELS.payroll}(${r.payroll_month} 귀속)`
                                : (DOC_TYPE_LABELS[r.doc_type] ?? r.doc_type),
                              PAYMENT_LABELS[r.payment_method] ?? r.payment_method,
                              ...(isForeignRow(r) ? [foreignWithCode(r.currency, r.foreign_amount)] : []),
                              ...(!r.file_pathname ? ["수기"] : []),
                            ]}
                          />
                        }
                        footer={
                          <>
                            {r.budget_item ? (
                              <span className={offBudget ? "text-amber-800" : "text-dark"}>{r.budget_item}</span>
                            ) : (
                              <Chip tone="warning">비목 미지정</Chip>
                            )}
                            {offBudget && <Chip tone="warning">예산 외</Chip>}
                            {showProjectCol && <span className="min-w-0 basis-full truncate text-text-secondary">{r.project_name}</span>}
                          </>
                        }
                        onOpen={() => setEditing(r)}
                        openLabel={`${r.vendor_name} 증빙 수정`}
                        trailing={
                          <button
                            type="button"
                            aria-label={`${r.vendor_name} 증빙 삭제`}
                            onClick={() => setDeleteTarget(r)}
                            className="-mr-1 rounded p-2 text-text-secondary hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        }
                      />
                    </li>
                  )
                })}
              </ul>
              <p className="flex items-center justify-between gap-3 border-t border-warm-tan px-3 py-3 text-sm font-semibold text-dark">
                <span>합계 {shown.length.toLocaleString("ko-KR")}건</span>
                <Money value={sums.total} unit strong />
              </p>
            </div>
          </div>
        )}
      </Panel>

      <ReceiptEditSheet
        receipt={editing}
        projects={projects}
        onClose={() => setEditing(null)}
        onSaved={(message) => {
          setEditing(null)
          setNotice({ tone: "success", text: message })
          refreshAll()
        }}
        onRequestDelete={(r) => setDeleteTarget(r)}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>증빙 삭제</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="grid gap-2 text-sm text-text-secondary [word-break:keep-all]">
                {deleteTarget && (
                  <p className="rounded-md bg-warm-beige/50 px-3 py-2 text-dark">
                    {deleteTarget.issue_date} · {deleteTarget.vendor_name} · <b className="tabular-nums">{formatWon(deleteTarget.total_amount)}</b>
                    <span className="block text-xs text-dark/70">{deleteTarget.project_name}</span>
                  </p>
                )}
                <p>
                  삭제 후 복구할 수 없으며 집행액에서 제외됩니다.
                  {deleteTarget?.file_pathname ? " 원본 파일도 삭제됩니다(같은 파일의 다른 증빙이 있으면 유지)." : ""}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void doDelete()
              }}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  삭제 중…
                </>
              ) : (
                "삭제"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
