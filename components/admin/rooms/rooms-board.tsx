"use client"

// 호실 현황 보드(계획서 4.3.1). 입주율 한 줄 + 범례 겸 필터 + 건물 > 층 줄 + 검색 + 호실 시트.
// 주소: ?state=(occupied|leaving|vacant|unavailable) · ?q= · ?room=호실코드(시트 열기) · ?action=movein|moveout(그 흐름 열기)
// ?action=은 **새로 불러온 지금 상태**로 판단한다(movein은 공실만, moveout은 진행 중 계약이 있을 때만). 완료 뒤에는 action을 지운다.
// 호실 상태는 board API가 진행 중 계약에서 파생한다(저장하지 않음, 가드 #11). 공실에만 [입주 처리].

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EmptyState, FilterTabs, useDelayedFlag, useUrlStates } from "@/components/saas"
import { MSG } from "@/lib/messages"
import { statusMeta } from "@/lib/status"
import { RoomsBoardSkeleton } from "./board-skeleton"
import { LegendSwatch, RoomTile } from "./room-tile"
import { RoomSheet, type SheetMode } from "./room-sheet"
import type { TenantOption } from "./move-in-form"
import {
  canOpenAction,
  groupByFloor,
  legendCounts,
  legendOf,
  matchRoom,
  occupancy,
  parseLegend,
  visibleLegendKeys,
  type BoardRoom,
  type LegendKey,
} from "./move-model"

/** 범례 이름은 lib/status.ts 사전(room)에서 읽는다(용어를 한 곳에서 바꾸게) */
const legendLabel = (k: LegendKey): string => (k === "all" ? "전체" : statusMeta("room", k).label)

const EMPTY_TEXT: Record<Exclude<LegendKey, "all">, string> = {
  occupied: "입주 중인 호실이 없어요",
  leaving: "퇴실 예정인 호실이 없어요",
  vacant: "공실이 없어요",
  unavailable: "사용 불가 호실이 없어요",
}

