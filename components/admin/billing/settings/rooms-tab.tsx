"use client"

// 기준 정보 > 호실 — 호실 추가와 면적·사용 여부 수정만 여기서 한다. 입주·공실·퇴실 상태는 호실 현황에서 본다(계획서 4.3.9).
// PUT /api/admin/rooms도 전체 덮어쓰기라 GET 행의 모든 칸(메모·면적(m²)·정렬 순서 포함)을 그대로 두고 고친 칸만 바꿔 보낸다.

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  BusyButton,
  EmptyState,
  ErrorSummary,
  Notice,
  StatusBadge,
  TableSkeleton,
  UnitInput,
  toastSuccess,
  useDelayedFlag,
  useFieldErrors,
} from "@/components/saas"
import { num } from "@/lib/format"
import { roomsHref } from "@/lib/links"
import { MSG, friendlyError } from "@/lib/messages"
import { errorDetail, getJson, sendJson, type RoomRow } from "./types"

type LoadState = "loading" | "error" | "ready"

interface RoomForm {
  code: string
  building: "본관" | "공장동"
  floor: string
  pyeong: string | null
  status: "available" | "maintenance"
}
const EMPTY_ROOM: RoomForm = { code: "", building: "본관", floor: "", pyeong: null, status: "available" }
const ROOM_LABELS = { code: "호실 코드", floor: "층" }

