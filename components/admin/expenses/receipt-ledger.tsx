"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDown, ClipboardCheck, Download, Eye, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ConfirmDialog,
  EmptyState,
  FilterBar,
  FilterTabs,
  Notice,
  RowActions,
  SourceTag,
  StatusBadge,
  TableSkeleton,
  toastSuccess,
  useDelayedFlag,
  useUrlStates,
  type FilterChip,
} from "@/components/saas"
import { BudgetUsageTable, usageRowKey } from "@/components/admin/expenses/ledger-budget-table"
import { ReceiptEditSheet, foreignWithCode, formatFxRate, fxCaption, type ReceiptSheetNav } from "@/components/admin/expenses/receipt-edit-sheet"
import { SettleCheckSheet } from "@/components/admin/expenses/settle-check-sheet"
import { PayrollEntryButton, type PayrollProject } from "@/components/admin/expenses/payroll-entry"
import { Money, RateValue, UsageBar } from "@/components/admin/expenses/ui"
import { downloadFromApi, fileUrl, jsonInit, monthRange, requestJson, thisMonthStr, usageRate, wonNumber } from "@/components/admin/expenses/client-helpers"
import { CHECK_LABELS, checkReceipts, needsCheck, type ReceiptCheck } from "@/components/admin/expenses/ledger-check"
import { dateShort, month as monthLabel, won } from "@/lib/format"
import { friendlyError, MSG } from "@/lib/messages"
import { receiptsPrintHref, type ReceiptsView } from "@/lib/links"
import {
  DOC_TYPE_LABELS,
  EXPENSE_DOC_TYPES,
  normalizeBudgetName,
  type ExpenseDocType,
  type ExpenseProject,
  type ExpenseReceipt,
} from "@/lib/expenses"
import { cn } from "@/lib/utils"

// 증빙 내역(장부) — 저장된 증빙을 찾아보고(프로젝트·기간·문서 종류·비목·검색·보기 탭), 점검하고, 고치고, 내려받는다(계획서 4.2.6).
// 모든 조건은 주소에 남는다(새로고침·링크 공유에도 그대로): project_id·from·to·q·doc_type·item·view·receipt(편집 시트).
// 서버 조회 조건은 project_id·from·to·q, 문서 종류·비목·보기 탭은 불러온 목록을 화면에서 거른다.
// 점검(같은 거래 쌍 등)은 프로젝트 전체 목록으로 계산한다(기간·검색으로 좁혀도 상대 증빙을 놓치지 않게).

type Preset = "all" | "this_month" | "last_month" | "last_3" | "this_year" | "month" | "custom"

const PRESET_LABELS: Record<Preset, string> = {
  all: "전체 기간",
  this_month: "이번 달",
  last_month: "지난달",
  last_3: "최근 3개월",
  this_year: "올해",
  month: "월 고르기",
  custom: "직접 지정",
}

const VIEWS: ReceiptsView[] = ["all", "check", "unassigned", "foreign", "payroll"]
const VIEW_LABELS: Record<ReceiptsView, string> = {
  all: "전체",
  check: "점검 필요",
  unassigned: "비목 미지정",
  foreign: "외화",
  payroll: "인건비",
}

const ALL = "__all__"

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function presetRange(preset: Preset, ym: string): { from: string; to: string } {
  const cur = thisMonthStr()
  switch (preset) {
    case "this_month":
      return monthRange(cur) ?? { from: "", to: "" }
    case "last_month":
      return monthRange(shiftMonth(cur, -1)) ?? { from: "", to: "" }
    case "last_3":
      return { from: monthRange(shiftMonth(cur, -2))?.from ?? "", to: monthRange(cur)?.to ?? "" }
    case "this_year": {
      const y = new Date().getFullYear()
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    }
    case "month":
      return monthRange(ym) ?? { from: "", to: "" }
    default:
      return { from: "", to: "" }
  }
}

// 주소의 from·to → 기간 선택 모양(이번 달·지난달·…·월·직접 지정)
function presetOf(from: string, to: string): { preset: Preset; month: string } {
  const cur = thisMonthStr()
  if (!from && !to) return { preset: "all", month: cur }
  for (const p of ["this_month", "last_month", "last_3", "this_year"] as Preset[]) {
    const r = presetRange(p, cur)
    if (r.from === from && r.to === to) return { preset: p, month: cur }
  }
  const ym = from.slice(0, 7)
  const r = monthRange(ym)
  if (r && r.from === from && r.to === to) return { preset: "month", month: ym }
  return { preset: "custom", month: cur }
}

function recentMonths(): string[] {
  const cur = thisMonthStr()
  return Array.from({ length: 36 }, (_, i) => shiftMonth(cur, -i))
}

function isForeignRow(r: ExpenseReceipt): boolean {
  return Boolean(r.currency) && r.currency !== "KRW" && typeof r.foreign_amount === "number"
}

