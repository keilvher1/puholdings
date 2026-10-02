"use client"

// 기준 정보 > 계약 — 기업·호실 검색 + 상태 보기 + 주소 조건(?tenant= ?contract= ?rent= ?mgmt=). 행을 누르면 오른쪽 계약 시트.
// [퇴실] 버튼은 두지 않는다 — ⋯ 안 "호실 현황에서 퇴실 처리"가 /admin/rooms?room=코드&action=moveout을 연다(퇴실은 한 곳, 4.3).

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  EmptyState,
  FilterBar,
  FilterTabs,
  Notice,
  RowActions,
  StatusBadge,
  TableSkeleton,
  toastSuccess,
  useDelayedFlag,
  useUrlStates,
} from "@/components/saas"
import { num, won, wonNum } from "@/lib/format"
import { MSG, friendlyError } from "@/lib/messages"
import { billsHref, roomsHref, tenantsHref } from "@/lib/links"
import type { ContractRow } from "./contract-sheet-model"
import { ContractSheet } from "./contract-sheet"
import type { DraftBillsInfo } from "./billing-settings"
import { getJson, type RoomRow, type TenantRow } from "./types"
import { CONTRACT_FILTER_DEFAULTS } from "./url-keys"

type LoadState = "loading" | "error" | "ready"

const ELEC_LABEL: Record<string, string> = { area: "면적 배분", metered: "계량기" }