export function RoomsTab() {
  const router = useRouter()
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [state, setState] = useState<LoadState>("loading")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<RoomRow | "new" | null>(null)
  const showSkeleton = useDelayedFlag(state === "loading")

  const load = useCallback(async () => {
    const r = await getJson<{ rooms: RoomRow[] }>("/api/admin/rooms")
    if (!r.ok || !r.data) {
      setLoadError(friendlyError(r.status, r.error, MSG.loadFailed))
      setState("error")
      return
    }
    setRooms(r.data.rooms)
    setState("ready")
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      {/* 휴대폰: 안내를 한 줄 전체 폭으로, [호실 추가]는 그 아래. sm부터 나란히 */}
      <div className="mb-3 flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
        <Notice tone="info" className="w-full min-w-0 sm:w-auto sm:flex-1">
          호실 상태(입주·공실·퇴실)는 호실 현황에서 봐요.{" "}
          <Link href={roomsHref()} className="inline-flex items-center gap-0.5 text-link underline underline-offset-2 hover:text-dark">
            호실 현황 열기
            <ChevronRight className="size-4" aria-hidden />
          </Link>
          <span className="mt-0.5 block text-[15px] text-text-secondary">여기서는 호실 추가와 면적·사용 여부만 고쳐요.</span>
        </Notice>
        <Button type="button" variant="outline" className="shrink-0 hover:bg-warm-beige" onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          호실 추가
        </Button>
      </div>

      {state === "error" ? (
        <EmptyState kind="error" title="호실을 불러오지 못했어요" description={loadError ?? undefined} onRetry={() => { setState("loading"); void load() }} bordered />
      ) : state === "loading" ? (
        showSkeleton ? <TableSkeleton rows={8} columns={4} label="호실을 불러오는 중…" /> : <div className="h-40" aria-hidden />
      ) : rooms.length === 0 ? (
        <EmptyState
          kind="first-use"
          title="아직 등록한 호실이 없어요"
          description="호실을 추가하면 입주 처리와 계약에 쓸 수 있어요"
          action={<Button onClick={() => setEditing("new")}>호실 추가</Button>}
          bordered
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-warm-tan bg-card">
          <Table className="text-[15px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-11 text-[#3f3f4e]">호실</TableHead>
                <TableHead className="h-11 text-[#3f3f4e]">건물</TableHead>
                <TableHead className="hidden h-11 text-right text-[#3f3f4e] sm:table-cell">층</TableHead>
                <TableHead className="h-11 text-right text-[#3f3f4e]">면적</TableHead>
                <TableHead className="hidden h-11 text-[#3f3f4e] md:table-cell">지금 입주 기업</TableHead>
                <TableHead className="h-11 w-20">
                  <span className="sr-only">동작</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((r) => (
                <TableRow key={r.id} className="hover:bg-warm-ivory">
                  <TableCell className="py-2.5 font-medium text-dark">
                    {r.code}
                    {r.status === "maintenance" && <StatusBadge domain="room" status="maintenance" className="ml-2" />}
                  </TableCell>
                  <TableCell>{r.building}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{r.floor ?? "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.pyeong != null ? `${num(r.pyeong, 1)}평` : "-"}</TableCell>
                  <TableCell className="hidden text-text-secondary md:table-cell">{r.tenant_name || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-8 text-[15px] text-dark hover:bg-warm-beige"
                      onClick={() => setEditing(r)}
                      aria-label={`${r.code} 호실 고치기`}
                    >
                      고치기
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <RoomDialog
          key={editing === "new" ? "new" : editing.id}
          room={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(created) => {
            setEditing(null)
            toastSuccess(created ? "호실을 추가했어요" : "호실을 저장했어요")
            void load()
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function RoomDialog({ room, onClose, onSaved }: { room: RoomRow | null; onClose: () => void; onSaved: (created: boolean) => void }) {
  const [form, setForm] = useState<RoomForm>(() =>
    room
      ? {
          code: room.code,
          building: room.building === "공장동" ? "공장동" : "본관",
          floor: room.floor != null ? String(room.floor) : "",
          pyeong: room.pyeong != null ? String(room.pyeong) : null,
          status: room.status === "maintenance" ? "maintenance" : "available",
        }
      : { ...EMPTY_ROOM },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fe = useFieldErrors(ROOM_LABELS)

  const save = async () => {
    if (busy) return
    setError(null)
    const floorOk = form.floor.trim() === "" || /^-?\d+$/.test(form.floor.trim())
    if (!fe.check({ code: !form.code.trim() && "호실 코드를 입력해 주세요", floor: !floorOk && "층은 숫자로 입력해 주세요" })) return
    setBusy(true)
    try {
      // 수정: GET 행 전체 + 고친 칸(메모·면적(m²)·정렬 순서가 지워지지 않게)
      const body = {
        ...(room ?? {}),
        code: form.code.trim(),
        building: form.building,
        floor: form.floor.trim() === "" ? null : Number(form.floor.trim()),
        pyeong: form.pyeong,
        status: form.status,
        memo: room?.memo ?? null,
        area_m2: room?.area_m2 ?? null,
        sort_order: room?.sort_order ?? 0,
      }
      const r = await sendJson("/api/admin/rooms", room ? "PUT" : "POST", body)
      if (!r.ok) {
        setError(friendlyError(r.status, r.status >= 500 ? null : r.error, MSG.saveFailed))
        return
      }
      onSaved(!room)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="app-shell sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{room ? `${room.code} 호실 고치기` : "호실 추가"}</DialogTitle>
          <DialogDescription>
            {room ? "면적을 바꾸면 이 호실로 새로 입주할 때 기본 면적으로 쓰여요. 진행 중 계약의 부과 면적은 계약에서 고쳐요." : "새 호실을 등록해요. 같은 코드가 있으면 저장되지 않아요."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {error && (
            <Notice tone="danger" title="저장하지 못했어요">
              {errorDetail(error, "저장하지 못했어요")}
              {!room && <span className="block">같은 호실 코드가 이미 있는지 확인해 주세요.</span>}
            </Notice>
          )}
          <ErrorSummary errors={fe.summary} />
          <div className="grid gap-1.5">
            <Label htmlFor={fe.fieldId("code")} className="text-base">
              호실 코드
            </Label>
            <Input
              {...fe.field("code")}
              value={form.code}
              onChange={(e) => {
                setForm({ ...form, code: e.target.value })
                fe.clear("code")
              }}
              className="bg-card text-base"
              aria-describedby={[`room-code-hint`, fe.errors.code ? fe.errorId("code") : null].filter(Boolean).join(" ")}
            />
            <p id="room-code-hint" className="text-sm text-text-secondary">
              예: 203, F101
            </p>
            {fe.errors.code && <FieldError id={fe.errorId("code")}>{fe.errors.code}</FieldError>}
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-base font-medium text-dark">건물</legend>
            <RadioGroup value={form.building} onValueChange={(v) => setForm({ ...form, building: v as RoomForm["building"] })} className="flex flex-wrap gap-2">
              {(["본관", "공장동"] as const).map((b) => (
                <label key={b} htmlFor={`room-building-${b}`} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-warm-tan bg-card px-3 has-[[data-state=checked]]:border-dark">
                  <RadioGroupItem id={`room-building-${b}`} value={b} className="border-[#6b6b7b]" />
                  <span className="text-base">{b}</span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={fe.fieldId("floor")} className="text-base">
                층
              </Label>
              <Input
                {...fe.field("floor")}
                inputMode="numeric"
                value={form.floor}
                onChange={(e) => {
                  setForm({ ...form, floor: e.target.value })
                  fe.clear("floor")
                }}
                className="bg-card text-base"
              />
              {fe.errors.floor && <FieldError id={fe.errorId("floor")}>{fe.errors.floor}</FieldError>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="room-pyeong" className="text-base">
                면적
              </Label>
              <UnitInput id="room-pyeong" unit="평" value={form.pyeong} onChange={(v) => setForm({ ...form, pyeong: v })} />
            </div>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-base font-medium text-dark">사용 여부</legend>
            <RadioGroup value={form.status} onValueChange={(v) => setForm({ ...form, status: v as RoomForm["status"] })} className="gap-2">
              {[
                { v: "available", l: "사용 가능", h: "입주 처리할 수 있어요" },
                { v: "maintenance", l: "사용 불가", h: "보수 중처럼 쓸 수 없는 호실이에요. 호실 현황에서 빗금으로 보여요" },
              ].map((o) => (
                <label key={o.v} htmlFor={`room-status-${o.v}`} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-warm-tan bg-card px-3 py-2.5 has-[[data-state=checked]]:border-dark">
                  <RadioGroupItem id={`room-status-${o.v}`} value={o.v} className="mt-1 border-[#6b6b7b]" />
                  <span>
                    <span className="block text-base font-medium text-dark">{o.l}</span>
                    <span className="block text-sm text-text-secondary">{o.h}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="hover:bg-warm-beige" onClick={onClose} disabled={busy}>
            닫기
          </Button>
          <BusyButton type="button" busy={busy} onClick={save}>
            {room ? "저장하기" : "호실 추가하기"}
          </BusyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
