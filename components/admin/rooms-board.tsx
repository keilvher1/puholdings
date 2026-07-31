"use client"

import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AdminCard } from "@/components/admin/admin-ui"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatWon } from "@/lib/billing"

interface BoardRoom {
  id: number
  code: string
  building: string
  floor: number | null
  pyeong: number | null
  tenant_id: number | null
  tenant_name: string | null
  contract_id: number | null
  ended_at: string | null
  state: "occupied" | "vacant" | "leaving" | "maintenance"
  dday: number | null
}
interface Summary {
  total: number
  occupied: number
  vacant: number
  leaving: number
  occupancy_rate: number
}
interface TenantOption {
  id: number
  name: string
}

const STATE_STYLE: Record<BoardRoom["state"], { label: string; cls: string }> = {
  occupied: { label: "입주중", cls: "border-blue-300 bg-blue-50 text-blue-900" },
  vacant: { label: "공실", cls: "border-warm-tan bg-warm-beige/40 text-text-secondary" },
  leaving: { label: "퇴실예정", cls: "border-orange-300 bg-orange-50 text-orange-900" },
  maintenance: { label: "사용불가", cls: "border-warm-tan bg-[repeating-linear-gradient(45deg,#eee,#eee_6px,#fafafa_6px,#fafafa_12px)] text-text-tertiary" },
}

// 신규 입주 계약은 갱신 여부와 무관하게 21,000원/평 (20,000원은 비갱신 '기존' 계약 전용)
const MOVE_IN_EMPTY = {
  tenant_id: "",
  start_date: "",
  pyeong_billed: "",
  rent_unit_price: "21000",
  mgmt_fee: "15000",
  renewal_type: "new",
  elec_method: "area",
  deposit_actual: "",
  first_month_billing: "full",
}

