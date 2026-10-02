"use client"

// 청구서 화면 본문(WP7, 계획서 4.4.7) — 보기 탭 3개: 받을 돈(기본) · 월별 청구서 · 작성 중.
// 주소 계약(lib/links.ts billsHref): ?view=receivable|month|draft &bucket= &period=(청구월) &status= &q= &bill=(상세 시트) &tenant= &add=1(추가 청구 시트)
// 받을 돈은 bills GET 상태 묶음(status=issued,overdue&include=correcting, 건수 상한 없음)으로 읽고 구간·경과는 lib/receivables.ts로 판정한다.
// 일괄 납부·되돌리기·상세·추가 청구는 각 파일(pay-dialog·bill-sheet·add-charge-sheet).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Download, FileSpreadsheet } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  BulkActionBar,
  EmptyState,
  FilterBar,
  FilterTabs,
  MonthPicker,
  Notice,
  RowActions,
  TableSkeleton,
  toastSuccess,
  useUrlStates,
  type FilterChip,
  type RowActionItem,
} from "@/components/saas"
import { billMonth, billMonthShort, isYm, thisMonthKST, todayKST, won } from "@/lib/format"
import { billingCloseHrefForBillMonth } from "@/lib/links"
import { cn } from "@/lib/utils"
import { AddChargeSheet } from "./add-charge-sheet"
import {
  BUCKET_CARD_LABEL,
  BUCKET_ORDER,
  bucketFilterLabel,
  bucketSummary,
  filterReceivables,
  isPayable,
  MONTH_TAB_LABEL,
  MONTH_TABS,
  monthSummary,
  monthTabOf,
  paidToastText,
  parseBucket,
  parseMonthTab,
  sortByElapsed,
  stateOf,
  unpaidMonthsByTenant,
  type BankForGuide,
  type BillRow,
  type BucketFilter,
  type MonthTab,
} from "./bill-model"
import { BillSheet } from "./bill-sheet"
import { fetchDrafts, fetchMonth, fetchReceivables, markUnpaid } from "./bills-api"
import { BillsTable } from "./bills-table"
import { GuideDialog, type GuideTarget } from "./guide-dialog"
import { PayDialog } from "./pay-dialog"

type View = "receivable" | "month" | "draft"
const VIEWS: View[] = ["receivable", "month", "draft"]

interface Load {
  state: "loading" | "error" | "ready"
  rows: BillRow[]
  error: string | null
}
const LOADING: Load = { state: "loading", rows: [], error: null }

const URL_DEFAULTS = { view: "receivable", bucket: "", period: "", status: "", q: "", bill: "", tenant: "", add: "" }