export function RoomsBoard() {
  const [rooms, setRooms] = useState<BoardRoom[]>([])
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading")
  const [tenants, setTenants] = useState<TenantOption[] | null>(null)
  const [tenantsError, setTenantsError] = useState(false)
  const [url, setUrl] = useUrlStates({ state: "", q: "", room: "", action: "" })
  const [mode, setMode] = useState<SheetMode>("info")
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const handledRef = useRef<string | null>(null)
  const showSkeleton = useDelayedFlag(status === "loading" && rooms.length === 0)

  const legend = parseLegend(url.state)
  const q = url.q

  /** 보드를 다시 읽는다. 성공하면 새 목록을 돌려준다(입주 직전 공실 재확인에도 쓴다) */
  const load = useCallback(async (): Promise<BoardRoom[] | null> => {
    try {
      const res = await fetch("/api/admin/rooms/board", { credentials: "include", cache: "no-store" })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) throw new Error("load")
      setRooms(data.rooms)
      setStatus("ready")
      return data.rooms as BoardRoom[]
    } catch {
      setStatus((s) => (s === "ready" ? s : "error"))
      return null
    }
  }, [])

  const loadTenants = useCallback(async () => {
    try {
      // 퇴실한 기업도 함께 받는다: 다시 들어오는 기업을 "새 기업으로 등록"해 두 번 만들지 않게(목록에서 ‘퇴실한 기업’으로 보인다)
      const res = await fetch("/api/admin/tenants", { credentials: "include", cache: "no-store" })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.success) throw new Error("tenants")
      setTenants(
        (d.tenants as { id: number; name: string; status?: string | null }[]).map((t) => ({
          id: Number(t.id),
          name: t.name,
          status: t.status === "moved_out" ? "moved_out" : "active",
        })),
      )
      setTenantsError(false)
    } catch {
      setTenantsError(true)
    }
  }, [])

  useEffect(() => {
    void load()
    void loadTenants()
  }, [load, loadTenants])

  // ?room=&action= — 보드를 새로 불러온 뒤 한 번만 판단한다
  useEffect(() => {
    if (status !== "ready") return
    const key = `${url.room}|${url.action}`
    if (handledRef.current === key) return
    handledRef.current = key
    if (!url.room) return
    const room = rooms.find((r) => r.code === url.room)
    if (!room) {
      handledRef.current = "|"
      setUrl({ room: null, action: null })
      return
    }
    // action을 주소에서 지울 때는 지운 뒤의 주소도 "이미 처리함"으로 적어 둔다(안내가 바로 지워지지 않게)
    if (url.action === "movein" || url.action === "moveout") {
      const can = canOpenAction(room, url.action)
      if (can.ok) {
        setMode(url.action)
        setActionNotice(null)
      } else {
        setMode("info")
        setActionNotice(`${room.code}호는 ${can.reason}`)
        handledRef.current = `${room.code}|`
        setUrl({ action: null })
      }
    } else {
      setMode("info")
      setActionNotice(null)
      if (url.action) {
        handledRef.current = `${room.code}|`
        setUrl({ action: null })
      }
    }
  }, [status, rooms, url.room, url.action, setUrl])

  const selected = useMemo(() => (url.room ? rooms.find((r) => r.code === url.room) ?? null : null), [rooms, url.room])

  const openRoom = (r: BoardRoom) => {
    handledRef.current = `${r.code}|`
    setMode("info")
    setActionNotice(null)
    setUrl({ room: r.code, action: null })
  }
  const closeSheet = () => {
    handledRef.current = "|"
    setMode("info")
    setActionNotice(null)
    setUrl({ room: null, action: null })
  }
  const changeMode = (m: SheetMode) => {
    if (!selected) return
    handledRef.current = `${selected.code}|${m === "info" ? "" : m}`
    setMode(m)
    setActionNotice(null)
    setUrl({ action: m === "info" ? null : m })
  }
  /** 입주·퇴실을 마치면 주소에서 action을 지운다(새로고침·뒤로 가기가 흐름을 다시 열지 않게). 시트와 결과 카드는 그대로 */
  const finishAction = () => {
    if (!selected) return
    handledRef.current = `${selected.code}|`
    setUrl({ action: null })
  }

  const counts = useMemo(() => legendCounts(rooms), [rooms])
  const occ = useMemo(() => occupancy(rooms), [rooms])
  const legendKeys = visibleLegendKeys(counts, legend)
  const shown = legend === "all" ? rooms : rooms.filter((r) => legendOf(r.state) === legend)
  const groups = groupByFloor(shown)
  const matches = q.trim() ? shown.filter((r) => matchRoom(r, q) === true) : []

  const tenantRooms = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const r of rooms) if (r.tenant_id) m.set(r.tenant_id, [...(m.get(r.tenant_id) ?? []), r.code])
    return m
  }, [rooms])

  if (status === "error" && rooms.length === 0) {
    return (
      <EmptyState
        kind="error"
        title="호실 현황을 불러오지 못했어요"
        description={MSG.network}
        onRetry={() => {
          setStatus("loading")
          void load()
        }}
        bordered
      />
    )
  }
  if (status === "loading" && rooms.length === 0) return showSkeleton ? <RoomsBoardSkeleton /> : <div className="min-h-64" aria-busy="true" />

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base text-dark">
          입주율 <strong className="font-semibold tabular-nums">{occ.rate}%</strong>
          <span className="ml-1 text-text-secondary tabular-nums">
            ({occ.total}실 중 {occ.occupied}실
            {/* 범례의 "입주 중" 숫자와 달라 보이지 않게, 퇴실 예정도 입주율에 들어간다는 것을 적는다 */}
            {counts.leaving > 0 ? ` · 퇴실 예정 ${counts.leaving}실 포함` : ""})
          </span>
        </p>
        <div className="w-full sm:w-72">
          <Label htmlFor="room-search" className="sr-only">
            기업명·호실 찾기
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5f6070]" aria-hidden />
            <Input
              id="room-search"
              type="search"
              value={q}
              placeholder="기업명·호실 찾기"
              onChange={(e) => setUrl({ q: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches.length === 1) {
                  e.preventDefault()
                  openRoom(matches[0])
                }
              }}
              aria-describedby="room-search-result"
              className="h-10 bg-card pl-9 text-base md:text-base"
            />
          </div>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <FilterTabs
          wrap
          label="호실 상태로 거르기(범례)"
          value={legend}
          onValueChange={(v) => setUrl({ state: v === "all" ? null : v })}
          options={legendKeys.map((k) => ({
            value: k,
            label: legendLabel(k),
            count: counts[k],
            swatch: k !== "all" ? <LegendSwatch kind={k} /> : undefined,
          }))}
        />
      </div>
      <p id="room-search-result" aria-live="polite" className="mb-4 min-h-6 text-sm text-text-secondary">
        {q.trim()
          ? matches.length === 0
            ? `‘${q.trim()}’에 맞는 호실이 없어요`
            : matches.length === 1
              ? `${matches[0].code}호가 맞아요. Enter를 누르면 열려요`
              : `맞는 호실 ${matches.length}칸`
          : ""}
      </p>

      {shown.length === 0 ? (
        <EmptyState
          kind="no-results"
          title={legend === "all" ? "등록한 호실이 없어요" : EMPTY_TEXT[legend]}
          description={legend === "leaving" ? "퇴실 처리는 계약을 바로 끝내요. 퇴실 예정은 퇴실일이 오늘 이후인 진행 중 계약이에요." : undefined}
          onClear={legend === "all" ? undefined : () => setUrl({ state: null })}
          clearLabel="모든 호실 보기"
          bordered
        />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.building} aria-labelledby={`bld-${g.building}`}>
              <h2 id={`bld-${g.building}`} className="mb-2 text-lg font-semibold text-dark">
                {g.building}
              </h2>
              <div className="divide-y divide-warm-tan border-y border-warm-tan">
                {g.floors.map((f) => (
                  <div key={String(f.floor)} className="grid gap-2 py-3 sm:grid-cols-[3.5rem_1fr]">
                    <h3 className="text-[15px] font-semibold text-[#3f3f4e] sm:pt-2">{f.floor === null ? "층 없음" : `${f.floor}층`}</h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]">
                      {f.rooms.map((r) => (
                        <RoomTile key={r.id} room={r} match={matchRoom(r, q)} selected={selected?.id === r.id} onOpen={() => openRoom(r)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <RoomSheet
        room={selected}
        mode={mode}
        onModeChange={changeMode}
        actionNotice={actionNotice}
        onDismissNotice={() => setActionNotice(null)}
        onClose={closeSheet}
        onReload={load}
        onActionDone={finishAction}
        tenants={tenants}
        tenantsError={tenantsError}
        onRetryTenants={loadTenants}
        onTenantCreated={(t) => setTenants((prev) => (prev && !prev.some((p) => p.id === t.id) ? [...prev, t] : prev))}
        tenantRooms={tenantRooms}
      />
    </div>
  )
}