export function ContractsTab({ draftBills }: { draftBills: DraftBillsInfo | null }) {
  const router = useRouter()
  const [url, setUrl] = useUrlStates({ contract: "", ...CONTRACT_FILTER_DEFAULTS })
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [state, setState] = useState<LoadState>("loading")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [justCreated, setJustCreated] = useState<number | null>(null)
  // 기업·호실 목록(계약 직접 추가용) 불러오기 실패 — 시트에서 "맞는 기업이 없어요"로 잘못 보이지 않게 따로 둔다
  const [optionsFailed, setOptionsFailed] = useState(false)
  const showSkeleton = useDelayedFlag(state === "loading")

  const load = useCallback(async () => {
    const [c, t, r] = await Promise.all([
      getJson<{ contracts: ContractRow[] }>("/api/admin/contracts"),
      getJson<{ tenants: TenantRow[] }>("/api/admin/tenants?status=active"),
      getJson<{ rooms: RoomRow[] }>("/api/admin/rooms"),
    ])
    if (!c.ok || !c.data) {
      setLoadError(friendlyError(c.status, c.error, MSG.loadFailed))
      setState("error")
      return
    }
    setContracts(c.data.contracts)
    // 기업·호실 목록은 "계약 직접 추가"에만 쓴다. 실패해도 계약 목록은 보이고, 시트 안에서 알린다
    if (t.ok && t.data) setTenants(t.data.tenants)
    if (r.ok && r.data) setRooms(r.data.rooms)
    setOptionsFailed(!(t.ok && t.data) || !(r.ok && r.data))
    setLoadError(null)
    setState("ready")
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  // ── 거르기 ────────────────────────────────────────────────────────────────
  const tenantFilter = /^\d+$/.test(url.tenant) ? Number(url.tenant) : null
  const rentFilter = /^\d+$/.test(url.rent) ? Number(url.rent) : null
  const mgmtFilter = /^\d+$/.test(url.mgmt) ? Number(url.mgmt) : null
  const status = url.status === "ended" || url.status === "all" ? url.status : "active"
  const q = url.q.trim().toLowerCase()

  const base = useMemo(
    () =>
      contracts.filter(
        (c) =>
          (tenantFilter === null || c.tenant_id === tenantFilter) &&
          (rentFilter === null || Math.round(Number(c.rent_unit_price)) === rentFilter) &&
          (mgmtFilter === null || Math.round(Number(c.mgmt_fee)) === mgmtFilter) &&
          (!q || c.tenant_name.toLowerCase().includes(q) || c.room_code.toLowerCase().includes(q)),
      ),
    [contracts, tenantFilter, rentFilter, mgmtFilter, q],
  )
  const counts = useMemo(
    () => ({ active: base.filter((c) => c.status === "active").length, ended: base.filter((c) => c.status !== "active").length, all: base.length }),
    [base],
  )
  const rows = status === "all" ? base : base.filter((c) => (status === "active" ? c.status === "active" : c.status !== "active"))

  const tenantName = tenantFilter !== null ? contracts.find((c) => c.tenant_id === tenantFilter)?.tenant_name ?? `기업 #${tenantFilter}` : null
  const chips = [
    tenantName ? { label: `기업: ${tenantName}`, onRemove: () => setUrl({ tenant: null }) } : null,
    rentFilter !== null ? { label: `평당 임대료: ${won(rentFilter)}`, onRemove: () => setUrl({ rent: null }) } : null,
    mgmtFilter !== null ? { label: `관리비: ${won(mgmtFilter)}`, onRemove: () => setUrl({ mgmt: null }) } : null,
  ].filter((x): x is { label: string; onRemove: () => void } => x !== null)
  const hasFilter = chips.length > 0 || !!q

  // ── 시트 ──────────────────────────────────────────────────────────────────
  const openId = url.contract
  const isNew = openId === "new"
  const openRow = !isNew && /^\d+$/.test(openId) ? contracts.find((c) => c.id === Number(openId)) ?? null : null
  const missing = state === "ready" && !!openId && !isNew && !openRow
  const sheetOpen = isNew || !!openRow
  const closeSheet = () => {
    setJustCreated(null)
    setUrl({ contract: null })
  }

  const [retryingOptions, setRetryingOptions] = useState(false)
  const reloadOptions = async () => {
    if (retryingOptions) return
    setRetryingOptions(true)
    try {
      const [t, r] = await Promise.all([
        getJson<{ tenants: TenantRow[] }>("/api/admin/tenants?status=active"),
        getJson<{ rooms: RoomRow[] }>("/api/admin/rooms"),
      ])
      if (t.ok && t.data) setTenants(t.data.tenants)
      if (r.ok && r.data) setRooms(r.data.rooms)
      setOptionsFailed(!(t.ok && t.data) || !(r.ok && r.data))
    } finally {
      setRetryingOptions(false)
    }
  }

  const afterWrite = async () => {
    await load()
    router.refresh() // 단가 요약·사이드바 배지 다시 읽기(2.0)
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="text-[15px] leading-relaxed text-text-secondary [word-break:keep-all]">
          입주·퇴실은{" "}
          <Link href={roomsHref()} className="text-link underline underline-offset-2 hover:text-dark">
            호실 현황
          </Link>
          에서 처리해요. 여기서는 계약 조건(면적·단가·관리비·청구 방식)을 고쳐요.
        </p>
        <Button type="button" variant="outline" className="hover:bg-warm-beige" onClick={() => setUrl({ contract: "new" })}>
          <Plus aria-hidden />
          계약 직접 추가
        </Button>
      </div>

      {missing && (
        <Notice tone="warning" onClose={() => setUrl({ contract: null })} className="mb-3">
          주소의 계약을 찾을 수 없어요. 이미 지워졌을 수 있어요.
        </Notice>
      )}

      <FilterBar
        search={{ value: url.q, onChange: (v) => setUrl({ q: v }), label: "기업·호실 검색", placeholder: "기업 이름이나 호실" }}
        filters={
          <FilterTabs
            label="계약 상태"
            value={status}
            onValueChange={(v) => setUrl({ status: v })}
            options={[
              { value: "active", label: "진행 중", count: state === "ready" ? counts.active : null },
              { value: "ended", label: "종료", count: state === "ready" ? counts.ended : null },
              { value: "all", label: "전체", count: state === "ready" ? counts.all : null },
            ]}
          />
        }
        chips={chips}
        onClearAll={hasFilter ? () => setUrl({ q: null, tenant: null, rent: null, mgmt: null }) : undefined}
        summary={state === "ready" ? <>계약 {rows.length}건</> : null}
      />

      {state === "error" ? (
        <EmptyState kind="error" title="계약을 불러오지 못했어요" description={loadError ?? undefined} onRetry={() => { setState("loading"); void load() }} bordered />
      ) : state === "loading" ? (
        showSkeleton ? <TableSkeleton rows={8} columns={6} label="계약을 불러오는 중…" /> : <div className="h-40" aria-hidden />
      ) : rows.length === 0 ? (
        hasFilter ? (
          <EmptyState kind="no-results" title="조건에 맞는 계약이 없어요" onClear={() => setUrl({ q: null, tenant: null, rent: null, mgmt: null })} bordered />
        ) : (
          <EmptyState
            kind="first-use"
            title={status === "ended" ? "종료한 계약이 없어요" : "아직 계약이 없어요"}
            description="입주 처리를 하면 여기에 계약이 생겨요"
            action={
              <Button asChild>
                <Link href={roomsHref({ state: "vacant" })}>호실 현황에서 입주 처리</Link>
              </Button>
            }
            bordered
          />
        )
      ) : (
        <div className="overflow-hidden rounded-md border border-warm-tan bg-card">
          <Table className="text-[15px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-11 text-[#3f3f4e]">기업</TableHead>
                <TableHead className="hidden h-11 text-[#3f3f4e] sm:table-cell">호실</TableHead>
                <TableHead className="hidden h-11 text-right text-[#3f3f4e] sm:table-cell">부과 면적</TableHead>
                <TableHead className="h-11 text-right text-[#3f3f4e]">
                  <span className="hidden sm:inline">평당 임대료(원)</span>
                  <span className="sm:hidden">임대료·관리비(원)</span>
                </TableHead>
                <TableHead className="hidden h-11 text-right text-[#3f3f4e] sm:table-cell">관리비(원)</TableHead>
                <TableHead className="hidden h-11 text-[#3f3f4e] md:table-cell">전기료</TableHead>
                {status !== "active" && <TableHead className="hidden h-11 text-[#3f3f4e] sm:table-cell">상태</TableHead>}
                <TableHead className="h-11 w-12">
                  <span className="sr-only">동작</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-warm-ivory"
                  onClick={(e) => {
                    // ⋯ 메뉴·링크를 누른 것은 시트를 열지 않는다
                    if ((e.target as HTMLElement).closest("button, a, [role=menu]")) return
                    setUrl({ contract: String(c.id) })
                  }}
                >
                  <TableCell className="min-h-11 py-2.5 whitespace-normal">
                    <button
                      type="button"
                      onClick={() => setUrl({ contract: String(c.id) })}
                      className="text-left font-medium text-dark underline-offset-2 hover:underline"
                    >
                      {c.tenant_name}
                    </button>
                    <span className="mt-0.5 block text-sm text-text-secondary [word-break:keep-all] sm:hidden">
                      {c.room_code} · {num(c.pyeong_billed, 1)}평 · {ELEC_LABEL[c.elec_method] ?? c.elec_method}
                      {c.status !== "active" ? " · 종료" : ""}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{c.room_code}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{num(c.pyeong_billed, 1)}평</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {wonNum(c.rent_unit_price)}
                    <span className="block text-sm text-text-secondary sm:hidden">관리비 {wonNum(c.mgmt_fee)}</span>
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{wonNum(c.mgmt_fee)}</TableCell>
                  <TableCell className="hidden md:table-cell">{ELEC_LABEL[c.elec_method] ?? c.elec_method}</TableCell>
                  {status !== "active" && (
                    <TableCell className="hidden sm:table-cell">
                      <StatusBadge domain="contract" status={c.status} />
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <RowActions
                      label={`${c.tenant_name} ${c.room_code} 계약`}
                      items={[
                        { label: "계약 조건 고치기", onSelect: () => setUrl({ contract: String(c.id) }) },
                        { label: "기업 카드 보기", href: tenantsHref({ tenant: c.tenant_id, card: "contract" }) },
                        { label: "이 기업 청구서 보기", href: billsHref({ tenant: c.tenant_id }) },
                        ...(c.status === "active"
                          ? [{ label: "호실 현황에서 퇴실 처리", href: roomsHref({ room: c.room_code, action: "moveout" }) }]
                          : []),
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {sheetOpen && (
        <ContractSheet
          key={openRow ? openRow.id : "new"}
          open
          onOpenChange={(o) => {
            if (!o) closeSheet()
          }}
          row={openRow}
          tenants={tenants}
          rooms={rooms}
          optionsFailed={optionsFailed}
          retryingOptions={retryingOptions}
          onRetryOptions={() => void reloadOptions()}
          draftBills={draftBills}
          justSaved={!!openRow && justCreated === openRow.id}
          onSaved={() => void afterWrite()}
          onCreated={(id) => {
            setJustCreated(id)
            toastSuccess("계약을 추가했어요")
            void afterWrite().then(() => setUrl({ contract: String(id) }))
          }}
        />
      )}
    </div>
  )
}