export function BillsScreen({ bank, phone, mailEnabled }: { bank: BankForGuide; phone: string | null; mailEnabled: boolean }) {
  const router = useRouter()
  const today = todayKST()
  const [u, setU] = useUrlStates(URL_DEFAULTS)
  const view: View = (VIEWS as string[]).includes(u.view) ? (u.view as View) : "receivable"
  const bucket = parseBucket(u.bucket)
  const period = isYm(u.period) ? u.period : ""
  const monthPeriod = period || thisMonthKST()
  const monthTab = parseMonthTab(u.status)
  const tenantId = Number(u.tenant) > 0 ? Number(u.tenant) : null
  const billId = Number(u.bill) > 0 ? Number(u.bill) : null

  const [recv, setRecv] = useState<Load>(LOADING)
  const [drafts, setDrafts] = useState<Load>(LOADING)
  const [month, setMonth] = useState<Load & { period: string }>({ ...LOADING, period: "" })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [payRows, setPayRows] = useState<BillRow[] | null>(null)
  const [guide, setGuide] = useState<GuideTarget | null>(null)
  const [pageNotice, setPageNotice] = useState<{ tone: "danger" | "warning" | "success"; title?: string; text: string } | null>(null)
  const [zipBusy, setZipBusy] = useState(false)
  const [sheetTick, setSheetTick] = useState(0)
  /** 추가 청구에서 저장은 됐지만 발행이 실패한 청구서 — 열리는 상세 시트에 Notice로 보인다 */
  const [sheetNotice, setSheetNotice] = useState<{ billId: number; title: string; text: string } | null>(null)

  const loadRecv = useCallback(async () => {
    setRecv((p) => ({ ...p, state: p.rows.length ? "ready" : "loading" }))
    const r = await fetchReceivables()
    setRecv(r.ok ? { state: "ready", rows: r.data, error: null } : { state: "error", rows: [], error: r.error })
  }, [])
  const loadDrafts = useCallback(async () => {
    const r = await fetchDrafts()
    setDrafts(r.ok ? { state: "ready", rows: r.data, error: null } : { state: "error", rows: [], error: r.error })
  }, [])
  const loadMonth = useCallback(async (p: string) => {
    setMonth((m) => (m.period === p ? m : { ...LOADING, period: p }))
    const r = await fetchMonth(p)
    setMonth((m) => (m.period !== p ? m : r.ok ? { state: "ready", rows: r.data, error: null, period: p } : { state: "error", rows: [], error: r.error, period: p }))
  }, [])

  useEffect(() => {
    void loadRecv()
    void loadDrafts()
  }, [loadRecv, loadDrafts])

  useEffect(() => {
    if (view === "month") void loadMonth(monthPeriod)
  }, [view, monthPeriod, loadMonth])

  /** 쓰기 뒤: 목록 다시 읽기 + 사이드바 배지 갱신 */
  const reloadAll = useCallback(() => {
    void loadRecv()
    void loadDrafts()
    if (view === "month") void loadMonth(monthPeriod)
    router.refresh()
  }, [loadRecv, loadDrafts, loadMonth, view, monthPeriod, router])

  // 보기·거르기(구간·검색·청구월·상태 탭·기업)가 바뀌면 선택을 비운다(보이지 않는 행이 선택에 남지 않게)
  const filterKey = [view, bucket, u.q.trim(), period, monthTab, tenantId ?? ""].join("|")
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey)
    setSelected(new Set())
  }

  // ── 받을 돈 ──
  const summary = useMemo(() => bucketSummary(recv.rows, today), [recv.rows, today])
  const unpaidMonths = useMemo(() => unpaidMonthsByTenant(recv.rows, today), [recv.rows, today])
  const recvRows = useMemo(
    () => sortByElapsed(filterReceivables(recv.rows, { bucket, q: u.q, period, tenantId }, today), today),
    [recv.rows, bucket, u.q, period, tenantId, today],
  )

  // ── 월별 ──
  const mSummary = useMemo(() => monthSummary(month.rows, today), [month.rows, today])
  const monthRows = useMemo(() => {
    const q = u.q.trim().toLowerCase()
    return month.rows.filter(
      (r) => (monthTab === "all" || monthTabOf(r, today) === monthTab) && (!q || r.tenant_name.toLowerCase().includes(q)) && (!tenantId || r.tenant_id === tenantId),
    )
  }, [month.rows, monthTab, u.q, tenantId, today])

  // ── 작성 중 ──
  const draftRows = useMemo(() => {
    const q = u.q.trim().toLowerCase()
    return [...drafts.rows]
      .filter((r) => (!q || r.tenant_name.toLowerCase().includes(q)) && (!period || r.period === period) && (!tenantId || r.tenant_id === tenantId))
      .sort((a, b) => (a.period === b.period ? a.tenant_name.localeCompare(b.tenant_name, "ko") : a.period < b.period ? 1 : -1))
  }, [drafts.rows, u.q, period, tenantId])

  const visibleRows = view === "receivable" ? recvRows : view === "month" ? monthRows : draftRows
  const allKnown = useMemo(() => {
    const m = new Map<number, BillRow>()
    for (const r of [...recv.rows, ...month.rows, ...drafts.rows]) m.set(r.id, r)
    return m
  }, [recv.rows, month.rows, drafts.rows])
  const selectedRows = [...selected].map((id) => allKnown.get(id)).filter((r): r is BillRow => !!r && isPayable(r))
  const selectedSum = selectedRows.reduce((s, r) => s + Number(r.total_amount), 0)

  const tenantName = tenantId ? (allKnown.size ? [...allKnown.values()].find((r) => r.tenant_id === tenantId)?.tenant_name : null) : null

  // ── 동작 ──
  const openBill = (r: BillRow) => setU({ bill: r.id })
  const openGuide = (r: BillRow) => {
    const same = recv.rows.filter((x) => x.tenant_id === r.tenant_id && stateOf(x, today).kind === "receivable")
    setGuide({ tenantName: r.tenant_name, bills: same.length ? same : [r] })
  }
  const rowActions = (r: BillRow): RowActionItem[] => {
    const items: RowActionItem[] = [{ label: "청구서 열기", onSelect: () => openBill(r) }]
    if (isPayable(r)) items.push({ label: "납부 처리", onSelect: () => setPayRows([r]) })
    if (stateOf(r, today).kind === "receivable") items.push({ label: "납부 안내 문구 복사", onSelect: () => openGuide(r) })
    items.push({ label: "PDF 미리보기(새 창)", onSelect: () => window.open(`/api/admin/billing/bills/preview?id=${r.id}`, "_blank", "noopener") })
    if (stateOf(r, today).kind === "correcting") items.push({ label: "월 마감 4단계 열기", href: billingCloseHrefForBillMonth(r.period, 4) })
    return items
  }

  const toggle = (id: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const toggleAll = (on: boolean) => {
    const ids = visibleRows.filter(isPayable).map((r) => r.id)
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const onPaid = (paid: BillRow[]) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const r of paid) next.delete(r.id)
      return next
    })
    reloadAll()
    setSheetTick((n) => n + 1)
    toastSuccess(paidToastText(paid), {
      undo: async () => {
        const failed: string[] = []
        for (const r of paid) {
          const res = await markUnpaid(r.id)
          if (!res.ok) failed.push(`${r.tenant_name} ${billMonthShort(r.period, today)}`)
        }
        reloadAll()
        setSheetTick((n) => n + 1)
        if (failed.length) {
          setPageNotice({
            tone: "danger",
            title: `${failed.length}건은 되돌리지 못했어요`,
            text: `${failed.join(", ")} — 청구서를 열어 ⋯의 [납부 처리 취소]를 눌러 주세요.`,
          })
        } else {
          toastSuccess(paid.length === 1 ? `${paid[0].tenant_name} ${billMonthShort(paid[0].period, today)}을 납부 대기로 되돌렸어요` : `${paid.length}건을 납부 대기로 되돌렸어요`)
        }
      },
    })
  }

  const downloadZip = async () => {
    const statusParam = monthTab === "draft" || monthTab === "paid" ? monthTab : ""
    setZipBusy(true)
    setPageNotice(null)
    try {
      const q = new URLSearchParams({ period: monthPeriod })
      if (statusParam) q.set("status", statusParam)
      const res = await fetch(`/api/admin/billing/bills/download?${q}`, { credentials: "include" })
      if (!res.ok) {
        setPageNotice({ tone: "danger", title: "PDF를 받지 못했어요", text: res.status === 404 ? `${billMonth(monthPeriod)} 청구서가 없어요.` : "잠시 뒤 다시 눌러 주세요." })
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filenameFromResponse(res, `청구서_${monthPeriod}.zip`)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      const got = Number(res.headers.get("X-Invoice-Count"))
      const total = Number(res.headers.get("X-Invoice-Total"))
      if (Number.isFinite(got) && Number.isFinite(total) && got < total) {
        setPageNotice({ tone: "warning", text: `${total}건 중 ${got}건만 받았어요. 빠진 ${total - got}건은 zip 안 ‘_안내.txt’에 적혀 있어요.` })
      } else {
        toastSuccess(`${billMonth(monthPeriod)} 청구서 PDF ${Number.isFinite(got) ? `${got}건` : ""}을 내려받았어요`)
      }
    } catch {
      setPageNotice({ tone: "danger", title: "PDF를 받지 못했어요", text: "인터넷 연결을 확인하고 다시 눌러 주세요." })
    } finally {
      setZipBusy(false)
    }
  }

  // 월별 도구: zip은 작성 중·납부 완료 탭에서만 그 상태로 거르고, 그 밖에는 그 달 전체를 받는다(라우트가 단일 DB 상태만 받음)
  const zipByTab = monthTab === "draft" || monthTab === "paid"
  const zipLabel = !zipByTab
    ? `${monthTab === "all" ? "PDF 모두 받기" : "그 달 PDF 모두 받기"}${month.state === "ready" ? `(${month.rows.length}건)` : ""}`
    : `${MONTH_TAB_LABEL[monthTab]} PDF 받기${month.state === "ready" ? `(${mSummary.counts[monthTab]}건)` : ""}`
  const exportHref = `/api/admin/billing/export?period=${monthPeriod}`

  // ── 조건 칩 ──
  const chips: FilterChip[] = []
  if (view === "receivable" && bucket) chips.push({ label: `구간: ${bucketFilterLabel(bucket)}`, onRemove: () => setU({ bucket: null }) })
  if (view !== "month" && period) chips.push({ label: `청구월: ${billMonth(period)}`, onRemove: () => setU({ period: null }) })
  if (tenantId) chips.push({ label: `기업: ${tenantName ?? tenantId}`, onRemove: () => setU({ tenant: null }) })
  if (u.q.trim()) chips.push({ label: `검색: ${u.q.trim()}`, onRemove: () => setU({ q: null }) })
  const clearAll = () => setU({ bucket: null, period: view === "month" ? u.period : null, tenant: null, q: null, status: null })

  const sum = (rows: BillRow[]) => rows.reduce((s, r) => s + Number(r.total_amount), 0)

  const tableOrState = (load: Load, rows: BillRow[], variant: "receivable" | "month" | "draft", caption: string, empty: ReactNode) => {
    if (load.state === "loading") return <TableSkeleton rows={6} columns={variant === "month" ? 8 : 6} label="청구서를 불러오는 중…" />
    if (load.state === "error")
      return (
        <EmptyState
          kind="error"
          title="청구서를 불러오지 못했어요"
          description={load.error}
          onRetry={() => (variant === "receivable" ? loadRecv() : variant === "draft" ? loadDrafts() : loadMonth(monthPeriod))}
          bordered
        />
      )
    return (
      <BillsTable
        variant={variant}
        rows={rows}
        selected={selected}
        onToggle={toggle}
        onToggleAll={toggleAll}
        onOpen={openBill}
        rowActions={rowActions}
        unpaidMonths={variant === "receivable" ? unpaidMonths : undefined}
        empty={empty}
        caption={caption}
      />
    )
  }

  return (
    <div className={cn(selected.size > 0 && "pb-28")}>
      <FilterTabs
        label="청구서 보기"
        value={view}
        onValueChange={(v) => setU({ view: v, bucket: null, status: null, period: null })}
        options={[
          { value: "receivable", label: "받을 돈", count: recv.state === "ready" ? summary.receivable.count : null },
          { value: "month", label: "월별 청구서" },
          { value: "draft", label: "작성 중", count: drafts.state === "ready" ? drafts.rows.length : null },
        ]}
        className="mb-4"
      />

      {pageNotice && (
        <Notice tone={pageNotice.tone} title={pageNotice.title} onClose={() => setPageNotice(null)} className="mb-4">
          {pageNotice.text}
        </Notice>
      )}

      {view === "receivable" && (
        <>
          <ReceivableCards
            summary={summary}
            ready={recv.state === "ready"}
            bucket={bucket}
            onPick={(b) => setU({ bucket: b === bucket ? null : b })}
          />
          {recv.state === "ready" && summary.correcting.count > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-[15px] text-amber-900">
              <span className="font-semibold">정정 중 {summary.correcting.count}건</span>
              <span>· {summary.correcting.periods.map((p) => billMonthShort(p, today)).join("·")} · 다시 발행해야 포털에 보여요</span>
              <span className="ml-auto flex flex-wrap items-center gap-3">
                <button type="button" className="min-h-8 text-link underline underline-offset-2" onClick={() => setU({ bucket: bucket === "correcting" ? null : "correcting" })}>
                  {bucket === "correcting" ? "받을 돈 보기" : "정정 중만 보기"}
                </button>
                <Link href={billingCloseHrefForBillMonth(summary.correcting.periods[0], 4)} className="inline-flex min-h-8 items-center gap-0.5 text-link underline underline-offset-2">
                  월 마감 열기
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              </span>
            </div>
          )}
          <FilterBar
            search={{ value: u.q, onChange: (v) => setU({ q: v || null }), label: "기업 이름 찾기", placeholder: "기업 이름 찾기" }}
            chips={chips}
            onClearAll={clearAll}
            summary={recv.state === "ready" ? <>조회 {recvRows.length}건 · {won(sum(recvRows))}</> : null}
          />
          {tableOrState(
            recv,
            recvRows,
            "receivable",
            "받을 돈 목록",
            recv.rows.some((r) => stateOf(r, today).kind === "receivable") || chips.length > 0 ? (
              <EmptyState kind="no-results" title="조건에 맞는 청구서가 없어요" onClear={clearAll} compact />
            ) : (
              <EmptyState
                kind="first-use"
                title="받을 돈이 없어요"
                description="납부 대기·기한 지남 청구서가 없어요. 발행한 청구서는 ‘월별 청구서’에서 볼 수 있어요."
                compact
              />
            ),
          )}
        </>
      )}

      {view === "month" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <MonthPicker label="청구월" value={monthPeriod} onChange={(ym) => setU({ period: ym === thisMonthKST() ? null : ym })} format={(ym) => `${billMonth(ym)} 청구서`} />
            <div className="ml-auto hidden flex-wrap items-center gap-2 sm:flex">
              <Button type="button" variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark" disabled={zipBusy || month.rows.length === 0} onClick={downloadZip}>
                <Download aria-hidden />
                {zipBusy ? "묶는 중…" : zipLabel}
              </Button>
              <Button asChild variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark">
                <a href={exportHref} download>
                  <FileSpreadsheet aria-hidden />
                  정산표 엑셀(작성 중 포함)
                </a>
              </Button>
            </div>
            {/* 휴대폰: 보조 버튼은 ⋯ 하나로(B-6) */}
            <div className="ml-auto sm:hidden">
              <RowActions
                label={`${billMonth(monthPeriod)} 청구서`}
                triggerLabel={`${billMonth(monthPeriod)} 청구서 내려받기 메뉴`}
                items={[
                  {
                    label: zipBusy ? "PDF 묶는 중…" : zipLabel,
                    onSelect: () => void downloadZip(),
                    disabled: zipBusy || month.rows.length === 0,
                    disabledReason: month.rows.length === 0 ? "이 달 청구서가 없어요" : undefined,
                  },
                  { label: "정산표 엑셀(작성 중 포함)", onSelect: () => window.location.assign(exportHref) },
                ]}
              />
            </div>
          </div>
          {month.state === "ready" && month.rows.length > 0 && (
            <>
              <FilterTabs
                label="상태"
                value={monthTab}
                onValueChange={(v) => setU({ status: v === "all" ? null : v })}
                options={MONTH_TABS.map((t: MonthTab) => ({ value: t, label: MONTH_TAB_LABEL[t], count: mSummary.counts[t] }))}
                className="mb-3"
              />
              <p className="mb-3 rounded-md border border-warm-tan bg-card px-4 py-2.5 text-[15px] tabular-nums text-dark [word-break:keep-all]">
                청구 {mSummary.total.count}건 <span className="font-semibold">{won(mSummary.total.sum)}</span>
                <span className="text-[#3f3f4e]"> · 납부 {won(mSummary.paid.sum)} · 받을 돈 {won(mSummary.receivable.sum)}</span>
              </p>
              <FilterBar
                search={{ value: u.q, onChange: (v) => setU({ q: v || null }), label: "기업 이름 찾기", placeholder: "기업 이름 찾기" }}
                chips={chips}
                onClearAll={() => setU({ q: null, tenant: null, status: null })}
                summary={<>조회 {monthRows.length}건 · {won(sum(monthRows))}</>}
              />
            </>
          )}
          {tableOrState(
            month,
            monthRows,
            "month",
            `${billMonth(monthPeriod)} 청구서 목록`,
            month.rows.length === 0 ? (
              <EmptyState
                kind="first-use"
                title={`${billMonth(monthPeriod)} 청구서가 아직 없어요`}
                description="월 마감 3단계에서 청구서를 만들면 여기에 보여요."
                action={
                  <Button asChild>
                    <Link href={billingCloseHrefForBillMonth(monthPeriod)}>
                      월 마감 시작하기
                      <ChevronRight aria-hidden />
                    </Link>
                  </Button>
                }
                compact
              />
            ) : (
              <EmptyState kind="no-results" title="조건에 맞는 청구서가 없어요" onClear={() => setU({ q: null, tenant: null, status: null })} compact />
            ),
          )}
        </>
      )}

      {view === "draft" && (
        <>
          <p className="mb-3 text-[15px] text-[#3f3f4e] [word-break:keep-all]">
            정기 청구서는 월 마감 4단계에서 한꺼번에 발행해요. 수기 청구서는 청구서를 열어 [이 청구서만 발행]으로 따로 발행할 수 있어요.
          </p>
          <FilterBar
            search={{ value: u.q, onChange: (v) => setU({ q: v || null }), label: "기업 이름 찾기", placeholder: "기업 이름 찾기" }}
            chips={chips}
            onClearAll={clearAll}
            summary={drafts.state === "ready" ? <>조회 {draftRows.length}건 · {won(sum(draftRows))}</> : null}
          />
          {tableOrState(
            drafts,
            draftRows,
            "draft",
            "작성 중 청구서 목록",
            drafts.rows.length === 0 ? (
              <EmptyState kind="first-use" title="작성 중인 청구서가 없어요" description="월 마감 3단계에서 청구서를 만들면 여기에 보여요." compact />
            ) : (
              <EmptyState kind="no-results" title="조건에 맞는 청구서가 없어요" onClear={clearAll} compact />
            ),
          )}
        </>
      )}

      <BulkActionBar count={selectedRows.length} summary={<>합계 {won(selectedSum)}</>} onClear={() => setSelected(new Set())}>
        <Button type="button" onClick={() => setPayRows(selectedRows)}>
          납부 처리
        </Button>
      </BulkActionBar>

      <PayDialog open={payRows !== null} onOpenChange={(o) => !o && setPayRows(null)} rows={payRows ?? []} onPaid={(paid) => onPaid(paid)} onReload={reloadAll} />

      <BillSheet
        billId={billId}
        onClose={() => setU({ bill: null })}
        onPay={(r) => setPayRows([r])}
        onGuide={openGuide}
        onChanged={reloadAll}
        mailEnabled={mailEnabled}
        refreshKey={sheetTick}
        openNotice={sheetNotice}
        onOpenNoticeShown={() => setSheetNotice(null)}
      />

      <AddChargeSheet
        open={u.add === "1"}
        onOpenChange={(o) => setU({ add: o ? "1" : null })}
        onDone={(id, issueError) => {
          if (id && issueError) {
            setSheetNotice({
              billId: id,
              title: "수기 청구서는 저장했지만 발행하지 못했어요",
              text: `${issueError} 내용을 확인한 뒤 아래 [이 청구서만 발행]을 다시 눌러 주세요.`,
            })
          }
          setU({ add: null, bill: id ?? null })
          reloadAll()
        }}
        mailEnabled={mailEnabled}
        initialTenantId={u.tenant || null}
        initialPeriod={u.period || null}
      />

      <GuideDialog target={guide} onOpenChange={(o) => !o && setGuide(null)} bank={bank} phone={phone} />
    </div>
  )
}

