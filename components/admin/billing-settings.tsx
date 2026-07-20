"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { AdminCard } from "@/components/admin/admin-ui"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Pencil } from "lucide-react"
import { formatWon } from "@/lib/billing"

interface Room { id: number; code: string; building: string; floor: number | null; pyeong: number | null; status: string; tenant_name?: string | null }
interface Tenant { id: number; name: string }
interface Contract {
  id: number; tenant_id: number; tenant_name: string; room_id: number; room_code: string
  pyeong_billed: string; rent_unit_price: string; mgmt_fee: string; renewal_type: string
  elec_method: string; status: string; deposit_standard: string | null; deposit_actual: string | null; ended_at: string | null
}

export function BillingSettings() {
  const [tab, setTab] = useState<"rooms" | "contracts" | "data">("rooms")
  return (
    <div>
      <div className="mb-4 flex gap-1">
        {([["rooms", "호실 관리"], ["contracts", "계약 관리"], ["data", "데이터"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-md px-4 py-2 text-sm ${tab === k ? "bg-dark text-primary-foreground" : "text-text-secondary hover:bg-warm-beige"}`}>{l}</button>
        ))}
      </div>
      {tab === "rooms" && <RoomsManager />}
      {tab === "contracts" && <ContractsManager />}
      {tab === "data" && (
        <AdminCard className="p-6 text-sm text-text-secondary">
          기존 정산 엑셀 가져오기와 월별 정산표 내려받기는 준비 중입니다. (참조 엑셀 업로드 후 연동 예정)
        </AdminCard>
      )}
    </div>
  )
}

const ROOM_EMPTY = { code: "", building: "본관", floor: "", pyeong: "", status: "available", memo: "" }

function RoomsManager() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<Record<string, string>>({ ...ROOM_EMPTY })

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/rooms", { credentials: "include" })
    const d = await res.json()
    if (d.success) setRooms(d.rooms)
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    const body = { ...(editId ? { id: editId } : {}), ...form, floor: form.floor || null, pyeong: form.pyeong || null }
    const res = await fetch("/api/admin/rooms", {
      method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body),
    })
    const d = await res.json()
    if (d.success) { setOpen(false); load() } else alert(d.error || "저장 실패")
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => { setEditId(null); setForm({ ...ROOM_EMPTY }); setOpen(true) }}><Plus className="h-4 w-4" />호실 추가</Button>
      </div>
      <AdminCard>
        <Table>
          <TableHeader><TableRow><TableHead>호실</TableHead><TableHead>건물</TableHead><TableHead>평형</TableHead><TableHead>입주</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rooms.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium text-dark">{r.code}</TableCell>
                <TableCell>{r.building}</TableCell>
                <TableCell>{r.pyeong ?? "-"}평</TableCell>
                <TableCell>{r.tenant_name || <span className="text-text-secondary">공실</span>}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => { setEditId(r.id); setForm({ code: r.code, building: r.building, floor: String(r.floor ?? ""), pyeong: String(r.pyeong ?? ""), status: r.status, memo: "" }); setOpen(true) }}><Pencil className="h-3.5 w-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {rooms.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-text-secondary">호실이 없습니다</TableCell></TableRow>}
          </TableBody>
        </Table>
      </AdminCard>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editId ? "호실 수정" : "호실 추가"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>호실코드</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="203호 / F101" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>건물</Label>
                <Select value={form.building} onValueChange={(v) => setForm({ ...form, building: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="본관">본관</SelectItem><SelectItem value="공장동">공장동</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>층</Label><Input type="number" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>평형</Label><Input type="number" step="0.1" value={form.pyeong} onChange={(e) => setForm({ ...form, pyeong: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>상태</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="available">사용가능</SelectItem><SelectItem value="maintenance">사용불가</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>취소</Button><Button onClick={save}>저장</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const CONTRACT_EMPTY = { tenant_id: "", room_id: "", pyeong_billed: "", pyeong_actual: "", rent_unit_price: "21000", mgmt_fee: "15000", renewal_type: "renewal", elec_method: "area", deposit_actual: "", start_date: "", first_month_billing: "full", memo: "" }

function ContractsManager() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<Record<string, string>>({ ...CONTRACT_EMPTY })
  const [endOpen, setEndOpen] = useState<Contract | null>(null)
  const [endForm, setEndForm] = useState({ ended_at: "", last_month_billing: "full", deposit_returned_amount: "" })

  const load = useCallback(async () => {
    const [c, t, r] = await Promise.all([
      fetch("/api/admin/contracts", { credentials: "include" }).then((x) => x.json()),
      fetch("/api/admin/tenants?status=active", { credentials: "include" }).then((x) => x.json()),
      fetch("/api/admin/rooms", { credentials: "include" }).then((x) => x.json()),
    ])
    if (c.success) setContracts(c.contracts)
    if (t.success) setTenants(t.tenants)
    if (r.success) setRooms(r.rooms)
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    const res = await fetch("/api/admin/contracts", {
      method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ ...(editId ? { id: editId } : {}), ...form }),
    })
    const d = await res.json()
    if (d.success) { setOpen(false); load() } else alert(d.error || "저장 실패")
  }

  const doEnd = async () => {
    if (!endOpen) return
    if (!endForm.ended_at) { alert("종료일을 입력하세요"); return }
    const res = await fetch(`/api/admin/contracts/${endOpen.id}/end`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(endForm),
    })
    const d = await res.json()
    if (d.success) {
      const o = d.offset
      alert(`퇴실 처리 완료.\n보증금 ${formatWon(o.deposit_actual)}원 − 미납 ${formatWon(o.unpaid_total)}원 = 반환 제안 ${formatWon(o.suggested_return)}원`)
      setEndOpen(null); load()
    } else alert(d.error || "처리 실패")
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => { setEditId(null); setForm({ ...CONTRACT_EMPTY }); setOpen(true) }}><Plus className="h-4 w-4" />계약 추가</Button>
      </div>
      <AdminCard>
        <Table>
          <TableHeader><TableRow><TableHead>기업</TableHead><TableHead>호실</TableHead><TableHead>평형</TableHead><TableHead className="text-right">평당</TableHead><TableHead>전기</TableHead><TableHead>상태</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {contracts.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium text-dark">{c.tenant_name}</TableCell>
                <TableCell>{c.room_code}</TableCell>
                <TableCell>{c.pyeong_billed}평</TableCell>
                <TableCell className="text-right">{formatWon(c.rent_unit_price)}</TableCell>
                <TableCell>{c.elec_method === "metered" ? "실사용" : "면적별"}</TableCell>
                <TableCell>{c.status === "active" ? <Badge>진행</Badge> : <Badge variant="secondary">종료</Badge>}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => { setEditId(c.id); setForm({ tenant_id: String(c.tenant_id), room_id: String(c.room_id), pyeong_billed: c.pyeong_billed, pyeong_actual: "", rent_unit_price: c.rent_unit_price, mgmt_fee: c.mgmt_fee, renewal_type: c.renewal_type, elec_method: c.elec_method, deposit_actual: c.deposit_actual ?? "", start_date: "", first_month_billing: "full", memo: "" }); setOpen(true) }}><Pencil className="h-3.5 w-3.5" /></Button>
                    {c.status === "active" && <Button variant="outline" size="sm" onClick={() => { setEndOpen(c); setEndForm({ ended_at: "", last_month_billing: "full", deposit_returned_amount: "" }) }}>퇴실</Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {contracts.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-text-secondary">계약이 없습니다</TableCell></TableRow>}
          </TableBody>
        </Table>
      </AdminCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "계약 수정" : "계약 추가"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>기업</Label>
                <Select value={form.tenant_id} onValueChange={(v) => setForm({ ...form, tenant_id: v })}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{tenants.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>호실</Label>
                <Select value={form.room_id} onValueChange={(v) => setForm({ ...form, room_id: v })}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{rooms.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.code}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>부과평형</Label><Input type="number" step="0.1" value={form.pyeong_billed} onChange={(e) => setForm({ ...form, pyeong_billed: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>평당 임대료</Label><Input type="number" value={form.rent_unit_price} onChange={(e) => setForm({ ...form, rent_unit_price: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>관리비</Label><Input type="number" value={form.mgmt_fee} onChange={(e) => setForm({ ...form, mgmt_fee: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>실보증금</Label><Input type="number" value={form.deposit_actual} onChange={(e) => setForm({ ...form, deposit_actual: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>계약구분</Label>
                <Select value={form.renewal_type} onValueChange={(v) => setForm({ ...form, renewal_type: v, rent_unit_price: v === "new" ? "20000" : "21000" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="renewal">갱신</SelectItem><SelectItem value="new">신규(비갱신)</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>전기 방식</Label>
                <Select value={form.elec_method} onValueChange={(v) => setForm({ ...form, elec_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="area">면적별</SelectItem><SelectItem value="metered">실사용(공장동)</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>취소</Button><Button onClick={save}>저장</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!endOpen} onOpenChange={(o) => !o && setEndOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>퇴실 처리 — {endOpen?.tenant_name} ({endOpen?.room_code})</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>종료일</Label><Input type="date" value={endForm.ended_at} onChange={(e) => setEndForm({ ...endForm, ended_at: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>마지막 달 청구</Label>
              <Select value={endForm.last_month_billing} onValueChange={(v) => setEndForm({ ...endForm, last_month_billing: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="full">전액</SelectItem><SelectItem value="prorated">일할</SelectItem><SelectItem value="none">없음</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>보증금 반환액 (비우면 상계 제안값)</Label><Input type="number" value={endForm.deposit_returned_amount} onChange={(e) => setEndForm({ ...endForm, deposit_returned_amount: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEndOpen(null)}>취소</Button><Button onClick={doEnd}>퇴실 처리</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
