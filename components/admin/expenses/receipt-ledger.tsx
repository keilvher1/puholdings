"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Eye,
  FileSpreadsheet,
  FileArchive,
  FolderPlus,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  SearchX,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { AdminCard } from "@/components/admin/admin-ui"
import { BudgetUsageTable } from "@/components/admin/expenses/ledger-budget-table"
import { ReceiptEditSheet } from "@/components/admin/expenses/receipt-edit-sheet"
import { RateBar } from "@/components/admin/expenses/project-card"
import { NoticeBanner, type Notice } from "@/components/admin/expenses/notice-banner"
import {
  downloadFromApi,
  fileUrl,
  formatRate,
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
  PAYMENT_LABELS,
  amountMismatch,
  formatWon,
  isValidDate,
  type ExpenseProject,
  type ExpenseReceipt,
} from "@/lib/expenses"

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
  const filtersActive = Boolean(range.from || range.to || debouncedQ)
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
      setNotice({ tone: "info", text: "요청한 프로젝트를 찾을 수 없어 전체 프로젝트를 보여 드립니다." })
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
  }

  // ── 요약 ─────────────────────────────────────────────────────────────────
  const sums = useMemo(() => {
    let total = 0
    let supply = 0
    let vat = 0
    const byProject = new Map<number, { name: string; count: number; total: number }>()
    for (const r of receipts) {
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
  }, [receipts])

  const budgetNameSet = useMemo(
    () => new Set((selectedProject?.budget_items ?? []).map((b) => normalizeName(b.name))),
    [selectedProject]
  )

  const scopeText = [
    selectedProject ? selectedProject.name : "전체 프로젝트",
    preset === "month" ? monthLabel(month) : preset === "custom" ? `${range.from || "처음"} ~ ${range.to || "오늘"}` : PRESET_LABELS[preset],
    debouncedQ ? `“${debouncedQ}” 검색` : "",
  ]
    .filter(Boolean)
    .join(" · ")

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
            text: kind === "xlsx" ? "엑셀 파일을 내려받았습니다." : "증빙 원본 파일을 zip으로 내려받았습니다.",
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
      <AdminCard className="px-6 py-14 text-center">
        <FolderPlus className="mx-auto h-10 w-10 text-text-tertiary" />
        <p className="mt-3 text-base font-semibold text-dark">아직 등록된 프로젝트가 없습니다</p>
        <p className="mt-1 text-sm text-text-secondary [word-break:keep-all]">
          증빙은 프로젝트별로 모입니다. 먼저 사업·프로젝트를 등록해 주세요.
        </p>
        <Button asChild className="mt-4">
          <Link href="/admin/expenses/projects">프로젝트 등록하러 가기</Link>
        </Button>
      </AdminCard>
    )
  }

  return (
    <div>
      <NoticeBanner notice={notice} onClose={clearNotice} />
      {projectsError && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          <span className="[word-break:keep-all]">프로젝트 목록을 불러오지 못했습니다. {projectsError}</span>
          <Button size="sm" variant="outline" onClick={() => void loadProjects()}>
            다시 시도
          </Button>
        </div>
      )}

      {/* 필터 */}
      <AdminCard className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="grid gap-1.5">
            <Label htmlFor="lf-project" className="text-xs text-text-secondary">
              프로젝트
            </Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="lf-project" className="w-full">
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

          <div className="grid gap-1.5">
            <Label htmlFor="lf-period" className="text-xs text-text-secondary">
              거래 기간
            </Label>
            <div className="flex gap-2">
              <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
                <SelectTrigger id="lf-period" className={preset === "month" ? "w-28 shrink-0" : "w-full"}>
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
                  <SelectTrigger className="w-full" aria-label="월">
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
            <Label htmlFor="lf-q" className="text-xs text-text-secondary">
              검색
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                id="lf-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="거래처·적요·비목·금액으로 찾기"
                className="pl-8 pr-8"
              />
              {q && (
                <button
                  type="button"
                  aria-label="검색어 지우기"
                  onClick={() => setQ("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-tertiary hover:text-dark"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {preset === "custom" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-auto" aria-label="시작일" />
            <span className="text-sm text-text-secondary">~</span>
            <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-auto" aria-label="종료일" />
            {range.invalid && <span className="text-xs text-destructive">시작일이 종료일보다 늦습니다</span>}
            {!from && !to && <span className="text-xs text-text-tertiary">시작일·종료일 중 하나만 넣어도 됩니다</span>}
          </div>
        )}

        {anyFilter && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-warm-tan/60 pt-3 text-xs text-text-secondary">
            <span className="[word-break:keep-all]">조회 조건: {scopeText}</span>
            <button type="button" onClick={resetFilters} className="font-medium text-dark underline-offset-2 hover:underline">
              조건 초기화
            </button>
          </div>
        )}
      </AdminCard>

      {/* 요약 */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="조회된 증빙" value={`${receipts.length.toLocaleString("ko-KR")}건`} sub={loading ? "불러오는 중…" : scopeText} />
        <StatTile
          label="합계 금액"
          value={formatWon(sums.total)}
          sub={`공급가액 ${wonNumber(sums.supply)} · 부가세 ${wonNumber(sums.vat)}`}
        />
        {selectedProject ? (
          <>
            <StatTile
              label="프로젝트 집행률 (전체 기준)"
              value={formatRate(usageRate(selectedProject.spent_total, selectedProject.total_budget))}
              sub={
                selectedProject.total_budget === null
                  ? "총사업비를 넣으면 집행률이 계산됩니다"
                  : `집행 ${wonNumber(selectedProject.spent_total)} / 총사업비 ${wonNumber(selectedProject.total_budget)}`
              }
            >
              <RateBar rate={usageRate(selectedProject.spent_total, selectedProject.total_budget)} className="mt-2 h-1.5" />
            </StatTile>
            <StatTile
              label="남은 예산"
              value={
                selectedProject.total_budget === null ? "-" : formatWon(selectedProject.total_budget - selectedProject.spent_total)
              }
              sub={`저장된 증빙 ${selectedProject.receipt_count.toLocaleString("ko-KR")}건`}
              danger={selectedProject.total_budget !== null && selectedProject.total_budget < selectedProject.spent_total}
            />
          </>
        ) : (
          <StatTile
            label="프로젝트별"
            value={`${sums.byProject.length}개 프로젝트`}
            sub={
              sums.byProject.length > 0
                ? sums.byProject
                    .slice(0, 2)
                    .map((p) => `${p.name} ${wonNumber(p.total)}`)
                    .join(" · ") + (sums.byProject.length > 2 ? " 외" : "")
                : "프로젝트를 고르면 예산 대비 집행을 볼 수 있어요"
            }
            className="lg:col-span-2"
          />
        )}
      </div>

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
      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-tan bg-warm-beige/40 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-dark">증빙 목록</span>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-text-tertiary" aria-label="불러오는 중" />
            ) : (
              receipts.length > 0 && <span className="hidden text-xs text-text-secondary sm:inline">행을 누르면 내용을 고칠 수 있습니다</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedProject || downloading !== null || selectedProject.receipt_count === 0}
              onClick={() => void download("xlsx")}
              title={selectedProject ? "이 프로젝트의 전체 증빙을 엑셀로 내려받습니다" : "프로젝트를 먼저 고르세요"}
            >
              {downloading === "xlsx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
              엑셀 다운로드
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedProject || downloading !== null || selectedProject.receipt_count === 0}
              onClick={() => void download("zip")}
              title={selectedProject ? "이 프로젝트의 증빙 원본 파일을 zip으로 묶어 내려받습니다" : "프로젝트를 먼저 고르세요"}
            >
              {downloading === "zip" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileArchive className="h-3.5 w-3.5" />}
              증빙 파일 zip
            </Button>
          </div>
        </div>
        <p className="border-b border-warm-tan/60 px-4 py-1.5 text-[11px] text-text-tertiary [word-break:keep-all]">
          {selectedProject
            ? downloading === "zip"
              ? "원본 파일을 모으는 중입니다. 증빙이 많으면 1분 정도 걸릴 수 있어요."
              : "엑셀·zip은 기간·검색 조건과 관계없이 이 프로젝트의 전체 증빙을 담습니다."
            : "엑셀·zip 다운로드는 위에서 프로젝트를 고르면 쓸 수 있습니다."}
        </p>

        {error ? (
          <div className="px-6 py-12 text-center">
            <TriangleAlert className="mx-auto h-8 w-8 text-destructive" />
            <p className="mt-3 text-sm font-medium text-dark">증빙 목록을 불러오지 못했습니다</p>
            <p className="mt-1 text-sm text-text-secondary">{error}</p>
            <Button className="mt-4" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
              <RefreshCw className="h-4 w-4" />
              다시 시도
            </Button>
          </div>
        ) : loading && receipts.length === 0 ? (
          <div className="grid gap-2 p-4" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-warm-beige/50" />
            ))}
          </div>
        ) : receipts.length === 0 ? (
          filtersActive ? (
            <div className="px-6 py-12 text-center">
              <SearchX className="mx-auto h-9 w-9 text-text-tertiary" />
              <p className="mt-3 text-sm font-medium text-dark">조건에 맞는 증빙이 없습니다</p>
              <p className="mt-1 text-sm text-text-secondary">기간을 넓히거나 검색어를 바꿔 보세요.</p>
              <Button className="mt-4" variant="outline" onClick={resetFilters}>
                조건 초기화
              </Button>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <Inbox className="mx-auto h-9 w-9 text-text-tertiary" />
              <p className="mt-3 text-sm font-medium text-dark">
                {selectedProject ? "이 프로젝트로 저장된 증빙이 아직 없습니다" : "아직 저장된 증빙이 없습니다"}
              </p>
              <p className="mt-1 text-sm text-text-secondary [word-break:keep-all]">
                영수증·카드전표를 올리면 AI가 내용을 읽어 표로 정리해 드립니다. 확인 후 저장하면 여기에 쌓입니다.
              </p>
              <Button asChild className="mt-4">
                <Link href="/admin/expenses">
                  <Upload className="h-4 w-4" />
                  증빙 올리러 가기
                </Link>
              </Button>
            </div>
          )
        ) : (
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow className="bg-warm-ivory/60 hover:bg-warm-ivory/60">
                  <TableHead className="w-[104px] pl-4">거래일자</TableHead>
                  <TableHead className="w-[104px]">문서 종류</TableHead>
                  <TableHead>거래처</TableHead>
                  <TableHead className="w-[110px]">비목</TableHead>
                  <TableHead>적요</TableHead>
                  <TableHead className="w-[120px] text-right">합계</TableHead>
                  <TableHead className="w-[76px]">결제</TableHead>
                  <TableHead className="w-[150px]">프로젝트</TableHead>
                  <TableHead className="w-[64px]">파일</TableHead>
                  <TableHead className="w-[48px] pr-4">
                    <span className="sr-only">삭제</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((r) => {
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
                      className="cursor-pointer hover:bg-warm-beige/40 focus-visible:bg-warm-beige/60 focus-visible:outline-none"
                      title="눌러서 수정"
                    >
                      <TableCell className="pl-4 tabular-nums text-dark">{r.issue_date}</TableCell>
                      <TableCell>
                        <span className="rounded bg-warm-beige/70 px-1.5 py-0.5 text-[11px] text-text-secondary">
                          {DOC_TYPE_LABELS[r.doc_type] ?? r.doc_type}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <div className="truncate font-medium text-dark" title={r.vendor_name}>
                          {r.vendor_name}
                        </div>
                        {r.vendor_biz_no && <div className="text-[11px] tabular-nums text-text-tertiary">{r.vendor_biz_no}</div>}
                      </TableCell>
                      <TableCell>
                        {r.budget_item ? (
                          <span className={offBudget ? "text-amber-800" : "text-dark"} title={offBudget ? "예산표에 없는 비목" : undefined}>
                            {r.budget_item}
                            {offBudget && <TriangleAlert className="ml-1 inline h-3 w-3" />}
                          </span>
                        ) : (
                          <span className="text-xs text-text-tertiary">미지정</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[240px]">
                        <div className="truncate text-text-secondary" title={r.purpose}>
                          {r.purpose || <span className="text-text-tertiary">-</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold tabular-nums text-dark">{wonNumber(r.total_amount)}</span>
                        {mismatch && (
                          <TriangleAlert
                            className="ml-1 inline h-3.5 w-3.5 text-amber-700"
                            aria-label="공급가액과 부가세의 합이 합계와 다릅니다"
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-text-secondary">{PAYMENT_LABELS[r.payment_method] ?? r.payment_method}</TableCell>
                      <TableCell className="max-w-[150px]">
                        <div className="truncate text-xs text-text-secondary" title={r.project_name}>
                          {r.project_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <a
                          href={fileUrl(r.file_pathname)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-dark hover:bg-warm-beige hover:text-gold"
                          title={`${r.file_name} 원본 보기`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          보기
                        </a>
                      </TableCell>
                      <TableCell className="pr-4">
                        <button
                          type="button"
                          aria-label={`${r.vendor_name} 증빙 삭제`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(r)
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="rounded p-1.5 text-text-tertiary hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-warm-beige/40 hover:bg-warm-beige/40">
                  <TableCell colSpan={5} className="pl-4 text-sm font-semibold text-dark">
                    합계 {receipts.length.toLocaleString("ko-KR")}건
                  </TableCell>
                  <TableCell className="text-right font-bold tabular-nums text-dark">{wonNumber(sums.total)}</TableCell>
                  <TableCell colSpan={4} />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </AdminCard>

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
            <AlertDialogTitle>이 증빙을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="grid gap-2 text-sm text-text-secondary [word-break:keep-all]">
                {deleteTarget && (
                  <p className="rounded-md bg-warm-beige/50 px-3 py-2 text-dark">
                    {deleteTarget.issue_date} · {deleteTarget.vendor_name} · <b>{formatWon(deleteTarget.total_amount)}</b>
                    <span className="block text-xs text-text-secondary">{deleteTarget.project_name}</span>
                  </p>
                )}
                <p>
                  삭제하면 되돌릴 수 없고 프로젝트 집행액에서도 빠집니다. 원본 파일도 함께 지워집니다(같은 파일에서 나온 다른 증빙이 있으면 파일은
                  남습니다).
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

function StatTile({
  label,
  value,
  sub,
  danger = false,
  className = "",
  children,
}: {
  label: string
  value: string
  sub?: string
  danger?: boolean
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border border-warm-tan bg-card px-4 py-3 shadow-sm ${className}`}>
      <p className="text-xs text-text-secondary">{label}</p>
      <p
        className={`mt-0.5 truncate text-xl font-bold tabular-nums ${danger ? "text-destructive" : "text-dark"}`}
        title={value}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 truncate text-[11px] text-text-tertiary" title={sub}>
          {sub}
        </p>
      )}
      {children}
    </div>
  )
}
