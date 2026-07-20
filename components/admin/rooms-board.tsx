"use client"

import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
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

const STATE_STYLE: Record<BoardRoom["state"], { label: string; cls: string }> = {
  occupied: { label: "입주중", cls: "border-blue-300 bg-blue-50 text-blue-900" },
  vacant: { label: "공실", cls: "border-warm-tan bg-warm-beige/40 text-text-secondary" },
  leaving: { label: "퇴실예정", cls: "border-orange-300 bg-orange-50 text-orange-900" },
  maintenance: { label: "사용불가", cls: "border-warm-tan bg-[repeating-linear-gradient(45deg,#eee,#eee_6px,#fafafa_6px,#fafafa_12px)] text-text-tertiary" },
}

export function RoomsBoard() {
  const [rooms, setRooms] = useState<BoardRoom[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | BoardRoom["state"]>("all")
  const [selected, setSelected] = useState<BoardRoom | null>(null)

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
                      onClick={() => setSelected(r)}
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
        <SheetContent>
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
              <div className="mt-4 space-y-3 px-4 text-sm">
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
                <AdminCard className="p-3 text-xs text-text-secondary">
                  {selected.state === "vacant"
                    ? "입주 계약 만들기: 설정 > 계약 관리에서 이 호실로 새 계약을 등록하세요."
                    : "계약 정보·퇴실 처리는 설정 > 계약 관리에서 진행합니다."}
                </AdminCard>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