export function RoomsBoard() {
  const [rooms, setRooms] = useState<BoardRoom[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | BoardRoom["state"]>("all")
  const [selected, setSelected] = useState<BoardRoom | null>(null)

  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [mode, setMode] = useState<"info" | "movein" | "moveout">("info")
  const [busy, setBusy] = useState(false)
  const [moveIn, setMoveIn] = useState<Record<string, string>>({ ...MOVE_IN_EMPTY })
  const [moveOut, setMoveOut] = useState({ ended_at: "", last_month_billing: "full", deposit_returned_amount: "" })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/rooms/board", { credentials: "include" })
      const data = await res.json()
      if (data.success) {
        setRooms(data.rooms)
        setSummary(data.summary)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const loadTenants = useCallback(() => {
    fetch("/api/admin/tenants?status=active", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (d.success) setTenants(d.tenants) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadTenants()
  }, [loadTenants])

  const openRoom = (r: BoardRoom) => {
    setSelected(r)
    setMode("info")
    setMoveIn({
      ...MOVE_IN_EMPTY,
      pyeong_billed: r.pyeong != null ? String(r.pyeong) : "",
      elec_method: r.building === "공장동" ? "metered" : "area",
    })
    setMoveOut({ ended_at: "", last_month_billing: "full", deposit_returned_amount: "" })
  }

  const doMoveIn = async () => {
    if (!selected) return
    if (!moveIn.tenant_id) { alert("입주 기업을 선택하세요"); return }
    if (!moveIn.start_date) { alert("입주일을 입력하세요"); return }
    if (!moveIn.pyeong_billed || !moveIn.rent_unit_price) { alert("부과평형과 평당 임대료를 입력하세요"); return }
    setBusy(true)
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...moveIn, room_id: selected.id }),
      })
      const d = await res.json()
      if (d.success) {
        setSelected(null)
        load()
      } else {
        alert(d.error || "입주 처리에 실패했습니다")
      }
    } catch {
      alert("서버 오류가 발생했습니다")
    } finally {
      setBusy(false)
    }
  }

  const doMoveOut = async () => {
    if (!selected?.contract_id) return
    if (!moveOut.ended_at) { alert("종료일을 입력하세요"); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/contracts/${selected.contract_id}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(moveOut),
      })
      const d = await res.json()
      if (d.success) {
        const o = d.offset
        alert(`퇴실 처리 완료.\n보증금 ${formatWon(o.deposit_actual)}원 − 미납 ${formatWon(o.unpaid_total)}원 = 반환 제안 ${formatWon(o.suggested_return)}원`)
        setSelected(null)
        load()
      } else {
        alert(d.error || "퇴실 처리에 실패했습니다")
      }
    } catch {
      alert("서버 오류가 발생했습니다")
    } finally {
      setBusy(false)
    }
  }

  const buildings = [...new Set(rooms.map((r) => r.building))]
  const shown = filter === "all" ? rooms : rooms.filter((r) => r.state === filter)

  return (
    <div>
      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "전체 호실", value: summary.total, key: "all" as const },
            { label: "입주", value: summary.occupied, key: "occupied" as const },
            { label: "공실", value: summary.vacant, key: "vacant" as const },
            { label: "입주율", value: `${summary.occupancy_rate}%`, key: "all" as const },
          ].map((s, i) => (
            <button
              key={i}
              onClick={() => setFilter(s.key === "all" && i !== 0 ? "all" : (s.key as typeof filter))}
              className="rounded-lg border border-warm-tan bg-card p-4 text-left"
            >
              <p className="text-xs text-text-secondary">{s.label}</p>
              <p className="mt-1 text-2xl font-bold text-dark">{s.value}</p>
            </button>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1">
        {(["all", "occupied", "vacant", "leaving", "maintenance"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-sm ${filter === f ? "bg-dark text-primary-foreground" : "text-text-secondary hover:bg-warm-beige"}`}
          >
            {f === "all" ? "전체" : STATE_STYLE[f].label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-text-secondary">불러오는 중...</p>
      ) : (
        buildings.map((b) => {
          const list = shown.filter((r) => r.building === b)
          if (list.length === 0) return null
          return (
            <div key={b} className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-dark">{b}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {list.map((r) => {
                  const st = STATE_STYLE[r.state]
                  return (
                    <button
                      key={r.id}
                      onClick={() => openRoom(r)}
                      className={`rounded-lg border p-3 text-left transition hover:shadow ${st.cls}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{r.code}</span>
                        {r.state === "leaving" && r.dday !== null && (
                          <span className="text-[10px] font-semibold">D-{r.dday}</span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs">{r.tenant_name || st.label}</p>
                      {r.pyeong != null && <p className="text-[10px] opacity-70">{r.pyeong}평</p>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {selected.building} {selected.code}
                </SheetTitle>
                <SheetDescription>
                  <Badge variant="outline">{STATE_STYLE[selected.state].label}</Badge>
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-3 px-4 pb-6 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">평형</span>
                  <span>{selected.pyeong ?? "-"}평</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">입주 기업</span>
                  <span>{selected.tenant_name || "공실"}</span>
                </div>
                {selected.ended_at && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">종료 예정일</span>
                    <span>{selected.ended_at}</span>
                  </div>
                )}

                {/* 공실 → 입주 처리 */}
                {selected.state === "vacant" && mode === "info" && (
                  <Button className="w-full" onClick={() => { loadTenants(); setMode("movein") }}>입주 처리</Button>
                )}
                {selected.state === "vacant" && mode === "movein" && (
                  <div className="space-y-3 rounded-lg border border-warm-tan p-3">
                    <p className="text-xs font-semibold text-dark">새 입주 계약</p>
                    <div className="grid gap-1.5">
                      <Label>입주 기업</Label>
                      <Select value={moveIn.tenant_id} onValueChange={(v) => setMoveIn({ ...moveIn, tenant_id: v })}>
                        <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>
                          {tenants.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-text-secondary">목록에 없으면 먼저 기업 관리에서 등록하세요.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5"><Label>입주일</Label><Input type="date" value={moveIn.start_date} onChange={(e) => setMoveIn({ ...moveIn, start_date: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label>부과평형</Label><Input type="number" step="0.1" value={moveIn.pyeong_billed} onChange={(e) => setMoveIn({ ...moveIn, pyeong_billed: e.target.value })} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5"><Label>계약구분</Label>
                        <Select value={moveIn.renewal_type} onValueChange={(v) => setMoveIn({ ...moveIn, renewal_type: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="new">비갱신</SelectItem><SelectItem value="renewal">갱신</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5"><Label>평당 임대료</Label><Input type="number" value={moveIn.rent_unit_price} onChange={(e) => setMoveIn({ ...moveIn, rent_unit_price: e.target.value })} /></div>
                    </div>
                    <p className="text-[11px] text-text-secondary">신규 입주는 계약구분과 무관하게 21,000원/평입니다 (20,000원은 비갱신 기존 계약 전용).</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5"><Label>관리비</Label><Input type="number" value={moveIn.mgmt_fee} onChange={(e) => setMoveIn({ ...moveIn, mgmt_fee: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label>실보증금</Label><Input type="number" value={moveIn.deposit_actual} onChange={(e) => setMoveIn({ ...moveIn, deposit_actual: e.target.value })} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5"><Label>전기 방식</Label>
                        <Select value={moveIn.elec_method} onValueChange={(v) => setMoveIn({ ...moveIn, elec_method: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="area">면적별</SelectItem><SelectItem value="metered">실사용(공장동)</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5"><Label>첫 달 청구</Label>
                        <Select value={moveIn.first_month_billing} onValueChange={(v) => setMoveIn({ ...moveIn, first_month_billing: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="full">전액</SelectItem><SelectItem value="prorated">일할</SelectItem><SelectItem value="none">없음</SelectItem></SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button className="flex-1" onClick={doMoveIn} disabled={busy}>{busy ? "처리 중..." : "입주 확정"}</Button>
                      <Button variant="outline" onClick={() => setMode("info")} disabled={busy}>취소</Button>
                    </div>
                  </div>
                )}

                {/* 입주중/퇴실예정 → 퇴실 처리 */}
                {(selected.state === "occupied" || selected.state === "leaving") && selected.contract_id && mode === "info" && (
                  <Button variant="outline" className="w-full" onClick={() => setMode("moveout")}>퇴실 처리</Button>
                )}
                {(selected.state === "occupied" || selected.state === "leaving") && selected.contract_id && mode === "moveout" && (
                  <div className="space-y-3 rounded-lg border border-warm-tan p-3">
                    <p className="text-xs font-semibold text-dark">퇴실 처리 — {selected.tenant_name}</p>
                    <div className="grid gap-1.5"><Label>종료일</Label><Input type="date" value={moveOut.ended_at} onChange={(e) => setMoveOut({ ...moveOut, ended_at: e.target.value })} /></div>
                    <div className="grid gap-1.5"><Label>마지막 달 청구</Label>
                      <Select value={moveOut.last_month_billing} onValueChange={(v) => setMoveOut({ ...moveOut, last_month_billing: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="full">전액</SelectItem><SelectItem value="prorated">일할</SelectItem><SelectItem value="none">없음</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5"><Label>보증금 반환액 (비우면 상계 제안값)</Label><Input type="number" value={moveOut.deposit_returned_amount} onChange={(e) => setMoveOut({ ...moveOut, deposit_returned_amount: e.target.value })} /></div>
                    <div className="flex gap-2 pt-1">
                      <Button className="flex-1" onClick={doMoveOut} disabled={busy}>{busy ? "처리 중..." : "퇴실 확정"}</Button>
                      <Button variant="outline" onClick={() => setMode("info")} disabled={busy}>취소</Button>
                    </div>
                  </div>
                )}

                {mode === "info" && (
                  <AdminCard className="p-3 text-xs text-text-secondary">
                    {selected.state === "vacant"
                      ? "위 버튼으로 바로 입주 계약을 만들거나, 설정 > 계약 관리에서 등록할 수 있습니다."
                      : "계약 조건 수정은 설정 > 계약 관리에서 진행합니다."}
                  </AdminCard>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
