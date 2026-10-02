"use client"

// 입주기업 목록 화면(/admin/tenants, 계획서 4.3.5) — 검색 · 건수 탭(입주 중·퇴실·전체) · 조건 칩 · 표(휴대폰은 카드) · 행 끝 ⋯ 하나.
// 행을 누르면 기업 카드(4.3.6)가 오른쪽 시트로 열린다. 탭·검색·조건·열린 카드는 주소에 남는다
// (?tab=active|moved_out|all&q=&filter=no_portal,no_bill_email,unpaid&tenant=ID&card=…, lib/links.ts tenantsHref).
// 삭제는 확인창(위험)에 청구서·계약·신청 건수를 보이고 확인 체크 뒤에만 실행한다(삭제 API 동작은 그대로).

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  BusyButton,
  DetailSheet,
  EmptyState,
  FilterBar,
  FilterTabs,
  Money,
  Notice,
  PageHeader,
  RowActions,
  StatusBadge,
  TableSkeleton,
  ToneBadge,
  toastInfo,
  toastSuccess,
  useConfirm,
  useDelayedFlag,
  useUrlStates,
  type RowActionItem,
} from "@/components/saas"
import { dateTime, relative, won } from "@/lib/format"
import { friendlyError, MSG } from "@/lib/messages"
import { TENANTS_HELP } from "@/lib/help/tenants"
import type { TenantCardTab, TenantsFilter, TenantsTab } from "@/lib/links"
import type { BillingBankInfo } from "@/lib/bank-info"
import { cn } from "@/lib/utils"
import { TenantCardSheet, CARD_TABS, type CardActionSink } from "./tenant-card-sheet"
import { activeContractSentence, useTenantForm } from "./tenant-edit-form"
import { billMailTarget, matchesTenant, roomsLabel, type TenantRow, type TenantSummary } from "@/lib/tenant-model"

export interface TenantsPageProps {
  /** isMailEnabled() — 서버 컴포넌트가 넘긴다 */
  mailEnabled: boolean
  /** getBillingBankInfo() — 납부 안내 문구용 */
  bank: BillingBankInfo
  /** 납부 안내 문구의 문의 전화(사이트 연락처) */
  contactPhone: string | null
  /** 도움말 시트의 문의처(getSupportContact()) */
  supportContact: string | null
}

const TABS: TenantsTab[] = ["active", "moved_out", "all"]
const FILTERS: { key: TenantsFilter; label: string; test: (t: TenantRow) => boolean }[] = [
  { key: "no_portal", label: "포털 계정 없음", test: (t) => !t.account_id },
  { key: "no_bill_email", label: "청구서 받을 메일 없음", test: (t) => billMailTarget(t).via === "none" },
  { key: "unpaid", label: "받을 돈 있음", test: (t) => t.unpaid_count > 0 },
]

/** 받침에 맞는 조사(을/를). 한글이 아니면 "을(를)" */
function eulReul(word: string): string {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? "를" : "을"
  return "을(를)"
}

function firstRoomKey(t: TenantRow): string {
  return (t.contract_rooms ?? "").split(/,\s*/)[0] || "￿"
}

function portalText(t: TenantRow): string {
  if (!t.account_id) return "없음"
  return t.account_last_login ? `${relative(t.account_last_login)} 로그인` : "로그인 안 함"
}