function ReceivableCards({
  summary,
  ready,
  bucket,
  onPick,
}: {
  summary: ReturnType<typeof bucketSummary>
  ready: boolean
  bucket: BucketFilter | ""
  onPick: (b: BucketFilter) => void
}) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="받을 돈 구간(누르면 그 구간만 보여요)">
      {BUCKET_ORDER.map((b) => {
        const c = summary.buckets[b]
        const on = bucket === b
        const late = b === "d1_30" || b === "d31_60" || b === "d60_plus"
        return (
          <button
            key={b}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(b)}
            className={cn(
              "min-h-[4.25rem] rounded-md border bg-card px-3 py-2 text-left hover:border-dark",
              on ? "border-dark bg-warm-beige" : "border-warm-tan",
            )}
          >
            <span className="block text-sm text-[#3f3f4e]">{BUCKET_CARD_LABEL[b]}</span>
            <span className={cn("block text-lg font-semibold tabular-nums", late && c.count > 0 ? "text-red-800" : "text-dark")}>
              {ready ? `${c.count}건` : "…"}
            </span>
            <span className="block text-sm tabular-nums text-[#3f3f4e]">{ready ? won(c.sum) : ""}</span>
          </button>
        )
      })}
    </div>
  )
}

// 서버가 보낸 Content-Disposition의 filename*=UTF-8''... 을 그대로 저장 파일명으로 쓴다(서버가 붙인 이름과 어긋나지 않게).
function filenameFromResponse(res: Response, fallback: string): string {
  const cd = res.headers.get("Content-Disposition") || ""
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  if (!m) return fallback
  try {
    return decodeURIComponent(m[1].trim().replace(/^"|"$/g, ""))
  } catch {
    return fallback
  }
}