function isDateText(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function viewMatch(view: ReceiptsView, r: ExpenseReceipt, c: ReceiptCheck | undefined): boolean {
  switch (view) {
    case "check":
      return needsCheck(c)
    case "unassigned":
      return !normalizeBudgetName(r.budget_item)
    case "foreign":
      return isForeignRow(r)
    case "payroll":
      return r.doc_type === "payroll"
    default:
      return true
  }
}

// 표의 "점검" 칸: 확인 필요 사유(첫 번째 + 나머지 수) 또는 회색 참고
function CheckCell({ check }: { check: ReceiptCheck | undefined }) {
  if (!check) return null
  if (check.warnings.length > 0) {
    const first = CHECK_LABELS[check.warnings[0]].short
    const rest = check.warnings.length - 1
    // 상태 사전(expenseCheck.check = "확인 필요") 배지 + 사유 글자("같은 거래?")
    return (
      <span title={`확인 필요: ${check.warnings.map((w) => CHECK_LABELS[w].label).join(" · ")}`}>
        <StatusBadge domain="expenseCheck" status="check" detail={rest > 0 ? `${first} 외 ${rest}` : first} />
      </span>
    )
  }
  if (check.notes.length > 0) {
    return (
      <span className="whitespace-nowrap text-sm text-text-secondary" title={check.notes.map((n) => CHECK_LABELS[n].label).join(" · ")}>
        참고: {CHECK_LABELS[check.notes[0]].short}
        {check.notes.length > 1 && ` 외 ${check.notes.length - 1}`}
      </span>
    )
  }
  return null
}

// 외화 근거(L-8): "USD 1,520.25 × 1,384.60" + "9월 18일(금) 기준 · 유럽중앙은행" / 직접 입력
function ForeignBasis({ r, align = "right" }: { r: ExpenseReceipt; align?: "right" | "left" }) {
  if (!isForeignRow(r)) return null
  const manual = r.exchange_rate_source === "manual"
  return (
    <div className={cn("text-sm text-text-secondary", align === "right" && "text-right")}>
      <div className="whitespace-nowrap tabular-nums">
        {foreignWithCode(r.currency, r.foreign_amount)} × {formatFxRate(r.exchange_rate)}
      </div>
      <div className="[word-break:keep-all]">{manual ? <SourceTag source="manual" className="ml-0 text-sm" /> : fxCaption(r)}</div>
    </div>
  )
}

const TH = "sticky top-0 z-[1] h-10 whitespace-nowrap border-b border-warm-tan bg-warm-beige px-2 text-left align-middle text-sm font-semibold text-dark"
const TD = "px-2 py-2 align-middle text-[15px]"
const NUM = "text-right tabular-nums whitespace-nowrap"

type Downloading = "cond-xlsx" | "cond-zip" | "project-xlsx" | "project-zip" | "all-xlsx" | null

export function ReceiptLedger() {
  const router = useRouter()
  const [url, setUrl] = useUrlStates({ project_id: "", from: "", to: "", q: "", doc_type: "", item: "", view: "all", receipt: "" })

  const [projects, setProjects] = useState<ExpenseProject[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [projectsError, setProjectsError] = useState("")

  const [receipts, setReceipts] = useState<ExpenseReceipt[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [full, setFull] = useState<ExpenseReceipt[] | null>(null)
  const [fullLoading, setFullLoading] = useState(false)
  const [fullError, setFullError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)

  const [qInput, setQInput] = useState(url.q)
  const [periodMode, setPeriodMode] = useState<Preset>(() => presetOf(url.from, url.to).preset)
  const [pickedMonth, setPickedMonth] = useState(() => presetOf(url.from, url.to).month)

  const [navIds, setNavIds] = useState<number[] | null>(null)
  const [checkOpen, setCheckOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ExpenseReceipt | null>(null)
  const [downloading, setDownloading] = useState<Downloading>(null)
  const [pageNotice, setPageNotice] = useState<{ tone: "info" | "danger"; text: string } | null>(null)

  const projectId = /^\d+$/.test(url.project_id) ? url.project_id : ""
  const view: ReceiptsView = (VIEWS as string[]).includes(url.view) ? (url.view as ReceiptsView) : "all"
  const docType = (EXPENSE_DOC_TYPES as readonly string[]).includes(url.doc_type) ? (url.doc_type as ExpenseDocType) : null
  const itemKey = normalizeBudgetName(url.item)
  const from = isDateText(url.from) ? url.from : ""
  const to = isDateText(url.to) ? url.to : ""
  const q = url.q.trim()
  const serverFiltered = Boolean(from || to || q)
  const selectedProject = projects.find((p) => String(p.id) === projectId) ?? null
  const months = useMemo(recentMonths, [])

  // ── 데이터 불러오기 ─────────────────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    const r = await requestJson<{ projects: ExpenseProject[] }>("/api/admin/expenses/projects")
    if (r.ok) {
      setProjects(Array.isArray(r.data.projects) ? r.data.projects : [])
      setProjectsError("")
    } else {
      setProjectsError(friendlyError(r.status, r.error, MSG.loadFailed))
    }
    setProjectsLoaded(true)
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  // 주소로 넘어온 프로젝트가 없으면(삭제됨 등) 전체로 돌린다
  useEffect(() => {
    if (!projectsLoaded || projectsError || !url.project_id) return
    if (!projects.some((p) => String(p.id) === url.project_id)) {
      setUrl({ project_id: null })
      setPageNotice({ tone: "info", text: "프로젝트를 찾지 못해 전체 프로젝트를 보여 줘요." })
    }
  }, [projectsLoaded, projectsError, projects, url.project_id, setUrl])

  // 검색어는 0.3초 뒤 주소에 반영
  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput.trim() !== url.q.trim()) setUrl({ q: qInput.trim() || null })
    }, 300)
    return () => clearTimeout(t)
  }, [qInput, url.q, setUrl])

  // 조건 지우기 등 주소가 바깥에서 바뀌면 입력칸도 맞춘다
  useEffect(() => {
    setQInput((cur) => (cur.trim() === url.q.trim() ? cur : url.q))
  }, [url.q])

  useEffect(() => {
    const ctrl = new AbortController()
    const qs = new URLSearchParams()
    if (projectId) qs.set("project_id", projectId)
    if (from) qs.set("from", from)
    if (to) qs.set("to", to)
    if (q) qs.set("q", q)
    setLoading(true)
    void requestJson<{ receipts: ExpenseReceipt[] }>(`/api/admin/expenses/receipts?${qs.toString()}`, { signal: ctrl.signal }).then((r) => {
      if (r.ok) {
        setReceipts(Array.isArray(r.data.receipts) ? r.data.receipts : [])
        setError("")
        setLoading(false)
        setLoaded(true)
      } else if (!r.aborted) {
        setError(friendlyError(r.status, r.error, "증빙 목록을 불러오지 못했어요."))
        setLoading(false)
        setLoaded(true)
      }
    })
    return () => ctrl.abort()
  }, [projectId, from, to, q, reloadKey])

  // 점검·비목별 집행 현황은 기간·검색과 무관하게 (그 프로젝트) 전체로 계산한다
  useEffect(() => {
    if (!serverFiltered) {
      setFull(null)
      setFullError("")
      return
    }
    const ctrl = new AbortController()
    setFull(null)
    setFullError("")
    setFullLoading(true)
    void requestJson<{ receipts: ExpenseReceipt[] }>(`/api/admin/expenses/receipts${projectId ? `?project_id=${projectId}` : ""}`, {
      signal: ctrl.signal,
    }).then((r) => {
      if (!r.ok && r.aborted) return
      if (r.ok) {
        setFull(Array.isArray(r.data.receipts) ? r.data.receipts : [])
        setFullError("")
      } else {
        // 실패를 0건으로 보이지 않는다 — 집행 현황·정산 전 점검은 오류 + [다시 시도]
        setFull(null)
        setFullError(friendlyError(r.status, r.error, MSG.loadFailed))
      }
      setFullLoading(false)
    })
    return () => ctrl.abort()
  }, [projectId, serverFiltered, reloadKey])

  // 점검·집행 현황의 기준 목록(그 프로젝트 전체). 아직 못 불러왔거나 실패하면 null — 0건으로 보이지 않게 한다.
  const fullList: ExpenseReceipt[] | null = serverFiltered ? full : loaded && !error ? receipts : null
  const fullListLoading = serverFiltered ? fullLoading : loading
  const fullListError = serverFiltered ? fullError : error
  // 목록을 못 불러온 상태(요약 띠·탭 건수는 "-")
  const listFailed = Boolean(error)

  const refreshAll = useCallback(() => {
    setReloadKey((k) => k + 1)
    void loadProjects()
    router.refresh()
  }, [loadProjects, router])

  // ── 거르기·점검 ─────────────────────────────────────────────────────────────
  const checks = useMemo(
    () => checkReceipts(receipts, projects, { pairSource: fullList ?? receipts }),
    [receipts, projects, fullList],
  )

  const base = useMemo(
    () =>
      receipts.filter(
        (r) => (!docType || r.doc_type === docType) && (!itemKey || normalizeBudgetName(r.budget_item) === itemKey),
      ),
    [receipts, docType, itemKey],
  )

  const viewCounts = useMemo(() => {
    const out = Object.fromEntries(VIEWS.map((v) => [v, 0])) as Record<ReceiptsView, number>
    for (const r of base) for (const v of VIEWS) if (viewMatch(v, r, checks.get(r.id))) out[v] += 1
    return out
  }, [base, checks])

  const shown = useMemo(() => base.filter((r) => viewMatch(view, r, checks.get(r.id))), [base, view, checks])

  const byId = useMemo(() => {
    const m = new Map<number, ExpenseReceipt>()
    for (const r of fullList ?? []) m.set(r.id, r)
    for (const r of receipts) m.set(r.id, r)
    return m
  }, [receipts, fullList])

  // 비목별 같은 거래 쌍 수(초과 비목 행에 붙인다)
  const pairCountByItem = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of fullList ?? []) {
      for (const p of checks.get(r.id)?.pairs ?? []) {
        if (r.id > p.otherId) continue
        const other = byId.get(p.otherId)
        const keys = new Set([normalizeBudgetName(r.budget_item), normalizeBudgetName(other?.budget_item ?? r.budget_item)])
        for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1)
      }
    }
    return m
  }, [fullList, checks, byId])

  const itemOptions = useMemo(() => {
    const names = new Set<string>()
    for (const b of selectedProject?.budget_items ?? []) if (normalizeBudgetName(b.name)) names.add(normalizeBudgetName(b.name))
    for (const r of fullList ?? receipts) if (normalizeBudgetName(r.budget_item)) names.add(normalizeBudgetName(r.budget_item))
    if (itemKey) names.add(itemKey)
    return [...names]
  }, [selectedProject, fullList, receipts, itemKey])

  // 인건비 등록: 진행 중 프로젝트만(종료된 프로젝트에는 증빙을 추가할 수 없다)
  const payrollProjects = useMemo<PayrollProject[]>(
    () =>
      projects
        .filter((p) => p.status === "active")
        .map((p) => ({ id: p.id, name: p.name, budget_items: p.budget_items.filter((b) => b.name.trim()) })),
    [projects],
  )

  const sums = useMemo(() => {
    let total = 0
    let supply = 0
    let vat = 0
    const byProject = new Map<number, { name: string; total: number }>()
    for (const r of shown) {
      const t = typeof r.total_amount === "number" ? r.total_amount : 0
      total += t
      supply += typeof r.supply_amount === "number" ? r.supply_amount : 0
      vat += typeof r.vat_amount === "number" ? r.vat_amount : 0
      const cur = byProject.get(r.project_id) ?? { name: r.project_name, total: 0 }
      cur.total += t
      byProject.set(r.project_id, cur)
    }
    return { total, supply, vat, byProject: [...byProject.values()].sort((a, b) => b.total - a.total) }
  }, [shown])

  // ── 조건 바꾸기 ─────────────────────────────────────────────────────────────
  const setProject = (v: string) => {
    setNavIds(null)
    setUrl({ project_id: v === ALL ? null : v, item: null })
  }
  const setPreset = (p: Preset) => {
    setPeriodMode(p)
    if (p === "custom") return
    const r = presetRange(p, pickedMonth)
    setUrl({ from: r.from || null, to: r.to || null })
  }
  const setMonthPick = (ym: string) => {
    setPickedMonth(ym)
    const r = monthRange(ym)
    if (r) setUrl({ from: r.from, to: r.to })
  }
  const clearAll = () => {
    setPeriodMode("all")
    setQInput("")
    setUrl({ project_id: null, from: null, to: null, q: null, doc_type: null, item: null, view: null })
  }

  const chips: FilterChip[] = []
  if (selectedProject) chips.push({ label: `프로젝트: ${selectedProject.name}`, onRemove: () => setProject(ALL) })
  if (from || to) {
    const p = presetOf(from, to)
    const label =
      p.preset === "month" ? monthLabel(p.month) : p.preset === "custom" ? `${from ? dateShort(from) : "처음"} ~ ${to ? dateShort(to) : "오늘"}` : PRESET_LABELS[p.preset]
    chips.push({ label: `기간: ${label}`, onRemove: () => setPreset("all") })
  }
  if (docType) chips.push({ label: `문서 종류: ${DOC_TYPE_LABELS[docType]}`, onRemove: () => setUrl({ doc_type: null }) })
  if (itemKey) chips.push({ label: `비목: ${itemKey}`, onRemove: () => setUrl({ item: null }) })
  if (q) chips.push({ label: `검색: ${q}`, onRemove: () => { setQInput(""); setUrl({ q: null }) } })
  const anyCondition = chips.length > 0
  // 프로젝트 말고 더 좁힌 조건(기간·문서 종류·비목·검색)이 있는지 — 없으면 "지금 조건" 파일 = 프로젝트 전체 파일
  const narrowed = Boolean(from || to || q || docType || itemKey)

  // ── 편집 시트 ─────────────────────────────────────────────────────────────
  const openId = /^\d+$/.test(url.receipt) ? Number(url.receipt) : null
  const editing = openId !== null ? (byId.get(openId) ?? null) : null
  // 주소의 증빙을 (불러온 뒤에도) 찾지 못하면 시트 파라미터를 지운다
  useEffect(() => {
    if (openId !== null && loaded && !loading && !fullListLoading && !byId.has(openId)) setUrl({ receipt: null })
  }, [openId, loaded, loading, fullListLoading, byId, setUrl])

  const openReceipt = (id: number, ids: number[] | null = null) => {
    setNavIds(ids)
    setUrl({ receipt: id })
  }
  const closeSheet = () => {
    setNavIds(null)
    setUrl({ receipt: null })
  }
  const navList = navIds ?? shown.map((r) => r.id)
  const navIndex = openId !== null ? navList.indexOf(openId) : -1
  const nav: ReceiptSheetNav | null =
    navIndex >= 0
      ? {
          index: navIndex,
          total: navList.length,
          scope: navIds ? "점검 건" : "지금 목록",
          onPrev: navIndex > 0 ? () => setUrl({ receipt: navList[navIndex - 1] }) : undefined,
          onNext: navIndex < navList.length - 1 ? () => setUrl({ receipt: navList[navIndex + 1] }) : undefined,
        }
      : null

  // ── 동작 ─────────────────────────────────────────────────────────────────
  const condParams = (withProject = true) => {
    const qs = new URLSearchParams()
    if (withProject && projectId) qs.set("project_id", projectId)
    if (from) qs.set("from", from)
    if (to) qs.set("to", to)
    if (q) qs.set("q", q)
    if (docType) qs.set("doc_type", docType)
    if (itemKey) qs.set("budget_item", itemKey)
    return qs.toString()
  }

  const download = async (kind: Exclude<Downloading, null>) => {
    const projectQs = projectId ? `project_id=${projectId}` : ""
    const urlFor: Record<Exclude<Downloading, null>, string> = {
      "cond-xlsx": `/api/admin/expenses/export?${condParams()}`,
      "cond-zip": `/api/admin/expenses/download?${condParams()}`,
      "project-xlsx": `/api/admin/expenses/export?${projectQs}`,
      "project-zip": `/api/admin/expenses/download?${projectQs}`,
      "all-xlsx": "/api/admin/expenses/export",
    }
    const isZip = kind === "cond-zip" || kind === "project-zip"
    setDownloading(kind)
    setPageNotice(null)
    const err = await downloadFromApi(urlFor[kind], isZip ? "사업비_증빙원본.zip" : "사업비_증빙.xlsx")
    setDownloading(null)
    if (err) {
      setPageNotice({ tone: "danger", text: `${isZip ? "원본 zip" : "엑셀 파일"}을 내려받지 못했어요. ${friendlyError(400, err, MSG.loadFailed)}` })
      return
    }
    toastSuccess(isZip ? "원본 zip을 내려받았어요" : "엑셀 파일을 내려받았어요")
  }

  const doDelete = async (): Promise<void | { error: string }> => {
    const target = deleteTarget
    if (!target) return
    const r = await requestJson("/api/admin/expenses/receipts", jsonInit("DELETE", { id: target.id }))
    if (!r.ok) return { error: friendlyError(r.status, r.error, MSG.deleteFailed) }
    if (openId === target.id) closeSheet()
    toastSuccess(`${target.vendor_name} ${wonNumber(target.total_amount)}원 증빙을 삭제했어요`)
    refreshAll()
  }

  // 증빙 올리기 화면(payroll-entry)과 같은 문구: "인건비 n건(합계)을 등록했어요"
  const onPayrollSaved = (count: number, total?: number) => {
    toastSuccess(total === undefined ? `인건비 ${count.toLocaleString("ko-KR")}건을 등록했어요` : `인건비 ${count.toLocaleString("ko-KR")}건(${won(total)})을 등록했어요`)
    refreshAll()
  }

  const showSkeleton = useDelayedFlag(loading && !loaded)

  // ── 화면 ─────────────────────────────────────────────────────────────────
  if (projectsLoaded && !projectsError && projects.length === 0) {
    return (
      <EmptyState
        bordered
        title="아직 등록한 프로젝트가 없어요"
        description="증빙은 프로젝트(정부지원사업 과제)별로 모아요. 사업·프로젝트에서 먼저 등록해 주세요."
        action={
          <Button asChild>
            <Link href="/admin/expenses/projects">프로젝트 등록하기</Link>
          </Button>
        }
      />
    )
  }

  const projectRate = selectedProject ? usageRate(selectedProject.spent_total, selectedProject.total_budget) : null
  const projectRemain = selectedProject && selectedProject.total_budget !== null ? selectedProject.total_budget - selectedProject.spent_total : null
  const showProjectCol = !selectedProject
  const busyDownload = downloading !== null

  const filters = (
    <>
      {/* 1280px(본문 960px)에서도 필터가 한 줄에 들어가게 폭을 줄인다(4.0 #4: 1280×600에서 표 첫 행이 첫 화면에) */}
      <div className="w-full sm:w-56">
        <Label htmlFor="lf-project" className="sr-only">
          프로젝트
        </Label>
        <Select value={projectId || ALL} onValueChange={setProject}>
          <SelectTrigger id="lf-project" className="h-9 w-full bg-card text-[15px]">
            <SelectValue placeholder="전체 프로젝트" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>전체 프로젝트</SelectItem>
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
      <div className="flex gap-2">
        <Label htmlFor="lf-period" className="sr-only">
          거래 기간
        </Label>
        <Select value={periodMode} onValueChange={(v) => setPreset(v as Preset)}>
          <SelectTrigger id="lf-period" className="h-9 w-32 bg-card text-[15px]">
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
        {periodMode === "month" && (
          <Select value={pickedMonth} onValueChange={setMonthPick}>
            <SelectTrigger className="h-9 w-36 bg-card text-[15px]" aria-label="월">
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
      <div>
        <Label htmlFor="lf-doc" className="sr-only">
          문서 종류
        </Label>
        <Select value={docType ?? ALL} onValueChange={(v) => setUrl({ doc_type: v === ALL ? null : v })}>
          <SelectTrigger id="lf-doc" className="h-9 w-36 bg-card text-[15px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>모든 문서</SelectItem>
            <SelectSeparator />
            {EXPENSE_DOC_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {DOC_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="lf-item" className="sr-only">
          비목
        </Label>
        <Select value={itemKey || ALL} onValueChange={(v) => setUrl({ item: v === ALL ? null : v })}>
          <SelectTrigger id="lf-item" className="h-9 w-36 bg-card text-[15px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>모든 비목</SelectItem>
            {itemOptions.length > 0 && <SelectSeparator />}
            {itemOptions.map((n) => (
              <SelectItem key={n} value={n}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  )

  const downloadMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige" disabled={busyDownload} aria-busy={busyDownload || undefined}>
          <Download className="size-4" aria-hidden />
          {busyDownload ? (downloading === "cond-zip" || downloading === "project-zip" ? "압축 중…" : "만드는 중…") : "내려받기"}
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="app-shell w-72">
        <DropdownMenuItem className="min-h-9 text-[15px]" onSelect={() => void download("cond-xlsx")}>
          지금 조건으로 엑셀
        </DropdownMenuItem>
        {selectedProject ? (
          <>
            <DropdownMenuItem className="min-h-9 text-[15px]" onSelect={() => void download("cond-zip")}>
              지금 조건으로 원본 zip
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-9 text-[15px]" onSelect={() => void download("project-xlsx")}>
              프로젝트 전체 엑셀
            </DropdownMenuItem>
            {narrowed && (
              <DropdownMenuItem className="min-h-9 text-[15px]" onSelect={() => void download("project-zip")}>
                프로젝트 전체 원본 zip
              </DropdownMenuItem>
            )}
          </>
        ) : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-9 text-[15px]" onSelect={() => void download("all-xlsx")}>
              전체 프로젝트 엑셀(프로젝트별 집계 포함)
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-sm font-normal text-text-muted-strong [word-break:keep-all]">
          {anyCondition ? "조건이 걸린 파일은 파일 이름과 첫 줄에 조건이 적혀요." : "지금은 조건이 없어 전체 증빙이 담겨요."}
          {view !== "all" && " 보기 탭(점검 필요 등)은 파일에 반영되지 않아요."}
          {!selectedProject && " 원본 zip은 프로젝트를 고르면 받을 수 있어요."}
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const toolbar = (
    <>
      <PayrollEntryButton
        size="sm"
        projects={payrollProjects}
        defaultProjectId={selectedProject?.status === "active" ? selectedProject.id : null}
        onSaved={onPayrollSaved}
      />
      {downloadMenu}
      <Button asChild size="sm" variant="outline" className="hover:bg-warm-beige">
        <Link href={receiptsPrintHref({ project_id: projectId || null, from: from || null, to: to || null })}>
          <Printer className="size-4" aria-hidden />
          인쇄
        </Link>
      </Button>
    </>
  )

  const rowActions = (r: ExpenseReceipt) => (
    <RowActions
      label={`${r.vendor_name} ${dateShort(r.issue_date)}`}
      items={[
        { label: "수정", onSelect: () => openReceipt(r.id) },
        ...(r.file_pathname ? [{ label: "원본 받기", href: fileUrl(r.file_pathname, { download: true, name: r.file_name }) }] : []),
        { label: "삭제", danger: true, onSelect: () => setDeleteTarget(r) },
      ]}
    />
  )

  const listBody = error ? (
    <EmptyState kind="error" title="증빙 목록을 불러오지 못했어요" description={error} onRetry={() => setReloadKey((k) => k + 1)} />
  ) : !loaded ? (
    showSkeleton ? <TableSkeleton rows={8} columns={7} label="증빙 목록을 불러오는 중…" className="p-4" /> : <div className="h-40" aria-busy="true" />
  ) : shown.length === 0 ? (
    receipts.length === 0 && !anyCondition ? (
      <EmptyState
        title="아직 저장한 증빙이 없어요"
        description="증빙 올리기에서 저장한 증빙과 직접 등록한 인건비가 여기에 모여요."
        action={
          <Button asChild>
            <Link href="/admin/expenses">증빙 올리기</Link>
          </Button>
        }
      />
    ) : view !== "all" && base.length > 0 ? (
      <EmptyState
        kind="no-results"
        compact
        title={view === "check" ? "점검할 것이 없어요" : `${VIEW_LABELS[view]} 증빙이 없어요`}
        description={view === "check" ? "같은 거래로 보이는 쌍·금액 불일치·비목 미지정·예산 외·기간 밖 거래가 없어요." : undefined}
        onClear={() => setUrl({ view: null })}
        clearLabel="전체 보기"
      />
    ) : (
      <EmptyState kind="no-results" compact title="조건에 맞는 증빙이 없어요" description="기간·검색어·비목을 바꿔 보세요." onClear={clearAll} />
    )
  ) : (
    <div className={cn("transition-opacity", loading && "opacity-60")}>
      {/* md 이상: 표 */}
      <div className="hidden max-h-[75vh] overflow-auto md:block">
        <table className="w-full min-w-[760px] table-fixed text-[15px]">
          <thead>
            <tr>
              <th className={cn(TH, "w-[120px] pl-4")}>거래일자 · 문서</th>
              <th className={TH}>거래처 · 적요</th>
              <th className={cn(TH, "w-[120px]")}>비목</th>
              <th className={cn(TH, "w-[190px] text-right")}>합계(원)</th>
              <th className={cn(TH, "w-[116px]")}>점검</th>
              {showProjectCol && <th className={cn(TH, "w-[140px]")}>프로젝트</th>}
              <th className={cn(TH, "w-[64px]")}>원본</th>
              <th className={cn(TH, "w-[48px] pr-3")}>
                <span className="sr-only">동작</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const c = checks.get(r.id)
              const flagged = needsCheck(c)
              return (
                <tr
                  key={r.id}
                  tabIndex={0}
                  onClick={() => openReceipt(r.id)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      openReceipt(r.id)
                    }
                  }}
                  aria-label={`${r.vendor_name} ${dateShort(r.issue_date)} ${wonNumber(r.total_amount)}원 증빙 수정`}
                  title="클릭하여 수정"
                  className={cn(
                    "cursor-pointer border-b border-warm-tan/70 hover:bg-warm-beige/50 focus-visible:bg-warm-beige/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-dark",
                    flagged && "shadow-[inset_4px_0_0_0_var(--color-amber-600)]",
                    openId === r.id && "bg-warm-beige/60",
                  )}
                >
                  <td className={cn(TD, "pl-4")}>
                    <div className="whitespace-nowrap tabular-nums text-dark">{dateShort(r.issue_date)}</div>
                    <div className="text-sm text-text-on-beige [word-break:keep-all]">
                      {DOC_TYPE_LABELS[r.doc_type] ?? r.doc_type}
                      {r.doc_type === "payroll" && /^\d{4}-\d{2}$/.test(r.payroll_month) && ` · ${Number(r.payroll_month.slice(5))}월 귀속`}
                    </div>
                  </td>
                  <td className={TD}>
                    <div className="truncate font-medium text-dark" title={r.vendor_biz_no ? `${r.vendor_name} · 사업자등록번호 ${r.vendor_biz_no}` : r.vendor_name}>
                      {r.vendor_name}
                    </div>
                    {r.purpose && (
                      <div className="truncate text-sm text-text-secondary" title={r.purpose}>
                        {r.purpose}
                      </div>
                    )}
                  </td>
                  <td className={TD}>
                    {r.budget_item ? (
                      <span className="block truncate text-dark" title={r.budget_item}>
                        {r.budget_item}
                      </span>
                    ) : (
                      <span className="text-sm text-text-secondary">미지정</span>
                    )}
                  </td>
                  <td className={cn(TD, NUM)}>
                    <Money value={r.total_amount} strong />
                    <ForeignBasis r={r} />
                  </td>
                  <td className={TD}>
                    <CheckCell check={c} />
                  </td>
                  {showProjectCol && (
                    <td className={TD}>
                      <div className="truncate text-sm text-dark" title={r.project_name}>
                        {r.project_name}
                      </div>
                    </td>
                  )}
                  <td className={TD}>
                    {r.file_pathname ? (
                      <a
                        href={fileUrl(r.file_pathname)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-sm text-sm text-link underline underline-offset-2"
                        aria-label={`${r.file_name} 원본 보기(새 창)`}
                      >
                        <Eye className="size-4" aria-hidden />
                        보기
                      </a>
                    ) : (
                      <span className="whitespace-nowrap text-sm text-text-secondary">없음</span>
                    )}
                  </td>
                  <td className={cn(TD, "pr-3")} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    {rowActions(r)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-warm-tan bg-warm-ivory font-semibold text-dark">
              <td colSpan={3} className={cn(TD, "pl-4")}>
                합계 {shown.length.toLocaleString("ko-KR")}건
              </td>
              <td className={cn(TD, NUM)}>
                <Money value={sums.total} strong />
              </td>
              <td colSpan={showProjectCol ? 4 : 3} className={TD} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* md 미만: 카드 목록(금액·점검이 첫 화면 폭 안에) */}
      <div className="md:hidden">
        <ul className="grid gap-2 p-3">
          {shown.map((r) => {
            const c = checks.get(r.id)
            const flagged = needsCheck(c)
            return (
              <li
                key={r.id}
                className={cn("flex items-start gap-1 rounded-md border border-warm-tan bg-card", flagged && "border-l-4 border-l-amber-600")}
              >
                <button
                  type="button"
                  onClick={() => openReceipt(r.id)}
                  aria-label={`${r.vendor_name} ${dateShort(r.issue_date)} 증빙 수정`}
                  className="block min-w-0 flex-1 rounded-sm px-3 py-2.5 text-left"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate text-[15px] font-semibold text-dark">{r.vendor_name}</span>
                    <span className="shrink-0 text-[15px]">
                      <Money value={r.total_amount} unit strong />
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm text-text-secondary [word-break:keep-all]">
                    {dateShort(r.issue_date)} · {DOC_TYPE_LABELS[r.doc_type] ?? r.doc_type}
                    {r.budget_item ? ` · ${r.budget_item}` : " · 비목 미지정"}
                    {!r.file_pathname && " · 원본 없음"}
                  </span>
                  {isForeignRow(r) && (
                    <span className="mt-0.5 block">
                      <ForeignBasis r={r} align="left" />
                    </span>
                  )}
                  {showProjectCol && <span className="mt-0.5 block truncate text-sm text-text-secondary">{r.project_name}</span>}
                  {c && (c.warnings.length > 0 || c.notes.length > 0) && (
                    <span className="mt-1.5 block">
                      <CheckCell check={c} />
                    </span>
                  )}
                </button>
                <div className="shrink-0 py-1.5 pr-1.5">{rowActions(r)}</div>
              </li>
            )
          })}
        </ul>
        <p className="flex items-center justify-between gap-3 border-t border-warm-tan px-3 py-3 text-[15px] font-semibold text-dark">
          <span>합계 {shown.length.toLocaleString("ko-KR")}건</span>
          <Money value={sums.total} unit strong />
        </p>
      </div>
    </div>
  )

  return (
    <div className="grid gap-4">
      {projectsError && (
        <Notice
          tone="danger"
          action={
            <Button size="sm" variant="outline" className="bg-card hover:bg-warm-beige" onClick={() => void loadProjects()}>
              다시 시도
            </Button>
          }
        >
          프로젝트 목록을 불러오지 못했어요. {projectsError}
        </Notice>
      )}
      {pageNotice && (
        <Notice tone={pageNotice.tone} onClose={() => setPageNotice(null)}>
          {pageNotice.text}
        </Notice>
      )}

      <div>
        <FilterBar
          className="mb-0"
          search={{ value: qInput, onChange: setQInput, label: "거래처·적요·비목·금액 검색", placeholder: "거래처·적요·비목·금액" }}
          filters={filters}
          chips={chips}
          onClearAll={anyCondition ? clearAll : undefined}
        />
        {periodMode === "custom" && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Label htmlFor="lf-from" className="text-sm text-text-muted-strong">
              시작일
            </Label>
            <Input
              id="lf-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setUrl({ from: isDateText(e.target.value) ? e.target.value : null })}
              className="h-9 w-auto bg-card"
            />
            <Label htmlFor="lf-to" className="text-sm text-text-muted-strong">
              종료일
            </Label>
            <Input
              id="lf-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setUrl({ to: isDateText(e.target.value) ? e.target.value : null })}
              className="h-9 w-auto bg-card"
            />
            {from && to && from > to && <span className="text-sm text-red-800">시작일이 종료일보다 늦어요</span>}
          </div>
        )}
      </div>

      {/* 요약 띠: 조회된 증빙 · 합계 · 집행률 · 남은 예산 */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-warm-tan bg-warm-tan lg:grid-cols-4">
        <div className="min-w-0 bg-card px-4 py-3 lg:[@media(max-height:760px)]:py-2">
          <dt className="text-sm text-text-secondary">조회된 증빙</dt>
          <dd className="mt-0.5 text-xl font-bold tabular-nums text-dark">{loaded && !listFailed ? `${shown.length.toLocaleString("ko-KR")}건` : "-"}</dd>
          {view !== "all" && <dd className="text-sm text-text-secondary">{VIEW_LABELS[view]} 보기</dd>}
        </div>
        <div className="min-w-0 bg-card px-4 py-3 lg:[@media(max-height:760px)]:py-2">
          <dt className="text-sm text-text-secondary">합계 금액</dt>
          <dd className="mt-0.5 text-xl font-bold tabular-nums text-dark">{loaded && !listFailed ? `${wonNumber(sums.total)}원` : "-"}</dd>
          {loaded && !listFailed && (
            <dd className="text-sm tabular-nums text-text-secondary">
              공급가액 {wonNumber(sums.supply)} · 부가세 {wonNumber(sums.vat)}
            </dd>
          )}
        </div>
        {selectedProject ? (
          <>
            <div className="min-w-0 bg-card px-4 py-3 lg:[@media(max-height:760px)]:py-2">
              <dt className="text-sm text-text-secondary">집행률(프로젝트 전체)</dt>
              <dd className="mt-0.5 text-xl font-bold">
                <RateValue rate={projectRate} className="font-bold" />
              </dd>
              <dd className="text-sm tabular-nums text-text-secondary [word-break:keep-all]">
                {selectedProject.total_budget === null
                  ? "총사업비 미입력"
                  : `${wonNumber(selectedProject.spent_total)} / ${wonNumber(selectedProject.total_budget)}`}
              </dd>
              <UsageBar className="mt-2" rate={projectRate} />
            </div>
            <div className="min-w-0 bg-card px-4 py-3 lg:[@media(max-height:760px)]:py-2">
              <dt className="text-sm text-text-secondary">남은 예산</dt>
              <dd className={cn("mt-0.5 text-xl font-bold tabular-nums", projectRemain !== null && projectRemain < 0 ? "text-red-800" : "text-dark")}>
                {projectRemain === null ? "-" : `${wonNumber(projectRemain)}원`}
              </dd>
              <dd className="text-sm text-text-secondary">저장한 증빙 {selectedProject.receipt_count.toLocaleString("ko-KR")}건</dd>
            </div>
          </>
        ) : (
          <div className="col-span-2 min-w-0 bg-card px-4 py-3 lg:[@media(max-height:760px)]:py-2">
            <dt className="text-sm text-text-secondary">프로젝트별 합계</dt>
            {listFailed ? (
              <dd className="mt-1 text-sm text-text-secondary">-</dd>
            ) : sums.byProject.length === 0 ? (
              <dd className="mt-1 text-sm text-text-secondary">프로젝트를 고르면 예산 대비 집행이 보여요</dd>
            ) : (
              <dd>
                <ul className="mt-1 grid gap-0.5 text-[15px]">
                  {sums.byProject.slice(0, 3).map((p, i) => (
                    <li key={`${i}-${p.name}`} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate text-dark" title={p.name}>
                        {p.name}
                      </span>
                      <Money value={p.total} />
                    </li>
                  ))}
                </ul>
                {sums.byProject.length > 3 && <p className="text-sm text-text-secondary">외 {sums.byProject.length - 3}개</p>}
              </dd>
            )}
          </div>
        )}
      </dl>

      {selectedProject && (
        <BudgetUsageTable
          key={selectedProject.id}
          project={selectedProject}
          receipts={fullList}
          loading={fullListLoading}
          error={fullList ? "" : fullListError}
          onRetry={() => setReloadKey((k) => k + 1)}
          pairCountByItem={pairCountByItem}
          selectedItem={view === "unassigned" ? "" : itemKey || null}
          onSelectItem={(row) => {
            if (row.kind === "unassigned") {
              setUrl({ view: view === "unassigned" ? null : "unassigned", item: null })
              return
            }
            const key = usageRowKey(row)
            setUrl({ item: key === itemKey ? null : key, view: view === "unassigned" ? null : view })
          }}
          onShowPairs={(key) => setUrl({ item: key || null, view: "check" })}
          actions={
            <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige" onClick={() => setCheckOpen(true)}>
              <ClipboardCheck className="size-4" aria-hidden />
              정산 전 점검
            </Button>
          }
        />
      )}

      {/* 프로젝트를 골랐으면 비목별 집행 현황 칸이 같은 실패를 보여 주므로 겹쳐 띄우지 않는다 */}
      {serverFiltered && fullListError && !listFailed && !selectedProject && (
        <Notice
          tone="warning"
          action={
            <Button size="sm" variant="outline" className="bg-card hover:bg-warm-beige" onClick={() => setReloadKey((k) => k + 1)}>
              다시 시도
            </Button>
          }
        >
          점검에 쓰는 프로젝트 전체 증빙을 불러오지 못했어요. 지금은 같은 거래로 보이는 쌍을 이 목록 안에서만 찾았어요. {fullListError}
        </Notice>
      )}

      {/* 목록 */}
      <section className="overflow-hidden rounded-md border border-warm-tan bg-card" aria-labelledby="ledger-list-title">
        {/* 보기 탭과 도구 줄을 한 줄로(1280×600에서 표 첫 행이 첫 화면에 들어오게). 건수는 요약 띠·탭에 있다 */}
        <h2 id="ledger-list-title" className="sr-only">
          증빙 목록 {loaded && !listFailed ? `${shown.length.toLocaleString("ko-KR")}건` : ""}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-warm-tan px-4 py-2.5">
          <FilterTabs
            className="min-w-0 max-w-full"
            label="증빙 보기"
            value={view}
            onValueChange={(v) => {
              setNavIds(null)
              setUrl({ view: v === "all" ? null : v })
            }}
            options={VIEWS.map((v) => ({
              value: v,
              label: VIEW_LABELS[v],
              count: !loaded || listFailed || (v === "check" && fullListError) ? null : viewCounts[v],
            }))}
          />
          <div className="flex flex-wrap items-center gap-2">
            {loading && loaded && <span className="text-sm text-text-secondary">불러오는 중…</span>}
            {toolbar}
          </div>
        </div>
        {listBody}
      </section>

      <ReceiptEditSheet
        receipt={editing}
        projects={projects}
        nav={nav}
        check={editing ? checks.get(editing.id) : null}
        findReceipt={(id) => byId.get(id)}
        onOpenReceipt={(id) => openReceipt(id, navIds && navIds.includes(id) ? navIds : null)}
        onClose={closeSheet}
        onSaved={(message) => {
          closeSheet()
          toastSuccess(message)
          refreshAll()
        }}
        onRequestDelete={(r) => setDeleteTarget(r)}
      />

      {selectedProject && (
        <SettleCheckSheet
          open={checkOpen}
          onOpenChange={setCheckOpen}
          project={selectedProject}
          receipts={fullList}
          checks={checks}
          loading={!fullList && !fullListError}
          error={fullList ? "" : fullListError}
          onRetry={() => setReloadKey((k) => k + 1)}
          onOpen={(id, ids) => {
            setCheckOpen(false)
            openReceipt(id, ids)
          }}
          onDownload={() => {
            setCheckOpen(false)
            void download("project-xlsx")
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        tone="danger"
        title="이 증빙을 삭제할까요?"
        summary={
          deleteTarget
            ? [
                { label: "거래일자", value: dateShort(deleteTarget.issue_date) },
                { label: "거래처", value: deleteTarget.vendor_name },
                { label: "합계", value: `${wonNumber(deleteTarget.total_amount)}원` },
                { label: "프로젝트", value: deleteTarget.project_name },
              ]
            : undefined
        }
        consequences={[
          "삭제하면 되돌릴 수 없고 집행액에서 빠져요.",
          ...(deleteTarget?.file_pathname ? ["원본 파일도 지워져요(같은 파일을 쓰는 다른 증빙이 있으면 남겨요)."] : []),
        ]}
        confirmLabel="삭제하기"
        busyLabel="삭제 중…"
        failedTitle="삭제하지 못했어요"
        onConfirm={doDelete}
      />
    </div>
  )
}