export function TenantsPage({ mailEnabled, bank, contactPhone, supportContact }: TenantsPageProps) {
  const router = useRouter()
  const ask = useConfirm()
  const [rows, setRows] = useState<TenantRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [actionError, setActionError] = useState("")
  const [busyId, setBusyId] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const showSkeleton = useDelayedFlag(loading && rows === null)

  const [url, setUrl] = useUrlStates({ tab: "active", q: "", filter: "", tenant: "", card: "overview" })
  const tab: TenantsTab = (TABS as string[]).includes(url.tab) ? (url.tab as TenantsTab) : "active"
  const filters = useMemo(
    () => url.filter.split(",").filter((f): f is TenantsFilter => FILTERS.some((x) => x.key === f)),
    [url.filter],
  )
  const openId = /^\d+$/.test(url.tenant) ? Number(url.tenant) : null
  const cardTab: TenantCardTab = CARD_TABS.some((t) => t.value === url.card) ? (url.card as TenantCardTab) : "overview"

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/tenants", { credentials: "include", cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setRows(data.tenants as TenantRow[])
        setLoadError("")
      } else {
        setLoadError(friendlyError(res.status, data.error, MSG.loadFailed))
      }
    } catch {
      setLoadError(friendlyError(0, null, MSG.loadFailed))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const afterWrite = useCallback(() => {
    void load()
    router.refresh()
  }, [load, router])

  // 기업 카드가 열려 있으면 ⋯ 동작(상태 바꾸기·되돌리기·삭제)의 오류는 카드 안 Notice로, 성공 뒤에는 카드도 다시 읽는다.
  // 카드는 모달 시트라 페이지 맨 위 Notice가 가려 보이지 않기 때문(4.0-6). 토스트 [되돌리기]처럼 나중에 불려도
  // 그때 열린 카드를 보도록 ref로 찾는다.
  const cardSink = useRef<CardActionSink | null>(null)
  const sinkFor = (id: number) => (cardSink.current && cardSink.current.tenantId === id ? cardSink.current : null)
  const clearErrors = (id: number) => {
    setActionError("")
    sinkFor(id)?.setError("")
  }
  const reportError = (id: number, message: string) => {
    const sink = sinkFor(id)
    if (sink) sink.setError(message)
    else setActionError(message)
  }
  const afterAction = (id: number) => {
    afterWrite()
    sinkFor(id)?.refresh()
  }

  // ── 거르기 ──
  const all = rows ?? []
  const counts = {
    active: all.filter((t) => t.status === "active").length,
    moved_out: all.filter((t) => t.status === "moved_out").length,
    all: all.length,
  }
  const inTab = all.filter((t) => tab === "all" || t.status === tab)
  const searched = inTab.filter((t) => matchesTenant(t, url.q))
  const visible = searched
    .filter((t) => filters.every((f) => FILTERS.find((x) => x.key === f)!.test(t)))
    .sort((a, b) => firstRoomKey(a).localeCompare(firstRoomKey(b), "ko", { numeric: true }) || a.name.localeCompare(b.name, "ko"))
  const hasConditions = filters.length > 0 || url.q.trim() !== ""

  const toggleFilter = (key: TenantsFilter) => {
    const next = filters.includes(key) ? filters.filter((f) => f !== key) : [...filters, key]
    setUrl({ filter: next.join(",") || null })
  }
  const clearConditions = () => setUrl({ filter: null, q: null })

  const openCard = (t: TenantRow, card: TenantCardTab = "overview", edit = false) => {
    setEditing(edit)
    setUrl({ tenant: t.id, card })
  }
  const closeCard = () => {
    setEditing(false)
    setUrl({ tenant: null, card: null })
  }

  // ── 상태 바꾸기 ──
  const changeStatus = async (t: TenantRow, status: "active" | "moved_out") => {
    if (busyId !== null) return
    clearErrors(t.id)
    if (status === "moved_out") {
      const ok = await ask({
        title: `‘${t.name}’의 기업 상태를 ‘퇴실’로 바꿀까요?`,
        body: "기업 상태만 바꿔요. 계약과 청구서 기록은 그대로 남아요.",
        consequences: [
          "포털에 로그인할 수 없어 남은 청구서를 포털에서 볼 수 없어요",
          ...(mailEnabled ? ["남은 청구서의 납부 안내 메일도 보내지 않아요"] : []),
          "다시 ‘입주 중’으로 되돌릴 수 있어요",
        ],
        confirmLabel: "퇴실로 바꾸기",
      })
      if (!ok) return
    }
    setBusyId(t.id)
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: t.id, status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        reportError(t.id, friendlyError(res.status, data.error, MSG.saveFailed))
        return
      }
      const undoTo = status === "moved_out" ? "active" : "moved_out"
      toastSuccess(status === "moved_out" ? `${t.name} 기업 상태를 ‘퇴실’로 바꿨어요` : `${t.name} 기업 상태를 ‘입주 중’으로 되돌렸어요`, {
        undo: async () => {
          clearErrors(t.id)
          try {
            const r = await fetch("/api/admin/tenants", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ id: t.id, status: undoTo }),
            })
            const rd = await r.json().catch(() => ({}))
            if (!r.ok || !rd.success) reportError(t.id, friendlyError(r.status, rd.error, "되돌리지 못했어요. 다시 시도해 주세요."))
          } catch {
            reportError(t.id, friendlyError(0, null, "되돌리지 못했어요. 다시 시도해 주세요."))
          }
          afterAction(t.id)
        },
      })
      afterAction(t.id)
    } catch {
      reportError(t.id, friendlyError(0, null, MSG.saveFailed))
    } finally {
      setBusyId(null)
    }
  }

  // ── 삭제 ──
  const remove = async (t: TenantRow) => {
    if (busyId !== null) return
    clearErrors(t.id)
    setBusyId(t.id)
    try {
      const sres = await fetch(`/api/admin/tenants/${t.id}/summary`, { credentials: "include", cache: "no-store" })
      const sdata = await sres.json().catch(() => ({}))
      if (!sres.ok || !sdata.success) {
        reportError(t.id, friendlyError(sres.status, sdata.error, "삭제 전에 기록 건수를 확인하지 못했어요. 다시 눌러 주세요."))
        return
      }
      const s = sdata.summary as TenantSummary
      const ok = await ask({
        title: `‘${t.name}’${eulReul(t.name)} 삭제할까요?`,
        body: "아래 기록이 함께 지워져요.",
        summary: [
          { label: "청구서", value: `${s.impact.bills}건` },
          { label: "계약", value: `${s.impact.contracts}건` },
          { label: "프로그램 신청", value: `${s.impact.applications}건` },
          { label: "제출 자료", value: `${s.impact.submissions ?? 0}건` },
          { label: "포털 계정", value: s.impact.has_account ? "있음(함께 삭제)" : "없음" },
          ...(s.receivable.count > 0 ? [{ label: "받을 돈", value: `${s.receivable.count}건 ${won(s.receivable.total)}` }] : []),
        ],
        consequences: [
          "이 기업의 청구서·계약·신청·제출 기록이 모두 영구 삭제돼요. 되돌릴 수 없어요",
          "퇴실한 기업은 삭제 대신 ‘기업 상태를 퇴실로 바꾸기’를 써 주세요",
        ],
        acknowledge: "청구서·계약 기록도 함께 지워지는 것을 확인했어요",
        confirmLabel: "삭제하기",
        tone: "danger",
      })
      if (!ok) return
      const res = await fetch(`/api/admin/tenants?id=${t.id}`, { method: "DELETE", credentials: "include" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        reportError(t.id, friendlyError(res.status, data.error, MSG.deleteFailed))
        return
      }
      if (openId === t.id) closeCard()
      toastSuccess(`${t.name}${eulReul(t.name)} 삭제했어요`)
      afterWrite()
    } catch {
      reportError(t.id, friendlyError(0, null, MSG.deleteFailed))
    } finally {
      setBusyId(null)
    }
  }

  const rowActions = (t: TenantRow): RowActionItem[] => {
    const items: RowActionItem[] = [
      { label: "정보 수정", onSelect: () => openCard(t, cardTab, true) },
      { label: "포털 계정", onSelect: () => openCard(t, "contact") },
    ]
    if (t.status === "active") {
      const blocked = t.active_contracts > 0
      items.push({
        label: "기업 상태를 ‘퇴실’로 바꾸기",
        onSelect: () => void changeStatus(t, "moved_out"),
        disabled: blocked || busyId === t.id,
        disabledReason: blocked ? `${activeContractSentence(t).replace(/^이 기업은 /, "")}. 호실 현황에서 퇴실 처리해 주세요` : undefined,
      })
    } else {
      items.push({ label: "기업 상태를 ‘입주 중’으로 되돌리기", onSelect: () => void changeStatus(t, "active"), disabled: busyId === t.id })
    }
    items.push({ label: "삭제", onSelect: () => void remove(t), danger: true, disabled: busyId === t.id })
    return items
  }

  // ── 기업 등록 시트 ──
  const createForm = useTenantForm({
    mode: "create",
    tenant: null,
    mailEnabled,
    onSaved: ({ id, name }) => {
      setCreating(false)
      toastSuccess(`${name}${eulReul(name)} 등록했어요`)
      afterWrite()
      setEditing(false)
      setUrl({ tenant: id, card: "overview" })
    },
  })
  const openCreate = () => {
    createForm.reset()
    setCreating(true)
  }
  const closeCreate = async () => {
    if (createForm.dirty) {
      const ok = await ask({
        title: "저장하지 않은 변경이 있어요. 닫을까요?",
        body: "닫으면 입력한 내용이 사라져요.",
        confirmLabel: "저장하지 않고 닫기",
        cancelLabel: "계속 입력하기",
        tone: "danger",
      })
      if (!ok) return
    }
    setCreating(false)
  }

  const listRow = openId !== null ? (all.find((t) => t.id === openId) ?? null) : null
  const showStatus = tab !== "active"

  const recvCell = (t: TenantRow) =>
    t.unpaid_count > 0 ? (
      <span className="whitespace-nowrap">
        {t.unpaid_count}건 <Money value={t.unpaid_total} tone={t.unpaid_late_count > 0 ? "danger" : "default"} />
      </span>
    ) : (
      <span className="text-[#5f6070]">-</span>
    )

  const mailCell = (t: TenantRow) => {
    const m = billMailTarget(t)
    if (m.via === "tax") return <span className="break-all">{m.email}</span>
    if (m.via === "contact")
      return (
        <span>
          <span className="block text-[#5f6070]">담당자 메일을 써요</span>
          <span className="block break-all text-sm text-[#5f6070]">{m.email}</span>
        </span>
      )
    return <ToneBadge tone="warning">없음</ToneBadge>
  }

  // ── 그리기 ──
  let content: ReactNode
  if (rows === null) {
    content = loadError ? (
      <EmptyState kind="error" bordered title="입주기업을 불러오지 못했어요" description={loadError} onRetry={() => void load()} />
    ) : showSkeleton ? (
      <TableSkeleton rows={8} columns={5} label="입주기업을 불러오는 중…" />
    ) : (
      <div className="h-64" aria-busy="true" />
    )
  } else if (all.length === 0) {
    content = (
      <EmptyState
        kind="first-use"
        bordered
        title="아직 등록한 기업이 없어요"
        description="기업을 등록하고 호실 현황에서 입주 처리를 하면 청구가 시작돼요"
        action={
          <Button type="button" onClick={openCreate}>
            <Plus aria-hidden />
            기업 등록
          </Button>
        }
      />
    )
  } else if (visible.length === 0) {
    content = hasConditions ? (
      <EmptyState kind="no-results" bordered title="조건에 맞는 기업이 없어요" onClear={clearConditions} />
    ) : (
      <EmptyState kind="no-results" bordered title={tab === "moved_out" ? "퇴실한 기업이 없어요" : "입주 중인 기업이 없어요"} />
    )
  } else {
    content = (
      <>
        {/* 데스크톱·태블릿: 표 */}
        <div className="hidden overflow-x-auto rounded-md border border-warm-tan bg-card sm:block">
          <Table className="text-[15px]">
            <TableHeader>
              <TableRow className="bg-warm-ivory hover:bg-warm-ivory">
                <TableHead className="min-w-52">기업</TableHead>
                <TableHead>호실(계약 기준)</TableHead>
                <TableHead>청구서 받을 메일</TableHead>
                <TableHead>포털 계정</TableHead>
                <TableHead className="text-right">받을 돈</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">동작</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((t) => (
                <TableRow
                  key={t.id}
                  className={cn("h-14 cursor-pointer hover:bg-warm-ivory", openId === t.id && "bg-warm-beige/60")}
                  onClick={() => openCard(t)}
                >
                  <TableCell className="py-2">
                    <button
                      type="button"
                      className="-my-1 inline-flex min-h-8 items-center py-1 text-left font-medium text-dark underline-offset-2 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation()
                        openCard(t)
                      }}
                    >
                      {t.name}
                    </button>
                    <div className="flex flex-wrap items-center gap-x-2 text-sm text-[#5f6070]">
                      {t.business_no && <span className="tabular-nums">{t.business_no}</span>}
                      {showStatus && <StatusBadge domain="tenant" status={t.status} />}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{roomsLabel(t.contract_rooms) || <span className="text-[#5f6070]">없음</span>}</TableCell>
                  <TableCell className="max-w-64">{mailCell(t)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {t.account_id ? (
                      <span title={t.account_last_login ? dateTime(t.account_last_login) : undefined}>{portalText(t)}</span>
                    ) : (
                      <span className="text-[#5f6070]">없음</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {recvCell(t)}
                    {Number(t.overpaid_balance ?? 0) > 0 && (
                      <div className="text-sm text-[#5f6070]">더 받은 금액 {won(t.overpaid_balance)}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <RowActions label={t.name} items={rowActions(t)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* 휴대폰: 카드 */}
        <ul className="space-y-2 sm:hidden" aria-label="입주기업 목록">
          {visible.map((t) => {
            const m = billMailTarget(t)
            const parts = [
              roomsLabel(t.contract_rooms) || "호실 없음",
              t.unpaid_count > 0 ? `받을 돈 ${t.unpaid_count}건` : null,
              t.account_id ? `포털 ${portalText(t)}` : "포털 계정 없음",
            ].filter(Boolean)
            return (
              <li key={t.id} className="flex items-start gap-1 rounded-md border border-warm-tan bg-card">
                <button type="button" className="min-h-11 min-w-0 flex-1 px-3 py-2.5 text-left" onClick={() => openCard(t)}>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-dark">{t.name}</span>
                    {showStatus && <StatusBadge domain="tenant" status={t.status} />}
                  </span>
                  <span className="mt-0.5 block text-[15px] text-[#3f3f4e] [word-break:keep-all]">{parts.join(" · ")}</span>
                  {(t.unpaid_count > 0 || m.via === "none") && (
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      {t.unpaid_count > 0 && <Money value={t.unpaid_total} tone={t.unpaid_late_count > 0 ? "danger" : "default"} strong />}
                      {m.via === "none" && <ToneBadge tone="warning">청구서 받을 메일 없음</ToneBadge>}
                    </span>
                  )}
                </button>
                <div className="p-1.5">
                  <RowActions label={t.name} items={rowActions(t)} />
                </div>
              </li>
            )
          })}
        </ul>
      </>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="입주기업"
        description="입주기업 정보·청구서 받을 메일·포털 계정을 한곳에서 관리해요"
        help={TENANTS_HELP}
        helpContact={supportContact}
        primary={
          <Button type="button" onClick={openCreate}>
            <Plus aria-hidden />
            기업 등록
          </Button>
        }
        className="mb-4"
      />

      {actionError && (
        <Notice tone="danger" title="처리하지 못했어요" onClose={() => setActionError("")}>
          {actionError}
        </Notice>
      )}

      <div className={cn(actionError && "mt-3")}>
        <FilterBar
          search={{
            value: url.q,
            onChange: (v) => setUrl({ q: v || null }),
            label: "기업 찾기",
            placeholder: "기업명·대표·사업자번호·호실",
          }}
          filters={
            <FilterTabs
              label="기업 상태"
              value={tab}
              onValueChange={(v) => setUrl({ tab: v })}
              options={[
                { value: "active", label: "입주 중", count: rows ? counts.active : null },
                { value: "moved_out", label: "퇴실", count: rows ? counts.moved_out : null },
                { value: "all", label: "전체", count: rows ? counts.all : null },
              ]}
            />
          }
          summary={rows && hasConditions ? <>조회 {visible.length}곳</> : undefined}
          className="mb-2"
        />
        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="조건">
          <span className="text-[15px] text-[#3f3f4e]">조건:</span>
          {FILTERS.map((f) => {
            const on = filters.includes(f.key)
            const n = searched.filter(f.test).length
            return (
              <Button
                key={f.key}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={on}
                onClick={() => toggleFilter(f.key)}
                className={cn(
                  "h-8 gap-1.5 border-warm-tan px-2.5 text-sm font-medium",
                  on ? "border-dark bg-dark text-primary-foreground hover:bg-dark/90 hover:text-primary-foreground" : "bg-card text-dark hover:bg-warm-beige hover:text-dark",
                )}
              >
                {f.label}
                {rows && <span className="tabular-nums">{n}</span>}
              </Button>
            )
          })}
          {hasConditions && (
            <Button type="button" variant="ghost" size="sm" className="h-8 text-link underline underline-offset-2 hover:bg-warm-beige" onClick={clearConditions}>
              조건 지우기
            </Button>
          )}
        </div>
      </div>

      {rows !== null && loadError && (
        <Notice tone="warning" title="목록을 새로 고치지 못했어요" action={<Button size="sm" variant="outline" onClick={() => void load()}>{MSG.retry}</Button>}>
          {loadError}
        </Notice>
      )}

      {content}

      {openId !== null && (
        <TenantCardSheet
          key={openId}
          tenantId={openId}
          listRow={listRow}
          tab={cardTab}
          onTabChange={(v) => setUrl({ card: v })}
          editing={editing}
          onEditingChange={setEditing}
          onClose={closeCard}
          onMissing={() => {
            closeCard()
            toastInfo("이 기업을 찾을 수 없어요(삭제됐을 수 있어요)")
          }}
          actionSink={cardSink}
          onChanged={afterWrite}
          rowActions={rowActions}
          mailEnabled={mailEnabled}
          bank={bank}
          contactPhone={contactPhone}
        />
      )}

      <DetailSheet
        open={creating}
        onOpenChange={(o) => {
          if (!o) setCreating(false)
        }}
        title="기업 등록"
        description="새 입주기업을 등록해요"
        dirty={createForm.dirty}
        size="lg"
        footer={
          <>
            <Button type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" disabled={createForm.saving} onClick={() => void closeCreate()}>
              닫기
            </Button>
            <BusyButton type="button" busy={createForm.saving} busyLabel={MSG.busySave} onClick={() => void createForm.submit()}>
              기업 등록하기
            </BusyButton>
          </>
        }
      >
        {creating ? createForm.body : null}
      </DetailSheet>
    </div>
  )
}
